import { NextRequest } from 'next/server';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { db } from '@/lib/db';
import { canAccessObra } from '@/lib/auth/access';
import { audit } from '@/lib/api/audit';

export const runtime = 'nodejs';

async function ensureDiarioTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS obras_parametros_fiscalizacao (
      id_param BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_obra BIGINT UNSIGNED NOT NULL,
      janela_diario_dias INT NOT NULL DEFAULT 7,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_param),
      UNIQUE KEY uk_obra (tenant_id, id_obra),
      KEY idx_obra (tenant_id, id_obra)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS obras_diarios (
      id_diario BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_obra BIGINT UNSIGNED NOT NULL,
      data_diario DATE NOT NULL,
      bloco_execucao_json JSON NULL,
      bloco_fiscalizacao_json JSON NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      id_usuario_criador BIGINT UNSIGNED NULL,
      id_usuario_atualizador BIGINT UNSIGNED NULL,
      PRIMARY KEY (id_diario),
      UNIQUE KEY uk_obra_data (tenant_id, id_obra, data_diario),
      KEY idx_obra (tenant_id, id_obra),
      KEY idx_data (tenant_id, data_diario)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

function normalizeDate(v: unknown) {
  const s = String(v ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.FISCALIZACAO_DIARIO_VIEW);
    const idObra = Number(req.nextUrl.searchParams.get('idObra') || 0);
    const data = normalizeDate(req.nextUrl.searchParams.get('data'));
    if (!Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra é obrigatório');
    if (!data) return fail(422, 'data é obrigatória (YYYY-MM-DD)');
    if (!canAccessObra(current as any, idObra)) return fail(403, 'Sem acesso à obra');

    await ensureDiarioTables();
    const [[row]]: any = await db.query(
      `
      SELECT
        id_diario AS idDiario,
        data_diario AS data,
        bloco_execucao_json AS blocoExecucaoJson,
        bloco_fiscalizacao_json AS blocoFiscalizacaoJson,
        criado_em AS criadoEm,
        atualizado_em AS atualizadoEm
      FROM obras_diarios
      WHERE tenant_id = ? AND id_obra = ? AND data_diario = ?
      LIMIT 1
      `,
      [current.tenantId, idObra, data]
    );
    return ok(
      row
        ? {
            ...row,
            blocoExecucaoJson: typeof row.blocoExecucaoJson === 'string' ? JSON.parse(row.blocoExecucaoJson) : row.blocoExecucaoJson,
            blocoFiscalizacaoJson: typeof row.blocoFiscalizacaoJson === 'string' ? JSON.parse(row.blocoFiscalizacaoJson) : row.blocoFiscalizacaoJson,
          }
        : null
    );
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PUT(req: NextRequest) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.FISCALIZACAO_DIARIO_EDIT);
    const body = await req.json().catch(() => null);
    const idObra = Number(body?.idObra || 0);
    const data = normalizeDate(body?.data);
    const blocoFiscalizacao = body?.blocoFiscalizacao ?? null;

    if (!Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra é obrigatório');
    if (!data) return fail(422, 'data é obrigatória (YYYY-MM-DD)');
    if (!canAccessObra(current as any, idObra)) return fail(403, 'Sem acesso à obra');

    await ensureDiarioTables();

    const [[param]]: any = await conn.query(
      `SELECT janela_diario_dias AS janelaDias FROM obras_parametros_fiscalizacao WHERE tenant_id = ? AND id_obra = ? LIMIT 1`,
      [current.tenantId, idObra]
    );
    const janelaDias = Math.max(1, Number(param?.janelaDias || 7));

    const [[valid]]: any = await conn.query(
      `SELECT DATEDIFF(CURDATE(), ?) AS diffDias`,
      [data]
    );
    const diffDias = Number(valid?.diffDias ?? 0);
    if (diffDias > janelaDias) return fail(422, `Fora da janela fiscal do diário (limite ${janelaDias} dias).`);

    const [[before]]: any = await conn.query(
      `SELECT id_diario, bloco_fiscalizacao_json AS blocoFiscalizacaoJson FROM obras_diarios WHERE tenant_id = ? AND id_obra = ? AND data_diario = ? LIMIT 1`,
      [current.tenantId, idObra, data]
    );

    await conn.beginTransaction();
    await conn.query(
      `
      INSERT INTO obras_diarios
        (tenant_id, id_obra, data_diario, bloco_fiscalizacao_json, id_usuario_criador, id_usuario_atualizador)
      VALUES
        (?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE
        bloco_fiscalizacao_json = VALUES(bloco_fiscalizacao_json),
        id_usuario_atualizador = VALUES(id_usuario_atualizador)
      `,
      [current.tenantId, idObra, data, blocoFiscalizacao ? JSON.stringify(blocoFiscalizacao) : null, current.id, current.id]
    );

    await audit({
      tenantId: current.tenantId,
      userId: current.id,
      entidade: 'obras_diarios',
      idRegistro: `${idObra}:${data}`,
      acao: before ? 'UPDATE_FISCALIZACAO' : 'CREATE_FISCALIZACAO',
      dadosAnteriores: before?.blocoFiscalizacaoJson ? { blocoFiscalizacao: JSON.parse(before.blocoFiscalizacaoJson) } : null,
      dadosNovos: { idObra, data, blocoFiscalizacao },
    });

    await conn.commit();
    return ok({ idObra, data });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

