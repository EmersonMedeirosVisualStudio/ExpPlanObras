import type { CurrentUser } from '@/lib/auth/current-user';

export type DashboardScope = {
  empresaTotal: boolean;
  diretorias: number[];
  obras: number[];
  unidades: number[];
};

export async function getDashboardScope(current: CurrentUser | { id: number; tenantId: number; abrangencia?: any }): Promise<DashboardScope> {
  // Use scope from session cookie if available (Vercel compatible)
  if ('abrangencia' in current && current.abrangencia) {
    const ab = current.abrangencia;
    return {
      empresaTotal: !!ab.empresa,
      diretorias: Array.isArray(ab.diretorias) ? ab.diretorias.map(Number) : [],
      obras: Array.isArray(ab.obras) ? ab.obras.map(Number) : [],
      unidades: Array.isArray(ab.unidades) ? ab.unidades.map(Number) : [],
    };
  }

  // Fallback for API routes or edge cases (not recommended for SSR on Vercel)
  const { db } = await import('@/lib/db');
  const [rows]: any = await db.query(
    `
    SELECT ua.tipo_abrangencia, ua.id_obra, ua.id_unidade, ua.id_setor_diretoria
    FROM usuario_abrangencias ua
    WHERE ua.tenant_id = ? AND ua.id_usuario = ? AND ua.ativo = 1
    `,
    [current.tenantId, current.id]
  );

  const scope: DashboardScope = { empresaTotal: false, diretorias: [], obras: [], unidades: [] };

  for (const r of rows || []) {
    if (r.tipo_abrangencia === 'EMPRESA') scope.empresaTotal = true;
    if (r.tipo_abrangencia === 'DIRETORIA' && r.id_setor_diretoria) scope.diretorias.push(Number(r.id_setor_diretoria));
    if (r.tipo_abrangencia === 'OBRA' && r.id_obra) scope.obras.push(Number(r.id_obra));
    if (r.tipo_abrangencia === 'UNIDADE' && r.id_unidade) scope.unidades.push(Number(r.id_unidade));
  }

  scope.diretorias = Array.from(new Set(scope.diretorias));
  scope.obras = Array.from(new Set(scope.obras));
  scope.unidades = Array.from(new Set(scope.unidades));

  return scope;
}

export function inClause(values: number[]) {
  if (!values.length) return { sql: '(NULL)', params: [] as number[] };
  return { sql: `(${values.map(() => '?').join(',')})`, params: values };
}
