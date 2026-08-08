import { SAMPLE_DAY } from "@/lib/sample-data";

export function StaffHeader() {
  return (
    <header className="staff-header">
      <div className="brand-block">
        <p className="brand">Dispatch</p>
        <h1>Planificateur de tournée</h1>
        <p className="lede">
          Entrez les adresses d&apos;appels de la journée (dans n&apos;importe
          quel ordre). Google Maps calcule la meilleure séquence; seul le
          départ et l&apos;arrivée restent fixes, selon la circulation en
          temps réel.
        </p>
      </div>

      <aside className="tech-card" aria-label="Technicien assigné">
        <p className="tech-eyebrow">Technicien assigné</p>
        <p className="tech-name">{SAMPLE_DAY.techName}</p>
        <p className="tech-role">{SAMPLE_DAY.techRole}</p>
        <p className="tech-meta">Démo · un véhicule · Montréal</p>
      </aside>
    </header>
  );
}
