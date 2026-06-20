const MIN_TTL_MS = 1_000;
const MAX_TTL_MS = 86_400_000;

const TTL_PATTERN = /^(\d+)(s|m|h)?$/;

export function parseTtl(value: string): number {
  return parseTtlValue(value, false);
}

export function parseTtlOrZero(value: string): number {
  return parseTtlValue(value, true);
}

function parseTtlValue(value: string, allowZero: boolean): number {
  if (allowZero && value === "0") {
    return 0;
  }

  const match = TTL_PATTERN.exec(value);
  if (!match) {
    const suffix = allowZero ? ", or 0" : "";
    throw new Error(`Invalid TTL format. Use a whole-number duration like 5, 5s, 30m, or 2h${suffix}.`);
  }

  const amount = Number(match[1]);
  const unit = match[2] ?? "s";
  const multiplier = unit === "s" ? 1_000 : unit === "m" ? 60_000 : 3_600_000;
  const ttlMs = amount * multiplier;

  if (ttlMs < MIN_TTL_MS) {
    throw new Error("TTL must be at least 1s.");
  }

  if (ttlMs > MAX_TTL_MS) {
    throw new Error("TTL must be at most 24h.");
  }

  return ttlMs;
}
