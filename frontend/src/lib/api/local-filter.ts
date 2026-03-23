export function buildLocalFilter(searchParams: URLSearchParams, alias = '') {
  const tipoLocal = searchParams.get('tipoLocal');
  const idObra = Number(searchParams.get('idObra') || 0);
  const idUnidade = Number(searchParams.get('idUnidade') || 0);
  const p = alias ? `${alias}.` : '';

  if (tipoLocal === 'OBRA' && idObra) {
    return { sql: ` AND ${p}id_obra = ?`, params: [idObra] };
  }

  if (tipoLocal === 'UNIDADE' && idUnidade) {
    return { sql: ` AND ${p}id_unidade = ?`, params: [idUnidade] };
  }

  return { sql: '', params: [] as any[] };
}

