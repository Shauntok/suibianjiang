export function formatCompactCount(count: number): string {
  if (count < 1000) return String(count);
  if (count >= 100_000_000_000) return "999亿+";

  const [unit, suffix] = count >= 100_000_000
    ? [100_000_000, "亿"] as const
    : count >= 10_000
      ? [10_000, "万"] as const
      : [1000, "千"] as const;

  // Truncate rather than rounding up across unit boundaries.
  const value = count >= unit * 100
    ? Math.floor(count / unit)
    : Math.floor(count / (unit / 10)) / 10;
  return `${value}${suffix}`;
}
