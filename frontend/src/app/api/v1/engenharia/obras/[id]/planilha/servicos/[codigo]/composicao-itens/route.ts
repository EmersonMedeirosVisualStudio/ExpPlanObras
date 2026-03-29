import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { canAccessObra } from '@/lib/auth/access';
import { ensureEngenhariaImportTables } from '@/lib/modules/engenharia-importacao/server';

export const runtime = 'nodejs';

async function ensureObraTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS obras_planilhas_itens (
      id_item BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_obra BIGINT UNSIGNED NOT NULL,
      codigo_servico VARCHAR(80) NOT NULL,
      codigo_composicao VARCHAR(64) NULL,
      descricao_servico VARCHAR(220) NULL,
      unidade_medida VARCHAR(32) NULL,
      quantidade_contratada DECIMAL(14,4) NULL,
      preco_unitario DECIMAL(14,6) NULL,
      valor_total DECIMAL(14,6) NULL,
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

function normServico(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s ? s : null;
}

function normCc(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s ? s : null;
}

async function isGestorObra(tenantId: number, idObra: number, idFuncionario: number | null | undefined) {
  if (!idFuncionario) return false;
  const [[row]]: any = await db.query(`SELECT id_funcionario_gestor AS idGestor FROM obras_gestores WHERE tenant_id = ? AND id_obra = ? LIMIT 1`, [tenantId, idObra]);
  return row?.idGestor && Number(row.idGestor) === Number(idFuncionario);
}

async function resolveCodigoComposicao(args: { tenantId: number; idObra: number; codigoServico: string }) {
  const [[row]]: any = await db.query(
    `SELECT codigo_composicao AS codigoComposicao FROM obras_planilhas_itens WHERE tenant_id = ? AND id_obra = ? AND codigo_servico = ? LIMIT 1`,
    [args.tenantId, args.idObra, args.codigoServico]
  );
  const fromPlanilha = row?.codigoComposicao ? String(row.codigoComposicao) : null;
  if (fromPlanilha) return fromPlanilha;

  const [[comp]]: any = await db.query(
    `
    SELECT codigo
    FROM engenharia_composicoes
    WHERE tenant_id = ? AND codigo_servico = ? AND ativo = 1
    ORDER BY codigo
    LIMIT 1
    `,
    [args.tenantId, args.codigoServico]
  );
  const codigo = comp?.codigo ? String(comp.codigo) : null;
  if (!codigo) return null;

  await db.query(
    `UPDATE obras_planilhas_itens SET codigo_composicao = ?, atualizado_em = CURRENT_TIMESTAMP WHERE tenant_id = ? AND id_obra = ? AND codigo_servico = ?`,
    [codigo, args.tenantId, args.idObra, args.codigoServico]
  );
  return codigo;
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
    await ensureObraTables();

    const codigoComposicao = await resolveCodigoComposicao({ tenantId: current.tenantId, idObra, codigoServico });
    if (!codigoComposicao) return ok({ codigoServico, codigoComposicao: null, itens: [] });

    const [[compRow]]: any = await db.query(`SELECT id_composicao AS idComposicao FROM engenharia_composicoes WHERE tenant_id = ? AND codigo = ? LIMIT 1`, [
      current.tenantId,
      codigoComposicao,
    ]);
    if (!compRow?.idComposicao) return ok({ codigoServico, codigoComposicao, itens: [] });

    const [baseRows]: any = await db.query(
      `
      SELECT
        i.id_item AS idItemBase,
        i.etapa,
        i.tipo_item AS tipoItem,
        i.codigo_item AS codigoItem,
        i.quantidade,
        i.perda_percentual AS perdaPercentual,
        i.codigo_centro_custo AS codigoCentroCustoBase
      FROM engenharia_composicoes_itens i
      WHERE i.tenant_id = ? AND i.id_composicao = ?
      ORDER BY COALESCE(i.etapa,''), i.tipo_item, i.codigo_item
      `,
      [current.tenantId, Number(compRow.idComposicao)]
    );

    const ids = (baseRows as any[]).map((r) => Number(r.idItemBase)).filter((n) => Number.isFinite(n) && n > 0);
    const overrideMap = new Map<number, string | null>();
    if (ids.length) {
      const placeholders = ids.map(() => '?').join(',');
      const [ovrRows]: any = await db.query(
        `SELECT id_item_base AS idItemBase, codigo_centro_custo AS codigoCentroCusto FROM obras_composicoes_itens_overrides WHERE tenant_id = ? AND id_obra = ? AND id_item_base IN (${placeholders})`,
        [current.tenantId, idObra, ...ids]
      );
      for (const r of ovrRows as any[]) overrideMap.set(Number(r.idItemBase), r.codigoCentroCusto == null ? null : String(r.codigoCentroCusto));
    }

    return ok({
      codigoServico,
      codigoComposicao,
      itens: (baseRows as any[]).map((r) => {
        const idItemBase = Number(r.idItemBase);
        const ccOverride = overrideMap.has(idItemBase) ? overrideMap.get(idItemBase) : undefined;
        const ccBase = r.codigoCentroCustoBase ? String(r.codigoCentroCustoBase) : null;
        return {
          idItemBase,
          etapa: r.etapa ? String(r.etapa) : null,
          tipoItem: String(r.tipoItem),
          codigoItem: String(r.codigoItem),
          quantidade: r.quantidade == null ? null : Number(r.quantidade),
          perdaPercentual: r.perdaPercentual == null ? 0 : Number(r.perdaPercentual),
          codigoCentroCusto: (ccOverride !== undefined ? ccOverride : ccBase) || null,
          codigoCentroCustoBase: ccBase,
        };
      }),
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; codigo: string }> }) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const { id, codigo } = await params;
    const idObra = Number(id || 0);
    const codigoServico = normServico(codigo);
    if (!Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra inválido');
    if (!codigoServico) return fail(422, 'codigoServico inválido');
    if (!canAccessObra(current as any, idObra)) return fail(403, 'Sem acesso à obra');

    await ensureEngenhariaImportTables();
    await ensureObraTables();

    const gestorOk = await isGestorObra(current.tenantId, idObra, current.idFuncionario);
    if (!gestorOk) return fail(403, 'Somente o gestor da obra pode ajustar o centro de custo dos insumos da composição');

    const body = await req.json().catch(() => null);
    const updates = Array.isArray(body?.updates) ? body.updates : [];
    if (!updates.length) return fail(422, 'updates é obrigatório');

    await conn.beginTransaction();
    for (const u of updates) {
      const idItemBase = Number(u?.idItemBase || 0);
      const codigoCentroCusto = u?.codigoCentroCusto == null ? null : normCc(u.codigoCentroCusto);
      if (!Number.isFinite(idItemBase) || idItemBase <= 0) continue;

      const [[base]]: any = await conn.query(
        `
        SELECT i.id_item AS idItemBase
        FROM engenharia_composicoes_itens i
        INNER JOIN engenharia_composicoes c ON c.tenant_id = i.tenant_id AND c.id_composicao = i.id_composicao
        WHERE i.tenant_id = ? AND i.id_item = ? AND c.codigo_servico = ?
        LIMIT 1
        `,
        [current.tenantId, idItemBase, codigoServico]
      );
      if (!base) continue;

      await conn.query(
        `
        INSERT INTO obras_composicoes_itens_overrides (tenant_id, id_obra, id_item_base, codigo_centro_custo, id_usuario_atualizador)
        VALUES (?,?,?,?,?)
        ON DUPLICATE KEY UPDATE
          codigo_centro_custo = VALUES(codigo_centro_custo),
          id_usuario_atualizador = VALUES(id_usuario_atualizador),
          atualizado_em = CURRENT_TIMESTAMP
        `,
        [current.tenantId, idObra, idItemBase, codigoCentroCusto, current.id]
      );
    }
    await conn.commit();
    return ok({ idObra, codigoServico, atualizados: true });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}
