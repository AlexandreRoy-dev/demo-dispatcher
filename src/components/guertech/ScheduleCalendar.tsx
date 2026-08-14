"use client";

import { useMemo } from "react";
import { parseMinutes } from "@/lib/guertech/assign";
import type { PreventifSuggestion } from "@/lib/guertech/suggestions";
import { formatClock } from "@/lib/guertech/suggestions";
import type { DayStop, TechRoute } from "@/lib/guertech/types";

type CalendarItem =
  | {
      kind: "job";
      key: string;
      stop: DayStop;
      index: number;
      startMin: number;
      endMin: number;
      arriveLabel: string;
      leaveLabel: string;
    }
  | {
      kind: "travel";
      key: string;
      startMin: number;
      endMin: number;
      minutes: number;
      label: string;
    }
  | {
      kind: "suggestion";
      key: string;
      suggestion: PreventifSuggestion;
      startMin: number;
      endMin: number;
    };

type ScheduleCalendarProps = {
  routes: TechRoute[];
  suggestions: PreventifSuggestion[];
  selectedTechId?: string;
  onSelectTech?: (id: string) => void;
  onAcceptSuggestion?: (suggestion: PreventifSuggestion) => void;
  acceptingId?: string | null;
  onRemoveStop?: (techId: string, appelId: string) => void;
  removingId?: string | null;
};

const DAY_START = 7 * 60;
const DAY_END = 18 * 60;
const RANGE = DAY_END - DAY_START;
const HOUR_MARKS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
const DEFAULT_TRAVEL_MIN = 20;

