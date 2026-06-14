"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_PREFIX = "hestia:cook-timer:";

interface StoredTimer {
  endsAt: number;
  durationSec: number;
  stepIndex: number;
}

function storageKey(recipeId: string) {
  return `${STORAGE_PREFIX}${recipeId}`;
}

function readStored(recipeId: string): StoredTimer | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(storageKey(recipeId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredTimer;
    if (
      typeof parsed.endsAt !== "number" ||
      typeof parsed.durationSec !== "number" ||
      typeof parsed.stepIndex !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeStored(recipeId: string, data: StoredTimer | null) {
  if (typeof sessionStorage === "undefined") return;
  try {
    const key = storageKey(recipeId);
    if (data == null) {
      sessionStorage.removeItem(key);
    } else {
      sessionStorage.setItem(key, JSON.stringify(data));
    }
  } catch {
    // Private mode / quota — timer still works in-memory.
  }
}

function notifyTimerComplete() {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate([200, 100, 200]);
  }
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    new Notification("Timer finished", { body: "Your cook timer is done." });
  }
}

export interface UseCookTimerOptions {
  recipeId: string;
  stepIndex: number;
  /** Timer length for the current step, or null if no timer. */
  timerSec: number | null | undefined;
}

/**
 * Deadline-based cook timer that survives screen lock and tab backgrounding.
 * Persists active timers in sessionStorage so navigation within cook mode
 * does not reset a running countdown.
 */
export function useCookTimer({
  recipeId,
  stepIndex,
  timerSec,
}: UseCookTimerOptions) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const endsAtRef = useRef<number | null>(null);
  const notifiedRef = useRef(false);

  const syncFromDeadline = useCallback(() => {
    const endsAt = endsAtRef.current;
    if (endsAt == null) return;
    const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    setRemaining(left);
    if (left <= 0) {
      endsAtRef.current = null;
      setRunning(false);
      writeStored(recipeId, null);
      if (!notifiedRef.current) {
        notifiedRef.current = true;
        notifyTimerComplete();
      }
    }
  }, [recipeId]);

  // Restore or load timer when step / duration changes.
  useEffect(() => {
    notifiedRef.current = false;
    const duration = timerSec ?? null;
    if (duration == null || duration <= 0) {
      endsAtRef.current = null;
      setRemaining(null);
      setRunning(false);
      return;
    }

    const stored = readStored(recipeId);
    if (stored && stored.stepIndex === stepIndex && stored.durationSec === duration) {
      const left = Math.max(0, Math.ceil((stored.endsAt - Date.now()) / 1000));
      if (left > 0) {
        endsAtRef.current = stored.endsAt;
        setRemaining(left);
        setRunning(true);
        return;
      }
      writeStored(recipeId, null);
    }

    endsAtRef.current = null;
    setRemaining(duration);
    setRunning(false);
  }, [recipeId, stepIndex, timerSec]);

  // Tick + resync when tab becomes visible again (screen unlock).
  useEffect(() => {
    if (!running || endsAtRef.current == null) return;

    syncFromDeadline();
    const interval = setInterval(syncFromDeadline, 250);

    const onVisibility = () => {
      if (document.visibilityState === "visible") syncFromDeadline();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [running, syncFromDeadline]);

  const toggle = useCallback(() => {
    if (remaining == null || remaining <= 0) return;

    if (running) {
      const left = endsAtRef.current
        ? Math.max(0, Math.ceil((endsAtRef.current - Date.now()) / 1000))
        : remaining;
      endsAtRef.current = null;
      setRemaining(left);
      setRunning(false);
      writeStored(recipeId, null);
      return;
    }

    notifiedRef.current = false;
    const sec = endsAtRef.current
      ? Math.max(0, Math.ceil((endsAtRef.current - Date.now()) / 1000))
      : remaining;
    if (sec <= 0) return;

    const endsAt = Date.now() + sec * 1000;
    endsAtRef.current = endsAt;
    setRemaining(sec);
    setRunning(true);
    writeStored(recipeId, {
      endsAt,
      durationSec: timerSec ?? sec,
      stepIndex,
    });

    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, [remaining, running, recipeId, stepIndex, timerSec]);

  const reset = useCallback(() => {
    endsAtRef.current = null;
    notifiedRef.current = false;
    writeStored(recipeId, null);
    const duration = timerSec ?? null;
    if (duration == null || duration <= 0) {
      setRemaining(null);
      setRunning(false);
      return;
    }
    setRemaining(duration);
    setRunning(false);
  }, [recipeId, timerSec]);

  return { remaining, running, toggle, reset };
}
