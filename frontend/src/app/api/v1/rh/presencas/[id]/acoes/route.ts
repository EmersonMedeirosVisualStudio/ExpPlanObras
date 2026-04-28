import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError, ApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

async function ensurePolicyTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS tenant_configuracoes (
      id_config BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      chave VARCHAR(120) NOT NULL,
      valor_json JSON NULL,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      id_usuario_atualizador BIGINT UNSIGNED NULL,
      PRIMARY KEY (id_config),
      UNIQUE KEY uk_tenant_chave (tenant_id, chave),
      KEY idx_tenant (tenant_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS rh_presencas_autorizacoes (
      id_autorizacao BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_usuario BIGINT UNSIGNED NOT NULL,
      termo_versao VARCHAR(40) NOT NULL,
      aceito_em DATETIME NOT NULL,
      ip_registro VARCHAR(80) NULL,
      user_agent VARCHAR(255) NULL,
      device_uuid VARCHAR(80) NULL,
      plataforma VARCHAR(20) NULL,
      ativo TINYINT(1) NOT NULL DEFAULT 1,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_autorizacao),
      UNIQUE KEY uk_tenant_user (tenant_id, id_usuario),
      KEY idx_tenant (tenant_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

async function getPresencasPolicy(tenantId: number) {
  await ensurePolicyTables();
  const [[row]]: any = await db.query(`SELECT valor_json AS valorJson FROM tenant_configuracoes WHERE tenant_id = ? AND chave = ? LIMIT 1`, [
    tenantId,
    'rh.presencas.politica',
  ]);
  const cfg = row?.valorJson ? (typeof row.valorJson === 'string' ? JSON.parse(row.valorJson) : row.valorJson) : {};
  const exigirAutorizacaoDispositivo = cfg?.exigirAutorizacaoDispositivo === undefined ? true : !!cfg.exigirAutorizacaoDispositivo;
  return { exigirAutorizacaoDispositivo };
}

async function ensureAuthorizedForPresencas(args: { tenantId: number; userId: number }) {
  const policy = await getPresencasPolicy(args.tenantId);
  if (!policy.exigirAutorizacaoDispositivo) return true;
  const [[row]]: any = await db.query(
    `
    SELECT 1 AS ok
    FROM rh_presencas_autorizacoes
    WHERE tenant_id = ? AND id_usuario = ? AND ativo = 1
    LIMIT 1
    `,
    [args.tenantId, args.userId]
  );
  if (!row?.ok) throw new ApiError(403, 'Dispositivo não autorizado para registro de presença. Abra o termo e aceite.');
  return true;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const idPresenca = Number(id);
    const body = await req.json();
    const acao = body.acao;

    if (!acao) return fail(422, 'Ação obrigatória');

    if (acao === 'FECHAR') {
      const current = await requireApiPermission(PERMISSIONS.RH_PRESENCAS_FECHAR);
      await ensureAuthorizedForPresencas({ tenantId: current.tenantId, userId: current.id });
      const [heads]: any = await db.query(`SELECT * FROM presencas_cabecalho WHERE id_presenca = ? AND tenant_id = ?`, [
        idPresenca,
        current.tenantId,
      ]);
      if (!heads.length) return fail(404, 'Ficha não encontrada');
      const head = heads[0];
      if (Number(head.id_supervisor_lancamento) !== Number(current.idFuncionario)) return fail(403, 'Somente o supervisor responsável pode fechar');

      const [pendencias]: any = await db.query(
        `
        SELECT COUNT(*) AS total
        FROM presencas_itens
        WHERE id_presenca = ?
          AND (
            situacao_presenca IS NULL
            OR (
              requer_assinatura_funcionario = 1
              AND assinado_funcionario = 0
              AND (motivo_sem_assinatura IS NULL OR motivo_sem_assinatura = '')
            )
          )
        `,
        [idPresenca]
      );
      if (pendencias[0].total > 0) return fail(422, 'Existem itens pendentes de assinatura ou justificativa');

      await db.query(
        `UPDATE presencas_cabecalho SET status_presenca = 'FECHADA', data_fechamento = NOW(), id_usuario_fechamento = ? WHERE id_presenca = ? AND tenant_id = ?`,
        [current.id, idPresenca, current.tenantId]
      );
      return ok({ id: idPresenca, status: 'FECHADA' });
    }

    if (acao === 'ENVIAR_RH') {
      const current = await requireApiPermission(PERMISSIONS.RH_PRESENCAS_ENVIAR);
      await ensureAuthorizedForPresencas({ tenantId: current.tenantId, userId: current.id });
      await db.query(
        `UPDATE presencas_cabecalho SET status_presenca = 'ENVIADA_RH', data_envio_rh = NOW(), id_usuario_envio_rh = ? WHERE id_presenca = ? AND tenant_id = ? AND status_presenca = 'FECHADA'`,
        [current.id, idPresenca, current.tenantId]
      );
      return ok({ id: idPresenca, status: 'ENVIADA_RH' });
    }

    if (acao === 'RECEBER_RH') {
      const current = await requireApiPermission(PERMISSIONS.RH_PRESENCAS_RECEBER);
      await ensureAuthorizedForPresencas({ tenantId: current.tenantId, userId: current.id });
      await db.query(
        `UPDATE presencas_cabecalho SET status_presenca = 'RECEBIDA_RH', data_recebimento_rh = NOW(), id_usuario_recebimento_rh = ?, motivo_rejeicao_rh = NULL WHERE id_presenca = ? AND tenant_id = ? AND status_presenca = 'ENVIADA_RH'`,
        [current.id, idPresenca, current.tenantId]
      );
      return ok({ id: idPresenca, status: 'RECEBIDA_RH' });
    }

    if (acao === 'REJEITAR_RH') {
      const current = await requireApiPermission(PERMISSIONS.RH_PRESENCAS_RECEBER);
      await ensureAuthorizedForPresencas({ tenantId: current.tenantId, userId: current.id });
      if (!body.motivo?.trim()) return fail(422, 'Motivo obrigatório');

      await db.query(
        `UPDATE presencas_cabecalho SET status_presenca = 'REJEITADA_RH', motivo_rejeicao_rh = ? WHERE id_presenca = ? AND tenant_id = ? AND status_presenca = 'ENVIADA_RH'`,
        [body.motivo.trim(), idPresenca, current.tenantId]
      );
      return ok({ id: idPresenca, status: 'REJEITADA_RH' });
    }

    return fail(422, 'Ação inválida');
  } catch (e) {
    return handleApiError(e);
  }
}
