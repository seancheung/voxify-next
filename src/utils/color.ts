export function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function nameHashHue(name: string): number {
  return hashString(name || "voxify") % 360;
}

export function nameHashColor(name: string): string {
  return `hsl(${nameHashHue(name)} 55% 45%)`;
}
