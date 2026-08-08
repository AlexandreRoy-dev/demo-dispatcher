import type { SampleDay, StopInput } from "./types";

export const DEFAULT_ON_SITE_MINUTES = 30;

/** Montreal-area sample day for one-click prospect demos */
export const SAMPLE_DAY: SampleDay = {
  techName: "Jordan Hale",
  techRole: "Technicien de service sur le terrain",
  start: "1000 Rue de la Gauchetière O, Montréal, QC H3B 4W5",
  stops: [
    {
      address: "1255 Rue Peel, Montréal, QC H3B 4R9",
      minutesOnSite: DEFAULT_ON_SITE_MINUTES,
    },
    {
      address: "3800 Rue Sherbrooke E, Montréal, QC H1X 2B2",
      minutesOnSite: DEFAULT_ON_SITE_MINUTES,
    },
    {
      address: "7077 Boulevard Newman, LaSalle, QC H8N 1X1",
      minutesOnSite: DEFAULT_ON_SITE_MINUTES,
    },
    {
      address: "1500 Avenue McGill College, Montréal, QC H3A 3J5",
      minutesOnSite: DEFAULT_ON_SITE_MINUTES,
    },
    {
      address: "4545 Avenue Pierre-De Coubertin, Montréal, QC H1V 0B2",
      minutesOnSite: DEFAULT_ON_SITE_MINUTES,
    },
  ],
  end: "1000 Rue de la Gauchetière O, Montréal, QC H3B 4W5",
};

export function createEmptyStop(): StopInput {
  return { address: "", minutesOnSite: DEFAULT_ON_SITE_MINUTES };
}

export function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  if (hours <= 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}

export function formatDistance(meters: number): string {
  const km = meters / 1000;
  return `${km.toFixed(1)} km`;
}

export function formatClockLabel(date: Date): string {
  return date.toLocaleString("fr-CA", {
    hour: "numeric",
    minute: "2-digit",
  });
}
