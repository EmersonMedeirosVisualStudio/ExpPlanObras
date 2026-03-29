import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

async function ensureTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_ativos_manutencoes (
      id_manutencao BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_ativo BIGINT UNSIGNED NOT NULL,
      tipo ENUM('PREVENTIVA','CORRETIVA') NOT NULL,
      status ENUM('ABERTA','EXECUTADA','CANCELADA') NOT NULL DEFAULT 'ABERTA',
      data_programada DATE NULL,
      data_execucao DATE NULL,
      descricao TEXT NULL,
      codigo_servico VARCHAR(80) NULL,
      custo_total DECIMAL(14,2) NULL,
      id_contraparte BIGINT UNSIGNED NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      id_usuario_criador BIGINT UNSIGNED NULL,
      PRIMARY KEY (id_manutencao),
      KEY idx_ativo (tenant_id, id_ativo),
      KEY idx_status (tenant_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

function normalizeAcao(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'EXECUTAR' || s === 'CANCELAR' ? s : null;
}

function normalizeDate(v: unknown) {
  const s = String(v ?? '').trim();
  return s ? (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null) : null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const { id } = await params;
    const idManutencao = Number(id || 0);
    if (!Number.isFinite(idManutencao) || idManutencao <= 0) return fail(422, 'idManutencao inválido');

    const body = await req.json().catch(() => null);
    const acao = normalizeAcao(body?.acao);
    if (!acao) return fail(422, 'acao é obrigatória (EXECUTAR|CANCELAR)');

    await ensureTables();

    const [[row]]: any = await conn.query(
      `SELECT status FROM engenharia_ativos_manutencoes WHERE tenant_id = ? AND id_manutencao = ? LIMIT 1`,
      [current.tenantId, idManutencao]
    );
    if (!row) return fail(404, 'Manutenção não encontrada');
    const status = String(row.status);
    if (status !== 'ABERTA') return fail(422, 'Manutenção não pode ser alterada');

    await conn.beginTransaction();
    if (acao === 'EXECUTAR') {
      const dataExecucao = normalizeDate(body?.dataExecucao) || new Date().toISOString().slice(0, 10);
      await conn.query(
        `UPDATE engenharia_ativos_manutencoes SET status = 'EXECUTADA', data_execucao = ? WHERE tenant_id = ? AND id_manutencao = ?`,
        [dataExecucao, current.tenantId, idManutencao]
      );
      await conn.commit();
      return ok({ idManutencao, status: 'EXECUTADA' });
    }

    await conn.query(`UPDATE engenharia_ativos_manutencoes SET status = 'CANCELADA' WHERE tenant_id = ? AND id_manutencao = ?`, [
      current.tenantId,
      idManutencao,
    ]);
    await conn.commit();
    return ok({ idManutencao, status: 'CANCELADA' });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

