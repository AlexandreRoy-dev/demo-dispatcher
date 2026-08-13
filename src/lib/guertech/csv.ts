import type { Appel, CallType } from "./types";

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

export async function loadAppels(): Promise<Appel[]> {
  const response = await fetch("/guertech/appels.csv", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Impossible de charger la liste d'appels.");
  }
  const text = await response.text();
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]);
  const index = Object.fromEntries(header.map((key, i) => [key, i]));

  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const type = (cells[index.type] === "reactif" ? "reactif" : "preventif") as CallType;
    return {
      id: cells[index.id],
      type,
      magasin: cells[index.magasin],
      adresse: cells[index.adresse],
      ville: cells[index.ville],
      region: cells[index.region],
      equipement: cells[index.equipement],
      equipementId: Number(cells[index.equipement_id] || 0),
      netsuiteId: cells[index.netsuite_id],
      planifie: cells[index.planifie] === "1" || cells[index.planifie] === "true",
      heure: cells[index.heure] ?? "",
      techId: cells[index.tech_id] ?? "",
      openedAt: cells[index.opened_at] || "2026-08-13",
    };
  });
}
