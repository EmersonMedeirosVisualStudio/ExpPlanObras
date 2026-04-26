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

    const idObra = parseId(req.nextUrl.searchParams.get("idObra"));
    if (!idObra) return fail(400, "idObra inválido.");

    const tipoRaw = String(req.nextUrl.searchParams.get("tipo") || "").trim().toUpperCase();
    const tipo = tipoRaw ? normalizeTipo(tipoRaw) : null;
    if (tipoRaw && !tipo) return fail(422, "tipo inválido.");

    const apenasAtivos = String(req.nextUrl.searchParams.get("apenasAtivos") || "1").trim() !== "0";

    const where: string[] = ["orx.tenant_id = ?", "orx.id_obra = ?"];
    const params: any[] = [current.tenantId, idObra];
    if (tipo) {
      where.push("orx.tipo = ?");
      params.push(tipo);
    }
    if (apenasAtivos) where.push("orx.ativo = 1");

    const [rows]: any = await db.query(
      `
      SELECT
        orx.id_obra_responsabilidade AS idObraResponsabilidade,
        orx.id_obra AS idObra,
        orx.tipo,
        orx.abrangencia AS abrangencia,
        orx.numero_documento AS numeroDocumento,
        orx.observacao AS observacao,
        orx.ativo,
        t.id_tecnico AS idTecnico,
        t.nome AS nome,
        c.nome AS conselho,
        t.numero_registro AS numeroRegistro,
        t.cpf,
        t.email,
        t.telefone
      FROM engenharia_obras_responsabilidades orx
      INNER JOIN engenharia_tecnicos t
        ON t.tenant_id = orx.tenant_id AND t.id_tecnico = orx.id_tecnico
      LEFT JOIN engenharia_conselhos c
        ON c.tenant_id = t.tenant_id AND c.id_conselho = t.id_conselho
      WHERE ${where.join(" AND ")}
      ORDER BY t.nome ASC, orx.id_obra_responsabilidade DESC
      `,
      params
    );

    return ok(
      (rows as any[]).map((r) => ({
        ...r,
        idObraResponsabilidade: Number(r.idObraResponsabilidade),
        idObra: Number(r.idObra),
        idTecnico: Number(r.idTecnico),
        ativo: Boolean(r.ativo),
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
    const idObra = parseId(String(body?.idObra ?? ""));
    const idTecnico = parseId(String(body?.idTecnico ?? ""));
    const tipo = normalizeTipo(body?.tipo);
    const abrangencia = body?.abrangencia ? String(body.abrangencia).trim() : null;
    const numeroDocumento = body?.numeroDocumento ? String(body.numeroDocumento).trim() : null;
    const observacao = body?.observacao ? String(body.observacao).trim() : null;
    const ativo = body?.ativo !== undefined ? Boolean(body.ativo) : true;

    if (!idObra) return fail(422, "idObra é obrigatório.");
    if (!idTecnico) return fail(422, "idTecnico é obrigatório.");
    if (!tipo) return fail(422, "tipo inválido.");

    await conn.beginTransaction();
    await conn.query(
      `
      INSERT INTO engenharia_obras_responsabilidades
        (tenant_id, id_obra, id_tecnico, tipo, abrangencia, numero_documento, observacao, ativo)
      VALUES
        (?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE
        abrangencia = VALUES(abrangencia),
        numero_documento = VALUES(numero_documento),
        observacao = VALUES(observacao),
        ativo = VALUES(ativo)
      `,
      [
        current.tenantId,
        idObra,
        idTecnico,
        tipo,
        abrangencia ? abrangencia.slice(0, 80) : null,
        numeroDocumento ? numeroDocumento.slice(0, 80) : null,
        observacao ? observacao.slice(0, 255) : null,
        ativo ? 1 : 0,
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

