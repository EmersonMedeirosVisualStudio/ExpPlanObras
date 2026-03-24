import { db } from '@/lib/db';

export type DashboardScope = {
  empresaTotal: boolean;
  diretorias: number[];
  obras: number[];
  unidades: number[];
};

export async function getDashboardScope(current: { id: number; tenantId: number }): Promise<DashboardScope> {
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
