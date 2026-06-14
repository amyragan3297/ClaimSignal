/**
 * last-non-null-wins merge.
 * For every key in `next`: if next[key] is non-null/undefined, overwrite prev[key].
 * If next[key] is null/undefined, keep prev[key] unchanged.
 * Never blanks a field that already has a real value.
 */
export function mergeFields<T extends Record<string, unknown>>(
  prev: T,
  next: Partial<T>,
): T {
  const out = { ...prev } as Record<string, unknown>;
  for (const k of Object.keys(next) as (keyof T)[]) {
    const v = next[k];
    if (v !== null && v !== undefined) {
      out[k as string] = v;
    }
  }
  return out as T;
}
