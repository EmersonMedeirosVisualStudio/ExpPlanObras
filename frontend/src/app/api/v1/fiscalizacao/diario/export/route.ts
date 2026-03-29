import { NextRequest } from 'next/server';
import { fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { db } from '@/lib/db';
import { canAccessObra } from '@/lib/auth/access';

export const runtime = 'nodejs';

function sanitizeForCsvCell(input: any) {
  let s = input == null ? '' : String(input);
  s = s.replace(/^\t+/, '');
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return s;
}

function csvEscape(input: any) {
  const s = sanitizeForCsvCell(input);
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function row(values: any[]) {
  return values.map(csvEscape).join(',');
}

function normalizeDate(v: unknown) {
  const s = String(v ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.FISCALIZACAO_DIARIO_VIEW);
    const idObra = Number(req.nextUrl.searchParams.get('idObra') || 0);
    const dataIni = normalizeDate(req.nextUrl.searchParams.get('dataIni'));
    const dataFim = normalizeDate(req.nextUrl.searchParams.get('dataFim')) || dataIni;
    if (!Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra é obrigatório');
    if (!dataIni) return fail(422, 'dataIni é obrigatória (YYYY-MM-DD)');
    if (!dataFim) return fail(422, 'dataFim é obrigatória (YYYY-MM-DD)');
    if (!canAccessObra(current as any, idObra)) return fail(403, 'Sem acesso à obra');

    const [rows]: any = await db.query(
      `
      SELECT
        data_diario AS data,
        bloco_execucao_json AS blocoExecucaoJson,
        bloco_fiscalizacao_json AS blocoFiscalizacaoJson,
        criado_em AS criadoEm,
        atualizado_em AS atualizadoEm
      FROM obras_diarios
      WHERE tenant_id = ?
        AND id_obra = ?
        AND data_diario BETWEEN ? AND ?
      ORDER BY data_diario ASC
      `,
      [current.tenantId, idObra, dataIni, dataFim]
    );

    const lines: string[] = [];
    lines.push(row(['id_obra', 'data', 'bloco_execucao', 'bloco_fiscalizacao', 'criado_em', 'atualizado_em']));
    for (const r of rows || []) {
      const blocoExecucao = r.blocoExecucaoJson ? (typeof r.blocoExecucaoJson === 'string' ? r.blocoExecucaoJson : JSON.stringify(r.blocoExecucaoJson)) : '';
      const blocoFiscalizacao = r.blocoFiscalizacaoJson
        ? typeof r.blocoFiscalizacaoJson === 'string'
          ? r.blocoFiscalizacaoJson
          : JSON.stringify(r.blocoFiscalizacaoJson)
        : '';
      lines.push(row([idObra, r.data, blocoExecucao, blocoFiscalizacao, r.criadoEm ?? '', r.atualizadoEm ?? '']));
    }

    const bytes = new TextEncoder().encode(lines.join('\n'));
    return new Response(new Blob([bytes], { type: 'text/csv; charset=utf-8' }), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="diario-obra-${idObra}-${dataIni}${dataFim && dataFim !== dataIni ? `-a-${dataFim}` : ''}.csv"`,
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}

