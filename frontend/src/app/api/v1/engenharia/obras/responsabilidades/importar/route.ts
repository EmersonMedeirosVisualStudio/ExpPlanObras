import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, handleApiError, ok } from "@/lib/api/http";
import { requireApiPermission } from "@/lib/api/authz";
import { PERMISSIONS } from "@/lib/auth/permissions";

export const runtime = "nodejs";

async function ensureTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_projetos_responsaveis (
      id_projeto_responsavel BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_projeto BIGINT UNSIGNED NOT NULL,
      id_tecnico BIGINT UNSIGNED NOT NULL,
      tipo VARCHAR(32) NOT NULL,
      abrangencia VARCHAR(80) NULL,
      numero_documento VARCHAR(80) NULL,
      observacao VARCHAR(255) NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_projeto_responsavel),
      UNIQUE KEY uq_projeto_tecnico_tipo (tenant_id, id_projeto, id_tecnico, tipo),
      KEY idx_projeto (tenant_id, id_projeto),
      KEY idx_tecnico (tenant_id, id_tecnico)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_obras_responsabilidades (
      id_obra_responsabilidade BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_obra BIGINT UNSIGNED NOT NULL,
      id_tecnico BIGINT UNSIGNED NOT NULL,
      tipo VARCHAR(32) NOT NULL,
      abrangencia VARCHAR(80) NULL,
      numero_documento VARCHAR(80) NULL,
      observacao VARCHAR(255) NULL,
      ativo TINYINT(1) NOT NULL DEFAULT 1,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_obra_responsabilidade),
      UNIQUE KEY uq_obra_tecnico_tipo (tenant_id, id_obra, id_tecnico, tipo),
      KEY idx_obra (tenant_id, id_obra),
      KEY idx_tecnico (tenant_id, id_tecnico)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

function parseId(v: unknown) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function POST(req: NextRequest) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    await ensureTables();

    const body = await req.json().catch(() => null);
    const idObra = parseId(body?.idObra);
    const idProjeto = parseId(body?.idProjeto);
    if (!idObra) return fail(422, "idObra é obrigatório.");
    if (!idProjeto) return fail(422, "idProjeto é obrigatório.");

    await conn.beginTransaction();
    const [res]: any = await conn.query(
      `
      INSERT INTO engenharia_obras_responsabilidades
        (tenant_id, id_obra, id_tecnico, tipo, abrangencia, numero_documento, observacao, ativo)
      SELECT
        pr.tenant_id,
        ? AS id_obra,
        pr.id_tecnico,
        pr.tipo,
        pr.abrangencia,
        pr.numero_documento,
        pr.observacao,
        1 AS ativo
      FROM engenharia_projetos_responsaveis pr
      WHERE pr.tenant_id = ? AND pr.id_projeto = ?
      ON DUPLICATE KEY UPDATE
        abrangencia = VALUES(abrangencia),
        numero_documento = VALUES(numero_documento),
        observacao = VALUES(observacao),
        ativo = VALUES(ativo)
      `,
      [idObra, current.tenantId, idProjeto]
    );
    await conn.commit();
    return ok({ imported: Number(res?.affectedRows || 0) });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

