"use client";

import { APIProvider } from "@vis.gl/react-google-maps";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import type {
  Appel,
  CallType,
  DayStop,
  Tech,
  TechRoute,
  Unassigned,
} from "@/lib/guertech/types";
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

async function buildTechRoute(
  tech: Tech,
  stops: DayStop[],
): Promise<TechRoute> {
  if (stops.length === 0) {
    return { tech, stops: [], google: null, error: null };
  }

  const limited = [
    ...stops.filter((stop) => stop.pinned),
    ...stops.filter((stop) => !stop.pinned),
  ].slice(0, 8);

  const movable = limited.filter((stop) => !stop.pinned);
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
      movableOrder = optimized.waypointOrder
        .map((index) => movable[index]?.appel.id)
        .filter((id): id is string => Boolean(id));
      if (movableOrder.length === 0) {
        movableOrder = movable.map((stop) => stop.appel.id);
      }
    }

    const merged = mergePinnedAroundMovable(
      limited,
      movableOrder,
      tech.startHour,
      tech.endHour,
    );

    const google = await fetchRoute({
      start: tech.start,
      end: tech.end || tech.start,
      stops: merged.map((stop) => ({
        address: stop.appel.adresse,
        minutesOnSite: stop.minutesOnSite,
      })),
      optimize: false,
      departureTime: new Date().toISOString(),
    });

    return { tech, stops: merged, google, error: null };
  } catch (err) {
    const merged = mergePinnedAroundMovable(
      limited,
      movableOrder,
      tech.startHour,
      tech.endHour,
    );
    return {
      tech,
      stops: merged,
      google: null,
      error:
        err instanceof Error
          ? err.message
          : "Google n'a pas pu calculer cette tournée.",
    };
  }
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
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [routes, setRoutes] = useState<TechRoute[] | null>(null);
  const [unassigned, setUnassigned] = useState<Unassigned[]>([]);
  const resultsRef = useRef<HTMLDivElement>(null);

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
        setLoadError(
          err instanceof Error ? err.message : "Chargement impossible",
        ),
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

    if (calls.length === 0) {
      setError("Liste d'appels encore vide — attendez le chargement du CSV.");
      return;
    }

    let workingCalls = calls;
    if (missingPlannedTime.length > 0) {
      workingCalls = calls.map((item) =>
        item.planifie && !item.heure ? { ...item, heure: "10:00" } : item,
      );
      setCalls(workingCalls);
      setToast(
        `${missingPlannedTime.length} appel(s) planifié(s) sans heure — 10:00 appliqué automatiquement.`,
      );
    }

    setLoading(true);
    setProgress("Répartition des appels…");

    try {
      const assigned = assignDay({
        calls: workingCalls,
        techs,
        pmQuota,
        durations,
        asOfDate: date,
      });
      setUnassigned(assigned.unassigned);

      const present = techs.filter((tech) => tech.present);
      const draft: TechRoute[] = present.map((tech) => {
        const stops = (assigned.byTech[tech.id] ?? []).slice(0, 8);
        const movable = stops.filter((stop) => !stop.pinned);
        const merged = mergePinnedAroundMovable(
          stops,
          movable.map((stop) => stop.appel.id),
          tech.startHour,
          tech.endHour,
        );
        return { tech, stops: merged, google: null, error: null };
      });

      setRoutes(draft);
      window.requestAnimationFrame(() => {
        resultsRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });

      const withStops = draft.filter((route) => route.stops.length > 0);
      if (withStops.length === 0) {
        setError(
          "Aucun arrêt assigné. Vérifiez les techniciens présents, les compétences et le quota préventif.",
        );
        return;
      }

      setProgress(
        `Optimisation Google Maps pour ${withStops.length} technicien(s)…`,
      );

      const googleRoutes = await Promise.all(
        draft.map(async (route) => {
          if (route.stops.length === 0) return route;
          return buildTechRoute(route.tech, route.stops);
        }),
      );

      setRoutes(googleRoutes);

      const failed = googleRoutes.filter((route) => route.error);
      if (failed.length > 0 && failed.length === withStops.length) {
        setError(
          `Google n'a pas renvoyé de routes (${failed[0]?.error}). Le calendrier affiche quand même l'horaire estimé.`,
        );
      } else if (failed.length > 0) {
        setToast(
          `${failed.length} tournée(s) sans trafic Google — horaires estimés affichés.`,
        );
      } else {
        setToast("Tournées générées — calendrier mis à jour.");
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "La génération a échoué. Réessayez.",
      );
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }

  return (
    <div className="gt gt-shell">
      <p className="gt-banner">
        Prototype dispatch Guertech — données CSV fictives, non branché à
        NetSuite. Les techniciens n&apos;utilisent pas cette plateforme :
        envoyez-leur le lien Google Maps.
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
          <em>moyenne sur {businessDaysLeft} jours ouvrables restants</em>
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
          Réactif : délai {SLA.reactif.delayDays} j, priorité{" "}
          {SLA.reactif.priority} ({SLA.reactif.netsuiteId}). Préventif :{" "}
          {SLA.preventif.delayDays} j, priorité {SLA.preventif.priority} (
          {SLA.preventif.netsuiteId}).
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
      {progress ? <p className="gt-toast">{progress}</p> : null}

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
          {loading ? progress || "Génération…" : "Générer les routes"}
        </button>
      </div>

      <div ref={resultsRef}>
        {routes ? <RouteBoard routes={routes} unassigned={unassigned} /> : null}
      </div>
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
