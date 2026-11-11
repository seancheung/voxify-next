import { useEffect, useState } from "react";

/**
 * Returns `true` only after `flag` has stayed truthy for `delayMs`.
 * If `flag` flips back before the delay elapses, the timer is cancelled and
 * the hook never returns `true` for that cycle. Useful for skipping skeleton
 * placeholders on fast loads.
 */
export function useDelayedFlag(flag: boolean, delayMs = 200): boolean {
  const [delayed, setDelayed] = useState(false);

  useEffect(() => {
    if (!flag) {
      setDelayed(false);
      return;
    }
    const timer = setTimeout(() => setDelayed(true), delayMs);
    return () => clearTimeout(timer);
  }, [flag, delayMs]);

  return delayed;
}
