import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, handleApiError } from "@/lib/api/http";
import { requireApiPermission } from "@/lib/api/authz";
import { PERMISSIONS } from "@/lib/auth/permissions";

export const runtime = "nodejs";

async function ensureTables() {
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
    CREATE TABLE IF NOT EXISTS engenharia_obras_projetos (
      id_obra_projeto BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_obra BIGINT UNSIGNED NOT NULL,
      id_projeto BIGINT UNSIGNED NOT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_obra_projeto),
      UNIQUE KEY uq_obra_projeto (tenant_id, id_obra, id_projeto),
      KEY idx_obra (tenant_id, id_obra),
      KEY idx_projeto (tenant_id, id_projeto)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

function parseDateOrNull(v: unknown) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return s.slice(0, 10);
}

function parseId(v: string) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    await ensureTables();

    const { id } = await ctx.params;
    const idProjeto = parseId(id);
    if (!idProjeto) return fail(400, "id inválido.");

    const [rows]: any = await db.query(
      `
      SELECT
        id_projeto AS idProjeto,
        titulo,
        endereco,
        descricao,
        tipo,
        numero_projeto AS numeroProjeto,
        revisao,
        status,
        data_projeto AS dataProjeto,
        data_aprovacao AS dataAprovacao,
        criado_em AS criadoEm,
        atualizado_em AS atualizadoEm
      FROM engenharia_projetos
      WHERE tenant_id = ? AND id_projeto = ?
      LIMIT 1
      `,
      [current.tenantId, idProjeto]
    );

    const r = (rows as any[])[0];
    if (!r) return fail(404, "Projeto não encontrado.");
    return ok({ ...r, idProjeto: Number(r.idProjeto) });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    await ensureTables();

    const { id } = await ctx.params;
    const idProjeto = parseId(id);
    if (!idProjeto) return fail(400, "id inválido.");

    const body = await req.json().catch(() => null);
    const titulo = String(body?.titulo || "").trim();
    const endereco = body?.endereco ? String(body.endereco).trim() : null;
    const descricao = body?.descricao ? String(body.descricao).trim() : null;
    const tipo = body?.tipo ? String(body.tipo).trim() : null;
    const numeroProjeto = body?.numeroProjeto ? String(body.numeroProjeto).trim() : null;
    const revisao = body?.revisao ? String(body.revisao).trim() : null;
    const status = body?.status ? String(body.status).trim().toUpperCase() : null;
    const dataProjeto = parseDateOrNull(body?.dataProjeto);
    const dataAprovacao = parseDateOrNull(body?.dataAprovacao);

    if (!titulo) return fail(422, "título é obrigatório.");

    await conn.beginTransaction();
    const [upd]: any = await conn.query(
      `
      UPDATE engenharia_projetos
      SET
        titulo = ?,
        endereco = ?,
        descricao = ?,
        tipo = ?,
        numero_projeto = ?,
        revisao = ?,
        status = ?,
        data_projeto = ?,
        data_aprovacao = ?
      WHERE tenant_id = ? AND id_projeto = ?
      `,
      [
        titulo.slice(0, 255),
        endereco ? endereco.slice(0, 255) : null,
        descricao,
        tipo ? tipo.slice(0, 80) : null,
        numeroProjeto ? numeroProjeto.slice(0, 80) : null,
        revisao ? revisao.slice(0, 30) : null,
        status ? status.slice(0, 30) : null,
        dataProjeto,
        dataAprovacao,
        current.tenantId,
        idProjeto,
      ]
    );
    if (!upd.affectedRows) {
      await conn.rollback();
      return fail(404, "Projeto não encontrado.");
    }
    await conn.commit();
    return ok({ ok: true });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    await ensureTables();

    const { id } = await ctx.params;
    const idProjeto = parseId(id);
    if (!idProjeto) return fail(400, "id inválido.");

    await conn.beginTransaction();
    await conn.query(
      `
      DELETE FROM engenharia_obras_projetos
      WHERE tenant_id = ? AND id_projeto = ?
      `,
      [current.tenantId, idProjeto]
    );
    const [del]: any = await conn.query(
      `
      DELETE FROM engenharia_projetos
      WHERE tenant_id = ? AND id_projeto = ?
      LIMIT 1
      `,
      [current.tenantId, idProjeto]
    );
    if (!del.affectedRows) {
      await conn.rollback();
      return fail(404, "Projeto não encontrado.");
    }
    await conn.commit();
    return ok({ ok: true });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}
