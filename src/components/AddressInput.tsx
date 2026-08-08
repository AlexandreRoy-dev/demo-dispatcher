"use client";

import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { useEffect, useRef } from "react";

type AddressInputProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
};

export function AddressInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  hint,
}: AddressInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const places = useMapsLibrary("places");
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!places || !inputRef.current) return;

    const autocomplete = new places.Autocomplete(inputRef.current, {
      fields: ["formatted_address", "name"],
      types: ["address"],
    });

    const listener = autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      const next =
        place.formatted_address || place.name || inputRef.current?.value || "";
      onChangeRef.current(next);
    });

    return () => {
      listener.remove();
    };
  }, [places]);

  return (
    <label className="field" htmlFor={id}>
      <span className="field-label">{label}</span>
      <input
        ref={inputRef}
        id={id}
        className="field-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}
