export function narratorColor(name: string): string {
  let hash = 0;
  for (const char of name.trim().normalize()) {
    hash = (Math.imul(hash, 31) + (char.codePointAt(0) ?? 0)) >>> 0;
  }
  // Space consecutive suffixes such as 角色1 and 角色2 apart on the color wheel.
  const hue = (Math.imul(hash, 0x9e3779b1) >>> 0) * (360 / 2 ** 32);
  return `oklch(82% 0.13 ${hue})`;
}