function formatMin(total: number): string {
  const clamped = Math.max(0, Math.round(total));
  const hours = Math.floor(clamped / 60);
  const minutes = clamped % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function travelMinutesForLeg(route: TechRoute, stopIndex: number): number {
  const leg = route.google?.legs?.[stopIndex];
  if (leg && Number.isFinite(leg.durationSeconds) && leg.durationSeconds > 0) {
    return Math.max(5, Math.round(leg.durationSeconds / 60));
  }
  return DEFAULT_TRAVEL_MIN;
}

function buildTimeline(
  route: TechRoute,
  techSuggestions: PreventifSuggestion[],
): CalendarItem[] {
  const items: CalendarItem[] = [];
  let cursor = parseMinutes(route.tech.startHour || "08:00");

  route.stops.forEach((stop, index) => {
    const driveMin = travelMinutesForLeg(route, index);
    if (driveMin > 0) {
      items.push({
        kind: "travel",
        key: `travel-${route.tech.id}-${index}`,
        startMin: cursor,
        endMin: cursor + driveMin,
        minutes: driveMin,
        label: route.google?.legs?.[index]?.durationText
          ? `Trajet ${route.google.legs[index].durationText}`
          : `Trajet ~${driveMin} min`,
      });
      cursor += driveMin;
    }

    let startMin = cursor;
    if (stop.pinned && stop.appel.heure) {
      const pin = parseMinutes(stop.appel.heure);
      if (pin > startMin) startMin = pin;
    }

    const endMin = startMin + stop.minutesOnSite;
    items.push({
      kind: "job",
      key: stop.appel.id,
      stop,
      index,
      startMin,
      endMin,
      arriveLabel: formatMin(startMin),
      leaveLabel: formatMin(endMin),
    });
    cursor = endMin;
  });

  const returnLeg = route.google?.legs?.[route.stops.length];
  if (returnLeg && returnLeg.durationSeconds > 0) {
    const minutes = Math.max(5, Math.round(returnLeg.durationSeconds / 60));
    items.push({
      kind: "travel",
      key: `travel-return-${route.tech.id}`,
      startMin: cursor,
      endMin: cursor + minutes,
      minutes,
      label: `Retour dépôt · ${returnLeg.durationText}`,
    });
  }

  for (const suggestion of techSuggestions) {
    const startMin = suggestion.suggestedStartMin;
    const endMin = startMin + suggestion.minutesOnSite;
    items.push({
      kind: "suggestion",
      key: `sug-${suggestion.appel.id}`,
      suggestion,
      startMin,
      endMin,
    });
  }

  return items;
}

function topPct(startMin: number): number {
  return (
    ((Math.max(DAY_START, Math.min(DAY_END, startMin)) - DAY_START) / RANGE) *
    100
  );
}

function heightPct(startMin: number, endMin: number): number {
  const start = Math.max(DAY_START, startMin);
  const end = Math.min(DAY_END, Math.max(start + 12, endMin));
  return ((end - start) / RANGE) * 100;
}

export function ScheduleCalendar({
  routes,
  suggestions,
  selectedTechId,
  onSelectTech,
  onAcceptSuggestion,
  acceptingId = null,
  onRemoveStop,
  removingId = null,
}: ScheduleCalendarProps) {
  const columns = routes.filter((route) => route.stops.length > 0);

  const byTech = useMemo(() => {
    const map = new Map<string, PreventifSuggestion[]>();
    for (const suggestion of suggestions) {
      const list = map.get(suggestion.techId) ?? [];
      list.push(suggestion);
      map.set(suggestion.techId, list);
    }
    return map;
  }, [suggestions]);

  if (columns.length === 0) {
    return (
      <p className="gt-section-empty">
        Aucune tournée à afficher dans le calendrier.
      </p>
    );
  }

  return (
    <div className="gt-cal-wrap">
      {suggestions.length > 0 ? (
        <div className="gt-suggest-banner">
          <strong>{suggestions.length} suggestion(s) préventif</strong>
          <span>
            Clients déjà sur la tournée (réactif) qui ont aussi un entretien
            préventif en attente — proposés dans les créneaux libres, surtout en
            fin de journée.
          </span>
        </div>
      ) : null}

      <div className="gt-cal">
        <div className="gt-cal-hours" aria-hidden>
          {HOUR_MARKS.map((hour) => (
            <div
              key={hour}
              className="gt-cal-hour"
              style={{ top: `${((hour * 60 - DAY_START) / RANGE) * 100}%` }}
            >
              {String(hour).padStart(2, "0")}:00
            </div>
          ))}
        </div>

        <div
          className="gt-cal-columns"
          style={{
            gridTemplateColumns: `repeat(${columns.length}, minmax(10.5rem, 1fr))`,
          }}
        >
          {columns.map((route) => {
            const techSuggestions = byTech.get(route.tech.id) ?? [];
            const items = buildTimeline(route, techSuggestions);
            const selected = route.tech.id === selectedTechId;
            const jobCount = items.filter((item) => item.kind === "job").length;
            return (
              <div
                key={route.tech.id}
                className={`gt-cal-col${selected ? " on" : ""}`}
              >
                <button
                  type="button"
                  className="gt-cal-col-head"
                  onClick={() => onSelectTech?.(route.tech.id)}
                >
                  <strong>{route.tech.name}</strong>
                  <span>
                    {jobCount} arrêt{jobCount > 1 ? "s" : ""}
                    {techSuggestions.length
                      ? ` · ${techSuggestions.length} suggestion(s)`
                      : ""}
                    {route.google ? " · trafic Google" : " · estimé"}
                  </span>
                </button>
                <div className="gt-cal-day">
                  {HOUR_MARKS.map((hour) => (
                    <div
                      key={hour}
                      className="gt-cal-gridline"
                      style={{
                        top: `${((hour * 60 - DAY_START) / RANGE) * 100}%`,
                      }}
                    />
                  ))}
                  {items.map((item) => {
                    if (item.kind === "travel") {
                      const h = heightPct(item.startMin, item.endMin);
                      if (h < 1.2) return null;
                      return (
                        <div
                          key={item.key}
                          className="gt-cal-travel"
                          style={{
                            top: `${topPct(item.startMin)}%`,
                            height: `${h}%`,
                          }}
                          title={item.label}
                        >
                          <span>{item.label}</span>
                        </div>
                      );
                    }

                    if (item.kind === "suggestion") {
                      return (
                        <div
                          key={item.key}
                          className="gt-cal-suggest"
                          style={{
                            top: `${topPct(item.startMin)}%`,
                            height: `${Math.max(6, heightPct(item.startMin, item.endMin))}%`,
                          }}
                        >
                          <span className="gt-cal-event-time">
                            Suggestion · {formatClock(item.startMin)}
                          </span>
                          <span className="gt-cal-event-title">
                            {item.suggestion.appel.magasin}
                          </span>
                          <span className="gt-cal-event-meta">
                            {item.suggestion.reason}
                          </span>
                          <button
                            type="button"
                            className="gt-suggest-btn"
                            disabled={acceptingId === item.suggestion.appel.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              onAcceptSuggestion?.(item.suggestion);
                            }}
                          >
                            {acceptingId === item.suggestion.appel.id
                              ? "Ajout…"
                              : "Ajouter au horaire"}
                          </button>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={item.key}
                        className={`gt-cal-event ${item.stop.appel.type}${
                          item.stop.pinned ? " pinned" : ""
                        }`}
                        style={{
                          top: `${topPct(item.startMin)}%`,
                          height: `${Math.max(5.5, heightPct(item.startMin, item.endMin))}%`,
                        }}
                        title={`${item.arriveLabel}–${item.leaveLabel} · ${item.stop.appel.magasin}`}
                      >
                        <button
                          type="button"
                          className="gt-cal-remove"
                          title="Retirer de l'horaire"
                          aria-label={`Retirer ${item.stop.appel.magasin}`}
                          disabled={removingId === item.stop.appel.id}
                          onClick={(event) => {
                            event.stopPropagation();
                            onRemoveStop?.(route.tech.id, item.stop.appel.id);
                          }}
                        >
                          ×
                        </button>
                        <span className="gt-cal-event-time">
                          {item.arriveLabel}–{item.leaveLabel}
                          {item.stop.pinned ? " · planifié" : ""}
                        </span>
                        <span className="gt-cal-event-title">
                          {item.index + 1}. {item.stop.appel.magasin}
                        </span>
                        <span className="gt-cal-event-meta">
                          {item.stop.appel.type === "preventif"
                            ? "Préventif"
                            : "Réactif"}{" "}
                          · {item.stop.minutesOnSite} min sur place
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
