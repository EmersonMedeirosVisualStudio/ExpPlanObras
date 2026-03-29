import { NextRequest } from 'next/server';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { db } from '@/lib/db';
import { canAccessObra } from '@/lib/auth/access';

export const runtime = 'nodejs';

async function ensureCronogramaTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS contratos_aditivos (
      id_aditivo BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_contrato BIGINT UNSIGNED NOT NULL,
      numero_aditivo VARCHAR(64) NULL,
      tipo_aditivo ENUM('CRONOGRAMA','PRAZO','VALOR','OUTRO') NOT NULL DEFAULT 'OUTRO',
      descricao TEXT NULL,
      data_assinatura DATE NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      id_usuario_criador BIGINT UNSIGNED NULL,
      PRIMARY KEY (id_aditivo),
      KEY idx_tenant_contrato (tenant_id, id_contrato),
      KEY idx_tenant (tenant_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS obras_cronogramas (
      id_cronograma BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_obra BIGINT UNSIGNED NOT NULL,
      id_contrato BIGINT UNSIGNED NOT NULL,
      versao INT NOT NULL,
      origem ENUM('CONTRATADO','ADITIVO') NOT NULL DEFAULT 'CONTRATADO',
      id_aditivo BIGINT UNSIGNED NULL,
      cronograma_json JSON NOT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      id_usuario_criador BIGINT UNSIGNED NULL,
      PRIMARY KEY (id_cronograma),
      UNIQUE KEY uk_obra_versao (tenant_id, id_obra, versao),
      KEY idx_obra (tenant_id, id_obra),
      KEY idx_contrato (tenant_id, id_contrato)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.OBRAS_VIEW);
    const idObra = Number(req.nextUrl.searchParams.get('idObra') || 0);
    if (!Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra é obrigatório');
    if (!canAccessObra(current as any, idObra)) return fail(403, 'Sem acesso à obra');

    await ensureCronogramaTables();

    const [[obra]]: any = await db.query(
      `
      SELECT o.id_obra, o.id_contrato, c.numero_contrato
      FROM obras o
      INNER JOIN contratos c ON c.id_contrato = o.id_contrato
      WHERE c.tenant_id = ? AND o.id_obra = ?
      LIMIT 1
      `,
      [current.tenantId, idObra]
    );
    if (!obra) return fail(404, 'Obra não encontrada');

    const [[row]]: any = await db.query(
      `
      SELECT
        oc.id_cronograma AS idCronograma,
        oc.versao,
        oc.origem,
        oc.id_aditivo AS idAditivo,
        oc.criado_em AS criadoEm,
        oc.cronograma_json AS cronogramaJson
      FROM obras_cronogramas oc
      WHERE oc.tenant_id = ? AND oc.id_obra = ?
      ORDER BY oc.versao DESC, oc.id_cronograma DESC
      LIMIT 1
      `,
      [current.tenantId, idObra]
    );

    return ok({
      idObra,
      idContrato: Number(obra.id_contrato),
      numeroContrato: String(obra.numero_contrato || ''),
      cronograma: row
        ? {
            idCronograma: Number(row.idCronograma),
            versao: Number(row.versao),
            origem: String(row.origem),
            idAditivo: row.idAditivo ? Number(row.idAditivo) : null,
            criadoEm: row.criadoEm,
            cronogramaJson: typeof row.cronogramaJson === 'string' ? JSON.parse(row.cronogramaJson) : row.cronogramaJson,
          }
        : null,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

