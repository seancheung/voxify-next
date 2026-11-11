export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const minutes = Math.floor(total / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const millis = total % 1000;
  const ss = String(seconds).padStart(2, "0");
  const tail = millis === 0 ? "" : `.${String(millis).padStart(3, "0")}`;
  return `${minutes}:${ss}${tail}`;
}
