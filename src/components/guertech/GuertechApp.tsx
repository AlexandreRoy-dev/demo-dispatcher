"use client";

import { APIProvider } from "@vis.gl/react-google-maps";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CallList } from "@/components/guertech/CallList";
import { RouteBoard } from "@/components/guertech/RouteBoard";
import { TechRoster } from "@/components/guertech/TechRoster";
import {
  assignDay,
  mergePinnedAroundMovable,
} from "@/lib/guertech/assign";
import {
  countBusinessDays,
  createDefaultTechs,
  DEFAULT_DURATIONS,
  isReactifOverdue,
  preventifPerBusinessDay,
  QUARTER,
  SLA,
} from "@/lib/guertech/constants";
import { loadAppels } from "@/lib/guertech/csv";
import type { Appel, CallType, Tech, TechRoute, Unassigned } from "@/lib/guertech/types";
import type { OptimizeRouteResponse } from "@/lib/types";

function todayIsoDate(): string {
  return "2026-08-13";
}

async function fetchRoute(payload: {
  start: string;
  end: string;
  stops: { address: string; minutesOnSite: number }[];
  optimize: boolean;
  departureTime?: string;
}): Promise<OptimizeRouteResponse> {
  const response = await fetch("/api/optimize-route", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await response.json()) as OptimizeRouteResponse & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(data.error || "Échec de l'optimisation Google.");
  }
  return data;
}

