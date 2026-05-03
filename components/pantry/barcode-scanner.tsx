"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Body, Btn, Label, Mono } from "@/components/ds";

interface BarcodeScannerProps {
  onResult: (item: {
    name: string;
    qty?: number;
    unit?: string;
    location?: "pantry" | "fridge" | "freezer" | "spices";
    photoUrl?: string | null;
  }) => void;
}

export function BarcodeScanner({ onResult }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [scanning, setScanning] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);

  useEffect(() => {
    if (!scanning) return;
    const reader = new BrowserMultiFormatReader();
    let stop: (() => void) | undefined;
    setError(null);

    (async () => {
      try {
        const controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current!,
          (result, _err, ctrls) => {
            if (result) {
              setCode(result.getText());
              ctrls.stop();
              setScanning(false);
            }
          },
        );
        stop = () => controls.stop();
      } catch (err) {
        setError((err as Error).message);
        setScanning(false);
      }
    })();

    return () => {
      stop?.();
    };
  }, [scanning]);

  useEffect(() => {
    if (!code) return;
    let active = true;
    setLooking(true);
    fetch(`/api/pantry/barcode?code=${encodeURIComponent(code)}`)
      .then((r) => r.json())
      .then((json) => {
        if (!active) return;
        if (json.found) {
          onResult({
            name: json.name,
            qty: 1,
            unit: "each",
            location: json.location,
            photoUrl: json.photo_url,
          });
        } else {
          setError("Barcode not in Open Food Facts. Add manually.");
        }
      })
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLooking(false));
    return () => {
      active = false;
    };
  }, [code, onResult]);

  return (
    <div className="flex flex-col gap-3">
      <Label>scan barcode</Label>
      <div className="aspect-video rounded-card overflow-hidden bg-paper-3 border border-ink-l relative">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          playsInline
          muted
        />
        {!scanning ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Body size="sm" dim>
              Camera ready when you are.
            </Body>
          </div>
        ) : null}
      </div>
      {code ? (
        <Mono className="text-ink-3 text-[11px]">decoded: {code}</Mono>
      ) : null}
      {looking ? <Body size="sm" dim>looking up…</Body> : null}
      {error ? <Body size="sm" className="text-danger">{error}</Body> : null}
      <div className="flex gap-2">
        {scanning ? (
          <Btn variant="outline" onClick={() => setScanning(false)}>
            stop
          </Btn>
        ) : (
          <Btn variant="primary" onClick={() => { setCode(null); setScanning(true); }}>
            start camera
          </Btn>
        )}
      </div>
    </div>
  );
}
