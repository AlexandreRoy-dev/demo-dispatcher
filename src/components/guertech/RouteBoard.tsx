"use client";

import { useMemo, useState } from "react";
import { RouteMap } from "@/components/RouteMap";
import { ScheduleCalendar } from "@/components/guertech/ScheduleCalendar";
import { DRUMMONDVILLE_CENTER } from "@/lib/guertech/constants";
import type { TechRoute, Unassigned } from "@/lib/guertech/types";
import {
  buildGoogleMapsRouteUrl,
  buildRouteShareText,
} from "@/lib/maps-link";

type RouteBoardProps = {
  routes: TechRoute[];
  unassigned: Unassigned[];
};

export function RouteBoard({ routes, unassigned }: RouteBoardProps) {
  const withWork = routes.filter((route) => route.stops.length > 0);
  const [techId, setTechId] = useState(withWork[0]?.tech.id ?? "");
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const current =
    withWork.find((route) => route.tech.id === techId) ?? withWork[0] ?? null;

  const [copyState, setCopyState] = useState("Copier le lien");

  const mapsUrl = useMemo(
    () => (current?.google ? buildGoogleMapsRouteUrl(current.google) : ""),
    [current],
  );
  const shareText = useMemo(
    () =>
      current?.google
        ? buildRouteShareText(current.google, current.tech.name)
        : "",
    [current],
  );

  if (!current) {
    return (
      <section className="gt-panel">
        <h2>Tournées</h2>
        <p>
          Aucun arrêt assigné. Vérifiez les techniciens présents et les appels.
        </p>
      </section>
    );
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(mapsUrl);
      setCopyState("Lien copié");
      window.setTimeout(() => setCopyState("Copier le lien"), 2000);
    } catch {
      setCopyState("Copie impossible");
    }
  }

  async function sendToTech() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Tournée ${current.tech.name}`,
          text: shareText,
          url: mapsUrl,
        });
        return;
      } catch {
        /* fall through */
      }
    }
    await copyLink();
  }

  return (
    <section className="gt-panel">
      <div className="gt-results-head">
        <h2>Tournées générées</h2>
        <div className="gt-tabs">
          <button
            type="button"
            className={view === "calendar" ? "on" : ""}
            onClick={() => setView("calendar")}
          >
            Calendrier
          </button>
          <button
            type="button"
            className={view === "list" ? "on" : ""}
            onClick={() => setView("list")}
          >
            Liste + carte
          </button>
        </div>
      </div>

      {view === "calendar" ? (
        <>
          <p className="gt-share-hint">
            Horaires côte à côte pour chaque technicien présent. Cliquez une
            colonne pour ouvrir les liens Google Maps de ce tech.
          </p>
          <ScheduleCalendar
            routes={withWork}
            selectedTechId={current.tech.id}
            onSelectTech={setTechId}
          />
          <div className="gt-share" style={{ marginTop: "0.85rem" }}>
            <strong style={{ alignSelf: "center" }}>{current.tech.name}</strong>
            {current.google ? (
              <>
                <a
                  className="gt-btn"
                  href={mapsUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Ouvrir dans Google Maps
                </a>
                <button
                  type="button"
                  className="gt-btn-ghost"
                  onClick={sendToTech}
                >
                  Envoyer au technicien
                </button>
                <button
                  type="button"
                  className="gt-btn-ghost"
                  onClick={copyLink}
                >
                  {copyState}
                </button>
              </>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <div className="gt-results-nav">
            {withWork.map((route) => (
              <button
                key={route.tech.id}
                type="button"
                className={
                  route.tech.id === current.tech.id ? "gt-btn" : "gt-btn-ghost"
                }
                onClick={() => setTechId(route.tech.id)}
              >
                {route.tech.name} ({route.stops.length})
              </button>
            ))}
          </div>

          {current.error ? <p className="gt-error">{current.error}</p> : null}

          {current.google ? (
            <div className="gt-share">
              <a
                className="gt-btn"
                href={mapsUrl}
                target="_blank"
                rel="noreferrer"
              >
                Ouvrir dans Google Maps
              </a>
              <button
                type="button"
                className="gt-btn-ghost"
                onClick={sendToTech}
              >
                Envoyer au technicien
              </button>
              <button type="button" className="gt-btn-ghost" onClick={copyLink}>
                {copyState}
              </button>
            </div>
          ) : null}

          <ol className="optimized-list">
            {current.stops.map((stop, index) => (
              <li
                key={stop.appel.id}
                className={`optimized-item${stop.pinned ? " gt-stop-pin" : ""}`}
              >
                <span className="badge">{index + 1}</span>
                <div>
                  <p className="optimized-address">
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.appel.adresse)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {stop.appel.magasin}
                    </a>
                    {stop.pinned ? " · planifié" : ""}
                  </p>
                  <p className="optimized-leg">
                    <span className={`gt-tag ${stop.appel.type}`}>
                      {stop.appel.type === "preventif"
                        ? "Préventif"
                        : "Réactif"}
                    </span>
                    {stop.appel.adresse}
                    {stop.pinned ? ` · ${stop.appel.heure}` : ""}
                    {current.google?.optimizedStopDetails[index]
                      ? ` · ${current.google.optimizedStopDetails[index].arriveLabel}`
                      : ""}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <RouteMap
            result={current.google}
            defaultCenter={DRUMMONDVILLE_CENTER}
          />
        </>
      )}

      {unassigned.length > 0 ? (
        <div>
          <h2>Non assignés ({unassigned.length})</h2>
          <ul className="optimized-list">
            {unassigned.slice(0, 40).map((item) => (
              <li key={item.appel.id} className="optimized-item">
                <span className="badge">—</span>
                <div>
                  <p className="optimized-address">{item.appel.magasin}</p>
                  <p className="optimized-leg">
                    {item.reason} · {item.appel.adresse}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
