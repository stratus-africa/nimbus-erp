import { useCallback, useEffect, useState } from "react";

/**
 * Per-user persisted sidebar preferences, stored in localStorage.
 *  - `open`: top-level expanded/collapsed state on desktop
 *  - `groups`: open/closed state per collapsible nav group label
 */
export type SidebarPrefs = {
  open: boolean;
  groups: Record<string, boolean>;
};

const DEFAULT: SidebarPrefs = { open: true, groups: {} };

function storageKey(userId: string | null | undefined) {
  return `nimbus:sidebar:${userId ?? "anon"}`;
}

function read(userId: string | null | undefined): SidebarPrefs {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw);
    return {
      open: typeof parsed.open === "boolean" ? parsed.open : true,
      groups: parsed.groups && typeof parsed.groups === "object" ? parsed.groups : {},
    };
  } catch {
    return DEFAULT;
  }
}

export function useSidebarPrefs(userId: string | null | undefined) {
  const [prefs, setPrefs] = useState<SidebarPrefs>(() => read(userId));

  // Re-read when user changes (e.g. after sign-in).
  useEffect(() => {
    setPrefs(read(userId));
  }, [userId]);

  const persist = useCallback(
    (next: SidebarPrefs) => {
      try {
        window.localStorage.setItem(storageKey(userId), JSON.stringify(next));
      } catch {
        /* quota / private mode — ignore */
      }
    },
    [userId],
  );

  const setOpen = useCallback(
    (open: boolean) => {
      setPrefs((p) => {
        const next = { ...p, open };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  // Accordion behavior: only one group can be open at a time.
  const setGroupOpen = useCallback(
    (label: string, open: boolean) => {
      setPrefs((p) => {
        const next = {
          ...p,
          groups: open ? { [label]: true } : { ...p.groups, [label]: false },
        };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  return { prefs, setOpen, setGroupOpen };
}
