import { NextRequest } from 'next/server';
import { fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { db } from '@/lib/db';
import { canAccessObra } from '@/lib/auth/access';

export const runtime = 'nodejs';

function esc(s: any) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
        d.enviado_em AS enviadoEm,
        d.aprovado_em AS aprovadoEm
      FROM obras o
      INNER JOIN contratos c ON c.id_contrato = o.id_contrato
      INNER JOIN contratos_medicoes m ON m.id_contrato = c.id_contrato AND m.tenant_id = c.tenant_id ${sqlIdObraMed}
      LEFT JOIN contratos_medicoes_detalhes d ON d.tenant_id = m.tenant_id AND d.id_medicao = m.id_medicao
      WHERE ${where.join(' AND ')}
      ORDER BY m.id_medicao DESC
      LIMIT 200
      `,
      params
    );

    const trs = (rows as any[]).map(
      (r) => `
      <tr>
        <td>${esc(r.idMedicao)}</td>
        <td>${esc(r.status || '')}</td>
        <td>${esc(r.competencia || '')}</td>
        <td>${esc(r.numeroContrato || '')}</td>
        <td>${esc(r.origem || '')}</td>
        <td>${esc(r.idMedicaoOrigem || '')}</td>
        <td style="text-align:right">${esc(Number(r.valorMedido || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))}</td>
        <td>${esc(r.descricao || '')}</td>
        <td>${esc(r.dataHora || '')}</td>
        <td>${esc(r.enviadoEm || '')}</td>
        <td>${esc(r.aprovadoEm || '')}</td>
      </tr>`
    );

    const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Medições - Obra #${esc(idObra)}</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; padding: 24px; color: #0f172a; }
      h1 { font-size: 18px; margin: 0 0 4px; }
      .meta { font-size: 12px; color: #475569; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border-top: 1px solid #e2e8f0; padding: 6px 8px; vertical-align: top; }
      th { text-align: left; color: #475569; }
      @media print { body { padding: 0; } .no-print { display: none; } }
    </style>
  </head>
  <body>
    <div class="no-print" style="margin-bottom: 12px;">
      <button onclick="window.print()">Imprimir</button>
    </div>
    <h1>Medições</h1>
    <div class="meta">Obra #${esc(idObra)}${status ? ` · Status ${esc(status)}` : ''}</div>
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Status</th>
          <th>Competência</th>
          <th>Contrato</th>
          <th>Origem</th>
          <th>Origem ID</th>
          <th>Valor medido</th>
          <th>Descrição</th>
          <th>Data/hora</th>
          <th>Enviado</th>
          <th>Aprovado</th>
        </tr>
      </thead>
      <tbody>
        ${trs.join('')}
      </tbody>
    </table>
  </body>
</html>`;

    return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  } catch (e) {
    return handleApiError(e);
  }
}

