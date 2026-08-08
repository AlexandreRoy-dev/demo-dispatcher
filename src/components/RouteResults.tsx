"use client";

import { useMemo, useState } from "react";
import {
  buildGoogleMapsRouteUrl,
  buildRouteShareText,
} from "@/lib/maps-link";
import type { OptimizeRouteResponse, OptimizedStop } from "@/lib/types";

type RouteResultsProps = {
  result: OptimizeRouteResponse | null;
};

export function RouteResults({ result }: RouteResultsProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );

  const mapsUrl = useMemo(
    () => (result ? buildGoogleMapsRouteUrl(result) : ""),
    [result],
  );
  const shareText = useMemo(
    () => (result ? buildRouteShareText(result) : ""),
    [result],
  );

  if (!result) {
    return (
      <section className="panel results-panel results-empty">
        <h2>Ordre de visite du jour</h2>
        <p>
          Les adresses saisies n&apos;ont pas d&apos;ordre obligatoire.
          Lancez le calcul pour obtenir la meilleure séquence de la journée
          (circulation + temps sur place) et l&apos;afficher sur la carte.
        </p>
      </section>
    );
  }

  const departed = new Date(result.departureTime);
  const trafficLabel = departed.toLocaleString("fr-CA", {
    hour: "numeric",
    minute: "2-digit",
  });

  const stopDetails: OptimizedStop[] =
    result.optimizedStopDetails?.length > 0
      ? result.optimizedStopDetails
      : result.optimizedStops.map((address) => ({
          address,
          minutesOnSite: 30,
        }));

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(mapsUrl);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2200);
    } catch {
      setCopyState("error");
      window.setTimeout(() => setCopyState("idle"), 2200);
    }
  }

  async function shareToTech() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Tournée optimisée",
          text: shareText,
          url: mapsUrl,
        });
        return;
      } catch {
        // User cancelled or share failed; fall back to copy.
      }
    }
    await copyLink();
  }

  return (
    <section className="panel results-panel">
      <div className="panel-heading">
        <h2>Ordre de visite du jour</h2>
        {result.trafficAware ? (
          <span className="traffic-pill">
            Circulation en direct · départ {trafficLabel}
          </span>
        ) : null}
      </div>
      <p className="share-hint">
        Séquence calculée par Google (pas l&apos;ordre de saisie). Départ et
        arrivée restent fixes. La journée inclut route + temps sur place.
      </p>

      <div className="metrics metrics-day">
        <div className="metric metric-day">
          <span className="metric-label">Journée estimée</span>
          <span className="metric-value">{result.totalDayText}</span>
        </div>
        <div className="metric">
          <span className="metric-label">Temps de route</span>
          <span className="metric-value">{result.totalDurationText}</span>
        </div>
        <div className="metric">
          <span className="metric-label">Temps sur place</span>
          <span className="metric-value">{result.totalOnSiteText}</span>
        </div>
        <div className="metric">
          <span className="metric-label">Distance</span>
          <span className="metric-value">{result.totalDistanceText}</span>
        </div>
      </div>

      <div className="share-actions">
        <a
          className="btn-primary share-primary"
          href={mapsUrl}
          target="_blank"
          rel="noreferrer"
        >
          Ouvrir dans Google Maps
        </a>
        <button type="button" className="btn-secondary" onClick={shareToTech}>
          Envoyer au technicien
        </button>
        <button type="button" className="btn-ghost" onClick={copyLink}>
          {copyState === "copied"
            ? "Lien copié"
            : copyState === "error"
              ? "Copie impossible"
              : "Copier le lien"}
        </button>
      </div>
      <p className="share-hint">
        Le technicien ouvre le lien sur son téléphone : la tournée complète
        s&apos;affiche déjà dans Google Maps, prêt à démarrer la navigation.
      </p>

      <ol className="optimized-list">
        <li className="optimized-item depot">
          <span className="badge">Départ</span>
          <div>
            <p className="optimized-address">{result.startAddress}</p>
            <p className="optimized-leg">Départ vers {trafficLabel}</p>
          </div>
        </li>
        {stopDetails.map((stop, index) => (
          <li key={`${index}-${stop.address}`} className="optimized-item">
            <span className="badge">{index + 1}</span>
            <div>
              <p className="optimized-address">{stop.address}</p>
              <p className="optimized-leg">
                Sur place : {stop.minutesOnSite} min
                {stop.arriveLabel && stop.leaveLabel
                  ? ` · arrivée ${stop.arriveLabel} · départ ${stop.leaveLabel}`
                  : ""}
              </p>
              {result.legs[index] ? (
                <p className="optimized-leg">
                  Trajet précédent : {result.legs[index].distanceText} ·{" "}
                  {result.legs[index].durationText}
                </p>
              ) : null}
            </div>
          </li>
        ))}
        <li className="optimized-item depot">
          <span className="badge">Arrivée</span>
          <span>{result.endAddress}</span>
        </li>
      </ol>
    </section>
  );
}
