export function slugify(input: string) {
  const base = String(input || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return base.length > 0 ? base : 'empresa';
}

export async function generateUniqueTenantSlug(prismaClient: any, base: string) {
  const s = slugify(base);
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? s : `${s}-${i + 1}`;
    const existing = await prismaClient.tenant.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!existing) return candidate;
  }
  return `${s}-${Date.now()}`;
}
