import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, handleApiError, ok } from "@/lib/api/http";
import { requireApiPermission } from "@/lib/api/authz";
import { PERMISSIONS } from "@/lib/auth/permissions";

export const runtime = "nodejs";

function parseId(v: string) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function normalizeTipo(v: unknown) {
  const s = String(v ?? "").trim().toUpperCase();
  return s === "RESPONSAVEL_TECNICO" || s === "FISCAL_OBRA" ? s : null;
}

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
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    await ensureTables();
    const { id } = await ctx.params;
    const idProjetoResponsavel = parseId(id);
    if (!idProjetoResponsavel) return fail(400, "ID inválido.");

    const body = await req.json().catch(() => null);
    const tipo = body?.tipo !== undefined ? normalizeTipo(body.tipo) : undefined;
    const abrangencia = body?.abrangencia !== undefined ? (body.abrangencia ? String(body.abrangencia).trim() : null) : undefined;
    const numeroDocumento =
      body?.numeroDocumento !== undefined ? (body.numeroDocumento ? String(body.numeroDocumento).trim() : null) : undefined;
    const observacao = body?.observacao !== undefined ? (body.observacao ? String(body.observacao).trim() : null) : undefined;

    if (tipo === null) return fail(422, "tipo inválido.");

    const sets: string[] = [];
    const params: any[] = [];
    if (tipo) {
      sets.push("tipo = ?");
      params.push(tipo);
    }
    if (abrangencia !== undefined) {
      sets.push("abrangencia = ?");
      params.push(abrangencia ? abrangencia.slice(0, 80) : null);
    }
    if (numeroDocumento !== undefined) {
      sets.push("numero_documento = ?");
      params.push(numeroDocumento ? numeroDocumento.slice(0, 80) : null);
    }
    if (observacao !== undefined) {
      sets.push("observacao = ?");
      params.push(observacao ? observacao.slice(0, 255) : null);
    }
    if (!sets.length) return fail(422, "Nenhum campo para atualizar.");

    params.push(current.tenantId, idProjetoResponsavel);
    await conn.beginTransaction();
    const [res]: any = await conn.query(
      `UPDATE engenharia_projetos_responsaveis SET ${sets.join(", ")} WHERE tenant_id = ? AND id_projeto_responsavel = ?`,
      params
    );
    if (!res?.affectedRows) {
      await conn.rollback();
      return fail(404, "Registro não encontrado.");
    }
    await conn.commit();
    return ok({ success: true });
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
    const idProjetoResponsavel = parseId(id);
    if (!idProjetoResponsavel) return fail(400, "ID inválido.");

    await conn.beginTransaction();
    const [res]: any = await conn.query(
      `DELETE FROM engenharia_projetos_responsaveis WHERE tenant_id = ? AND id_projeto_responsavel = ?`,
      [current.tenantId, idProjetoResponsavel]
    );
    if (!res?.affectedRows) {
      await conn.rollback();
      return fail(404, "Registro não encontrado.");
    }
    await conn.commit();
    return ok({ success: true });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

