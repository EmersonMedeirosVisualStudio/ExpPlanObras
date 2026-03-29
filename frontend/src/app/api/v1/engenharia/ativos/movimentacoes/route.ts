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
    CREATE TABLE IF NOT EXISTS engenharia_ativos_movimentacoes (
      id_mov BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_ativo BIGINT UNSIGNED NOT NULL,
      tipo ENUM('TRANSFERENCIA','LOCALIZACAO','ENTRADA','SAIDA','MANUTENCAO','DESCARTE') NOT NULL,
      de_local_tipo ENUM('OBRA','UNIDADE','ALMOXARIFADO','TERCEIRO') NULL,
      de_local_id BIGINT UNSIGNED NULL,
      para_local_tipo ENUM('OBRA','UNIDADE','ALMOXARIFADO','TERCEIRO') NULL,
      para_local_id BIGINT UNSIGNED NULL,
      data_referencia DATE NOT NULL,
      observacao TEXT NULL,
      id_usuario BIGINT UNSIGNED NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_mov),
      KEY idx_ativo (tenant_id, id_ativo),
      KEY idx_local (tenant_id, para_local_tipo, para_local_id),
      KEY idx_data (tenant_id, data_referencia)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

function normalizeTipo(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'TRANSFERENCIA' || s === 'LOCALIZACAO' || s === 'ENTRADA' || s === 'SAIDA' || s === 'MANUTENCAO' || s === 'DESCARTE' ? s : null;
}

function normalizeLocalTipo(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'OBRA' || s === 'UNIDADE' || s === 'ALMOXARIFADO' || s === 'TERCEIRO' ? s : null;
}

function normalizeDate(v: unknown) {
  const s = String(v ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function assertScope(scope: any, tipo: string | null, id: number | null) {
  if (!tipo || !id) return;
  if (scope.empresaTotal) return;
  if (tipo === 'OBRA' && !scope.obras.includes(id)) throw new Error('Obra fora da abrangência');
  if (tipo === 'UNIDADE' && !scope.unidades.includes(id)) throw new Error('Unidade fora da abrangência');
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const idAtivo = Number(req.nextUrl.searchParams.get('idAtivo') || 0);
    if (!Number.isFinite(idAtivo) || idAtivo <= 0) return fail(422, 'idAtivo é obrigatório');

    await ensureTables();

    const [rows]: any = await db.query(
      `
      SELECT
        id_mov AS idMov,
        tipo,
        de_local_tipo AS deLocalTipo,
        de_local_id AS deLocalId,
        para_local_tipo AS paraLocalTipo,
        para_local_id AS paraLocalId,
        data_referencia AS dataReferencia,
        observacao,
        criado_em AS criadoEm
      FROM engenharia_ativos_movimentacoes
      WHERE tenant_id = ? AND id_ativo = ?
      ORDER BY data_referencia DESC, id_mov DESC
      LIMIT 500
      `,
      [current.tenantId, idAtivo]
    );
    return ok(
      (rows as any[]).map((r) => ({
        ...r,
        idMov: Number(r.idMov),
        deLocalId: r.deLocalId == null ? null : Number(r.deLocalId),
        paraLocalId: r.paraLocalId == null ? null : Number(r.paraLocalId),
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
    const scope = await getDashboardScope(current);
    const body = await req.json().catch(() => null);

    const idAtivo = Number(body?.idAtivo || 0);
    const tipo = normalizeTipo(body?.tipo);
    const paraLocalTipo = normalizeLocalTipo(body?.paraLocalTipo);
    const paraLocalId = body?.paraLocalId ? Number(body.paraLocalId) : null;
    const dataReferencia = normalizeDate(body?.dataReferencia) || new Date().toISOString().slice(0, 10);
    const observacao = body?.observacao ? String(body.observacao).trim() : null;

    if (!Number.isFinite(idAtivo) || idAtivo <= 0) return fail(422, 'idAtivo é obrigatório');
    if (!tipo) return fail(422, 'tipo é obrigatório');
    if (!dataReferencia) return fail(422, 'dataReferencia inválida');

    await ensureTables();

    const [[ativo]]: any = await conn.query(
      `
      SELECT id_ativo, local_tipo AS localTipo, local_id AS localId, status
      FROM engenharia_ativos
      WHERE tenant_id = ? AND id_ativo = ?
      LIMIT 1
      `,
      [current.tenantId, idAtivo]
    );
    if (!ativo) return fail(404, 'Ativo não encontrado');

    const deLocalTipo = ativo.localTipo ? String(ativo.localTipo) : null;
    const deLocalId = ativo.localId == null ? null : Number(ativo.localId);

    try {
      assertScope(scope, deLocalTipo, deLocalId);
      assertScope(scope, paraLocalTipo, paraLocalId);
    } catch (e: any) {
      return fail(403, e?.message || 'Fora da abrangência');
    }

    const nextLocalTipo = tipo === 'DESCARTE' || tipo === 'SAIDA' ? null : paraLocalTipo ?? deLocalTipo;
    const nextLocalId = tipo === 'DESCARTE' || tipo === 'SAIDA' ? null : paraLocalId ?? deLocalId;
    const nextStatus = tipo === 'DESCARTE' ? 'DESCARTADO' : String(ativo.status || 'ATIVO');

    await conn.beginTransaction();
    const [ins]: any = await conn.query(
      `
      INSERT INTO engenharia_ativos_movimentacoes
        (tenant_id, id_ativo, tipo, de_local_tipo, de_local_id, para_local_tipo, para_local_id, data_referencia, observacao, id_usuario)
      VALUES
        (?,?,?,?,?,?,?,?,?,?)
      `,
      [current.tenantId, idAtivo, tipo, deLocalTipo, deLocalId, nextLocalTipo, nextLocalId, dataReferencia, observacao, current.id]
    );

    await conn.query(
      `
      UPDATE engenharia_ativos
      SET local_tipo = ?, local_id = ?, status = ?
      WHERE tenant_id = ? AND id_ativo = ?
      `,
      [nextLocalTipo, nextLocalId, nextStatus, current.tenantId, idAtivo]
    );

    await conn.commit();
    return ok({ idMov: Number(ins.insertId) });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

