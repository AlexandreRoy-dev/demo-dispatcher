"use client";

import { APIProvider } from "@vis.gl/react-google-maps";
import { useCallback, useState } from "react";
import { RouteMap } from "@/components/RouteMap";
import { RouteResults } from "@/components/RouteResults";
import { StaffHeader } from "@/components/StaffHeader";
import { StopForm } from "@/components/StopForm";
import {
  DEFAULT_ON_SITE_MINUTES,
  SAMPLE_DAY,
  createEmptyStop,
} from "@/lib/sample-data";
import type { OptimizeRouteResponse, StopInput } from "@/lib/types";

function DispatcherWorkspace() {
  const [start, setStart] = useState(SAMPLE_DAY.start);
  const [end, setEnd] = useState(SAMPLE_DAY.end);
  const [stops, setStops] = useState<StopInput[]>(SAMPLE_DAY.stops);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OptimizeRouteResponse | null>(null);

  const onStopAddressChange = useCallback((index: number, value: string) => {
    setStops((current) =>
      current.map((stop, i) =>
        i === index ? { ...stop, address: value } : stop,
      ),
    );
  }, []);

  const onStopMinutesChange = useCallback((index: number, minutes: number) => {
    const safe =
      Number.isFinite(minutes) && minutes >= 0
        ? Math.round(minutes)
        : DEFAULT_ON_SITE_MINUTES;
    setStops((current) =>
      current.map((stop, i) =>
        i === index ? { ...stop, minutesOnSite: safe } : stop,
      ),
    );
  }, []);

  const onAddStop = useCallback(() => {
    setStops((current) => [...current, createEmptyStop()]);
  }, []);

  const onRemoveStop = useCallback((index: number) => {
    setStops((current) =>
      current.length <= 1 ? current : current.filter((_, i) => i !== index),
    );
  }, []);

  const onResetSample = useCallback(() => {
    setStart(SAMPLE_DAY.start);
    setEnd(SAMPLE_DAY.end);
    setStops(SAMPLE_DAY.stops);
    setError(null);
    setResult(null);
  }, []);

  const onSubmit = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/optimize-route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start, stops, end }),
      });
      const data = (await response.json()) as OptimizeRouteResponse & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "Impossible d'optimiser la tournée.");
      }

      setResult(data);
    } catch (err) {
      setResult(null);
      setError(
        err instanceof Error
          ? err.message
          : "Impossible d'optimiser la tournée.",
      );
    } finally {
      setLoading(false);
    }
  }, [end, start, stops]);

  return (
    <div className="app-shell">
      <StaffHeader />
      <div className="workspace">
        <StopForm
          start={start}
          end={end}
          stops={stops}
          loading={loading}
          error={error}
          onStartChange={setStart}
          onEndChange={setEnd}
          onStopAddressChange={onStopAddressChange}
          onStopMinutesChange={onStopMinutesChange}
          onAddStop={onAddStop}
          onRemoveStop={onRemoveStop}
          onResetSample={onResetSample}
          onSubmit={onSubmit}
        />
        <div className="workspace-right">
          <RouteResults result={result} />
          <RouteMap result={result} />
        </div>
      </div>
    </div>
  );
}

export function DispatchApp() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  if (!apiKey) {
    return (
      <div className="app-shell">
        <StaffHeader />
        <div className="missing-key" role="alert">
          <p>
            <strong>Clé Google Maps manquante.</strong> Créez une clé dans{" "}
            <a
              href="https://console.cloud.google.com/google/maps-apis/credentials"
              target="_blank"
              rel="noreferrer"
            >
              Google Cloud Console
            </a>
            , activez <em>Routes API</em>, <em>Maps JavaScript API</em> et{" "}
            <em>Places API</em>, puis ajoutez-la dans{" "}
            <code>/var/www/demo-dispatcher/.env</code> sur le VPS (ou{" "}
            <code>.env.local</code> en local) :
          </p>
          <pre className="env-snippet">{`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=votre_clé
GOOGLE_MAPS_SERVER_API_KEY=votre_clé`}</pre>
          <p>
            Ensuite : <code>sudo systemctl restart demo-dispatcher</code>
          </p>
        </div>
      </div>
    );
  }

  return (
    <APIProvider apiKey={apiKey} libraries={["places"]} language="fr-CA">
      <DispatcherWorkspace />
    </APIProvider>
  );
}
