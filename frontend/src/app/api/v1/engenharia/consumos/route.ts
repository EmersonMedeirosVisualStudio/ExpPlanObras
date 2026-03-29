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
    CREATE TABLE IF NOT EXISTS engenharia_consumos (
      id_consumo BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      tipo_local ENUM('OBRA','UNIDADE') NOT NULL,
      id_local BIGINT UNSIGNED NOT NULL,
      competencia VARCHAR(7) NOT NULL,
      tipo_consumo ENUM('ENERGIA','AGUA','ESGOTO') NOT NULL,
      consumo DECIMAL(14,4) NULL,
      valor_total DECIMAL(14,2) NOT NULL DEFAULT 0,
      observacao TEXT NULL,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      id_usuario_atualizador BIGINT UNSIGNED NULL,
      PRIMARY KEY (id_consumo),
      UNIQUE KEY uk_unique (tenant_id, tipo_local, id_local, competencia, tipo_consumo),
      KEY idx_local (tenant_id, tipo_local, id_local),
      KEY idx_tipo (tenant_id, tipo_consumo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

function normalizeTipoLocal(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'OBRA' || s === 'UNIDADE' ? s : null;
}

function normalizeCompetencia(v: unknown) {
  const s = String(v ?? '').trim();
  return /^\d{4}-\d{2}$/.test(s) ? s : null;
}

function normalizeTipoConsumo(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'ENERGIA' || s === 'AGUA' || s === 'ESGOTO' ? s : null;
}

function toNumberOrNull(v: unknown) {
  if (v == null || String(v).trim() === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const scope = await getDashboardScope(current);

    const tipoLocal = normalizeTipoLocal(req.nextUrl.searchParams.get('tipoLocal'));
    const idLocal = Number(req.nextUrl.searchParams.get('idLocal') || 0);
    const competencia = normalizeCompetencia(req.nextUrl.searchParams.get('competencia'));

    if (!tipoLocal) return fail(422, 'tipoLocal é obrigatório (OBRA|UNIDADE)');
    if (!Number.isFinite(idLocal) || idLocal <= 0) return fail(422, 'idLocal é obrigatório');
    if (!competencia) return fail(422, 'competencia é obrigatória (YYYY-MM)');
    if (!scope.empresaTotal && tipoLocal === 'OBRA' && !scope.obras.includes(idLocal)) return fail(403, 'Obra fora da abrangência');
    if (!scope.empresaTotal && tipoLocal === 'UNIDADE' && !scope.unidades.includes(idLocal)) return fail(403, 'Unidade fora da abrangência');

    await ensureTables();

    const [rows]: any = await db.query(
      `
      SELECT
        tipo_consumo AS tipoConsumo,
        consumo,
        valor_total AS valorTotal,
        observacao
      FROM engenharia_consumos
      WHERE tenant_id = ? AND tipo_local = ? AND id_local = ? AND competencia = ?
      ORDER BY tipo_consumo
      `,
      [current.tenantId, tipoLocal, idLocal, competencia]
    );

    return ok(
      (rows as any[]).map((r) => ({
        ...r,
        consumo: r.consumo == null ? null : Number(r.consumo),
        valorTotal: Number(r.valorTotal || 0),
      }))
    );
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

    const tipoLocal = normalizeTipoLocal(body?.tipoLocal);
    const idLocal = Number(body?.idLocal || 0);
    const competencia = normalizeCompetencia(body?.competencia);
    const tipoConsumo = normalizeTipoConsumo(body?.tipoConsumo);
    const consumo = toNumberOrNull(body?.consumo);
    const valorTotal = toNumberOrNull(body?.valorTotal);
    const observacao = body?.observacao ? String(body.observacao).trim() : null;

    if (!tipoLocal) return fail(422, 'tipoLocal é obrigatório (OBRA|UNIDADE)');
    if (!Number.isFinite(idLocal) || idLocal <= 0) return fail(422, 'idLocal é obrigatório');
    if (!competencia) return fail(422, 'competencia é obrigatória (YYYY-MM)');
    if (!tipoConsumo) return fail(422, 'tipoConsumo é obrigatório (ENERGIA|AGUA|ESGOTO)');
    if (valorTotal == null || valorTotal < 0) return fail(422, 'valorTotal inválido');
    if (consumo != null && consumo < 0) return fail(422, 'consumo inválido');
    if (!scope.empresaTotal && tipoLocal === 'OBRA' && !scope.obras.includes(idLocal)) return fail(403, 'Obra fora da abrangência');
    if (!scope.empresaTotal && tipoLocal === 'UNIDADE' && !scope.unidades.includes(idLocal)) return fail(403, 'Unidade fora da abrangência');

    await ensureTables();

    await conn.beginTransaction();
    await conn.query(
      `
      INSERT INTO engenharia_consumos
        (tenant_id, tipo_local, id_local, competencia, tipo_consumo, consumo, valor_total, observacao, id_usuario_atualizador)
      VALUES
        (?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE
        consumo = VALUES(consumo),
        valor_total = VALUES(valor_total),
        observacao = VALUES(observacao),
        id_usuario_atualizador = VALUES(id_usuario_atualizador)
      `,
      [current.tenantId, tipoLocal, idLocal, competencia, tipoConsumo, consumo, valorTotal, observacao, current.id]
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

