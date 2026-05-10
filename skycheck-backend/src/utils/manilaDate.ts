// ─────────────────────────────────────────────────────────────────
// Health "today" must follow the user's calendar day (Philippines),
// not the server's local midnight — avoids wrong row on UTC hosts.
// Stored as UTC noon on that calendar date (stable for Prisma @db.Date).
// ─────────────────────────────────────────────────────────────────

export function manilaCheckDate(): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year:     'numeric',
    month:    '2-digit',
    day:      '2-digit',
  }).formatToParts(new Date());

  const y = Number(parts.find(p => p.type === 'year')!.value);
  const m = Number(parts.find(p => p.type === 'month')!.value);
  const d = Number(parts.find(p => p.type === 'day')!.value);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
}
