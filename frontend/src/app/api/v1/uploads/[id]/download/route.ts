import { fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

async function ensureTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS uploads_midias (
      id_upload BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_usuario BIGINT UNSIGNED NOT NULL,
      nome_arquivo VARCHAR(255) NOT NULL,
      mime_type VARCHAR(120) NOT NULL,
      tamanho_bytes BIGINT UNSIGNED NOT NULL,
      conteudo_blob LONGBLOB NOT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_upload),
      KEY idx_tenant (tenant_id),
      KEY idx_user (tenant_id, id_usuario),
      KEY idx_created (tenant_id, criado_em)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

async function requireAnyUser() {
  try {
    return await requireApiPermission(PERMISSIONS.DASHBOARD_VIEW);
  } catch {
    try {
      return await requireApiPermission(PERMISSIONS.DASHBOARD_FISCALIZACAO_VIEW);
    } catch {
      return await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    }
  }
}

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireAnyUser();
    await ensureTables();

    const { id } = await context.params;
    const idUpload = Number(id);
    if (!Number.isFinite(idUpload) || idUpload <= 0) return fail(400, 'ID inválido');

    const [[row]]: any = await db.query(
      `
      SELECT nome_arquivo AS nome, mime_type AS mimeType, conteudo_blob AS blob
      FROM uploads_midias
      WHERE tenant_id = ? AND id_upload = ?
      LIMIT 1
      `,
      [current.tenantId, idUpload]
    );
    if (!row) return fail(404, 'Arquivo não encontrado');
    if (!row.blob) return fail(404, 'Arquivo indisponível');

    const bytes = new Uint8Array(row.blob as Buffer);
    const mimeType = String(row.mimeType || 'application/octet-stream');
    const blob = new Blob([bytes], { type: mimeType });
    return new Response(blob, {
      status: 200,
      headers: { 'Content-Disposition': `inline; filename="${String(row.nome || 'arquivo')}"` },
    });
  } catch (e) {
    return handleApiError(e);
  }
}
