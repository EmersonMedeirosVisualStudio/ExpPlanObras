import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { canAccessObra } from '@/lib/auth/access';
import { ensureEngenhariaImportTables } from '@/lib/modules/engenharia-importacao/server';

export const runtime = 'nodejs';

async function ensureTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS obras_servicos_centros_custo (
      id_vinculo BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_obra BIGINT UNSIGNED NOT NULL,
      codigo_servico VARCHAR(80) NOT NULL,
      codigo_centro_custo VARCHAR(40) NOT NULL,
      origem ENUM('SUGERIDO','MANUAL') NOT NULL DEFAULT 'SUGERIDO',
      justificativa TEXT NULL,
      id_usuario_criador BIGINT UNSIGNED NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_vinculo),
      UNIQUE KEY uk_servico_cc (tenant_id, id_obra, codigo_servico, codigo_centro_custo),
      KEY idx_tenant (tenant_id),
      KEY idx_obra (tenant_id, id_obra),
      KEY idx_servico (tenant_id, id_obra, codigo_servico)
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
      ativo TINYINT(1) NOT NULL DEFAULT 1,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_vinculo),
      UNIQUE KEY uk_servico_cc (tenant_id, codigo_servico, codigo_centro_custo),
      KEY idx_tenant (tenant_id),
      KEY idx_servico (tenant_id, codigo_servico)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_centros_custo (
      id_centro_custo BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      codigo VARCHAR(40) NOT NULL,
      descricao VARCHAR(200) NOT NULL,
      ativo TINYINT(1) NOT NULL DEFAULT 1,
      PRIMARY KEY (id_centro_custo),
      UNIQUE KEY uk_codigo (tenant_id, codigo),
      KEY idx_tenant (tenant_id)
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

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS obras_planilhas_itens (
      id_item BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_obra BIGINT UNSIGNED NOT NULL,
      codigo_servico VARCHAR(80) NOT NULL,
      codigo_composicao VARCHAR(64) NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      id_usuario_criador BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY (id_item),
      UNIQUE KEY uk_item (tenant_id, id_obra, codigo_servico),
      KEY idx_tenant (tenant_id),
      KEY idx_obra (tenant_id, id_obra)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
  await db.query(`ALTER TABLE obras_planilhas_itens ADD COLUMN codigo_composicao VARCHAR(64) NULL AFTER codigo_servico`).catch(() => null);

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS obras_composicoes_itens_overrides (
      id_override BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_obra BIGINT UNSIGNED NOT NULL,
      id_item_base BIGINT UNSIGNED NOT NULL,
      codigo_centro_custo VARCHAR(40) NULL,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      id_usuario_atualizador BIGINT UNSIGNED NULL,
      PRIMARY KEY (id_override),
      UNIQUE KEY uk_override (tenant_id, id_obra, id_item_base),
      KEY idx_tenant (tenant_id),
      KEY idx_obra (tenant_id, id_obra)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

function normServico(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s ? s : null;
}

function normCc(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s ? s : null;
}

async function requireGestorObra(current: any, idObra: number) {
  if (!current.idFuncionario) return false;
  const [[row]]: any = await db.query(`SELECT id_funcionario_gestor AS idGestor FROM obras_gestores WHERE tenant_id = ? AND id_obra = ? LIMIT 1`, [
    current.tenantId,
    idObra,
  ]);
  return row?.idGestor && Number(row.idGestor) === Number(current.idFuncionario);
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; codigo: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const { id, codigo } = await params;
    const idObra = Number(id || 0);
    const codigoServico = normServico(codigo);
    if (!Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra inválido');
    if (!codigoServico) return fail(422, 'codigoServico inválido');
    if (!canAccessObra(current as any, idObra)) return fail(403, 'Sem acesso à obra');

    await ensureEngenhariaImportTables();
    await ensureTables();

    const [[plan]]: any = await db.query(
      `SELECT codigo_composicao AS codigoComposicao FROM obras_planilhas_itens WHERE tenant_id = ? AND id_obra = ? AND codigo_servico = ? LIMIT 1`,
      [current.tenantId, idObra, codigoServico]
    );
    const codigoComposicao = plan?.codigoComposicao ? String(plan.codigoComposicao) : null;
    const [manualRows]: any = await db.query(
      `
      SELECT codigo_centro_custo AS codigoCentroCusto, origem, justificativa
      FROM obras_servicos_centros_custo
      WHERE tenant_id = ? AND id_obra = ? AND codigo_servico = ?
      ORDER BY codigo_centro_custo ASC
      `,
      [current.tenantId, idObra, codigoServico]
    );
    const manualSelecionados = (manualRows as any[]).map((r) => ({
      codigoCentroCusto: String(r.codigoCentroCusto),
      origem: r.origem ? String(r.origem) : 'MANUAL',
      justificativa: r.justificativa ? String(r.justificativa) : null,
    }));

    if (!codigoComposicao) {
      return ok({ codigoServico, selecionados: manualSelecionados, sugeridos: [] });
    }

    const [[compRow]]: any = await db.query(`SELECT id_composicao AS idComposicao FROM engenharia_composicoes WHERE tenant_id = ? AND codigo = ? LIMIT 1`, [
      current.tenantId,
      codigoComposicao,
    ]);
    if (!compRow?.idComposicao) return ok({ codigoServico, selecionados: [], sugeridos: [] });

    const [rows]: any = await db.query(
      `
      SELECT DISTINCT
        COALESCE(o.codigo_centro_custo, i.codigo_centro_custo) AS codigoCentroCusto
      FROM engenharia_composicoes_itens i
      LEFT JOIN obras_composicoes_itens_overrides o
        ON o.tenant_id = i.tenant_id AND o.id_obra = ? AND o.id_item_base = i.id_item
      WHERE i.tenant_id = ?
        AND i.id_composicao = ?
        AND COALESCE(o.codigo_centro_custo, i.codigo_centro_custo) IS NOT NULL
      ORDER BY codigoCentroCusto ASC
      `,
      [idObra, current.tenantId, Number(compRow.idComposicao)]
    );

    const map = new Map<string, any>();
    for (const r of rows as any[]) {
      map.set(String(r.codigoCentroCusto), { codigoCentroCusto: String(r.codigoCentroCusto), origem: 'COMPOSICAO', justificativa: null });
    }
    for (const r of manualSelecionados) {
      map.set(String(r.codigoCentroCusto), r);
    }

    return ok({ codigoServico, selecionados: Array.from(map.values()).sort((a, b) => a.codigoCentroCusto.localeCompare(b.codigoCentroCusto, 'pt-BR')), sugeridos: [] });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; codigo: string }> }) {
  try {
    void req;
    void params;
    return fail(410, 'A definição de centro de custo por serviço foi substituída por centro de custo por insumo na composição.');
  } catch (e) {
    return handleApiError(e);
  }
}
