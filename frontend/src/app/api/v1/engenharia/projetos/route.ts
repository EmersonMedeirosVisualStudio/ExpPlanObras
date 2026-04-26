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
      KEY idx_tenant (tenant_id),
      KEY idx_status (tenant_id, status),
      KEY idx_titulo (tenant_id, titulo)
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

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    await ensureTables();

    const q = String(req.nextUrl.searchParams.get("q") || "").trim();
    const status = String(req.nextUrl.searchParams.get("status") || "").trim().toUpperCase();
    const tipo = String(req.nextUrl.searchParams.get("tipo") || "").trim();
    const limitRaw = Number(req.nextUrl.searchParams.get("limit") || 200);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 200;

    const where: string[] = ["tenant_id = ?"];
    const params: any[] = [current.tenantId];

    if (q) {
      where.push("(titulo LIKE ? OR numero_projeto LIKE ? OR endereco LIKE ?)");
      const like = `%${q}%`;
      params.push(like, like, like);
    }
    if (status) {
      where.push("UPPER(COALESCE(status,'')) = ?");
      params.push(status);
    }
    if (tipo) {
      where.push("tipo LIKE ?");
      params.push(`%${tipo}%`);
    }

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
      WHERE ${where.join(" AND ")}
      ORDER BY atualizado_em DESC, id_projeto DESC
      LIMIT ?
      `,
      [...params, limit]
    );

    return ok(
      (rows as any[]).map((r) => ({
        ...r,
        idProjeto: Number(r.idProjeto),
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
    const [ins]: any = await conn.query(
      `
      INSERT INTO engenharia_projetos
        (tenant_id, titulo, endereco, descricao, tipo, numero_projeto, revisao, status, data_projeto, data_aprovacao)
      VALUES
        (?,?,?,?,?,?,?,?,?,?)
      `,
      [
        current.tenantId,
        titulo.slice(0, 255),
        endereco ? endereco.slice(0, 255) : null,
        descricao,
        tipo ? tipo.slice(0, 80) : null,
        numeroProjeto ? numeroProjeto.slice(0, 80) : null,
        revisao ? revisao.slice(0, 30) : null,
        status ? status.slice(0, 30) : null,
        dataProjeto,
        dataAprovacao,
      ]
    );
    await conn.commit();
    return ok({ idProjeto: Number(ins.insertId) });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

