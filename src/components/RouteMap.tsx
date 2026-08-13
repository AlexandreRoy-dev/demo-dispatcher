"use client";

import { decode } from "@googlemaps/polyline-codec";
import { Map, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import { useEffect, useMemo } from "react";
import type { OptimizeRouteResponse } from "@/lib/types";

type RouteMapProps = {
  result: OptimizeRouteResponse | null;
  defaultCenter?: { lat: number; lng: number };
};

function RouteOverlay({ result }: { result: OptimizeRouteResponse }) {
  const map = useMap();
  const mapsLib = useMapsLibrary("maps");

  const path = useMemo(() => {
    if (!result.overviewPolyline) return [];
    return decode(result.overviewPolyline).map(([lat, lng]) => ({ lat, lng }));
  }, [result.overviewPolyline]);

  useEffect(() => {
    if (!map || !mapsLib || path.length === 0 || !window.google?.maps) return;

    const gmaps = window.google.maps;

    const polyline = new gmaps.Polyline({
      path,
      geodesic: true,
      strokeColor: "#0F4C5C",
      strokeOpacity: 0.95,
      strokeWeight: 5,
      map,
    });

    const markers = result.markerPoints.map(
      (point) =>
        new gmaps.Marker({
          position: point.position,
          map,
          label: {
            text: point.label,
            color: "#ffffff",
            fontWeight: "700",
            fontSize: "12px",
          },
        }),
    );

    const bounds = new gmaps.LatLngBounds();
    path.forEach((point) => bounds.extend(point));
    map.fitBounds(bounds, 56);

    return () => {
      polyline.setMap(null);
      markers.forEach((marker) => marker.setMap(null));
    };
  }, [map, mapsLib, path, result.markerPoints]);

  return null;
}

export function RouteMap({
  result,
  defaultCenter = { lat: 45.5017, lng: -73.5673 },
}: RouteMapProps) {
  return (
    <section className="panel map-panel">
      <div className="panel-heading">
        <h2>Carte de la tournée</h2>
      </div>
      <div className="map-shell">
        <Map
          defaultCenter={defaultCenter}
          defaultZoom={11}
          gestureHandling="greedy"
          disableDefaultUI={false}
          className="map-canvas"
        >
          {result ? <RouteOverlay result={result} /> : null}
        </Map>
        {!result ? (
          <div className="map-placeholder">
            La route optimisée s&apos;affiche ici après le calcul.
          </div>
        ) : null}
      </div>
    </section>
  );
}
