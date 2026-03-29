import { NextRequest } from 'next/server';
import { fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { db } from '@/lib/db';
import { canAccessObra } from '@/lib/auth/access';

export const runtime = 'nodejs';

function normalizeDate(v: unknown) {
  const s = String(v ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function esc(s: any) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function prettyJson(v: any) {
  if (!v) return '';
  try {
    const obj = typeof v === 'string' ? JSON.parse(v) : v;
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(v);
  }
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.FISCALIZACAO_DIARIO_VIEW);
    const idObra = Number(req.nextUrl.searchParams.get('idObra') || 0);
    const data = normalizeDate(req.nextUrl.searchParams.get('data'));
    if (!Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra é obrigatório');
    if (!data) return fail(422, 'data é obrigatória (YYYY-MM-DD)');
    if (!canAccessObra(current as any, idObra)) return fail(403, 'Sem acesso à obra');

    const [[row]]: any = await db.query(
      `
      SELECT
        data_diario AS data,
        bloco_execucao_json AS blocoExecucaoJson,
        bloco_fiscalizacao_json AS blocoFiscalizacaoJson,
        criado_em AS criadoEm,
        atualizado_em AS atualizadoEm
      FROM obras_diarios
      WHERE tenant_id = ? AND id_obra = ? AND data_diario = ?
      LIMIT 1
      `,
      [current.tenantId, idObra, data]
    );

    const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Diário de Obra #${esc(idObra)} - ${esc(data)}</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; padding: 24px; color: #0f172a; }
      h1 { font-size: 18px; margin: 0 0 4px; }
      .meta { font-size: 12px; color: #475569; margin-bottom: 16px; }
      .box { border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; margin-bottom: 12px; }
      pre { white-space: pre-wrap; word-break: break-word; margin: 0; font-size: 12px; }
      @media print { body { padding: 0; } .no-print { display: none; } }
    </style>
  </head>
  <body>
    <div class="no-print" style="margin-bottom: 12px;">
      <button onclick="window.print()">Imprimir</button>
    </div>
    <h1>Diário de Obra</h1>
    <div class="meta">Obra #${esc(idObra)} · Data ${esc(data)}</div>
    ${
      row
        ? `
      <div class="box">
        <div class="meta">Bloco da execução</div>
        <pre>${esc(prettyJson(row.blocoExecucaoJson))}</pre>
      </div>
      <div class="box">
        <div class="meta">Bloco da fiscalização</div>
        <pre>${esc(prettyJson(row.blocoFiscalizacaoJson))}</pre>
      </div>
      <div class="meta">Criado em: ${esc(row.criadoEm || '')} · Atualizado em: ${esc(row.atualizadoEm || '')}</div>
    `
        : `<div class="meta">Sem diário cadastrado para esta data.</div>`
    }
  </body>
</html>`;

    return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  } catch (e) {
    return handleApiError(e);
  }
}

