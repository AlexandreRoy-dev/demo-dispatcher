"use client";

import { useMemo, useState } from "react";
import { RouteMap } from "@/components/RouteMap";
import { ScheduleCalendar } from "@/components/guertech/ScheduleCalendar";
import { DRUMMONDVILLE_CENTER } from "@/lib/guertech/constants";
import { ROAD_WINDOW } from "@/lib/guertech/optimize";
import type { OvertimeWarning } from "@/lib/guertech/optimize";
import type { PreventifSuggestion } from "@/lib/guertech/suggestions";
import type { TechRoute, Unassigned } from "@/lib/guertech/types";
import {
  buildGoogleMapsRouteUrl,
  buildRouteShareText,
} from "@/lib/maps-link";

type RouteBoardProps = {
  routes: TechRoute[];
  unassigned: Unassigned[];
  suggestions?: PreventifSuggestion[];
  onAcceptSuggestion?: (suggestion: PreventifSuggestion) => void;
  acceptingId?: string | null;
  overtimeWarnings?: OvertimeWarning[];
  overtimeIgnored?: boolean;
  onIgnoreOvertime?: () => void;
  onTrimOvertime?: () => void;
};

export function RouteBoard({
  routes,
  unassigned,
  suggestions = [],
  onAcceptSuggestion,
  acceptingId = null,
  overtimeWarnings = [],
  overtimeIgnored = false,
  onIgnoreOvertime,
  onTrimOvertime,
}: RouteBoardProps) {
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

      {overtimeWarnings.length > 0 && !overtimeIgnored ? (
        <div className="gt-overtime-banner" role="alert">
          <div>
            <strong>
              Avertissement — fenêtre 8 h–{ROAD_WINDOW.softEndLabel}
            </strong>
            <p>
              {overtimeWarnings.length} technicien(s) termineraient après{" "}
              {ROAD_WINDOW.softEndLabel} (retour dépôt inclus) :
              {" "}
              {overtimeWarnings
                .map(
                  (item) =>
                    `${item.techName} (~${item.finishLabel}, +${item.overtimeMin} min)`,
                )
                .join(" · ")}
              . Vous pouvez ignorer l&apos;avertissement ou raccourcir
              automatiquement.
            </p>
          </div>
          <div className="gt-overtime-actions">
            <button
              type="button"
              className="gt-btn-ghost"
              onClick={onIgnoreOvertime}
            >
              Ignorer
            </button>
            <button type="button" className="gt-btn" onClick={onTrimOvertime}>
              Raccourcir pour finir à {ROAD_WINDOW.softEndLabel}
            </button>
          </div>
        </div>
      ) : null}

      {overtimeWarnings.length > 0 && overtimeIgnored ? (
        <p className="gt-overtime-ignored">
          Fenêtre 8 h–{ROAD_WINDOW.softEndLabel} dépassée — avertissement ignoré
          ({overtimeWarnings.map((item) => item.techName).join(", ")}).
        </p>
      ) : null}

      {view === "calendar" ? (
        <>
          <p className="gt-share-hint">
            Horaires côte à côte. Les bandes hachurées sont les trajets Google
            Maps entre les arrêts. Les blocs en pointillés sont des préventifs
            à proximité suggérés dans les créneaux libres — cliquez pour les
            ajouter.
          </p>
          <ScheduleCalendar
            routes={withWork}
            suggestions={suggestions}
            selectedTechId={current.tech.id}
            onSelectTech={setTechId}
            onAcceptSuggestion={onAcceptSuggestion}
            acceptingId={acceptingId}
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
                      ? ` · ${current.google.optimizedStopDetails[index].arriveLabel}–${current.google.optimizedStopDetails[index].leaveLabel}`
                      : ""}
                  </p>
                  {current.google?.legs[index] ? (
                    <p className="optimized-leg">
                      Trajet vers cet arrêt :{" "}
                      {current.google.legs[index].durationText} ·{" "}
                      {current.google.legs[index].distanceText}
                    </p>
                  ) : null}
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
