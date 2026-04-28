import { db } from '@/lib/db';
import { ApiError, created, handleApiError, ok } from '@/lib/api/http';
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

async function getCurrentFuncionarioId(tenantId: number, userId: number) {
  const [[row]]: any = await db.query(`SELECT id_funcionario idFuncionario FROM usuarios WHERE tenant_id = ? AND id_usuario = ? LIMIT 1`, [
    tenantId,
    userId,
  ]);
  return row?.idFuncionario ? Number(row.idFuncionario) : null;
}

export async function GET(req: Request) {
  try {
    const current = await requireApiPermission(PERMISSIONS.RH_PRESENCAS_VIEW);
    const { searchParams } = new URL(req.url);
    const status = (searchParams.get('status') || '').trim();
    const data = (searchParams.get('data') || '').trim();

    const [rows]: any = await db.query(
      `
      SELECT
        id_presenca AS id,
        tipo_local AS tipoLocal,
        id_obra AS idObra,
        id_unidade AS idUnidade,
        data_referencia AS dataReferencia,
        turno,
        status_presenca AS statusPresenca,
        id_supervisor_lancamento AS idSupervisorLancamento,
        observacao
      FROM presencas_cabecalho
      WHERE tenant_id = ?
        AND (? = '' OR status_presenca = ?)
        AND (? = '' OR data_referencia = ?)
      ORDER BY data_referencia DESC, id_presenca DESC
      `,
      [current.tenantId, status, status, data, data]
    );

    return ok(rows);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const current = await requireApiPermission(PERMISSIONS.RH_PRESENCAS_CRUD);
    const body = await req.json();

    await ensureAuthorizedForPresencas({ tenantId: current.tenantId, userId: current.id });

    const idFuncionario = await getCurrentFuncionarioId(current.tenantId, current.id);
    if (!idFuncionario) throw new ApiError(403, 'Usuário sem vínculo com funcionário');

    const tipoLocal = String(body?.tipoLocal || '').toUpperCase();
    const dataReferencia = String(body?.dataReferencia || '').trim();
    const idObra = body?.idObra ? Number(body.idObra) : null;
    const idUnidade = body?.idUnidade ? Number(body.idUnidade) : null;
    const turno = body?.turno ? String(body.turno) : 'NORMAL';
    const observacao = body?.observacao ? String(body.observacao) : null;

    if (!tipoLocal || !dataReferencia) throw new ApiError(422, 'Tipo do local e data são obrigatórios');
    if (tipoLocal === 'OBRA' && !idObra) throw new ApiError(422, 'Informe a obra');
    if (tipoLocal === 'UNIDADE' && !idUnidade) throw new ApiError(422, 'Informe a unidade');

    const [result]: any = await db.query(
      `
      INSERT INTO presencas_cabecalho
        (tenant_id, tipo_local, id_obra, id_unidade, data_referencia, turno, status_presenca, id_supervisor_lancamento, observacao)
      VALUES
        (?, ?, ?, ?, ?, ?, 'EM_PREENCHIMENTO', ?, ?)
      `,
      [current.tenantId, tipoLocal, idObra, idUnidade, dataReferencia, turno, idFuncionario, observacao]
    );

    return created({ id: result.insertId });
  } catch (e) {
    return handleApiError(e);
  }
}
