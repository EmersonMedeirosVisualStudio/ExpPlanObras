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

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DOCUMENTOS_VIEW);
    const idObra = Number(req.nextUrl.searchParams.get('idObra') || 0);
    const tipo = String(req.nextUrl.searchParams.get('tipo') || '').trim().toUpperCase();
    if (!Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra é obrigatório');
    if (!canAccessObra(current as any, idObra)) return fail(403, 'Sem acesso à obra');

    const where: string[] = ['tenant_id = ?', 'id_obra = ?'];
    const params: any[] = [current.tenantId, idObra];
    if (tipo === 'FOTO' || tipo === 'DOCUMENTO') {
      where.push('tipo = ?');
      params.push(tipo);
    }

    const [rows]: any = await db.query(
      `
      SELECT
        id_midia AS idMidia,
        tipo,
        origem,
        id_origem AS idOrigem,
        url,
        descricao,
        data_hora AS dataHora,
        servicos_json AS servicosJson,
        criado_em AS criadoEm
      FROM obras_midias
      WHERE ${where.join(' AND ')}
      ORDER BY COALESCE(data_hora, criado_em) DESC, id_midia DESC
      LIMIT 2000
      `,
      params
    );

    const lines: string[] = [];
    lines.push(row(['id_obra', 'id_midia', 'tipo', 'origem', 'id_origem', 'url', 'descricao', 'data_hora', 'servicos', 'criado_em']));
    for (const r of rows || []) {
      const servicos = r.servicosJson ? (typeof r.servicosJson === 'string' ? r.servicosJson : JSON.stringify(r.servicosJson)) : '';
      lines.push(row([idObra, r.idMidia, r.tipo ?? '', r.origem ?? '', r.idOrigem ?? '', r.url ?? '', r.descricao ?? '', r.dataHora ?? '', servicos, r.criadoEm ?? '']));
    }

    const bytes = new TextEncoder().encode(lines.join('\n'));
    return new Response(new Blob([bytes], { type: 'text/csv; charset=utf-8' }), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="midias-obra-${idObra}${tipo ? `-${tipo}` : ''}.csv"`,
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}

