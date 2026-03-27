import { useEffect, useState } from "react";
import type { LocalSyncState } from "@/modules/workbench/domain/workbench-types";

export function useSyncBadgeState(localSyncState: LocalSyncState) {
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    let immediateTimer: number | null = null;
    let fadeTimer: number | null = null;
    let hideTimer: number | null = null;

    if (localSyncState !== "synced") {
      immediateTimer = window.setTimeout(() => {
        setVisible(true);
        setFading(false);
      }, 0);
    } else {
      immediateTimer = window.setTimeout(() => {
        setVisible(true);
        setFading(false);
      }, 0);
      fadeTimer = window.setTimeout(() => setFading(true), 3000);
      hideTimer = window.setTimeout(() => {
        setVisible(false);
        setFading(false);
      }, 3600);
    }

    return () => {
      if (immediateTimer !== null) {
        window.clearTimeout(immediateTimer);
      }
      if (fadeTimer !== null) {
        window.clearTimeout(fadeTimer);
      }
      if (hideTimer !== null) {
        window.clearTimeout(hideTimer);
      }
    };
  }, [localSyncState]);

  return { visible, fading };
}
