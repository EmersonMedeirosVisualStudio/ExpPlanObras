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
        criado_em AS criadoEm
      FROM obras_midias
      WHERE ${where.join(' AND ')}
      ORDER BY COALESCE(data_hora, criado_em) DESC, id_midia DESC
      LIMIT 500
      `,
      params
    );

    const trs = (rows as any[]).map(
      (r) => `
      <tr>
        <td>${esc(r.idMidia)}</td>
        <td>${esc(r.tipo || '')}</td>
        <td>${esc(r.origem || '')}</td>
        <td>${esc(r.idOrigem || '')}</td>
        <td>${esc(r.descricao || '')}</td>
        <td>${esc(r.dataHora || '')}</td>
        <td><a href="${esc(r.url || '')}">${esc(r.url || '')}</a></td>
      </tr>`
    );

    const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Documentos e fotos - Obra #${esc(idObra)}</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; padding: 24px; color: #0f172a; }
      h1 { font-size: 18px; margin: 0 0 4px; }
      .meta { font-size: 12px; color: #475569; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border-top: 1px solid #e2e8f0; padding: 6px 8px; vertical-align: top; }
      th { text-align: left; color: #475569; }
      @media print { body { padding: 0; } .no-print { display: none; } a { color: #0f172a; text-decoration: none; } }
    </style>
  </head>
  <body>
    <div class="no-print" style="margin-bottom: 12px;">
      <button onclick="window.print()">Imprimir</button>
    </div>
    <h1>Documentos e fotos</h1>
    <div class="meta">Obra #${esc(idObra)}${tipo ? ` · Tipo ${esc(tipo)}` : ''}</div>
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Tipo</th>
          <th>Origem</th>
          <th>Origem ID</th>
          <th>Descrição</th>
          <th>Data/hora</th>
          <th>URL</th>
        </tr>
      </thead>
      <tbody>${trs.join('')}</tbody>
    </table>
  </body>
</html>`;

    return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  } catch (e) {
    return handleApiError(e);
  }
}

