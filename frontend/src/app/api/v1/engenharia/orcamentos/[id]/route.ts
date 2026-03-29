import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

async function ensureTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_orcamentos (
      id_orcamento BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      nome VARCHAR(180) NOT NULL,
      tipo ENUM('LICITACAO','CONTRATO_PRIVADO') NOT NULL DEFAULT 'CONTRATO_PRIVADO',
      data_base_label VARCHAR(120) NULL,
      referencia_base VARCHAR(120) NULL,
      ativo TINYINT(1) NOT NULL DEFAULT 1,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      id_usuario_criador BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY (id_orcamento),
      KEY idx_tenant (tenant_id),
      KEY idx_tipo (tenant_id, tipo),
      KEY idx_ativo (tenant_id, ativo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_orcamentos_versoes (
      id_versao BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_orcamento BIGINT UNSIGNED NOT NULL,
      numero_versao INT NOT NULL,
      titulo_versao VARCHAR(180) NULL,
      status ENUM('RASCUNHO','CONGELADO') NOT NULL DEFAULT 'RASCUNHO',
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      id_usuario_criador BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY (id_versao),
      UNIQUE KEY uk_orcamento_versao (tenant_id, id_orcamento, numero_versao),
      KEY idx_tenant (tenant_id),
      KEY idx_orcamento (tenant_id, id_orcamento)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_orcamentos_parametros (
      id_param BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_orcamento BIGINT UNSIGNED NOT NULL,
      parametros_json JSON NULL,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      id_usuario_atualizador BIGINT UNSIGNED NULL,
      PRIMARY KEY (id_param),
      UNIQUE KEY uk_orcamento (tenant_id, id_orcamento),
      KEY idx_tenant (tenant_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const { id } = await params;
    const idOrcamento = Number(id || 0);
    if (!Number.isFinite(idOrcamento) || idOrcamento <= 0) return fail(422, 'idOrcamento inválido');

    await ensureTables();

    const [[o]]: any = await db.query(
      `
      SELECT id_orcamento AS idOrcamento, nome, tipo, data_base_label AS dataBaseLabel, referencia_base AS referenciaBase
      FROM engenharia_orcamentos
      WHERE tenant_id = ? AND id_orcamento = ? AND ativo = 1
      LIMIT 1
      `,
      [current.tenantId, idOrcamento]
    );
    if (!o) return fail(404, 'Orçamento não encontrado');

    const [[p]]: any = await db.query(`SELECT parametros_json AS parametrosJson FROM engenharia_orcamentos_parametros WHERE tenant_id = ? AND id_orcamento = ? LIMIT 1`, [
      current.tenantId,
      idOrcamento,
    ]);
    const paramsJson = p?.parametrosJson ? (typeof p.parametrosJson === 'string' ? JSON.parse(p.parametrosJson) : p.parametrosJson) : null;

    const [versoes]: any = await db.query(
      `
      SELECT id_versao AS idVersao, numero_versao AS numeroVersao, titulo_versao AS tituloVersao, status, criado_em AS criadoEm
      FROM engenharia_orcamentos_versoes
      WHERE tenant_id = ? AND id_orcamento = ?
      ORDER BY numero_versao DESC
      `,
      [current.tenantId, idOrcamento]
    );

    return ok({
      orcamento: {
        idOrcamento: Number(o.idOrcamento),
        nome: String(o.nome),
        tipo: String(o.tipo),
        dataBaseLabel: o.dataBaseLabel ? String(o.dataBaseLabel) : null,
        referenciaBase: o.referenciaBase ? String(o.referenciaBase) : null,
      },
      parametros: paramsJson,
      versoes: (versoes as any[]).map((v) => ({
        idVersao: Number(v.idVersao),
        numeroVersao: Number(v.numeroVersao),
        tituloVersao: v.tituloVersao ? String(v.tituloVersao) : null,
        status: String(v.status),
        criadoEm: v.criadoEm ? new Date(v.criadoEm).toISOString() : null,
      })),
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const { id } = await params;
    const idOrcamento = Number(id || 0);
    if (!Number.isFinite(idOrcamento) || idOrcamento <= 0) return fail(422, 'idOrcamento inválido');

    await ensureTables();

    const body = await req.json().catch(() => null);
    const parametros = body?.parametros ?? null;
    if (!parametros) return fail(422, 'parametros é obrigatório');

    await conn.query(
      `
      INSERT INTO engenharia_orcamentos_parametros (tenant_id, id_orcamento, parametros_json, id_usuario_atualizador)
      VALUES (?,?,?,?)
      ON DUPLICATE KEY UPDATE
        parametros_json = VALUES(parametros_json),
        id_usuario_atualizador = VALUES(id_usuario_atualizador),
        atualizado_em = CURRENT_TIMESTAMP
      `,
      [current.tenantId, idOrcamento, JSON.stringify(parametros), current.id]
    );

    return ok({ idOrcamento });
  } catch (e) {
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

