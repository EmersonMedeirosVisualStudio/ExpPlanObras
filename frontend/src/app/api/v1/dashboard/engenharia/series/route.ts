import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { getDashboardScope, inClause } from '@/lib/dashboard/scope';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

function buildOnlyFilter(ids: number[] | null, alias: string) {
  if (ids === null) return { sql: '', params: [] as number[] };
  if (!ids.length) return { sql: ' AND 1 = 0', params: [] as number[] };
  const c = inClause(ids);
  return { sql: ` AND ${alias} IN ${c.sql}`, params: c.params };
}

function ym(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const scope = await getDashboardScope(current);

    const idObra = Number(req.nextUrl.searchParams.get('idObra') || 0);
    const idUnidade = Number(req.nextUrl.searchParams.get('idUnidade') || 0);

    if (!scope.empresaTotal) {
      if (idObra && !scope.obras.includes(idObra)) return fail(403, 'Obra fora da abrangência');
      if (idUnidade && !scope.unidades.includes(idUnidade)) return fail(403, 'Unidade fora da abrangência');
    }

    const obrasSelecionadas = idObra ? [idObra] : scope.empresaTotal && !idUnidade ? null : scope.obras;
    const fObra = buildOnlyFilter(obrasSelecionadas, 'o.id_obra');

    const keys: string[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) keys.push(ym(new Date(now.getFullYear(), now.getMonth() - i, 1)));

    const series = keys.map((referencia) => ({
      referencia,
      obrasIniciadas: 0,
      obrasConcluidas: 0,
      medicoesEmitidas: 0,
      ocorrencias: 0,
    }));

    try {
      const [rows]: any = await db.query(
        `
        SELECT DATE_FORMAT(o.created_at, '%Y-%m') AS referencia, COUNT(*) AS total
        FROM obras o
        INNER JOIN contratos c ON c.id_contrato = o.id_contrato
        WHERE c.tenant_id = ?
          AND o.created_at >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 5 MONTH)
          ${fObra.sql}
        GROUP BY DATE_FORMAT(o.created_at, '%Y-%m')
        `,
        [current.tenantId, ...fObra.params]
      );
      const map = new Map((rows as any[]).map((r) => [String(r.referencia), Number(r.total || 0)]));
      for (const s of series) s.obrasIniciadas = map.get(s.referencia) || 0;
    } catch {}

    try {
      const [rows]: any = await db.query(
        `
        SELECT DATE_FORMAT(o.data_conclusao, '%Y-%m') AS referencia, COUNT(*) AS total
        FROM obras o
        INNER JOIN contratos c ON c.id_contrato = o.id_contrato
        WHERE c.tenant_id = ?
          AND o.data_conclusao IS NOT NULL
          AND o.data_conclusao >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 5 MONTH)
          ${fObra.sql}
        GROUP BY DATE_FORMAT(o.data_conclusao, '%Y-%m')
        `,
        [current.tenantId, ...fObra.params]
      );
      const map = new Map((rows as any[]).map((r) => [String(r.referencia), Number(r.total || 0)]));
      for (const s of series) s.obrasConcluidas = map.get(s.referencia) || 0;
    } catch {}

    try {
      const [rows]: any = await db.query(
        `
        SELECT DATE_FORMAT(m.created_at, '%Y-%m') AS referencia, COUNT(*) AS total
        FROM contratos_medicoes m
        INNER JOIN contratos c ON c.id_contrato = m.id_contrato
        INNER JOIN obras o ON o.id_contrato = c.id_contrato
        WHERE c.tenant_id = ?
          AND m.created_at >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 5 MONTH)
          ${fObra.sql}
        GROUP BY DATE_FORMAT(m.created_at, '%Y-%m')
        `,
        [current.tenantId, ...fObra.params]
      );
      const map = new Map((rows as any[]).map((r) => [String(r.referencia), Number(r.total || 0)]));
      for (const s of series) s.medicoesEmitidas = map.get(s.referencia) || 0;
    } catch {}

    try {
      const [rows]: any = await db.query(
        `
        SELECT DATE_FORMAT(a.data_hora_ocorrencia, '%Y-%m') AS referencia, COUNT(*) AS total
        FROM sst_acidentes a
        WHERE a.tenant_id = ?
          AND a.data_hora_ocorrencia >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 5 MONTH)
        GROUP BY DATE_FORMAT(a.data_hora_ocorrencia, '%Y-%m')
        `,
        [current.tenantId]
      );
      const map = new Map((rows as any[]).map((r) => [String(r.referencia), Number(r.total || 0)]));
      for (const s of series) s.ocorrencias = map.get(s.referencia) || 0;
    } catch {}

    return ok(series);
  } catch (e) {
    return handleApiError(e);
  }
}

