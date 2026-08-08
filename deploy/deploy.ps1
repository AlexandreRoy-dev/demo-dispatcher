param(
  [string]$HostName = "158.69.1.173",
  [string]$User = "ubuntu",
  [string]$KeyPath = "$env:USERPROFILE\.ssh\ovh_vps",
  [string]$RemoteDir = "/var/www/demo-dispatcher"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$sshTarget = "${User}@${HostName}"

if (Test-Path $KeyPath) {
  $sshKeyArgs = @("-i", $KeyPath)
  $scpKeyArgs = @("-i", $KeyPath)
} else {
  Write-Warning "SSH key not found at $KeyPath; trying default ssh agent"
  $sshKeyArgs = @()
  $scpKeyArgs = @()
}

function Invoke-Remote([string]$Command) {
  & ssh @sshKeyArgs $sshTarget $Command
  if ($LASTEXITCODE -ne 0) {
    throw "Remote command failed: $Command"
  }
}

Write-Host "Creating remote directory $RemoteDir ..."
Invoke-Remote "sudo mkdir -p $RemoteDir && sudo chown -R ${User}:${User} $RemoteDir"

$staging = Join-Path $env:TEMP ("demo-dispatcher-" + [guid]::NewGuid().ToString("n"))
New-Item -ItemType Directory -Path $staging | Out-Null

try {
  $include = @(
    "package.json",
    "package-lock.json",
    "next.config.ts",
    "tsconfig.json",
    "postcss.config.mjs",
    "eslint.config.mjs",
    "src",
    "public",
    "deploy",
    ".env.example"
  )

  foreach ($item in $include) {
    $local = Join-Path $Root $item
    if (Test-Path $local) {
      Copy-Item -Recurse -Force $local (Join-Path $staging (Split-Path $item -Leaf))
    }
  }

  Write-Host "Uploading app files ..."
  Get-ChildItem -Force $staging | ForEach-Object {
    & scp @scpKeyArgs -r $_.FullName "${sshTarget}:${RemoteDir}/"
    if ($LASTEXITCODE -ne 0) { throw "scp failed for $($_.Name)" }
  }

  $localEnvExample = Join-Path $Root ".env.example"
  if (Test-Path $localEnvExample) {
    & scp @scpKeyArgs $localEnvExample "${sshTarget}:${RemoteDir}/.env.example"
  }

  $localEnv = Join-Path $Root ".env.local"
  if (Test-Path $localEnv) {
    Write-Host "Uploading .env.local as server .env ..."
    & scp @scpKeyArgs $localEnv "${sshTarget}:${RemoteDir}/.env"
  } else {
    Write-Host "Ensuring server .env exists (keys may still need to be filled) ..."
    Invoke-Remote "test -f $RemoteDir/.env || cp $RemoteDir/.env.example $RemoteDir/.env"
  }

  Invoke-Remote "chmod -R u+rwX,go+rX $RemoteDir"

  Write-Host "Installing deps and building on VPS ..."
  Invoke-Remote "cd $RemoteDir && npm ci && npm run build"

  Write-Host "Installing systemd unit ..."
  Invoke-Remote "sudo cp $RemoteDir/deploy/demo-dispatcher.service /etc/systemd/system/demo-dispatcher.service && sudo systemctl daemon-reload && sudo systemctl enable demo-dispatcher && sudo systemctl restart demo-dispatcher"

  Write-Host "Configuring nginx site ..."
  Invoke-Remote @"
set -e
sudo rm -f /etc/nginx/sites-enabled/dispatch.devis-expert.ca /etc/nginx/sites-available/dispatch.devis-expert.ca
sudo cp $RemoteDir/deploy/nginx.conf.snippet /etc/nginx/sites-available/dispatch.codesurmesure.ca
sudo ln -sf /etc/nginx/sites-available/dispatch.codesurmesure.ca /etc/nginx/sites-enabled/dispatch.codesurmesure.ca
sudo nginx -t
sudo systemctl reload nginx
if command -v certbot >/dev/null 2>&1; then
  sudo certbot --nginx -d dispatch.codesurmesure.ca --non-interactive --agree-tos --register-unsafely-without-email --redirect || echo 'Certbot skipped (DNS may not be ready yet)'
fi
"@

  Write-Host ""
  Write-Host "Deploy complete."
  Write-Host "App:     http://127.0.0.1:3010 (on VPS)"
  Write-Host "Public:  https://dispatch.codesurmesure.ca"
  Write-Host "DNS A record must point dispatch.codesurmesure.ca -> $HostName"
  Write-Host "Add Google API keys in $RemoteDir/.env then: sudo systemctl restart demo-dispatcher"
}
finally {
  Remove-Item -Recurse -Force $staging -ErrorAction SilentlyContinue
}
