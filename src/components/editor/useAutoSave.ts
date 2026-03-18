import { useCallback, useEffect, useRef, useState } from "react";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export function useAutoSave(
  save: () => Promise<void>,
  delay = 800
): { status: SaveStatus; flush: () => Promise<void>; markDirty: () => void } {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(save);

  useEffect(() => {
    saveRef.current = save;
  });

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    setStatus("saving");
    try {
      await saveRef.current();
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 3000);
    } catch {
      setStatus("error");
    }
  }, []);

  const markDirty = useCallback(() => {
    setStatus("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, delay);
  }, [flush, delay]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return { status, flush, markDirty };
}
