"use client";

import { AddressInput } from "@/components/AddressInput";
import { DEFAULT_ON_SITE_MINUTES } from "@/lib/sample-data";
import type { StopInput } from "@/lib/types";

type StopFormProps = {
  start: string;
  end: string;
  stops: StopInput[];
  loading: boolean;
  error: string | null;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  onStopAddressChange: (index: number, value: string) => void;
  onStopMinutesChange: (index: number, minutes: number) => void;
  onAddStop: () => void;
  onRemoveStop: (index: number) => void;
  onResetSample: () => void;
  onSubmit: () => void;
};

export function StopForm({
  start,
  end,
  stops,
  loading,
  error,
  onStartChange,
  onEndChange,
  onStopAddressChange,
  onStopMinutesChange,
  onAddStop,
  onRemoveStop,
  onResetSample,
  onSubmit,
}: StopFormProps) {
  return (
    <section className="panel form-panel">
      <div className="panel-heading">
        <h2>Appels du jour</h2>
        <button type="button" className="btn-ghost" onClick={onResetSample}>
          Charger la journée démo
        </button>
      </div>

      <div className="form-stack">
        <AddressInput
          id="start-address"
          label="Départ / dépôt (fixe)"
          value={start}
          onChange={onStartChange}
          placeholder="Où le technicien commence la journée"
          hint="Seul le départ et l'arrivée restent fixes."
        />

        <div className="stops-block">
          <div className="stops-heading">
            <h3>Adresses à visiter</h3>
            <span className="stops-count">{stops.length} adresses</span>
          </div>
          <p className="stops-note">
            L&apos;ordre dans cette liste n&apos;a pas d&apos;importance.
            Indiquez le temps approx. sur place (défaut {DEFAULT_ON_SITE_MINUTES}{" "}
            min) pour estimer la journée complète.
          </p>

          <ul className="stop-list">
            {stops.map((stop, index) => (
              <li key={`stop-${index}`} className="stop-row">
                <span className="stop-mark" aria-hidden="true" />
                <div className="stop-fields">
                  <div className="stop-input-wrap">
                    <AddressInput
                      id={`stop-${index}`}
                      label={`Adresse ${index + 1}`}
                      value={stop.address}
                      onChange={(value) => onStopAddressChange(index, value)}
                      placeholder="Adresse du client (ordre libre)"
                    />
                  </div>
                  <label
                    className="field minutes-field"
                    htmlFor={`minutes-${index}`}
                  >
                    <span className="field-label">Temps sur place</span>
                    <div className="minutes-input-row">
                      <input
                        id={`minutes-${index}`}
                        className="field-input minutes-input"
                        type="number"
                        min={0}
                        step={5}
                        value={stop.minutesOnSite}
                        onChange={(event) =>
                          onStopMinutesChange(
                            index,
                            Number(event.target.value),
                          )
                        }
                      />
                      <span className="minutes-suffix">min</span>
                    </div>
                  </label>
                </div>
                <button
                  type="button"
                  className="btn-icon"
                  onClick={() => onRemoveStop(index)}
                  disabled={stops.length <= 1}
                  aria-label={`Retirer l'adresse ${index + 1}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>

          <button type="button" className="btn-secondary" onClick={onAddStop}>
            + Ajouter une adresse
          </button>
        </div>

        <AddressInput
          id="end-address"
          label="Point d'arrivée (fixe)"
          value={end}
          onChange={onEndChange}
          placeholder="Par défaut : retour au dépôt"
          hint="Laissez le dépôt pour fermer la boucle de la journée."
        />

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          className="btn-primary"
          onClick={onSubmit}
          disabled={loading}
        >
          {loading ? "Optimisation…" : "Calculer l'ordre optimal"}
        </button>
      </div>
    </section>
  );
}
