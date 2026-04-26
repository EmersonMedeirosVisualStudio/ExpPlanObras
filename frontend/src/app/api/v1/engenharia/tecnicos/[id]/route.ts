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
      KEY idx_registro (tenant_id, numero_registro),
      KEY idx_conselho (tenant_id, id_conselho)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

async function getOrCreateConselhoId(tenantId: number, nome: string) {
  const n = nome.trim().toUpperCase().slice(0, 40);
  if (!n) return null;
  const [rows]: any = await db.query(
    `SELECT id_conselho AS idConselho FROM engenharia_conselhos WHERE tenant_id = ? AND nome = ? LIMIT 1`,
    [tenantId, n]
  );
  if (rows?.length) return Number(rows[0].idConselho);
  const [ins]: any = await db.query(`INSERT INTO engenharia_conselhos (tenant_id, nome) VALUES (?, ?)`, [tenantId, n]);
  return Number(ins.insertId);
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    await ensureTables();
    const { id } = await ctx.params;
    const idTecnico = parseId(id);
    if (!idTecnico) return fail(400, "ID inválido.");

    const [rows]: any = await db.query(
      `
      SELECT
        t.id_tecnico AS idTecnico,
        t.nome,
        c.nome AS conselho,
        t.numero_registro AS numeroRegistro,
        t.cpf,
        t.email,
        t.telefone,
        t.ativo,
        t.criado_em AS criadoEm,
        t.atualizado_em AS atualizadoEm
      FROM engenharia_tecnicos t
      LEFT JOIN engenharia_conselhos c
        ON c.tenant_id = t.tenant_id AND c.id_conselho = t.id_conselho
      WHERE t.tenant_id = ? AND t.id_tecnico = ?
      LIMIT 1
      `,
      [current.tenantId, idTecnico]
    );
    if (!rows?.length) return fail(404, "Registro não encontrado.");
    const r = rows[0];
    return ok({ ...r, idTecnico: Number(r.idTecnico), ativo: Boolean(r.ativo) });
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
    const idTecnico = parseId(id);
    if (!idTecnico) return fail(400, "ID inválido.");

    const body = await req.json().catch(() => null);
    const nome = body?.nome !== undefined ? String(body.nome || "").trim() : undefined;
    const conselho = body?.conselho !== undefined ? String(body.conselho || "").trim() : undefined;
    const numeroRegistro = body?.numeroRegistro !== undefined ? (body.numeroRegistro ? String(body.numeroRegistro).trim() : null) : undefined;
    const cpf = body?.cpf !== undefined ? (body.cpf ? String(body.cpf).trim() : null) : undefined;
    const email = body?.email !== undefined ? (body.email ? String(body.email).trim() : null) : undefined;
    const telefone = body?.telefone !== undefined ? (body.telefone ? String(body.telefone).trim() : null) : undefined;
    const ativo = body?.ativo !== undefined ? Boolean(body.ativo) : undefined;

    if (nome !== undefined && !nome) return fail(422, "nome é obrigatório.");

    const sets: string[] = [];
    const params: any[] = [];

    if (nome !== undefined) {
      sets.push("nome = ?");
      params.push(nome.slice(0, 255));
    }

    let idConselho: number | null | undefined = undefined;
    if (conselho !== undefined) {
      idConselho = conselho ? await getOrCreateConselhoId(current.tenantId, conselho) : null;
      sets.push("id_conselho = ?");
      params.push(idConselho);
    }

    if (numeroRegistro !== undefined) {
      sets.push("numero_registro = ?");
      params.push(numeroRegistro ? numeroRegistro.slice(0, 64) : null);
    }
    if (cpf !== undefined) {
      sets.push("cpf = ?");
      params.push(cpf ? cpf.slice(0, 20) : null);
    }
    if (email !== undefined) {
      sets.push("email = ?");
      params.push(email ? email.slice(0, 120) : null);
    }
    if (telefone !== undefined) {
      sets.push("telefone = ?");
      params.push(telefone ? telefone.slice(0, 40) : null);
    }
    if (ativo !== undefined) {
      sets.push("ativo = ?");
      params.push(ativo ? 1 : 0);
    }

    if (!sets.length) return fail(422, "Nenhum campo para atualizar.");

    params.push(current.tenantId, idTecnico);
    await conn.beginTransaction();
    const [res]: any = await conn.query(
      `UPDATE engenharia_tecnicos SET ${sets.join(", ")} WHERE tenant_id = ? AND id_tecnico = ?`,
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
    const idTecnico = parseId(id);
    if (!idTecnico) return fail(400, "ID inválido.");

    await conn.beginTransaction();
    const [res]: any = await conn.query(`DELETE FROM engenharia_tecnicos WHERE tenant_id = ? AND id_tecnico = ?`, [
      current.tenantId,
      idTecnico,
    ]);
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
