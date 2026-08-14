"use client";

import { parseMinutes } from "@/lib/guertech/assign";
import type { DayStop, TechRoute } from "@/lib/guertech/types";

type CalendarEvent = {
  stop: DayStop;
  index: number;
  startMin: number;
  endMin: number;
  arriveLabel: string;
  leaveLabel: string;
};

type ScheduleCalendarProps = {
  routes: TechRoute[];
  selectedTechId?: string;
  onSelectTech?: (id: string) => void;
};

const DAY_START = 7 * 60; // 07:00
const DAY_END = 18 * 60; // 18:00
const RANGE = DAY_END - DAY_START;
const HOUR_MARKS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

function parseClockLabel(label?: string): number | null {
  if (!label) return null;
  // "10 h 15", "10:15", "10 h"
  const match = label
    .normalize("NFKC")
    .match(/(\d{1,2})\s*(?:h|:)\s*(\d{2})?/i);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  if (!Number.isFinite(hours)) return null;
  return hours * 60 + minutes;
}

function formatMin(total: number): string {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function buildEvents(route: TechRoute): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  let cursor = parseMinutes(route.tech.startHour || "08:00");

  route.stops.forEach((stop, index) => {
    const detail = route.google?.optimizedStopDetails[index];
    const arriveFromGoogle = parseClockLabel(detail?.arriveLabel);
    const leaveFromGoogle = parseClockLabel(detail?.leaveLabel);

    let startMin: number;
    if (stop.pinned && stop.appel.heure) {
      startMin = parseMinutes(stop.appel.heure);
    } else if (arriveFromGoogle != null) {
      startMin = arriveFromGoogle;
    } else {
      startMin = cursor;
    }

    const endMin =
      leaveFromGoogle != null
        ? leaveFromGoogle
        : startMin + stop.minutesOnSite;

    events.push({
      stop,
      index,
      startMin,
      endMin,
      arriveLabel: detail?.arriveLabel || formatMin(startMin),
      leaveLabel: detail?.leaveLabel || formatMin(endMin),
    });

    cursor = Math.max(cursor, endMin) + 15;
  });

  return events;
}

function topPct(startMin: number): number {
  return ((Math.max(DAY_START, startMin) - DAY_START) / RANGE) * 100;
}

function heightPct(startMin: number, endMin: number): number {
  const start = Math.max(DAY_START, startMin);
  const end = Math.min(DAY_END, Math.max(start + 20, endMin));
  return ((end - start) / RANGE) * 100;
}

export function ScheduleCalendar({
  routes,
  selectedTechId,
  onSelectTech,
}: ScheduleCalendarProps) {
  const columns = routes.filter((route) => route.stops.length > 0);

  if (columns.length === 0) {
    return (
      <p className="gt-section-empty">
        Aucune tournée à afficher dans le calendrier.
      </p>
    );
  }

  return (
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
          gridTemplateColumns: `repeat(${columns.length}, minmax(9.5rem, 1fr))`,
        }}
      >
        {columns.map((route) => {
          const events = buildEvents(route);
          const selected = route.tech.id === selectedTechId;
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
                  {route.stops.length} arrêt
                  {route.stops.length > 1 ? "s" : ""} · {route.tech.startHour}–
                  {route.tech.endHour}
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
                {events.map((event) => (
                  <div
                    key={event.stop.appel.id}
                    className={`gt-cal-event ${event.stop.appel.type}${
                      event.stop.pinned ? " pinned" : ""
                    }`}
                    style={{
                      top: `${topPct(event.startMin)}%`,
                      height: `${Math.max(4.5, heightPct(event.startMin, event.endMin))}%`,
                    }}
                    title={`${event.arriveLabel}–${event.leaveLabel} · ${event.stop.appel.magasin}`}
                  >
                    <span className="gt-cal-event-time">
                      {event.arriveLabel}
                      {event.stop.pinned ? " 🔒" : ""}
                    </span>
                    <span className="gt-cal-event-title">
                      {event.index + 1}. {event.stop.appel.magasin}
                    </span>
                    <span className="gt-cal-event-meta">
                      {event.stop.appel.type === "preventif"
                        ? "Préventif"
                        : "Réactif"}{" "}
                      · {event.stop.minutesOnSite} min
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
