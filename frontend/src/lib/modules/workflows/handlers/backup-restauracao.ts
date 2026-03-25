import { ApiError } from '@/lib/api/http';
import { db } from '@/lib/db';
import type { WorkflowEntityHandler } from '../types-internal';

export const backupRestauracaoWorkflowHandler: WorkflowEntityHandler = {
  entidadeTipo: 'BACKUP_RESTAURACAO',
  async obterTitulo(_tenantId, entidadeId) {
    return `Restauração de backup #${entidadeId}`;
  },
  async obterContexto(tenantId, entidadeId) {
    const [[row]]: any = await db.query(
      `
      SELECT id_backup_restauracao AS id,
             ponto_referencia AS pontoReferencia,
             motivo,
             status,
             solicitado_em AS solicitadoEm,
             solicitado_por AS solicitadoPor
      FROM backup_restauracao_solicitacoes
      WHERE tenant_id = ? AND id_backup_restauracao = ?
      LIMIT 1
      `,
      [tenantId, entidadeId]
    );
    if (!row) throw new ApiError(404, 'Solicitação de restauração não encontrada.');
    return {
      id: Number(row.id),
      pontoReferencia: String(row.pontoReferencia),
      motivo: String(row.motivo),
      status: String(row.status),
      solicitadoEm: row.solicitadoEm ? new Date(row.solicitadoEm).toISOString() : null,
      solicitadoPor: Number(row.solicitadoPor || 0),
    };
  },
  async validarPodeIniciar(tenantId, entidadeId, _userId) {
    const [[row]]: any = await db.query(
      `SELECT status FROM backup_restauracao_solicitacoes WHERE tenant_id = ? AND id_backup_restauracao = ? LIMIT 1`,
      [tenantId, entidadeId]
    );
    if (!row) throw new ApiError(404, 'Solicitação de restauração não encontrada.');
    const status = String(row.status || '');
    if (!['SOLICITADA', 'EM_ANALISE'].includes(status)) throw new ApiError(422, 'Esta solicitação não pode iniciar workflow neste status.');
  },
  async aplicarEstadoNaEntidade({ tenantId, entidadeId, chaveEstado }) {
    const estado = String(chaveEstado || '').toUpperCase();
    if (estado === 'APROVADA') {
      await db.execute(
        `UPDATE backup_restauracao_solicitacoes SET status = 'APROVADA', confirmado_em = CURRENT_TIMESTAMP WHERE tenant_id = ? AND id_backup_restauracao = ?`,
        [tenantId, entidadeId]
      );
      return;
    }
    if (estado === 'REJEITADA') {
      await db.execute(
        `UPDATE backup_restauracao_solicitacoes SET status = 'REJEITADA', confirmado_em = CURRENT_TIMESTAMP WHERE tenant_id = ? AND id_backup_restauracao = ?`,
        [tenantId, entidadeId]
      );
      return;
    }
    if (estado === 'EM_ANALISE') {
      await db.execute(`UPDATE backup_restauracao_solicitacoes SET status = 'EM_ANALISE' WHERE tenant_id = ? AND id_backup_restauracao = ?`, [
        tenantId,
        entidadeId,
      ]);
    }
  },
  rotaDetalhe() {
    return '/dashboard/admin/backup';
  },
};

