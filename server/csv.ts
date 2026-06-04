function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(rows: Record<string, unknown>[], columns: { key: string; label: string }[]): string {
  const header = columns.map((c) => escapeCsv(c.label)).join(",");
  const body = rows
    .map((r) => columns.map((c) => escapeCsv(r[c.key])).join(","))
    .join("\n");
  return header + "\n" + body + "\n";
}
