"use client";

import { APIProvider } from "@vis.gl/react-google-maps";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CallList } from "@/components/guertech/CallList";
import { HelpGuide } from "@/components/guertech/HelpGuide";
import { RouteBoard } from "@/components/guertech/RouteBoard";
import { TechRoster } from "@/components/guertech/TechRoster";
import {
  ALL_SKILL_IDS,
  countBusinessDays,
  DRUMMONDVILLE_HQ,
  isReactifOverdue,
  preventifPerBusinessDay,
  QUARTER,
  SLA,
} from "@/lib/guertech/constants";
import { loadAppels } from "@/lib/guertech/csv";
import {
  evaluateRoadWindow,
  mergePinnedOptimal,
  optimizeDay,
  ROAD_WINDOW,
  trimToSoftEnd,
  type OvertimeWarning,
} from "@/lib/guertech/optimize";
import {
  blankCallAssignments,
  createBlankRoster,
  DEMO_PLAN_DATE,
  parseDurations,
  suggestPlannerFields,
  todayIsoDate,
} from "@/lib/guertech/suggest-form";
import {
  suggestPreventifs,
  type PreventifSuggestion,
} from "@/lib/guertech/suggestions";
import type {
  Appel,
  CallType,
  DayStop,
  Tech,
  TechRoute,
  Unassigned,
} from "@/lib/guertech/types";
import type { OptimizeRouteResponse } from "@/lib/types";

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
  ].slice(0, 12);

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

    const { ordered: merged } = mergePinnedOptimal(
      limited,
      movableOrder,
      tech.startHour,
      ROAD_WINDOW.softEnd,
      true,
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
    const { ordered: merged } = mergePinnedOptimal(
      limited,
      movableOrder,
      tech.startHour,
      ROAD_WINDOW.softEnd,
      true,
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
  const [techs, setTechs] = useState<Tech[]>(() => createBlankRoster());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [date, setDate] = useState(todayIsoDate);
  const [moveAssigned, setMoveAssigned] = useState<boolean | null>(null);
  const [pmQuota, setPmQuota] = useState("");
  const [reactifDuration, setReactifDuration] = useState("");
  const [preventifDuration, setPreventifDuration] = useState("");
  const [filter, setFilter] = useState<"all" | CallType | "overdue">("all");
  const [plannedOnly, setPlannedOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [routes, setRoutes] = useState<TechRoute[] | null>(null);
  const [unassigned, setUnassigned] = useState<Unassigned[]>([]);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [allowOvertime, setAllowOvertime] = useState<boolean | null>(null);
  const [overtimeWarnings, setOvertimeWarnings] = useState<OvertimeWarning[]>(
    [],
  );
  const [overtimeIgnored, setOvertimeIgnored] = useState(false);
  const [presenceTouched, setPresenceTouched] = useState<Set<string>>(
    () => new Set(["5", "12", "18", "21"]),
  );
  const [skillsTouched, setSkillsTouched] = useState<Set<string>>(
    () => new Set(),
  );
  const [suggestionReady, setSuggestionReady] = useState(false);
  const [techPanelOpen, setTechPanelOpen] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  const effectiveDate = date || todayIsoDate();
  const emptyRoutes = useMemo<TechRoute[]>(
    () =>
      techs
        .filter((tech) => tech.present)
        .map((tech) => ({
          tech: {
            ...tech,
            startHour: tech.startHour || ROAD_WINDOW.start,
            endHour: tech.endHour || ROAD_WINDOW.softEnd,
            start: tech.start || DRUMMONDVILLE_HQ,
            end: tech.end || tech.start || DRUMMONDVILLE_HQ,
          },
          stops: [],
          google: null,
          error: null,
        })),
    [techs],
  );
  // Keep calendar columns even if generate once set routes to [].
  const displayRoutes =
    routes && routes.length > 0 ? routes : emptyRoutes;
  const durations = useMemo(
    () => parseDurations(reactifDuration, preventifDuration),
    [reactifDuration, preventifDuration],
  );
  const pmQuotaNumber = Number(pmQuota) || 0;

  const businessDaysLeft = useMemo(
    () => countBusinessDays(effectiveDate, QUARTER.deadline),
    [effectiveDate],
  );
  const avgPreventifPerDay = useMemo(
    () => preventifPerBusinessDay(effectiveDate),
    [effectiveDate],
  );

  useEffect(() => {
    loadAppels()
      .then((rows) => setCalls(blankCallAssignments(rows)))
      .catch((err: unknown) =>
        setLoadError(
          err instanceof Error ? err.message : "Chargement impossible",
        ),
      );
  }, []);

  const reactifPendingCount = useMemo(
    () =>
      calls.filter(
        (item) =>
          item.type === "reactif" && !isReactifOverdue(item, effectiveDate),
      ).length,
    [calls, effectiveDate],
  );
  const reactifOverdueCount = useMemo(
    () => calls.filter((item) => isReactifOverdue(item, effectiveDate)).length,
    [calls, effectiveDate],
  );

  const missingPlannedTime = calls.filter(
    (item) => item.planifie && !item.heure,
  );

  const preventifSuggestions = useMemo(() => {
    if (!displayRoutes.some((route) => route.stops.length > 0)) return [];
    const assignedIds = new Set(
      displayRoutes.flatMap((route) =>
        route.stops.map((stop) => stop.appel.id),
      ),
    );
    const candidates = calls.filter(
      (appel) =>
        appel.type === "preventif" &&
        !appel.planifie &&
        !assignedIds.has(appel.id),
    );
    return suggestPreventifs({
      routes: displayRoutes,
      candidates,
      durations,
      maxPerTech: 6,
    });
  }, [displayRoutes, calls, durations]);

  const updateCall = useCallback((id: string, patch: Partial<Appel>) => {
    setCalls((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }, []);

  const updateTech = useCallback((id: string, patch: Partial<Tech>) => {
    if ("present" in patch) {
      setPresenceTouched((current) => new Set(current).add(id));
    }
    if ("skills" in patch) {
      setSkillsTouched((current) => new Set(current).add(id));
    }
    setTechs((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }, []);

  const addTech = useCallback(() => {
    const id = String(70 + techs.length);
    setTechs((current) => [
      ...current,
      {
        ...createBlankRoster()[0],
        id,
        name: `Technicien ${id}`,
        present: false,
      },
    ]);
  }, [techs.length]);

  function applySuggestion() {
    setError(null);
    if (calls.length === 0) {
      setError("Liste d'appels encore vide — attendez le chargement du CSV.");
      return;
    }

    const result = suggestPlannerFields({
      inputs: {
        date,
        pmQuota,
        reactifDuration,
        preventifDuration,
        moveAssigned,
        allowOvertime,
      },
      techs,
      calls,
      presenceTouched,
      skillsTouched,
    });

    setDate(result.date);
    setPmQuota(result.pmQuota);
    setReactifDuration(result.reactifDuration);
    setPreventifDuration(result.preventifDuration);
    setMoveAssigned(result.moveAssigned);
    setAllowOvertime(result.allowOvertime);
    setTechs(result.techs);
    setCalls(result.calls);
    setSuggestionReady(true);
    setToast(
      `Suggestion appliquée (champs vides seulement) : ${result.summary.join(" · ")}`,
    );
  }

  const acceptSuggestion = useCallback(
    async (suggestion: PreventifSuggestion) => {
      if (!routes || acceptingId) return;
      const route = routes.find((item) => item.tech.id === suggestion.techId);
      if (!route) return;

      setAcceptingId(suggestion.appel.id);
      setProgress(`Ajout du préventif sur ${route.tech.name}…`);
      setToast(null);
      setError(null);

      try {
        const newStop: DayStop = {
          appel: { ...suggestion.appel, techId: suggestion.techId },
          minutesOnSite: suggestion.minutesOnSite,
          pinned: false,
        };
        const nextStops = [...route.stops];
        const insertAt = Math.max(
          0,
          Math.min(suggestion.insertAfterIndex + 1, nextStops.length),
        );
        nextStops.splice(insertAt, 0, newStop);

        const rebuilt = await buildTechRoute(route.tech, nextStops);
        const nextRoutes = (routes ?? []).map((item) =>
          item.tech.id === route.tech.id ? rebuilt : item,
        );
        setRoutes(nextRoutes);
        setUnassigned((current) =>
          current.filter((item) => item.appel.id !== suggestion.appel.id),
        );
        const warnings = evaluateRoadWindow(nextRoutes);
        setOvertimeWarnings(warnings);
        if (warnings.length > 0 && !overtimeIgnored && allowOvertime !== true) {
          setToast(
            `Préventif ajouté — attention : dépasse ${ROAD_WINDOW.softEndLabel}.`,
          );
        } else {
          setToast(
            `Préventif ajouté à ${route.tech.name} — ${suggestion.appel.magasin}`,
          );
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Impossible d'ajouter la suggestion.",
        );
      } finally {
        setAcceptingId(null);
        setProgress(null);
      }
    },
    [routes, acceptingId, overtimeIgnored, allowOvertime],
  );

  const acceptAllSuggestions = useCallback(async () => {
    if (!routes || acceptingId || preventifSuggestions.length === 0) return;

    setAcceptingId("__all__");
    setProgress(`Acceptation de ${preventifSuggestions.length} suggestion(s)…`);
    setToast(null);
    setError(null);

    try {
      const byTech = new Map<string, PreventifSuggestion[]>();
      for (const suggestion of preventifSuggestions) {
        const list = byTech.get(suggestion.techId) ?? [];
        list.push(suggestion);
        byTech.set(suggestion.techId, list);
      }

      let nextRoutes = [...routes];
      const acceptedIds = new Set<string>();

      for (const [techId, list] of byTech) {
        const route = nextRoutes.find((item) => item.tech.id === techId);
        if (!route) continue;
        const ordered = [...list].sort(
          (a, b) => a.suggestedStartMin - b.suggestedStartMin,
        );
        let nextStops = [...route.stops];
        for (const suggestion of ordered) {
          const newStop: DayStop = {
            appel: { ...suggestion.appel, techId },
            minutesOnSite: suggestion.minutesOnSite,
            pinned: false,
          };
          const insertAt = Math.max(
            0,
            Math.min(suggestion.insertAfterIndex + 1, nextStops.length),
          );
          nextStops.splice(insertAt, 0, newStop);
          acceptedIds.add(suggestion.appel.id);
        }
        const rebuilt = await buildTechRoute(route.tech, nextStops);
        nextRoutes = nextRoutes.map((item) =>
          item.tech.id === techId ? rebuilt : item,
        );
      }

      setRoutes(nextRoutes);
      setUnassigned((current) =>
        current.filter((item) => !acceptedIds.has(item.appel.id)),
      );
      setOvertimeWarnings(evaluateRoadWindow(nextRoutes));
      setToast(
        `${acceptedIds.size} suggestion(s) ajoutée(s) aux horaires.`,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible d'accepter les suggestions.",
      );
    } finally {
      setAcceptingId(null);
      setProgress(null);
    }
  }, [routes, acceptingId, preventifSuggestions]);

  const removeStop = useCallback(
    async (techId: string, appelId: string) => {
      if (!routes || removingId) return;
      const route = routes.find((item) => item.tech.id === techId);
      if (!route) return;
      const removed = route.stops.find((stop) => stop.appel.id === appelId);
      if (!removed) return;

      setRemovingId(appelId);
      setProgress(`Retrait de ${removed.appel.magasin}…`);
      setError(null);

      try {
        const nextStops = route.stops.filter(
          (stop) => stop.appel.id !== appelId,
        );
        const rebuilt =
          nextStops.length === 0
            ? { tech: route.tech, stops: [], google: null, error: null }
            : await buildTechRoute(route.tech, nextStops);

        const nextRoutes = (routes ?? []).map((item) =>
          item.tech.id === techId ? rebuilt : item,
        );
        setRoutes(nextRoutes);
        setUnassigned((current) => [
          {
            appel: removed.appel,
            reason: "Retiré du calendrier",
          },
          ...current.filter((item) => item.appel.id !== appelId),
        ]);
        if (removed.pinned || removed.appel.planifie) {
          setCalls((current) =>
            current.map((item) =>
              item.id === appelId
                ? { ...item, planifie: false, heure: "", techId: "" }
                : item,
            ),
          );
        }
        setOvertimeWarnings(evaluateRoadWindow(nextRoutes));
        setToast(`${removed.appel.magasin} retiré de l'horaire.`);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Impossible de retirer cet arrêt.",
        );
      } finally {
        setRemovingId(null);
        setProgress(null);
      }
    },
    [routes, removingId],
  );

  const ignoreOvertimeWarning = useCallback(() => {
    setOvertimeIgnored(true);
    setAllowOvertime(true);
    setToast(
      `Avertissement 8 h–${ROAD_WINDOW.softEndLabel} ignoré — tournées conservées.`,
    );
  }, []);

  const trimOvertimeRoutes = useCallback(async () => {
    if (!routes) return;
    setLoading(true);
    setProgress("Raccourcissement des tournées…");
    try {
      const removedAll: DayStop[] = [];
      const trimmed = routes.map((route) => {
        const result = trimToSoftEnd(route.tech, route.stops);
        removedAll.push(...result.removed);
        return { ...route, stops: result.stops };
      });

      const rebuilt = await Promise.all(
        trimmed.map(async (route) => {
          if (route.stops.length === 0) {
            return { ...route, google: null, error: null };
          }
          return buildTechRoute(route.tech, route.stops);
        }),
      );
      setRoutes(rebuilt);
      if (removedAll.length > 0) {
        setUnassigned((current) => [
          ...removedAll.map((stop) => ({
            appel: stop.appel,
            reason: `Retiré pour respecter ${ROAD_WINDOW.softEndLabel}`,
          })),
          ...current,
        ]);
      }
      setOvertimeWarnings(evaluateRoadWindow(rebuilt));
      setOvertimeIgnored(false);
      setToast(
        removedAll.length > 0
          ? `${removedAll.length} arrêt(s) retirés pour finir avant ${ROAD_WINDOW.softEndLabel}.`
          : `Impossible de raccourcir davantage (planifiés fixes).`,
      );
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }, [routes]);

  async function generate() {
    setError(null);
    setToast(null);
    setOvertimeIgnored(false);
    setOvertimeWarnings([]);

    if (calls.length === 0) {
      setError("Liste d'appels encore vide — attendez le chargement du CSV.");
      return;
    }

    const overtimeAllowed = allowOvertime === true;
    const planDate = date || todayIsoDate();
    const quota = pmQuotaNumber > 0 ? pmQuotaNumber : Math.ceil(avgPreventifPerDay);
    const readyTechs = techs.map((tech) => ({
      ...tech,
      startHour: tech.startHour || ROAD_WINDOW.start,
      endHour: tech.endHour || ROAD_WINDOW.softEnd,
      start: tech.start || DRUMMONDVILLE_HQ,
      end: tech.end || tech.start || DRUMMONDVILLE_HQ,
      skills:
        tech.skills && tech.skills.length > 0
          ? tech.skills
          : [...ALL_SKILL_IDS],
    }));

    if (!readyTechs.some((tech) => tech.present)) {
      setError(
        "Aucun technicien présent. Utilisez « Générer une suggestion » ou cochez Présent.",
      );
      return;
    }

    // Persist filled defaults so the roster / calendar stay consistent.
    setTechs(readyTechs);

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
    setProgress("Optimisation de la journée (fenêtre 8 h–17 h)…");

    try {
      const assigned = optimizeDay({
        calls: workingCalls,
        techs: readyTechs,
        pmQuota: quota,
        durations,
        asOfDate: planDate,
        allowOvertime: overtimeAllowed,
      });
      setUnassigned(assigned.unassigned);

      const present = readyTechs.filter((tech) => tech.present);
      const mergeLeftovers: DayStop[] = [];
      const draft: TechRoute[] = present.map((tech) => {
        const raw = (assigned.byTech[tech.id] ?? []).slice(0, 12);
        const movable = raw.filter((stop) => !stop.pinned);
        const { ordered, leftover } = mergePinnedOptimal(
          raw,
          movable.map((stop) => stop.appel.id),
          tech.startHour,
          ROAD_WINDOW.softEnd,
          overtimeAllowed,
        );
        mergeLeftovers.push(...leftover);
        return { tech, stops: ordered, google: null, error: null };
      });

      if (mergeLeftovers.length > 0) {
        setUnassigned([
          ...assigned.unassigned,
          ...mergeLeftovers.map((stop) => ({
            appel: stop.appel,
            reason: `Hors fenêtre 8 h–${ROAD_WINDOW.softEndLabel}`,
          })),
        ]);
      }

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

      const warnings = evaluateRoadWindow(googleRoutes);
      const mergedWarnings = [...assigned.earlyWarnings];
      for (const warning of warnings) {
        if (!mergedWarnings.some((item) => item.techId === warning.techId)) {
          mergedWarnings.push(warning);
        } else {
          const index = mergedWarnings.findIndex(
            (item) => item.techId === warning.techId,
          );
          mergedWarnings[index] = warning;
        }
      }
      setOvertimeWarnings(mergedWarnings);

      const failed = googleRoutes.filter((route) => route.error);
      if (failed.length > 0 && failed.length === withStops.length) {
        setError(
          `Google n'a pas renvoyé de routes (${failed[0]?.error}). Le calendrier affiche quand même l'horaire estimé.`,
        );
      } else if (mergedWarnings.length > 0 && !overtimeAllowed) {
        setToast(
          `Tournées générées — ${mergedWarnings.length} tech(s) dépassent ${ROAD_WINDOW.softEndLabel}.`,
        );
      } else if (failed.length > 0) {
        setToast(
          `${failed.length} tournée(s) sans trafic Google — horaires estimés affichés.`,
        );
      } else {
        setToast("Tournées optimisées — calendrier mis à jour.");
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
    <div
      className={`gt gt-shell${displayRoutes.length > 0 ? " gt-shell-wide" : ""}`}
    >
      <header className="gt-header gt-header-compact">
        <div>
          <p className="gt-kicker">Dispatch v2</p>
          <h1>Planification de la journée</h1>
        </div>
        <div className="gt-header-actions">
          <button
            type="button"
            className="gt-btn-ghost"
            onClick={() => setTechPanelOpen(true)}
          >
            Techniciens
          </button>
        </div>
      </header>

      <HelpGuide />

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

      <div className="gt-sticky gt-sticky-top">
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
          className="gt-btn-ghost"
          onClick={applySuggestion}
          disabled={loading || calls.length === 0}
        >
          Générer une suggestion
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

      {error ? <p className="gt-error">{error}</p> : null}
      {toast ? <p className="gt-toast">{toast}</p> : null}
      {progress ? <p className="gt-toast">{progress}</p> : null}

      {displayRoutes.length > 0 ? (
        <div className="gt-split gt-split-top" ref={resultsRef}>
          <aside className="gt-split-calls">
            <CallList
              calls={calls}
              techs={techs}
              asOfDate={effectiveDate}
              filter={filter}
              plannedOnly={plannedOnly}
              search={search}
              onFilter={setFilter}
              onPlannedOnly={setPlannedOnly}
              onSearch={setSearch}
              onUpdate={updateCall}
            />
          </aside>
          <div className="gt-split-calendar">
            <RouteBoard
              routes={displayRoutes}
              suggestions={preventifSuggestions}
              onAcceptSuggestion={acceptSuggestion}
              onAcceptAllSuggestions={acceptAllSuggestions}
              acceptingId={acceptingId}
              overtimeWarnings={overtimeWarnings}
              overtimeIgnored={overtimeIgnored || allowOvertime === true}
              onIgnoreOvertime={ignoreOvertimeWarning}
              onTrimOvertime={trimOvertimeRoutes}
              onRemoveStop={removeStop}
              removingId={removingId}
              onOpenTechPanel={() => setTechPanelOpen(true)}
              emptyHint={
                routes
                  ? undefined
                  : "Calendrier prêt — générez les routes pour remplir les colonnes."
              }
            />
          </div>
        </div>
      ) : (
        <div className="gt-calls-solo">
          <CallList
            calls={calls}
            techs={techs}
            asOfDate={effectiveDate}
            filter={filter}
            plannedOnly={plannedOnly}
            search={search}
            onFilter={setFilter}
            onPlannedOnly={setPlannedOnly}
            onSearch={setSearch}
            onUpdate={updateCall}
          />
          <p className="gt-section-empty">
            Aucun technicien présent — ouvrez le panneau Techniciens.
          </p>
        </div>
      )}

      <details className="gt-params-details">
        <summary>Paramètres du jour</summary>
        <section className="gt-panel" style={{ marginTop: "0.75rem" }}>
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
                  checked={moveAssigned === false}
                  onChange={() => setMoveAssigned(false)}
                />
                Non
              </label>
              <label className="gt-check">
                <input
                  type="radio"
                  name="move"
                  checked={moveAssigned === true}
                  onChange={() => setMoveAssigned(true)}
                />
                Oui — n&apos;unlock pas les planifiés
              </label>
              {moveAssigned === null ? (
                <em style={{ color: "var(--gt-muted)", fontSize: "0.8rem" }}>
                  Non choisi — la suggestion proposera Non
                </em>
              ) : null}
            </fieldset>
            <label className="gt-field">
              <span>Entretiens préventifs à insérer</span>
              <input
                type="number"
                min={0}
                max={40}
                value={pmQuota}
                placeholder={`ex. ${Math.ceil(avgPreventifPerDay)} (ratio Q4)`}
                onChange={(event) => setPmQuota(event.target.value)}
              />
            </label>
            <label className="gt-field">
              <span>Durée réactif (min)</span>
              <input
                type="number"
                value={reactifDuration}
                placeholder="90"
                onChange={(event) => setReactifDuration(event.target.value)}
              />
            </label>
            <label className="gt-field">
              <span>Durée préventif (min)</span>
              <input
                type="number"
                value={preventifDuration}
                placeholder="60"
                onChange={(event) => setPreventifDuration(event.target.value)}
              />
            </label>
          </div>
          <p
            style={{ margin: 0, color: "var(--gt-muted)", fontSize: "0.88rem" }}
          >
            Réactif : délai {SLA.reactif.delayDays} j. Fenêtre route soft : 8 h–
            {ROAD_WINDOW.softEndLabel}.
          </p>
          <label className="gt-check" style={{ marginTop: "0.65rem" }}>
            <input
              type="checkbox"
              checked={allowOvertime === true}
              onChange={(event) => setAllowOvertime(event.target.checked)}
            />
            Autoriser les tournées après {ROAD_WINDOW.softEndLabel}
          </label>
        </section>
      </details>

      {techPanelOpen ? (
        <div className="gt-drawer-root">
          <button
            type="button"
            className="gt-drawer-backdrop"
            aria-label="Fermer"
            onClick={() => setTechPanelOpen(false)}
          />
          <aside className="gt-drawer" role="dialog" aria-label="Techniciens">
            <div className="gt-drawer-head">
              <h2>Techniciens</h2>
              <button
                type="button"
                className="gt-btn-ghost"
                onClick={() => setTechPanelOpen(false)}
              >
                Fermer
              </button>
            </div>
            <TechRoster
              techs={techs}
              onChange={updateTech}
              onAdd={addTech}
              defaultOpen
              hideToggle
            />
          </aside>
        </div>
      ) : null}
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
