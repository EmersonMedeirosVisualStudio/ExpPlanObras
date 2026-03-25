export function normalizeSearchText(input: string) {
  return String(input || '')
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function toBooleanFulltextQuery(q: string) {
  const norm = normalizeSearchText(q);
  const parts = norm
    .split(' ')
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 6);
  return parts.map((p) => `+${p}*`).join(' ');
}

