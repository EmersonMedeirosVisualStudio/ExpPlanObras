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

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    await ensureTables();

    const q = String(req.nextUrl.searchParams.get("q") || "").trim().toLowerCase();
    const apenasAtivos = String(req.nextUrl.searchParams.get("apenasAtivos") || "1").trim() !== "0";

    const where: string[] = ["t.tenant_id = ?"];
    const params: any[] = [current.tenantId];
    if (apenasAtivos) where.push("t.ativo = 1");
    if (q) {
      where.push("(LOWER(t.nome) LIKE ? OR LOWER(COALESCE(c.nome,'')) LIKE ? OR LOWER(COALESCE(t.numero_registro,'')) LIKE ?)");
      const like = `%${q}%`;
      params.push(like, like, like);
    }

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
      WHERE ${where.join(" AND ")}
      ORDER BY t.ativo DESC, t.nome ASC, t.id_tecnico DESC
      LIMIT 500
      `,
      params
    );

    return ok(
      (rows as any[]).map((r) => ({
        ...r,
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
    const nome = String(body?.nome || "").trim();
    const conselho = body?.conselho ? String(body.conselho).trim() : null;
    const numeroRegistroRaw = body?.numeroRegistro ?? body?.registroProfissional ?? null;
    const numeroRegistro = numeroRegistroRaw ? String(numeroRegistroRaw).trim() : null;
    const cpf = body?.cpf ? String(body.cpf).trim() : null;
    const email = body?.email ? String(body.email).trim() : null;
    const telefone = body?.telefone ? String(body.telefone).trim() : null;
    const ativo = body?.ativo !== undefined ? Boolean(body.ativo) : true;

    if (!nome) return fail(422, "nome é obrigatório.");

    const idConselho = conselho ? await getOrCreateConselhoId(current.tenantId, conselho) : null;

    await conn.beginTransaction();
    const [ins]: any = await conn.query(
      `
      INSERT INTO engenharia_tecnicos
        (tenant_id, nome, id_conselho, numero_registro, cpf, email, telefone, ativo)
      VALUES
        (?,?,?,?,?,?,?,?)
      `,
      [
        current.tenantId,
        nome.slice(0, 255),
        idConselho,
        numeroRegistro ? numeroRegistro.slice(0, 64) : null,
        cpf ? cpf.slice(0, 20) : null,
        email ? email.slice(0, 120) : null,
        telefone ? telefone.slice(0, 40) : null,
        ativo ? 1 : 0,
      ]
    );
    await conn.commit();

    const idTecnico = Number(ins?.insertId || 0);
    return ok({ idTecnico });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

