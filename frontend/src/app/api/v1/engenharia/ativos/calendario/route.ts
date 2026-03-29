import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { getDashboardScope } from '@/lib/dashboard/scope';

export const runtime = 'nodejs';

async function ensureTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_ativos_calendario (
      id_planejamento BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_ativo BIGINT UNSIGNED NOT NULL,
      competencia VARCHAR(7) NOT NULL,
      tipo_local ENUM('OBRA','UNIDADE') NOT NULL,
      id_local BIGINT UNSIGNED NOT NULL,
      planejamento_json JSON NOT NULL,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      id_usuario_atualizador BIGINT UNSIGNED NULL,
      PRIMARY KEY (id_planejamento),
      UNIQUE KEY uk_unique (tenant_id, id_ativo, competencia, tipo_local, id_local),
      KEY idx_local (tenant_id, tipo_local, id_local),
      KEY idx_ativo (tenant_id, id_ativo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

function normalizeCompetencia(v: unknown) {
  const s = String(v ?? '').trim();
  return /^\d{4}-\d{2}$/.test(s) ? s : null;
}

function normalizeTipoLocal(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'OBRA' || s === 'UNIDADE' ? s : null;
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const scope = await getDashboardScope(current);

    const idAtivo = Number(req.nextUrl.searchParams.get('idAtivo') || 0);
    const competencia = normalizeCompetencia(req.nextUrl.searchParams.get('competencia'));
    const tipoLocal = normalizeTipoLocal(req.nextUrl.searchParams.get('tipoLocal'));
    const idLocal = Number(req.nextUrl.searchParams.get('idLocal') || 0);

    if (!Number.isFinite(idAtivo) || idAtivo <= 0) return fail(422, 'idAtivo é obrigatório');
    if (!competencia) return fail(422, 'competencia é obrigatória (YYYY-MM)');
    if (!tipoLocal) return fail(422, 'tipoLocal é obrigatório (OBRA|UNIDADE)');
    if (!Number.isFinite(idLocal) || idLocal <= 0) return fail(422, 'idLocal é obrigatório');
    if (!scope.empresaTotal && tipoLocal === 'OBRA' && !scope.obras.includes(idLocal)) return fail(403, 'Obra fora da abrangência');
    if (!scope.empresaTotal && tipoLocal === 'UNIDADE' && !scope.unidades.includes(idLocal)) return fail(403, 'Unidade fora da abrangência');

    await ensureTables();

    const [[row]]: any = await db.query(
      `
      SELECT planejamento_json AS planejamentoJson
      FROM engenharia_ativos_calendario
      WHERE tenant_id = ? AND id_ativo = ? AND competencia = ? AND tipo_local = ? AND id_local = ?
      LIMIT 1
      `,
      [current.tenantId, idAtivo, competencia, tipoLocal, idLocal]
    );
    const planejamento = row?.planejamentoJson ? (typeof row.planejamentoJson === 'string' ? JSON.parse(row.planejamentoJson) : row.planejamentoJson) : null;
    return ok({ idAtivo, competencia, tipoLocal, idLocal, planejamento });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PUT(req: NextRequest) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const scope = await getDashboardScope(current);
    const body = await req.json().catch(() => null);

    const idAtivo = Number(body?.idAtivo || 0);
    const competencia = normalizeCompetencia(body?.competencia);
    const tipoLocal = normalizeTipoLocal(body?.tipoLocal);
    const idLocal = Number(body?.idLocal || 0);
    const planejamento = body?.planejamento;

    if (!Number.isFinite(idAtivo) || idAtivo <= 0) return fail(422, 'idAtivo é obrigatório');
    if (!competencia) return fail(422, 'competencia é obrigatória (YYYY-MM)');
    if (!tipoLocal) return fail(422, 'tipoLocal é obrigatório (OBRA|UNIDADE)');
    if (!Number.isFinite(idLocal) || idLocal <= 0) return fail(422, 'idLocal é obrigatório');
    if (!planejamento || typeof planejamento !== 'object') return fail(422, 'planejamento é obrigatório');
    if (!scope.empresaTotal && tipoLocal === 'OBRA' && !scope.obras.includes(idLocal)) return fail(403, 'Obra fora da abrangência');
    if (!scope.empresaTotal && tipoLocal === 'UNIDADE' && !scope.unidades.includes(idLocal)) return fail(403, 'Unidade fora da abrangência');

    await ensureTables();

    await conn.beginTransaction();
    await conn.query(
      `
      INSERT INTO engenharia_ativos_calendario
        (tenant_id, id_ativo, competencia, tipo_local, id_local, planejamento_json, id_usuario_atualizador)
      VALUES
        (?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE
        planejamento_json = VALUES(planejamento_json),
        id_usuario_atualizador = VALUES(id_usuario_atualizador)
      `,
      [current.tenantId, idAtivo, competencia, tipoLocal, idLocal, JSON.stringify(planejamento), current.id]
    );
    await conn.commit();
    return ok({ ok: true });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

