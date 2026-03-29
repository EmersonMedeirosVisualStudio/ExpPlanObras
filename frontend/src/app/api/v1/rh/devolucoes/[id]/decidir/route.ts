import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { audit } from '@/lib/api/audit';

export const runtime = 'nodejs';

async function ensureDevolucoesTable() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS rh_devolucoes_funcionario (
      id_solicitacao BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_funcionario BIGINT UNSIGNED NOT NULL,
      id_obra BIGINT UNSIGNED NULL,
      motivo VARCHAR(100) NULL,
      justificativa TEXT NULL,
      relato_engenheiro TEXT NULL,
      relato_mestre TEXT NULL,
      relato_encarregado TEXT NULL,
      sugestao_providencia VARCHAR(40) NULL,
      status ENUM('PENDENTE','DECIDIDA') NOT NULL DEFAULT 'PENDENTE',
      decisao VARCHAR(40) NULL,
      decisao_observacao TEXT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      decidido_em DATETIME NULL,
      id_usuario_solicitante BIGINT UNSIGNED NULL,
      id_usuario_decisor BIGINT UNSIGNED NULL,
      PRIMARY KEY (id_solicitacao),
      KEY idx_tenant_status (tenant_id, status),
      KEY idx_tenant_funcionario (tenant_id, id_funcionario),
      KEY idx_tenant_obra (tenant_id, id_obra)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.RH_FUNCIONARIOS_CRUD);
    const { id } = await params;
    const idSolicitacao = Number(id || 0);
    if (!Number.isFinite(idSolicitacao) || idSolicitacao <= 0) return fail(422, 'idSolicitacao inválido');

    const body = await req.json().catch(() => null);
    const decisao = body?.decisao ? String(body.decisao).trim().toUpperCase() : null;
    const observacao = body?.observacao ? String(body.observacao).trim() : null;
    if (!decisao) return fail(422, 'decisao é obrigatória');

    await ensureDevolucoesTable();

    const [[row]]: any = await conn.query(
      `SELECT id_solicitacao, status FROM rh_devolucoes_funcionario WHERE tenant_id = ? AND id_solicitacao = ? LIMIT 1`,
      [current.tenantId, idSolicitacao]
    );
    if (!row) return fail(404, 'Solicitação não encontrada');
    if (String(row.status) !== 'PENDENTE') return fail(422, 'Solicitação já decidida');

    await conn.beginTransaction();
    await conn.query(
      `
      UPDATE rh_devolucoes_funcionario
      SET status = 'DECIDIDA', decisao = ?, decisao_observacao = ?, decidido_em = NOW(), id_usuario_decisor = ?
      WHERE tenant_id = ? AND id_solicitacao = ?
      `,
      [decisao, observacao, current.id, current.tenantId, idSolicitacao]
    );

    await audit({
      tenantId: current.tenantId,
      userId: current.id,
      entidade: 'rh_devolucoes_funcionario',
      idRegistro: String(idSolicitacao),
      acao: 'DECIDIR',
      dadosNovos: { decisao, observacao },
    });

    await conn.commit();
    return ok({ idSolicitacao, status: 'DECIDIDA', decisao });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

