export type StopInput = {
  address: string;
  minutesOnSite: number;
};

export type OptimizeRouteRequest = {
  start: string;
  stops: StopInput[];
  end?: string;
  /** Default true. Set false to keep the given stop order (pinned planned calls). */
  optimize?: boolean;
  /** ISO timestamp; must be in the future for traffic-aware routing. */
  departureTime?: string;
};

export type LatLng = {
  lat: number;
  lng: number;
};

export type RouteLegSummary = {
  startAddress: string;
  endAddress: string;
  distanceText: string;
  distanceMeters: number;
  durationText: string;
  durationSeconds: number;
  startLocation: LatLng;
  endLocation: LatLng;
};

export type OptimizedStop = {
  address: string;
  minutesOnSite: number;
  /** Approximate arrival clock time label, e.g. "10 h 15" */
  arriveLabel?: string;
  /** Approximate departure after on-site time */
  leaveLabel?: string;
};

export type OptimizeRouteResponse = {
  optimizedStops: string[];
  optimizedStopDetails: OptimizedStop[];
  waypointOrder: number[];
  legs: RouteLegSummary[];
  totalDistanceText: string;
  totalDistanceMeters: number;
  totalDurationText: string;
  totalDurationSeconds: number;
  totalOnSiteMinutes: number;
  totalOnSiteText: string;
  totalDaySeconds: number;
  totalDayText: string;
  overviewPolyline: string;
  startAddress: string;
  endAddress: string;
  markerPoints: Array<{ label: string; position: LatLng }>;
  trafficAware: boolean;
  departureTime: string;
};

export type SampleDay = {
  techName: string;
  techRole: string;
  start: string;
  stops: StopInput[];
  end: string;
};
