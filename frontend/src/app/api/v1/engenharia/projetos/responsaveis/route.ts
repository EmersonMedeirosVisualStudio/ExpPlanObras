import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, handleApiError, ok } from "@/lib/api/http";
import { requireApiPermission } from "@/lib/api/authz";
import { PERMISSIONS } from "@/lib/auth/permissions";

export const runtime = "nodejs";

async function ensureTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_conselhos (
      id_conselho BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      nome VARCHAR(40) NOT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_conselho),
      UNIQUE KEY uq_tenant_nome (tenant_id, nome)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_tecnicos (
      id_tecnico BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      nome VARCHAR(255) NOT NULL,
      id_conselho BIGINT UNSIGNED NULL,
      numero_registro VARCHAR(64) NULL,
      cpf VARCHAR(20) NULL,
      email VARCHAR(120) NULL,
      telefone VARCHAR(40) NULL,
      ativo TINYINT(1) NOT NULL DEFAULT 1,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_tecnico),
      KEY idx_tenant (tenant_id),
      KEY idx_nome (tenant_id, nome),
      KEY idx_registro (tenant_id, numero_registro)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_projetos (
      id_projeto BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      titulo VARCHAR(255) NOT NULL,
      endereco VARCHAR(255) NULL,
      descricao TEXT NULL,
      tipo VARCHAR(80) NULL,
      numero_projeto VARCHAR(80) NULL,
      revisao VARCHAR(30) NULL,
      status VARCHAR(30) NULL,
      data_projeto DATE NULL,
      data_aprovacao DATE NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_projeto),
      KEY idx_tenant (tenant_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

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
}

function parseId(v: string | null) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function normalizeTipo(v: unknown) {
  const s = String(v ?? "").trim().toUpperCase();
  return s === "RESPONSAVEL_TECNICO" || s === "FISCAL_OBRA" ? s : null;
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    await ensureTables();

    const idProjeto = parseId(req.nextUrl.searchParams.get("idProjeto"));
    if (!idProjeto) return fail(400, "idProjeto inválido.");

    const [rows]: any = await db.query(
      `
      SELECT
        pr.id_projeto_responsavel AS idProjetoResponsavel,
        pr.id_projeto AS idProjeto,
        pr.tipo,
        pr.abrangencia AS abrangencia,
        pr.numero_documento AS numeroDocumento,
        pr.observacao AS observacao,
        t.id_tecnico AS idTecnico,
        t.nome AS nome,
        c.nome AS conselho,
        t.numero_registro AS numeroRegistro
      FROM engenharia_projetos_responsaveis pr
      INNER JOIN engenharia_tecnicos t
        ON t.tenant_id = pr.tenant_id AND t.id_tecnico = pr.id_tecnico
      LEFT JOIN engenharia_conselhos c
        ON c.tenant_id = t.tenant_id AND c.id_conselho = t.id_conselho
      WHERE pr.tenant_id = ? AND pr.id_projeto = ?
      ORDER BY t.nome ASC, pr.id_projeto_responsavel DESC
      `,
      [current.tenantId, idProjeto]
    );

    return ok(
      (rows as any[]).map((r) => ({
        ...r,
        idProjetoResponsavel: Number(r.idProjetoResponsavel),
        idProjeto: Number(r.idProjeto),
        idTecnico: Number(r.idTecnico),
      }))
    );
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    await ensureTables();

    const body = await req.json().catch(() => null);
    const idProjeto = parseId(String(body?.idProjeto ?? ""));
    const idTecnico = parseId(String(body?.idTecnico ?? ""));
    const tipo = normalizeTipo(body?.tipo);
    const abrangencia = body?.abrangencia ? String(body.abrangencia).trim() : null;
    const numeroDocumento = body?.numeroDocumento ? String(body.numeroDocumento).trim() : null;
    const observacao = body?.observacao ? String(body.observacao).trim() : null;

    if (!idProjeto) return fail(422, "idProjeto é obrigatório.");
    if (!idTecnico) return fail(422, "idTecnico é obrigatório.");
    if (!tipo) return fail(422, "tipo inválido.");

    await conn.beginTransaction();
    await conn.query(
      `
      INSERT INTO engenharia_projetos_responsaveis
        (tenant_id, id_projeto, id_tecnico, tipo, abrangencia, numero_documento, observacao)
      VALUES
        (?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE
        abrangencia = VALUES(abrangencia),
        numero_documento = VALUES(numero_documento),
        observacao = VALUES(observacao)
      `,
      [
        current.tenantId,
        idProjeto,
        idTecnico,
        tipo,
        abrangencia ? abrangencia.slice(0, 80) : null,
        numeroDocumento ? numeroDocumento.slice(0, 80) : null,
        observacao ? observacao.slice(0, 255) : null,
      ]
    );
    await conn.commit();
    return ok({ success: true });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

