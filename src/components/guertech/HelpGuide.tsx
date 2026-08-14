"use client";

import { useEffect, useState } from "react";

const STEPS = [
  {
    title: "Techniciens",
    body: "Ouvrez le panneau pour cocher qui est présent, les horaires (8 h–17 h) et les compétences. Les champs déjà remplis ne seront pas écrasés.",
  },
  {
    title: "Générer une suggestion",
    body: "Remplit seulement les champs vides (date, durées, quota, présence) selon le ratio Q4 et le SLA réactif de 2 jours.",
  },
  {
    title: "Appels",
    body: "Cochez Planifié + heure + tech pour figer un rendez-vous 24 h. Filtrez réactifs ou délai dépassé au besoin.",
  },
  {
    title: "Générer les routes",
    body: "Assigne les appels (urgence d’abord, proximité ensuite) et calcule les trajets Google Maps dans le calendrier.",
  },
  {
    title: "Calendrier",
    body: "Rouge = réactif, vert = préventif, hachuré = trajet. Accepter / Tout accepter pour les suggestions. × retire un arrêt.",
  },
  {
    title: "Fenêtre 8 h–17 h",
    body: "Si une tournée dépasse 17 h : ignorer l’avertissement ou raccourcir automatiquement.",
  },
  {
    title: "NetSuite",
    body: "Pousser vers NetSuite est une démo seulement — aucun envoi réel.",
  },
] as const;

export function HelpGuide() {
  const [open, setOpen] = useState(true);
  const [active, setActive] = useState(0);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => {
      setActive((current) => (current + 1) % STEPS.length);
    }, 3200);
    return () => window.clearInterval(id);
  }, [open]);

  return (
    <section className="gt-help" aria-label="Instructions">
      <button
        type="button"
        className="gt-help-toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="gt-help-pulse" aria-hidden />
        <span className="gt-help-toggle-label">
          Guide rapide — comment planifier la journée
        </span>
        <span className="gt-help-chevron" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
      </button>

      {open ? (
        <ol className={`gt-help-steps${entered ? " is-ready" : ""}`}>
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className={`gt-help-step${active === index ? " is-active" : ""}`}
              style={{ transitionDelay: `${index * 0.1}s` }}
              onMouseEnter={() => setActive(index)}
              onFocus={() => setActive(index)}
            >
              <span className="gt-help-dot" aria-hidden>
                {index + 1}
              </span>
              <div>
                <strong>{step.title}</strong>
                <p>{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
