import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { canAccessObra, hasPermission } from '@/lib/auth/access';

export const runtime = 'nodejs';

async function ensureTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_programacoes_semanais (
      id_programacao BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_obra BIGINT UNSIGNED NOT NULL,
      semana_inicio DATE NOT NULL,
      semana_fim DATE NOT NULL,
      status ENUM('RASCUNHO','ENVIADA','APROVADA','REJEITADA','CANCELADA') NOT NULL DEFAULT 'RASCUNHO',
      id_funcionario_planejamento BIGINT UNSIGNED NULL,
      id_funcionario_apropriacao BIGINT UNSIGNED NULL,
      motivo_rejeicao TEXT NULL,
      aprovado_em DATETIME NULL,
      id_usuario_aprovador BIGINT UNSIGNED NULL,
      id_usuario_criador BIGINT UNSIGNED NOT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_programacao),
      UNIQUE KEY uk_obra_semana (tenant_id, id_obra, semana_inicio),
      KEY idx_tenant (tenant_id),
      KEY idx_obra (tenant_id, id_obra),
      KEY idx_status (tenant_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_programacoes_semanais_itens (
      id_item BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_programacao BIGINT UNSIGNED NOT NULL,
      data_referencia DATE NOT NULL,
      id_funcionario BIGINT UNSIGNED NOT NULL,
      funcao_exercida VARCHAR(120) NULL,
      codigo_servico VARCHAR(80) NOT NULL,
      hora_inicio_prevista TIME NULL,
      hora_fim_prevista TIME NULL,
      hora_inicio_executada TIME NULL,
      hora_fim_executada TIME NULL,
      tipo_dia ENUM('UTIL','FIM_SEMANA','FERIADO') NOT NULL DEFAULT 'UTIL',
      he_prevista_minutos INT NOT NULL DEFAULT 0,
      banco_horas_com_anuencia TINYINT(1) NOT NULL DEFAULT 0,
      producao_min_por_hora DECIMAL(14,4) NULL,
      producao_prevista DECIMAL(14,4) NULL,
      observacao TEXT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_item),
      UNIQUE KEY uk_item (tenant_id, id_programacao, data_referencia, id_funcionario, codigo_servico),
      KEY idx_programacao (tenant_id, id_programacao),
      KEY idx_data (tenant_id, data_referencia)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

function daysUntil(dateIso: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(`${dateIso}T00:00:00`);
  return Math.floor((d.getTime() - today.getTime()) / 86400000);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const { id } = await params;
    const idProgramacao = Number(id || 0);
    if (!Number.isFinite(idProgramacao) || idProgramacao <= 0) return fail(422, 'idProgramacao inválido');

    const body = await req.json().catch(() => null);
    const acao = String(body?.acao || '').trim().toUpperCase();
    if (!acao) return fail(422, 'acao é obrigatória');

    await ensureTables();

    const [[head]]: any = await conn.query(
      `SELECT id_obra AS idObra, status, semana_inicio AS semanaInicio FROM engenharia_programacoes_semanais WHERE tenant_id = ? AND id_programacao = ? LIMIT 1`,
      [current.tenantId, idProgramacao]
    );
    if (!head) return fail(404, 'Programação não encontrada');
    if (!canAccessObra(current as any, Number(head.idObra))) return fail(403, 'Sem acesso à obra');

    if (acao === 'ENVIAR') {
      if (!['RASCUNHO', 'REJEITADA'].includes(String(head.status))) return fail(422, 'Ação não permitida neste status');
      const dias = daysUntil(String(head.semanaInicio));
      if (dias < 7) return fail(422, 'Programação deve ser enviada com antecedência mínima de 1 semana (7 dias) em relação ao início da semana');

      await conn.query(
        `UPDATE engenharia_programacoes_semanais SET status = 'ENVIADA', motivo_rejeicao = NULL WHERE tenant_id = ? AND id_programacao = ?`,
        [current.tenantId, idProgramacao]
      );
      return ok({ idProgramacao, status: 'ENVIADA' });
    }

    if (acao === 'APROVAR') {
      if (!hasPermission(current as any, PERMISSIONS.DASHBOARD_DIRETOR_VIEW)) return fail(403, 'Aprovação requer perfil de Diretor');
      if (String(head.status) !== 'ENVIADA') return fail(422, 'Apenas programações enviadas podem ser aprovadas');

      const [[excecoes]]: any = await conn.query(
        `
        SELECT
          SUM(CASE WHEN tipo_dia IN ('FIM_SEMANA','FERIADO') THEN 1 ELSE 0 END) AS totalExcecao,
          SUM(CASE WHEN tipo_dia IN ('FIM_SEMANA','FERIADO') AND (COALESCE(he_prevista_minutos,0) > 0 OR banco_horas_com_anuencia = 1) THEN 1 ELSE 0 END) AS totalComBase
        FROM engenharia_programacoes_semanais_itens
        WHERE tenant_id = ? AND id_programacao = ?
        `,
        [current.tenantId, idProgramacao]
      );
      const totalExcecao = Number(excecoes?.totalExcecao || 0);
      const totalComBase = Number(excecoes?.totalComBase || 0);
      if (totalExcecao > 0 && totalComBase < totalExcecao) {
        return fail(422, 'Há itens em feriado/final de semana sem previsão de HE ou banco de horas com anuência');
      }

      await conn.query(
        `
        UPDATE engenharia_programacoes_semanais
        SET status = 'APROVADA', aprovado_em = CURRENT_TIMESTAMP, id_usuario_aprovador = ?, motivo_rejeicao = NULL
        WHERE tenant_id = ? AND id_programacao = ?
        `,
        [current.id, current.tenantId, idProgramacao]
      );
      return ok({ idProgramacao, status: 'APROVADA' });
    }

    if (acao === 'REJEITAR') {
      if (!hasPermission(current as any, PERMISSIONS.DASHBOARD_DIRETOR_VIEW)) return fail(403, 'Rejeição requer perfil de Diretor');
      if (!['ENVIADA'].includes(String(head.status))) return fail(422, 'Apenas programações enviadas podem ser rejeitadas');
      const motivo = String(body?.motivo || '').trim();
      if (!motivo) return fail(422, 'motivo é obrigatório');
      await conn.query(
        `UPDATE engenharia_programacoes_semanais SET status = 'REJEITADA', motivo_rejeicao = ? WHERE tenant_id = ? AND id_programacao = ?`,
        [motivo, current.tenantId, idProgramacao]
      );
      return ok({ idProgramacao, status: 'REJEITADA' });
    }

    if (acao === 'CANCELAR') {
      if (!['RASCUNHO', 'REJEITADA'].includes(String(head.status))) return fail(422, 'Apenas rascunho/rejeitada pode ser cancelada');
      await conn.query(
        `UPDATE engenharia_programacoes_semanais SET status = 'CANCELADA' WHERE tenant_id = ? AND id_programacao = ?`,
        [current.tenantId, idProgramacao]
      );
      return ok({ idProgramacao, status: 'CANCELADA' });
    }

    return fail(422, 'Ação inválida');
  } catch (e) {
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

