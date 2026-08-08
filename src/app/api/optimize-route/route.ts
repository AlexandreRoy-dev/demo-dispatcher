import { NextResponse } from "next/server";
import {
  DEFAULT_ON_SITE_MINUTES,
  formatClockLabel,
  formatDistance,
  formatDuration,
} from "@/lib/sample-data";
import type {
  OptimizeRouteRequest,
  OptimizeRouteResponse,
  OptimizedStop,
  RouteLegSummary,
  StopInput,
} from "@/lib/types";

type RoutesApiLatLng = {
  latitude: number;
  longitude: number;
};

type RoutesApiLeg = {
  distanceMeters?: number;
  duration?: string;
  staticDuration?: string;
  startLocation?: { latLng?: RoutesApiLatLng };
  endLocation?: { latLng?: RoutesApiLatLng };
};

type RoutesApiResponse = {
  error?: { message?: string; status?: string };
  routes?: Array<{
    distanceMeters?: number;
    duration?: string;
    staticDuration?: string;
    optimizedIntermediateWaypointIndex?: number[];
    polyline?: { encodedPolyline?: string };
    legs?: RoutesApiLeg[];
    viewport?: unknown;
  }>;
};

function parseDurationSeconds(value?: string): number {
  if (!value) return 0;
  const match = /^(\d+(?:\.\d+)?)s$/.exec(value.trim());
  if (!match) return 0;
  return Math.round(Number(match[1]));
}

function toLatLng(point?: RoutesApiLatLng) {
  if (!point) return { lat: 0, lng: 0 };
  return { lat: point.latitude, lng: point.longitude };
}

function normalizeStops(raw: unknown): StopInput[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      if (typeof item === "string") {
        const address = item.trim();
        return address
          ? { address, minutesOnSite: DEFAULT_ON_SITE_MINUTES }
          : null;
      }

      if (!item || typeof item !== "object") return null;
      const record = item as { address?: unknown; minutesOnSite?: unknown };
      const address = String(record.address ?? "").trim();
      if (!address) return null;

      const minutes = Number(record.minutesOnSite);
      return {
        address,
        minutesOnSite:
          Number.isFinite(minutes) && minutes >= 0
            ? Math.round(minutes)
            : DEFAULT_ON_SITE_MINUTES,
      };
    })
    .filter((stop): stop is StopInput => Boolean(stop));
}

