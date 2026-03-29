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

let cachedHasIdObraInMedicoes: boolean | null = null;
async function contratosMedicoesHasIdObra() {
  if (cachedHasIdObraInMedicoes != null) return cachedHasIdObraInMedicoes;
  const [[r]]: any = await db.query(
    `
    SELECT COUNT(*) AS cnt
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'contratos_medicoes'
      AND COLUMN_NAME = 'id_obra'
    `
  );
  cachedHasIdObraInMedicoes = Number(r?.cnt || 0) > 0;
  return cachedHasIdObraInMedicoes;
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.FISCALIZACAO_MEDICOES_VIEW);
    const idObra = Number(req.nextUrl.searchParams.get('idObra') || 0);
    const status = String(req.nextUrl.searchParams.get('status') || '').trim().toUpperCase();
    if (!Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra é obrigatório');
    if (!canAccessObra(current as any, idObra)) return fail(403, 'Sem acesso à obra');

    const hasIdObra = await contratosMedicoesHasIdObra();
    const sqlIdObraMed = hasIdObra ? 'AND m.id_obra = o.id_obra' : '';

    const where: string[] = ['m.tenant_id = ?', 'o.id_obra = ?'];
    const params: any[] = [current.tenantId, idObra];
    if (status) {
      where.push('m.status_medicao = ?');
      params.push(status);
    }

    const [rows]: any = await db.query(
      `
      SELECT
        m.id_medicao AS idMedicao,
        m.status_medicao AS status,
        COALESCE(NULLIF(m.competencia,''), DATE_FORMAT(m.created_at, '%Y-%m')) AS competencia,
        COALESCE(m.valor_medido, 0) AS valorMedido,
        c.numero_contrato AS numeroContrato,
        d.origem,
        d.id_medicao_origem AS idMedicaoOrigem,
        d.descricao,
        d.data_hora AS dataHora,
        d.servicos_json AS servicosJson,
        d.enviado_em AS enviadoEm,
        d.aprovado_em AS aprovadoEm
      FROM obras o
      INNER JOIN contratos c ON c.id_contrato = o.id_contrato
      INNER JOIN contratos_medicoes m ON m.id_contrato = c.id_contrato AND m.tenant_id = c.tenant_id ${sqlIdObraMed}
      LEFT JOIN contratos_medicoes_detalhes d ON d.tenant_id = m.tenant_id AND d.id_medicao = m.id_medicao
      WHERE ${where.join(' AND ')}
      ORDER BY m.id_medicao DESC
      LIMIT 500
      `,
      params
    );

    const lines: string[] = [];
    lines.push(
      row([
        'id_obra',
        'id_medicao',
        'status',
        'competencia',
        'numero_contrato',
        'origem',
        'id_medicao_origem',
        'valor_medido',
        'descricao',
        'data_hora',
        'servicos',
        'enviado_em',
        'aprovado_em',
      ])
    );
    for (const r of rows || []) {
      const servicos = r.servicosJson ? (typeof r.servicosJson === 'string' ? r.servicosJson : JSON.stringify(r.servicosJson)) : '';
      lines.push(
        row([
          idObra,
          r.idMedicao,
          r.status ?? '',
          r.competencia ?? '',
          r.numeroContrato ?? '',
          r.origem ?? '',
          r.idMedicaoOrigem ?? '',
          r.valorMedido ?? 0,
          r.descricao ?? '',
          r.dataHora ?? '',
          servicos,
          r.enviadoEm ?? '',
          r.aprovadoEm ?? '',
        ])
      );
    }

    const bytes = new TextEncoder().encode(lines.join('\n'));
    return new Response(new Blob([bytes], { type: 'text/csv; charset=utf-8' }), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="medicoes-obra-${idObra}${status ? `-${status}` : ''}.csv"`,
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}

