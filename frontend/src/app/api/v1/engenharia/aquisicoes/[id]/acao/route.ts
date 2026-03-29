import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { getDashboardScope } from '@/lib/dashboard/scope';
import { audit } from '@/lib/api/audit';

export const runtime = 'nodejs';

async function ensureTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_solicitacoes_aquisicao (
      id_solicitacao BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      tipo_local ENUM('OBRA','UNIDADE') NOT NULL,
      id_local BIGINT UNSIGNED NOT NULL,
      categoria ENUM('EQUIPAMENTO','FERRAMENTA','COMBUSTIVEL','OUTRO') NOT NULL DEFAULT 'OUTRO',
      descricao VARCHAR(255) NOT NULL,
      quantidade DECIMAL(14,4) NOT NULL DEFAULT 1,
      unidade_medida VARCHAR(32) NULL,
      codigo_servico VARCHAR(80) NULL,
      prioridade ENUM('BAIXA','MEDIA','ALTA','CRITICA') NOT NULL DEFAULT 'MEDIA',
      status ENUM('RASCUNHO','ENVIADA','APROVADA','REJEITADA','CANCELADA') NOT NULL DEFAULT 'RASCUNHO',
      justificativa TEXT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      enviado_em DATETIME NULL,
      aprovado_em DATETIME NULL,
      id_usuario_solicitante BIGINT UNSIGNED NULL,
      id_usuario_aprovador BIGINT UNSIGNED NULL,
      motivo_rejeicao TEXT NULL,
      PRIMARY KEY (id_solicitacao),
      KEY idx_local (tenant_id, tipo_local, id_local),
      KEY idx_status (tenant_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

function normalizeAcao(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'ENVIAR' || s === 'APROVAR' || s === 'REJEITAR' || s === 'CANCELAR' ? s : null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const scope = await getDashboardScope(current);
    const { id } = await params;
    const idSolicitacao = Number(id || 0);
    if (!Number.isFinite(idSolicitacao) || idSolicitacao <= 0) return fail(422, 'idSolicitacao inválido');

    const body = await req.json().catch(() => null);
    const acao = normalizeAcao(body?.acao);
    const motivo = body?.motivo ? String(body.motivo).trim() : null;
    if (!acao) return fail(422, 'acao é obrigatória (ENVIAR|APROVAR|REJEITAR|CANCELAR)');

    await ensureTables();

    const [[row]]: any = await conn.query(
      `SELECT * FROM engenharia_solicitacoes_aquisicao WHERE tenant_id = ? AND id_solicitacao = ? LIMIT 1`,
      [current.tenantId, idSolicitacao]
    );
    if (!row) return fail(404, 'Solicitação não encontrada');

    const tipoLocal = String(row.tipo_local);
    const idLocal = Number(row.id_local);
    if (!scope.empresaTotal && tipoLocal === 'OBRA' && !scope.obras.includes(idLocal)) return fail(403, 'Obra fora da abrangência');
    if (!scope.empresaTotal && tipoLocal === 'UNIDADE' && !scope.unidades.includes(idLocal)) return fail(403, 'Unidade fora da abrangência');

    const status = String(row.status);

    if (acao === 'ENVIAR' && status !== 'RASCUNHO') return fail(422, 'Apenas rascunho pode ser enviado');
    if (acao === 'APROVAR' && status !== 'ENVIADA') return fail(422, 'Apenas enviada pode ser aprovada');
    if (acao === 'REJEITAR' && status !== 'ENVIADA') return fail(422, 'Apenas enviada pode ser rejeitada');
    if (acao === 'CANCELAR' && !['RASCUNHO', 'ENVIADA'].includes(status)) return fail(422, 'Não é possível cancelar neste status');

    if (acao === 'REJEITAR' && !motivo) return fail(422, 'motivo é obrigatório para rejeição');

    await conn.beginTransaction();
    if (acao === 'ENVIAR') {
      await conn.query(`UPDATE engenharia_solicitacoes_aquisicao SET status = 'ENVIADA', enviado_em = NOW() WHERE tenant_id = ? AND id_solicitacao = ?`, [
        current.tenantId,
        idSolicitacao,
      ]);
    } else if (acao === 'APROVAR') {
      await conn.query(
        `UPDATE engenharia_solicitacoes_aquisicao SET status = 'APROVADA', aprovado_em = NOW(), id_usuario_aprovador = ? WHERE tenant_id = ? AND id_solicitacao = ?`,
        [current.id, current.tenantId, idSolicitacao]
      );
    } else if (acao === 'REJEITAR') {
      await conn.query(
        `UPDATE engenharia_solicitacoes_aquisicao SET status = 'REJEITADA', id_usuario_aprovador = ?, motivo_rejeicao = ? WHERE tenant_id = ? AND id_solicitacao = ?`,
        [current.id, motivo, current.tenantId, idSolicitacao]
      );
    } else if (acao === 'CANCELAR') {
      await conn.query(`UPDATE engenharia_solicitacoes_aquisicao SET status = 'CANCELADA' WHERE tenant_id = ? AND id_solicitacao = ?`, [
        current.tenantId,
        idSolicitacao,
      ]);
    }

    await audit({
      tenantId: current.tenantId,
      userId: current.id,
      entidade: 'engenharia_solicitacoes_aquisicao',
      idRegistro: String(idSolicitacao),
      acao: `ACAO_${acao}`,
      dadosNovos: { motivo: motivo ?? null },
    });

    await conn.commit();
    return ok({ idSolicitacao, status: acao === 'ENVIAR' ? 'ENVIADA' : acao === 'APROVAR' ? 'APROVADA' : acao === 'REJEITAR' ? 'REJEITADA' : 'CANCELADA' });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}
