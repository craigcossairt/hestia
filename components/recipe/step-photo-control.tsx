"use client";

import { useRef, useState, useTransition } from "react";
import { Camera, Image as ImageIcon, Trash2, Upload } from "lucide-react";
import { Body, Btn } from "@/components/ds";
import {
  uploadDraftRecipeImage,
  uploadStepPhoto,
} from "@/app/(app)/recipes/actions";
import { cn } from "@/lib/utils";

interface StepPhotoControlProps {
  /** When set with persistImmediately, upload writes onto steps_json. */
  recipeId?: string;
  stepIndex: number;
  photoUrl?: string | null;
  onChange: (url: string | null) => void;
  /**
   * When true (and recipeId is set), persist photo_url into steps_json
   * immediately via uploadStepPhoto. When false, upload returns a URL
   * only — caller saves later. Defaults to true whenever recipeId is set.
   */
  persistImmediately?: boolean;
  /** Larger preview for cook mode. */
  size?: "sm" | "md" | "lg";
  /** Prefer camera capture (cook / mobile). */
  capture?: boolean;
  className?: string;
}

/**
 * Compact per-step photo attach/remove. Works with a saved recipe
 * (persists immediately) or draft/edit flows (returns URL only).
 */
export function StepPhotoControl({
  recipeId,
  stepIndex,
  photoUrl,
  onChange,
  persistImmediately,
  size = "sm",
  capture = false,
  className,
}: StepPhotoControlProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const dims =
    size === "lg"
      ? "w-full max-w-md aspect-[4/3]"
      : size === "md"
        ? "w-40 h-40"
        : "w-16 h-16";

  function handleFile(file: File) {
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] ?? "";
      start(async () => {
        const shouldPersist =
          recipeId != null && (persistImmediately ?? true);
        const r = shouldPersist
          ? await uploadStepPhoto({
              recipeId: recipeId!,
              stepIndex,
              filename: file.name,
              base64,
              contentType: file.type,
            })
          : await uploadDraftRecipeImage({
              filename: file.name,
              base64,
              contentType: file.type,
              folder:
                recipeId != null ? `${recipeId}/steps` : undefined,
            });
        if ("error" in r && r.error) {
          setError(r.error);
          return;
        }
        if ("url" in r && r.url) onChange(r.url);
      });
    };
    reader.onerror = () => setError("Couldn't read that file.");
    reader.readAsDataURL(file);
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div
        className={cn(
          "relative shrink-0 rounded-thumb overflow-hidden border border-ink-l bg-paper-2 flex items-center justify-center",
          dims,
        )}
      >
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt={`Step ${stepIndex + 1}`}
            className="w-full h-full object-cover"
          />
        ) : (
          <ImageIcon
            size={size === "lg" ? 36 : 18}
            className="text-ink-3"
          />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          capture={capture ? "environment" : undefined}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
        <Btn
          variant="ghost"
          size="sm"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="!px-2"
        >
          <span className="inline-flex items-center gap-1 text-[12px]">
            {capture ? <Camera size={13} /> : <Upload size={13} />}
            {uploading ? "…" : photoUrl ? "Replace" : "Photo"}
          </span>
        </Btn>
        {photoUrl ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-ink-3 hover:text-danger p-1 rounded"
            aria-label="remove step photo"
          >
            <Trash2 size={13} />
          </button>
        ) : null}
      </div>
      {error ? (
        <Body size="xs" className="text-danger">
          {error}
        </Body>
      ) : null}
    </div>
  );
}
