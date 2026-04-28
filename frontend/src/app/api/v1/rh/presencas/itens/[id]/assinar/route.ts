import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
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
  return {
    exigirAutorizacaoDispositivo: cfg?.exigirAutorizacaoDispositivo === undefined ? true : !!cfg.exigirAutorizacaoDispositivo,
    exigirGeolocalizacao: cfg?.exigirGeolocalizacao === undefined ? false : !!cfg.exigirGeolocalizacao,
    exigirFoto: cfg?.exigirFoto === undefined ? false : !!cfg.exigirFoto,
  };
}

async function ensureAuthorizedForPresencas(args: { tenantId: number; userId: number }) {
  const policy = await getPresencasPolicy(args.tenantId);
  if (!policy.exigirAutorizacaoDispositivo) return policy;
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
  return policy;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.RH_ASSINATURAS_EXECUTAR);
    const { id } = await params;
    const idItem = Number(id);
    const body = await req.json();

    if (!body.idFuncionarioSignatario || !body.tipoAssinatura) {
      return fail(422, 'Funcionário signatário e tipo de assinatura são obrigatórios');
    }

    const policy = await ensureAuthorizedForPresencas({ tenantId: current.tenantId, userId: current.id });

    if (policy.exigirGeolocalizacao) {
      const lat = Number(body.latitude);
      const lon = Number(body.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return fail(422, 'Geolocalização obrigatória (latitude/longitude).');
    }
    if (policy.exigirFoto) {
      const url = body.arquivoAssinaturaUrl ? String(body.arquivoAssinaturaUrl).trim() : '';
      if (!url) return fail(422, 'Foto obrigatória para assinatura.');
    }

    await conn.beginTransaction();

    const [rows]: any = await conn.query(
      `
      SELECT pi.id_presenca_item, pi.id_funcionario, pi.requer_assinatura_funcionario, pi.assinado_funcionario,
             pc.tenant_id, pc.status_presenca
      FROM presencas_itens pi
      INNER JOIN presencas_cabecalho pc ON pc.id_presenca = pi.id_presenca
      WHERE pi.id_presenca_item = ?
      `,
      [idItem]
    );
    if (!rows.length) return fail(404, 'Item não encontrado');

    const item = rows[0];
    if (item.tenant_id !== current.tenantId) return fail(403, 'Acesso negado');
    if (Number(item.id_funcionario) !== Number(body.idFuncionarioSignatario)) {
      return fail(422, 'Assinatura deve ser do próprio funcionário do item');
    }
    if (!item.requer_assinatura_funcionario) return fail(422, 'Este item não requer assinatura');
    if (item.status_presenca !== 'EM_PREENCHIMENTO' && item.status_presenca !== 'REJEITADA_RH') {
      return fail(422, 'Ficha não aceita assinatura neste status');
    }

    if (body.tipoAssinatura === 'PIN') {
      if (!body.pin) return fail(422, 'PIN obrigatório');

      const [pinRows]: any = await conn.query(
        `
        SELECT pin_hash
        FROM funcionarios_assinatura_habilitacoes
        WHERE tenant_id = ? AND id_funcionario = ? AND tipo_assinatura = 'PIN' AND ativo = 1
        `,
        [current.tenantId, body.idFuncionarioSignatario]
      );
      if (!pinRows.length) return fail(422, 'Funcionário sem PIN habilitado');

      const okPin = await bcrypt.compare(body.pin, pinRows[0].pin_hash);
      if (!okPin) return fail(422, 'PIN inválido');
    }

    const [result]: any = await conn.query(
      `
      INSERT INTO assinaturas_registros
      (tenant_id, entidade_tipo, entidade_id, id_funcionario_signatario, id_usuario_captura,
       tipo_assinatura, ip_origem, user_agent, latitude, longitude, hash_documento, arquivo_assinatura_url, observacao, metadata_json)
      VALUES
      (?, 'PRESENCA_ITEM', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        current.tenantId,
        idItem,
        body.idFuncionarioSignatario,
        current.id,
        body.tipoAssinatura,
        req.headers.get('x-forwarded-for') || null,
        req.headers.get('user-agent') || null,
        body.latitude || null,
        body.longitude || null,
        body.hashDocumento || null,
        body.arquivoAssinaturaUrl || null,
        body.observacao || null,
        body.metadataJson ? JSON.stringify(body.metadataJson) : null,
      ]
    );

    await conn.query(
      `
      UPDATE presencas_itens
      SET assinado_funcionario = 1, id_assinatura_registro = ?, motivo_sem_assinatura = NULL
      WHERE id_presenca_item = ?
      `,
      [result.insertId, idItem]
    );

    await conn.commit();
    return ok({ idAssinatura: result.insertId });
  } catch (error) {
    await conn.rollback();
    return handleApiError(error);
  } finally {
    conn.release();
  }
}
