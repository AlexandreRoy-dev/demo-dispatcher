"use client";

import { isReactifOverdue, TIME_SLOTS } from "@/lib/guertech/constants";
import type { Appel, CallType, Tech } from "@/lib/guertech/types";

type CallListProps = {
  calls: Appel[];
  techs: Tech[];
  asOfDate: string;
  filter: "all" | CallType | "overdue";
  plannedOnly: boolean;
  search: string;
  onFilter: (filter: "all" | CallType | "overdue") => void;
  onPlannedOnly: (value: boolean) => void;
  onSearch: (value: string) => void;
  onUpdate: (id: string, patch: Partial<Appel>) => void;
};

function CallCard({
  appel,
  techs,
  overdue,
  onUpdate,
}: {
  appel: Appel;
  techs: Tech[];
  overdue?: boolean;
  onUpdate: (id: string, patch: Partial<Appel>) => void;
}) {
  return (
    <article className={`gt-call${overdue ? " gt-call-overdue" : ""}`}>
      <div>
        <h3>
          <span className={`gt-tag ${appel.type}`}>
            {appel.type === "preventif" ? "Préventif" : "Réactif"}
          </span>
          {overdue ? <span className="gt-tag overdue">Délai dépassé</span> : null}
          {appel.planifie ? (
            <span className="gt-tag pin">Planifié {appel.heure}</span>
          ) : null}
          {appel.magasin}
        </h3>
        <p>
          {appel.adresse} · {appel.equipement} · {appel.netsuiteId}
          {appel.type === "reactif" ? ` · ouvert ${appel.openedAt}` : ""}
        </p>
      </div>
      <div className="gt-call-actions">
        <label className="gt-check">
          <input
            type="checkbox"
            checked={appel.planifie}
            onChange={(event) => {
              const planifie = event.target.checked;
              onUpdate(appel.id, {
                planifie,
                heure: planifie ? appel.heure || "10:00" : "",
                techId: planifie
                  ? appel.techId || techs.find((tech) => tech.present)?.id || ""
                  : appel.techId,
              });
            }}
          />
          Planifié
        </label>
        {appel.planifie ? (
          <>
            <label className="gt-field">
              <span>Heure (24 h) *</span>
              <select
                required
                value={appel.heure}
                onChange={(event) =>
                  onUpdate(appel.id, { heure: event.target.value })
                }
              >
                <option value="">Choisir</option>
                {TIME_SLOTS.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))}
              </select>
            </label>
            <label className="gt-field">
              <span>Technicien</span>
              <select
                value={appel.techId}
                onChange={(event) =>
                  onUpdate(appel.id, { techId: event.target.value })
                }
              >
                {techs.map((tech) => (
                  <option key={tech.id} value={tech.id}>
                    {tech.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
      </div>
    </article>
  );
}

export function CallList({
  calls,
  techs,
  asOfDate,
  filter,
  plannedOnly,
  search,
  onFilter,
  onPlannedOnly,
  onSearch,
  onUpdate,
}: CallListProps) {
  const query = search.trim().toLowerCase();

  const matchesSearch = (appel: Appel) => {
    if (!query) return true;
    return `${appel.magasin} ${appel.adresse} ${appel.equipement} ${appel.netsuiteId}`
      .toLowerCase()
      .includes(query);
  };

  const base = calls.filter((appel) => {
    if (plannedOnly && !appel.planifie) return false;
    return matchesSearch(appel);
  });

  const overdue = base.filter((appel) => isReactifOverdue(appel, asOfDate));
  const reactifPending = base.filter(
    (appel) => appel.type === "reactif" && !isReactifOverdue(appel, asOfDate),
  );
  const preventifs = base.filter((appel) => appel.type === "preventif");

  let sections: Array<{ title: string; items: Appel[]; overdue?: boolean }> = [];
  if (filter === "overdue") {
    sections = [
      { title: "Réactif délai dépassé", items: overdue, overdue: true },
    ];
  } else if (filter === "reactif") {
    sections = [
      { title: "Réactif délai dépassé", items: overdue, overdue: true },
      {
        title: "Réactif — en attente (délai 2 jours)",
        items: reactifPending,
      },
    ];
  } else if (filter === "preventif") {
    sections = [{ title: "Préventif", items: preventifs }];
  } else {
    sections = [
      { title: "Réactif délai dépassé", items: overdue, overdue: true },
      {
        title: "Réactif — en attente (délai 2 jours)",
        items: reactifPending,
      },
      { title: "Préventif", items: preventifs },
    ];
  }

  const totalVisible = sections.reduce((sum, section) => sum + section.items.length, 0);

  return (
    <section className="gt-panel">
      <h2>
        Appels ({totalVisible} / {calls.length})
      </h2>
      <div className="gt-tabs">
        <button
          type="button"
          className={filter === "all" ? "on" : ""}
          onClick={() => onFilter("all")}
        >
          Tous
        </button>
        <button
          type="button"
          className={filter === "preventif" ? "on" : ""}
          onClick={() => onFilter("preventif")}
        >
          Préventif
        </button>
        <button
          type="button"
          className={filter === "reactif" ? "on" : ""}
          onClick={() => onFilter("reactif")}
        >
          Réactif
        </button>
        <button
          type="button"
          className={filter === "overdue" ? "on" : ""}
          onClick={() => onFilter("overdue")}
        >
          Délai dépassé ({overdue.length})
        </button>
      </div>
      <div className="gt-row">
        <input
          className="gt-search"
          placeholder="Rechercher magasin, adresse, NS…"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
        />
        <label className="gt-check">
          <input
            type="checkbox"
            checked={plannedOnly}
            onChange={(event) => onPlannedOnly(event.target.checked)}
          />
          Planifié seulement
        </label>
      </div>
      <div className="gt-list">
        {sections.map((section) => {
          if (section.items.length === 0 && !section.overdue) return null;
          const shown = section.items;
          return (
            <div key={section.title} className="gt-call-section">
              <h3 className={`gt-section-title${section.overdue ? " overdue" : ""}`}>
                {section.title}{" "}
                <span>({section.items.length})</span>
              </h3>
              {section.items.length === 0 ? (
                <p className="gt-section-empty">Aucun appel dans cette section.</p>
              ) : (
                shown.map((appel) => (
                  <CallCard
                    key={appel.id}
                    appel={appel}
                    techs={techs}
                    overdue={section.overdue}
                    onUpdate={onUpdate}
                  />
                ))
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
