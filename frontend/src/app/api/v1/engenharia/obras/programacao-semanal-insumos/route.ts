import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { canAccessObra } from '@/lib/auth/access';

export const runtime = 'nodejs';

async function ensureTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_programacoes_semanais_insumos (
      id_programacao_insumo BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_obra BIGINT UNSIGNED NOT NULL,
      semana_inicio DATE NOT NULL,
      semana_fim DATE NOT NULL,
      status ENUM('RASCUNHO','FECHADA') NOT NULL DEFAULT 'RASCUNHO',
      id_usuario_criador BIGINT UNSIGNED NOT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_programacao_insumo),
      UNIQUE KEY uk_obra_semana (tenant_id, id_obra, semana_inicio),
      KEY idx_tenant (tenant_id),
      KEY idx_obra (tenant_id, id_obra),
      KEY idx_status (tenant_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_programacoes_semanais_insumos_itens (
      id_item BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_programacao_insumo BIGINT UNSIGNED NOT NULL,
      data_referencia DATE NOT NULL,
      codigo_servico VARCHAR(80) NOT NULL,
      item_descricao VARCHAR(200) NOT NULL,
      unidade_medida VARCHAR(32) NULL,
      quantidade_prevista DECIMAL(14,4) NULL,
      origem ENUM('ESTOQUE','COMPRA','TERCEIRO') NOT NULL DEFAULT 'ESTOQUE',
      observacao TEXT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_item),
      UNIQUE KEY uk_item (tenant_id, id_programacao_insumo, data_referencia, codigo_servico, item_descricao),
      KEY idx_prog (tenant_id, id_programacao_insumo),
      KEY idx_data (tenant_id, data_referencia)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

function normalizeDate(v: unknown) {
  const s = String(v ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function startOfWeekMonday(dateIso: string) {
  const d = new Date(`${dateIso}T00:00:00`);
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}

function addDays(dateIso: string, days: number) {
  const d = new Date(`${dateIso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const idObra = Number(req.nextUrl.searchParams.get('idObra') || 0);
    if (!Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra é obrigatório');
    if (!canAccessObra(current as any, idObra)) return fail(403, 'Sem acesso à obra');

    await ensureTables();

    const [rows]: any = await db.query(
      `
      SELECT
        id_programacao_insumo AS idProgramacao,
        id_obra AS idObra,
        semana_inicio AS semanaInicio,
        semana_fim AS semanaFim,
        status,
        criado_em AS criadoEm,
        atualizado_em AS atualizadoEm
      FROM engenharia_programacoes_semanais_insumos
      WHERE tenant_id = ? AND id_obra = ?
      ORDER BY semana_inicio DESC
      LIMIT 24
      `,
      [current.tenantId, idObra]
    );

    return ok(
      (rows as any[]).map((r) => ({
        idProgramacao: Number(r.idProgramacao),
        idObra: Number(r.idObra),
        semanaInicio: String(r.semanaInicio),
        semanaFim: String(r.semanaFim),
        status: String(r.status),
        criadoEm: String(r.criadoEm),
        atualizadoEm: String(r.atualizadoEm),
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
    const body = await req.json().catch(() => null);
    const idObra = Number(body?.idObra || 0);
    const dataBase = normalizeDate(body?.semanaInicio) || startOfWeekMonday(isoToday());
    const semanaInicio = startOfWeekMonday(dataBase);
    const semanaFim = addDays(semanaInicio, 6);

    if (!Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra é obrigatório');
    if (!canAccessObra(current as any, idObra)) return fail(403, 'Sem acesso à obra');

    await ensureTables();

    await conn.beginTransaction();

    const [[existing]]: any = await conn.query(
      `SELECT id_programacao_insumo AS idProgramacao FROM engenharia_programacoes_semanais_insumos WHERE tenant_id = ? AND id_obra = ? AND semana_inicio = ? LIMIT 1`,
      [current.tenantId, idObra, semanaInicio]
    );
    if (existing?.idProgramacao) {
      await conn.commit();
      return ok({ idProgramacao: Number(existing.idProgramacao), criado: false });
    }

    const [ins]: any = await conn.query(
      `
      INSERT INTO engenharia_programacoes_semanais_insumos
        (tenant_id, id_obra, semana_inicio, semana_fim, status, id_usuario_criador)
      VALUES
        (?,?,?,?, 'RASCUNHO', ?)
      `,
      [current.tenantId, idObra, semanaInicio, semanaFim, current.id]
    );

    await conn.commit();
    return ok({ idProgramacao: Number(ins.insertId), criado: true });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

