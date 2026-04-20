import { useCallback, useEffect, useRef, useState } from "react";
import { reportClientIssue } from "@/shared/lib/observability";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

const MAX_RETRIES = 3;
const RETRY_DELAYS = [2000, 5000, 10000];

function isNonRetryableSaveError(error: unknown) {
  return Boolean((error as { noRetry?: boolean } | null)?.noRetry);
}

export function useAutoSave(
  save: () => Promise<void>,
  delay = 800
): { status: SaveStatus; flush: () => Promise<void>; markDirty: () => void } {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCount = useRef(0);
  const saveRef = useRef(save);
  const flushRef = useRef<() => Promise<void>>(async () => {});
  const inFlightFlushRef = useRef<Promise<void> | null>(null);
  const pendingFlushRef = useRef(false);

  useEffect(() => {
    saveRef.current = save;
  });

  const clearAllTimers = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (idleTimer.current) {
      clearTimeout(idleTimer.current);
      idleTimer.current = null;
    }
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
  }, []);

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (idleTimer.current) {
      clearTimeout(idleTimer.current);
      idleTimer.current = null;
    }
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
    if (inFlightFlushRef.current) {
      pendingFlushRef.current = true;
      return inFlightFlushRef.current;
    }

    const run = (async () => {
      let scheduledRetry = false;
      setStatus("saving");
      try {
        await saveRef.current();
        retryCount.current = 0;
        setStatus("saved");
        idleTimer.current = setTimeout(() => setStatus("idle"), 3000);
      } catch (error) {
        reportClientIssue("autosave", "save failed", { error });
        const nonRetryable = isNonRetryableSaveError(error);
        if (!nonRetryable && retryCount.current < MAX_RETRIES) {
          const retryDelay = RETRY_DELAYS[retryCount.current] ?? RETRY_DELAYS[RETRY_DELAYS.length - 1];
          retryCount.current += 1;
          scheduledRetry = true;
          setStatus("error");
          retryTimer.current = setTimeout(() => {
            retryTimer.current = null;
            void flushRef.current();
          }, retryDelay);
        } else {
          pendingFlushRef.current = false;
          setStatus("error");
        }
      } finally {
        inFlightFlushRef.current = null;
        if (scheduledRetry) {
          pendingFlushRef.current = false;
        } else if (pendingFlushRef.current) {
          pendingFlushRef.current = false;
          queueMicrotask(() => {
            void flushRef.current();
          });
        }
      }
    })();

    inFlightFlushRef.current = run;
    return run;
  }, []);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const markDirty = useCallback(() => {
    retryCount.current = 0;
    if (idleTimer.current) {
      clearTimeout(idleTimer.current);
      idleTimer.current = null;
    }
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
    setStatus("dirty");
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    timer.current = setTimeout(flush, delay);
  }, [flush, delay]);

  useEffect(() => () => {
    clearAllTimers();
  }, [clearAllTimers]);

  return { status, flush, markDirty };
}
