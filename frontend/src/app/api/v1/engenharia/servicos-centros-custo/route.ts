import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { canAccessObra } from '@/lib/auth/access';

export const runtime = 'nodejs';

async function ensureTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_centros_custo (
      id_centro_custo BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      codigo VARCHAR(40) NOT NULL,
      descricao VARCHAR(200) NOT NULL,
      tipo VARCHAR(40) NULL,
      unidade_medida VARCHAR(32) NULL,
      ativo TINYINT(1) NOT NULL DEFAULT 1,
      observacao TEXT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_centro_custo),
      UNIQUE KEY uk_codigo (tenant_id, codigo),
      KEY idx_tenant (tenant_id),
      KEY idx_ativo (tenant_id, ativo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_servicos_centros_custo (
      id_vinculo BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      codigo_servico VARCHAR(80) NOT NULL,
      codigo_centro_custo VARCHAR(40) NOT NULL,
      id_equipe_padrao BIGINT UNSIGNED NULL,
      produtividade_prevista DECIMAL(14,6) NULL,
      custo_unitario_previsto DECIMAL(14,6) NULL,
      ativo TINYINT(1) NOT NULL DEFAULT 1,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      id_usuario_criador BIGINT UNSIGNED NULL,
      justificativa TEXT NULL,
      PRIMARY KEY (id_vinculo),
      UNIQUE KEY uk_servico_cc (tenant_id, codigo_servico, codigo_centro_custo),
      KEY idx_tenant (tenant_id),
      KEY idx_servico (tenant_id, codigo_servico),
      KEY idx_cc (tenant_id, codigo_centro_custo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS obras_gestores (
      id_gestor BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_obra BIGINT UNSIGNED NOT NULL,
      id_funcionario_gestor BIGINT UNSIGNED NOT NULL,
      definido_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      id_usuario_definidor BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY (id_gestor),
      UNIQUE KEY uk_obra (tenant_id, id_obra),
      KEY idx_tenant (tenant_id),
      KEY idx_obra (tenant_id, id_obra)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

function normalizeCodigoServico(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s ? s : null;
}

function normalizeCodigoCentroCusto(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s ? s : null;
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    await ensureTables();

    const codigoServico = normalizeCodigoServico(req.nextUrl.searchParams.get('codigoServico'));
    if (!codigoServico) return fail(422, 'codigoServico é obrigatório');

    const [rows]: any = await db.query(
      `
      SELECT
        v.codigo_servico AS codigoServico,
        v.codigo_centro_custo AS codigoCentroCusto,
        c.descricao AS centroCustoDescricao,
        c.unidade_medida AS unidadeMedida,
        v.id_equipe_padrao AS idEquipePadrao,
        v.produtividade_prevista AS produtividadePrevista,
        v.custo_unitario_previsto AS custoUnitarioPrevisto,
        v.ativo
      FROM engenharia_servicos_centros_custo v
      LEFT JOIN engenharia_centros_custo c
        ON c.tenant_id = v.tenant_id AND c.codigo = v.codigo_centro_custo
      WHERE v.tenant_id = ? AND v.codigo_servico = ? AND v.ativo = 1
      ORDER BY v.codigo_centro_custo ASC
      `,
      [current.tenantId, codigoServico]
    );

    return ok(
      (rows as any[]).map((r) => ({
        codigoServico: String(r.codigoServico),
        codigoCentroCusto: String(r.codigoCentroCusto),
        centroCustoDescricao: r.centroCustoDescricao ? String(r.centroCustoDescricao) : null,
        unidadeMedida: r.unidadeMedida ? String(r.unidadeMedida) : null,
        idEquipePadrao: r.idEquipePadrao == null ? null : Number(r.idEquipePadrao),
        produtividadePrevista: r.produtividadePrevista == null ? null : Number(r.produtividadePrevista),
        custoUnitarioPrevisto: r.custoUnitarioPrevisto == null ? null : Number(r.custoUnitarioPrevisto),
        ativo: Number(r.ativo || 0) ? true : false,
      }))
    );
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    await ensureTables();

    const body = await req.json().catch(() => null);
    const idObra = Number(body?.idObra || 0);
    const codigoServico = normalizeCodigoServico(body?.codigoServico);
    const codigoCentroCusto = normalizeCodigoCentroCusto(body?.codigoCentroCusto);
    const justificativa = body?.justificativa ? String(body.justificativa).trim() : null;

    if (!Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra é obrigatório');
    if (!canAccessObra(current as any, idObra)) return fail(403, 'Sem acesso à obra');
    if (!current.idFuncionario) return fail(403, 'Somente o gestor da obra pode vincular centro de custo por exceção');

    const [[gest]]: any = await db.query(
      `SELECT id_funcionario_gestor AS idFuncionarioGestor FROM obras_gestores WHERE tenant_id = ? AND id_obra = ? LIMIT 1`,
      [current.tenantId, idObra]
    );
    if (!gest?.idFuncionarioGestor) return fail(422, 'Gestor da obra não definido. Defina o gestor antes de vincular centro de custo por exceção.');
    if (Number(gest.idFuncionarioGestor) !== Number(current.idFuncionario)) return fail(403, 'Somente o gestor da obra pode vincular centro de custo por exceção');

    if (!codigoServico) return fail(422, 'codigoServico é obrigatório');
    if (!codigoCentroCusto) return fail(422, 'codigoCentroCusto é obrigatório');
    if (!justificativa) return fail(422, 'justificativa é obrigatória ao vincular centro de custo por exceção');

    const [[cc]]: any = await db.query(
      `SELECT id_centro_custo AS id FROM engenharia_centros_custo WHERE tenant_id = ? AND codigo = ? AND ativo = 1 LIMIT 1`,
      [current.tenantId, codigoCentroCusto]
    );
    if (!cc) return fail(422, 'Centro de custo não encontrado ou inativo');

    await db.query(
      `
      INSERT INTO engenharia_servicos_centros_custo (tenant_id, codigo_servico, codigo_centro_custo, ativo, id_usuario_criador, justificativa)
      VALUES (?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE
        ativo = 1,
        id_usuario_criador = VALUES(id_usuario_criador),
        justificativa = VALUES(justificativa)
      `,
      [current.tenantId, codigoServico, codigoCentroCusto, 1, current.id, justificativa]
    );

    return ok({ idObra, codigoServico, codigoCentroCusto });
  } catch (e) {
    return handleApiError(e);
  }
}
