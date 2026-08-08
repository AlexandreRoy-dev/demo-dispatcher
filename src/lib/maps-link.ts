import type { OptimizeRouteResponse, OptimizedStop } from "@/lib/types";

/** Builds a Google Maps directions URL the tech can open on their phone. */
export function buildGoogleMapsRouteUrl(result: OptimizeRouteResponse): string {
  const params = new URLSearchParams({
    api: "1",
    origin: result.startAddress,
    destination: result.endAddress,
    travelmode: "driving",
  });

  if (result.optimizedStops.length > 0) {
    params.set("waypoints", result.optimizedStops.join("|"));
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function buildRouteShareText(result: OptimizeRouteResponse): string {
  const details: OptimizedStop[] =
    result.optimizedStopDetails?.length > 0
      ? result.optimizedStopDetails
      : result.optimizedStops.map((address) => ({
          address,
          minutesOnSite: 30,
        }));

  const lines = [
    "Tournée optimisée - Jordan Hale",
    `Temps de route (trafic) : ${result.totalDurationText}`,
    `Temps sur place : ${result.totalOnSiteText}`,
    `Journée estimée : ${result.totalDayText}`,
    `Distance : ${result.totalDistanceText}`,
    "",
    `Départ : ${result.startAddress}`,
    ...details.map((stop, index) => {
      const timing =
        stop.arriveLabel && stop.leaveLabel
          ? ` · arrivée ${stop.arriveLabel}, départ ${stop.leaveLabel}`
          : "";
      return `${index + 1}. ${stop.address} (${stop.minutesOnSite} min sur place)${timing}`;
    }),
    `Arrivée : ${result.endAddress}`,
    "",
    "Ouvrir dans Google Maps :",
    buildGoogleMapsRouteUrl(result),
  ];
  return lines.join("\n");
}