export async function POST(request: Request) {
  const apiKey =
    process.env.GOOGLE_MAPS_SERVER_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Clé Google Maps manquante. Définissez GOOGLE_MAPS_SERVER_API_KEY ou NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.",
      },
      { status: 500 },
    );
  }

  let body: OptimizeRouteRequest;
  try {
    body = (await request.json()) as OptimizeRouteRequest;
  } catch {
    return NextResponse.json(
      { error: "Corps de requête JSON invalide." },
      { status: 400 },
    );
  }

  const start = body.start?.trim();
  const stops = normalizeStops(body.stops);
  const end = body.end?.trim() || start;

  if (!start) {
    return NextResponse.json(
      { error: "L'adresse de départ / dépôt est obligatoire." },
      { status: 400 },
    );
  }

  if (stops.length === 0) {
    return NextResponse.json(
      { error: "Ajoutez au moins une adresse d'arrêt." },
      { status: 400 },
    );
  }

  if (stops.length > 25) {
    return NextResponse.json(
      { error: "L'API Routes accepte au plus 25 arrêts intermédiaires." },
      { status: 400 },
    );
  }

  // Traffic-aware optimization: Google disallows optimizeWaypointOrder
  // with TRAFFIC_AWARE_OPTIMAL, so use TRAFFIC_AWARE (still live traffic).
  // departureTime must be in the future (clock skew / request latency).
  const departureTime = new Date(Date.now() + 2 * 60_000).toISOString();

  const routesBody = {
    origin: { address: start },
    destination: { address: end },
    intermediates: stops.map((stop) => ({ address: stop.address })),
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_AWARE",
    optimizeWaypointOrder: true,
    departureTime,
    languageCode: "fr-CA",
    regionCode: "CA",
    units: "METRIC",
  };

  const fieldMask = [
    "routes.distanceMeters",
    "routes.duration",
    "routes.staticDuration",
    "routes.polyline.encodedPolyline",
    "routes.optimizedIntermediateWaypointIndex",
    "routes.legs.distanceMeters",
    "routes.legs.duration",
    "routes.legs.staticDuration",
    "routes.legs.startLocation",
    "routes.legs.endLocation",
  ].join(",");

  let google: RoutesApiResponse;
  try {
    const res = await fetch(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": fieldMask,
        },
        body: JSON.stringify(routesBody),
        cache: "no-store",
      },
    );
    google = (await res.json()) as RoutesApiResponse;
    if (!res.ok) {
      const raw =
        google.error?.message || `Échec de l'API Routes (${res.status}).`;
      const permissionDenied =
        google.error?.status === "PERMISSION_DENIED" ||
        (/PERMISSION_DENIED|does not have permission|BillingNotEnabled|enable Billing/i.test(
          raw,
        ) &&
          !/optimize_waypoint_order/i.test(raw));
      return NextResponse.json(
        {
          error: permissionDenied
            ? "Permission refusée par Google. Dans Google Cloud Console, activez la facturation puis les API : Routes API, Maps JavaScript API et Places API pour cette clé."
            : raw,
        },
        { status: 400 },
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Impossible de joindre l'API Google Routes." },
      { status: 502 },
    );
  }

  const route = google.routes?.[0];
  if (!route) {
    return NextResponse.json(
      {
        error:
          google.error?.message ||
          "Aucune tournée tenant compte de la circulation n'a été trouvée pour ces adresses.",
      },
      { status: 400 },
    );
  }

  const rawOrder =
    route.optimizedIntermediateWaypointIndex ?? stops.map((_, i) => i);
  const waypointOrder = rawOrder.map((index, fallback) =>
    Number.isInteger(index) && index >= 0 && index < stops.length
      ? index
      : fallback,
  );

  const optimizedStops = waypointOrder.map((index) => stops[index].address);
  const legsRaw = route.legs ?? [];

  const legs: RouteLegSummary[] = legsRaw.map((leg, index) => {
    const durationSeconds = parseDurationSeconds(
      leg.duration || leg.staticDuration,
    );
    const distanceMeters = leg.distanceMeters ?? 0;
    const fromLabel =
      index === 0 ? start : optimizedStops[index - 1] || `Arrêt ${index}`;
    const toLabel =
      index < optimizedStops.length ? optimizedStops[index] : end;

    return {
      startAddress: fromLabel,
      endAddress: toLabel,
      distanceText: formatDistance(distanceMeters),
      distanceMeters,
      durationText: formatDuration(durationSeconds),
      durationSeconds,
      startLocation: toLatLng(leg.startLocation?.latLng),
      endLocation: toLatLng(leg.endLocation?.latLng),
    };
  });

  const totalDistanceMeters =
    route.distanceMeters ??
    legs.reduce((sum, leg) => sum + leg.distanceMeters, 0);
  const totalDurationSeconds =
    parseDurationSeconds(route.duration || route.staticDuration) ||
    legs.reduce((sum, leg) => sum + leg.durationSeconds, 0);

  // Build day timeline: drive legs + on-site time at each stop
  let cursor = new Date(departureTime);
  const optimizedStopDetails: OptimizedStop[] = [];

  for (let index = 0; index < optimizedStops.length; index += 1) {
    const driveSeconds = legs[index]?.durationSeconds ?? 0;
    cursor = new Date(cursor.getTime() + driveSeconds * 1000);
    const arriveLabel = formatClockLabel(cursor);

    const minutesOnSite = stops[waypointOrder[index]].minutesOnSite;
    cursor = new Date(cursor.getTime() + minutesOnSite * 60_000);
    const leaveLabel = formatClockLabel(cursor);

    optimizedStopDetails.push({
      address: optimizedStops[index],
      minutesOnSite,
      arriveLabel,
      leaveLabel,
    });
  }

  const totalOnSiteMinutes = optimizedStopDetails.reduce(
    (sum, stop) => sum + stop.minutesOnSite,
    0,
  );
  const totalDaySeconds = totalDurationSeconds + totalOnSiteMinutes * 60;

  const markerPoints: OptimizeRouteResponse["markerPoints"] = [];
  if (legs[0]) {
    markerPoints.push({ label: "D", position: legs[0].startLocation });
    optimizedStops.forEach((_, index) => {
      markerPoints.push({
        label: String(index + 1),
        position: legs[index].endLocation,
      });
    });
    const last = legs[legs.length - 1];
    if (last) {
      markerPoints.push({ label: "A", position: last.endLocation });
    }
  }

  const payload: OptimizeRouteResponse = {
    optimizedStops,
    optimizedStopDetails,
    waypointOrder,
    legs,
    totalDistanceText: formatDistance(totalDistanceMeters),
    totalDistanceMeters,
    totalDurationText: formatDuration(totalDurationSeconds),
    totalDurationSeconds,
    totalOnSiteMinutes,
    totalOnSiteText: formatDuration(totalOnSiteMinutes * 60),
    totalDaySeconds,
    totalDayText: formatDuration(totalDaySeconds),
    overviewPolyline: route.polyline?.encodedPolyline ?? "",
    startAddress: start,
    endAddress: end,
    markerPoints,
    trafficAware: true,
    departureTime,
  };

  return NextResponse.json(payload);
}
