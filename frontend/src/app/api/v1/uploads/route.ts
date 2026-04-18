import { created, fail, handleApiError } from '@/lib/api/http';
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

function getFilenameFromHeaders(req: Request) {
  const v = req.headers.get('x-filename') || req.headers.get('X-Filename');
  return v ? String(v) : null;
}

export async function POST(req: Request) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    await ensureTables();

    const contentType = String(req.headers.get('content-type') || '').toLowerCase();
    const isImage = contentType.startsWith('image/');
    if (!isImage) return fail(422, 'Apenas imagens são suportadas.');

    const ab = await req.arrayBuffer();
    const buffer = Buffer.from(ab);
    if (!buffer?.length) return fail(422, 'Arquivo vazio.');
    if (buffer.length > 10 * 1024 * 1024) return fail(422, 'Arquivo muito grande (máx 10MB).');

    const filename = (getFilenameFromHeaders(req) || 'imagem').slice(0, 255);
    const mimeType = contentType.split(';')[0] || 'application/octet-stream';

    const [res]: any = await db.query(
      `
      INSERT INTO uploads_midias
        (tenant_id, id_usuario, nome_arquivo, mime_type, tamanho_bytes, conteudo_blob)
      VALUES
        (?,?,?,?,?,?)
      `,
      [current.tenantId, current.id, filename, mimeType, buffer.length, buffer]
    );

    const idUpload = Number(res.insertId);
    return created({ idUpload, url: `/api/v1/uploads/${idUpload}/download` });
  } catch (e) {
    return handleApiError(e);
  }
}