function Workspace() {
  const [calls, setCalls] = useState<Appel[]>([]);
  const [techs, setTechs] = useState<Tech[]>(() => createDefaultTechs());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [date, setDate] = useState(todayIsoDate);
  const [moveAssigned, setMoveAssigned] = useState(false);
  const [pmQuota, setPmQuota] = useState(10);
  const [durations, setDurations] = useState(DEFAULT_DURATIONS);
  const [filter, setFilter] = useState<"all" | CallType | "overdue">("all");
  const [plannedOnly, setPlannedOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [routes, setRoutes] = useState<TechRoute[] | null>(null);
  const [unassigned, setUnassigned] = useState<Unassigned[]>([]);

  const businessDaysLeft = useMemo(
    () => countBusinessDays(date, QUARTER.deadline),
    [date],
  );
  const avgPreventifPerDay = useMemo(
    () => preventifPerBusinessDay(date),
    [date],
  );

  useEffect(() => {
    setPmQuota(Math.max(1, Math.ceil(avgPreventifPerDay)));
  }, [avgPreventifPerDay]);

  useEffect(() => {
    loadAppels()
      .then(setCalls)
      .catch((err: unknown) =>
        setLoadError(err instanceof Error ? err.message : "Chargement impossible"),
      );
  }, []);

  const reactifPendingCount = useMemo(
    () =>
      calls.filter(
        (item) => item.type === "reactif" && !isReactifOverdue(item, date),
      ).length,
    [calls, date],
  );
  const reactifOverdueCount = useMemo(
    () => calls.filter((item) => isReactifOverdue(item, date)).length,
    [calls, date],
  );

  const missingPlannedTime = calls.filter(
    (item) => item.planifie && !item.heure,
  );

  const updateCall = useCallback((id: string, patch: Partial<Appel>) => {
    setCalls((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }, []);

  const updateTech = useCallback((id: string, patch: Partial<Tech>) => {
    setTechs((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }, []);

  const addTech = useCallback(() => {
    const id = String(70 + techs.length);
    setTechs((current) => [
      ...current,
      {
        ...createDefaultTechs()[0],
        id,
        name: `Technicien ${id}`,
        present: true,
      },
    ]);
  }, [techs.length]);

  async function generate() {
    setError(null);
    setToast(null);
    if (missingPlannedTime.length > 0) {
      setError(
        `${missingPlannedTime.length} appel(s) planifié(s) sans heure 24 h. Complétez-les avant de générer.`,
      );
      return;
    }

    setLoading(true);
    try {
      const assigned = assignDay({
        calls,
        techs,
        pmQuota,
        durations,
        asOfDate: date,
      });
      setUnassigned(assigned.unassigned);

      const present = techs.filter((tech) => tech.present);
      const nextRoutes: TechRoute[] = [];

      for (const tech of present) {
        const stops = assigned.byTech[tech.id] ?? [];
        if (stops.length === 0) {
          nextRoutes.push({ tech, stops: [], google: null, error: null });
          continue;
        }

        const movable = stops.filter((stop) => !stop.pinned);
        let movableOrder = movable.map((stop) => stop.appel.id);

        try {
          if (movable.length >= 2) {
            const optimized = await fetchRoute({
              start: tech.start,
              end: tech.end || tech.start,
              stops: movable.map((stop) => ({
                address: stop.appel.adresse,
                minutesOnSite: stop.minutesOnSite,
              })),
              optimize: true,
            });
            movableOrder = optimized.waypointOrder.map(
              (index) => movable[index].appel.id,
            );
          }

          const merged = mergePinnedAroundMovable(
            stops,
            movableOrder,
            tech.startHour,
            tech.endHour,
          ).slice(0, 25);

          const departure = new Date(`${date}T${tech.startHour}:00`);
          const google = await fetchRoute({
            start: tech.start,
            end: tech.end || tech.start,
            stops: merged.map((stop) => ({
              address: stop.appel.adresse,
              minutesOnSite: stop.minutesOnSite,
            })),
            optimize: false,
            departureTime: departure.toISOString(),
          });

          nextRoutes.push({ tech, stops: merged, google, error: null });
        } catch (err) {
          nextRoutes.push({
            tech,
            stops,
            google: null,
            error:
              err instanceof Error
                ? err.message
                : "Google n'a pas pu calculer cette tournée.",
          });
        }
      }

      setRoutes(nextRoutes);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="gt gt-shell">
      <p className="gt-banner">
        Prototype dispatch Guertech — données CSV fictives, non branché à
        NetSuite. Les techniciens n&apos;utilisent pas cette plateforme : envoyez-leur
        le lien Google Maps.
      </p>
      <header className="gt-header">
        <div>
          <p className="gt-kicker">Guertech · Dispatch</p>
          <h1>Planification de la journée</h1>
          <p>
            Deux catégories d&apos;appels : préventif et réactif. Un appel{" "}
            <strong>planifié</strong> garde son heure 24 h et n&apos;est jamais
            réordonné.
          </p>
        </div>
        <a href="/">Démo Jordan Hale</a>
      </header>

      {loadError ? <p className="gt-error">{loadError}</p> : null}

      <div className="gt-stats">
        <div className="gt-stat">
          <span>Préventifs restants d&apos;ici fin Q4</span>
          <strong>{QUARTER.quarterTarget}</strong>
          <em>
            {QUARTER.yearTarget} / 4 · échéance {QUARTER.deadlineLabel}
          </em>
        </div>
        <div className="gt-stat">
          <span>Préventif à planifier / jour</span>
          <strong>{avgPreventifPerDay}</strong>
          <em>
            moyenne sur {businessDaysLeft} jours ouvrables restants
          </em>
        </div>
        <div className="gt-stat">
          <span>Réactif en attente (2 j)</span>
          <strong>{reactifPendingCount}</strong>
          <em>dans le délai de {SLA.reactif.delayDays} jours</em>
        </div>
        <div className="gt-stat gt-stat-alert">
          <span>Réactif délai dépassé</span>
          <strong>{reactifOverdueCount}</strong>
          <em>priorité immédiate</em>
        </div>
      </div>

      <section className="gt-panel" style={{ marginBottom: "1rem" }}>
        <h2>Paramètres du jour</h2>
        <div className="gt-row">
          <label className="gt-field">
            <span>Date à planifier</span>
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <fieldset className="gt-field">
            <span>Déplacer les tâches déjà attribuées ?</span>
            <label className="gt-check">
              <input
                type="radio"
                name="move"
                checked={!moveAssigned}
                onChange={() => setMoveAssigned(false)}
              />
              Non
            </label>
            <label className="gt-check">
              <input
                type="radio"
                name="move"
                checked={moveAssigned}
                onChange={() => setMoveAssigned(true)}
              />
              Oui — n&apos;unlock pas les planifiés
            </label>
          </fieldset>
          <label className="gt-field">
            <span>Entretiens préventifs à insérer</span>
            <input
              type="number"
              min={0}
              max={40}
              value={pmQuota}
              onChange={(event) => setPmQuota(Number(event.target.value) || 0)}
            />
          </label>
          <label className="gt-field">
            <span>Durée réactif (min)</span>
            <input
              type="number"
              value={durations.reactif}
              onChange={(event) =>
                setDurations((current) => ({
                  ...current,
                  reactif: Number(event.target.value) || 90,
                }))
              }
            />
          </label>
          <label className="gt-field">
            <span>Durée préventif (min)</span>
            <input
              type="number"
              value={durations.preventif}
              onChange={(event) =>
                setDurations((current) => ({
                  ...current,
                  preventif: Number(event.target.value) || 60,
                }))
              }
            />
          </label>
        </div>
        <p style={{ margin: 0, color: "var(--gt-muted)", fontSize: "0.88rem" }}>
          Réactif : délai {SLA.reactif.delayDays} j, priorité {SLA.reactif.priority} (
          {SLA.reactif.netsuiteId}). Préventif : {SLA.preventif.delayDays} j, priorité{" "}
          {SLA.preventif.priority} ({SLA.preventif.netsuiteId}).
        </p>
      </section>

      <div className="gt-grid">
        <TechRoster techs={techs} onChange={updateTech} onAdd={addTech} />
        <CallList
          calls={calls}
          techs={techs}
          asOfDate={date}
          filter={filter}
          plannedOnly={plannedOnly}
          search={search}
          onFilter={setFilter}
          onPlannedOnly={setPlannedOnly}
          onSearch={setSearch}
          onUpdate={updateCall}
        />
      </div>

      {error ? <p className="gt-error">{error}</p> : null}
      {toast ? <p className="gt-toast">{toast}</p> : null}

      <div className="gt-sticky">
        <button
          type="button"
          className="gt-btn-ghost"
          onClick={() =>
            setToast(
              "Prototype — les tournées ne sont pas poussées dans NetSuite.",
            )
          }
        >
          Pousser vers NetSuite
        </button>
        <button
          type="button"
          className="gt-btn"
          onClick={generate}
          disabled={loading || calls.length === 0}
        >
          {loading ? "Génération…" : "Générer les routes"}
        </button>
      </div>

      {routes ? <RouteBoard routes={routes} unassigned={unassigned} /> : null}
    </div>
  );
}

export function GuertechApp() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  if (!apiKey) {
    return (
      <div className="gt gt-shell">
        <p className="gt-error">
          Clé Google Maps manquante. Ajoutez NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
          dans .env.local.
        </p>
      </div>
    );
  }

  return (
    <APIProvider apiKey={apiKey} libraries={["places"]} language="fr-CA">
      <Workspace />
    </APIProvider>
  );
}
