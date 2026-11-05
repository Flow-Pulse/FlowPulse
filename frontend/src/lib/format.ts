/** Convert integer base units (e.g. stroops) to a decimal string. */
export function fromUnits(units: bigint, decimals = 7, maxFrac = decimals): string {
  const neg = units < 0n;
  const abs = neg ? -units : units;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  let frac = (abs % base).toString().padStart(decimals, "0").slice(0, maxFrac);
  frac = frac.replace(/0+$/, "");
  const w = whole.toLocaleString("en-US");
  return `${neg ? "-" : ""}${w}${frac ? "." + frac : ""}`;
}

/** Fixed number of fraction digits (for tickers that shouldn't jitter in width). */
export function fromUnitsFixed(units: bigint, decimals = 7, frac = 4): string {
  const neg = units < 0n;
  const abs = neg ? -units : units;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const f = (abs % base).toString().padStart(decimals, "0").slice(0, frac);
  return `${neg ? "-" : ""}${whole.toLocaleString("en-US")}${frac ? "." + f : ""}`;
}

/** Parse a user-entered decimal string into integer base units. */
export function toUnits(value: string, decimals = 7): bigint {
  const v = value.trim();
  if (!/^\d*(\.\d*)?$/.test(v) || v === "" || v === ".") throw new Error("Enter a positive number");
  const [w, f = ""] = v.split(".");
  if (f.length > decimals) throw new Error(`At most ${decimals} decimal places`);
  return BigInt(w || "0") * 10n ** BigInt(decimals) + BigInt((f + "0".repeat(decimals)).slice(0, decimals));
}

export function shortAddr(a: string, head = 4, tail = 4): string {
  if (!a) return "";
  return a.length <= head + tail + 1 ? a : `${a.slice(0, head)}…${a.slice(-tail)}`;
}

export function duration(secs: number): string {
  if (secs <= 0) return "0s";
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

export function timeAgo(ms: number): string {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
