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
    CREATE TABLE IF NOT EXISTS engenharia_programacoes_semanais_insumos (
      id_programacao_insumo BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_obra BIGINT UNSIGNED NOT NULL,
      semana_inicio DATE NOT NULL,
      semana_fim DATE NOT NULL,
      status ENUM('RASCUNHO','FECHADA') NOT NULL DEFAULT 'RASCUNHO',
      id_usuario_criador BIGINT UNSIGNED NOT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_programacao_insumo),
      UNIQUE KEY uk_obra_semana (tenant_id, id_obra, semana_inicio),
      KEY idx_tenant (tenant_id),
      KEY idx_obra (tenant_id, id_obra),
      KEY idx_status (tenant_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_programacoes_semanais_insumos_itens (
      id_item BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_programacao_insumo BIGINT UNSIGNED NOT NULL,
      data_referencia DATE NOT NULL,
      codigo_servico VARCHAR(80) NOT NULL,
      item_descricao VARCHAR(200) NOT NULL,
      unidade_medida VARCHAR(32) NULL,
      quantidade_prevista DECIMAL(14,4) NULL,
      origem ENUM('ESTOQUE','COMPRA','TERCEIRO') NOT NULL DEFAULT 'ESTOQUE',
      observacao TEXT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_item),
      UNIQUE KEY uk_item (tenant_id, id_programacao_insumo, data_referencia, codigo_servico, item_descricao),
      KEY idx_prog (tenant_id, id_programacao_insumo),
      KEY idx_data (tenant_id, data_referencia)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

function normalizeDate(v: unknown) {
  const s = String(v ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function toNumber(v: unknown) {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

function normalizeOrigem(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'ESTOQUE' || s === 'COMPRA' || s === 'TERCEIRO' ? s : 'ESTOQUE';
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const { id } = await params;
    const idProgramacao = Number(id || 0);
    if (!Number.isFinite(idProgramacao) || idProgramacao <= 0) return fail(422, 'idProgramacao inválido');

    await ensureTables();

    const [[head]]: any = await db.query(
      `
      SELECT id_programacao_insumo AS idProgramacao, id_obra AS idObra, semana_inicio AS semanaInicio, semana_fim AS semanaFim, status
      FROM engenharia_programacoes_semanais_insumos
      WHERE tenant_id = ? AND id_programacao_insumo = ?
      LIMIT 1
      `,
      [current.tenantId, idProgramacao]
    );
    if (!head) return fail(404, 'Programação não encontrada');
    if (!canAccessObra(current as any, Number(head.idObra))) return fail(403, 'Sem acesso à obra');

    const [itens]: any = await db.query(
      `
      SELECT
        id_item AS idItem,
        data_referencia AS dataReferencia,
        codigo_servico AS codigoServico,
        item_descricao AS itemDescricao,
        unidade_medida AS unidadeMedida,
        quantidade_prevista AS quantidadePrevista,
        origem,
        observacao
      FROM engenharia_programacoes_semanais_insumos_itens
      WHERE tenant_id = ? AND id_programacao_insumo = ?
      ORDER BY data_referencia ASC, codigo_servico ASC, item_descricao ASC
      `,
      [current.tenantId, idProgramacao]
    );

    return ok({
      cabecalho: {
        idProgramacao: Number(head.idProgramacao),
        idObra: Number(head.idObra),
        semanaInicio: String(head.semanaInicio),
        semanaFim: String(head.semanaFim),
        status: String(head.status),
      },
      itens: (itens as any[]).map((r) => ({
        idItem: Number(r.idItem),
        dataReferencia: String(r.dataReferencia),
        codigoServico: String(r.codigoServico),
        itemDescricao: String(r.itemDescricao),
        unidadeMedida: r.unidadeMedida ? String(r.unidadeMedida) : null,
        quantidadePrevista: r.quantidadePrevista == null ? null : Number(r.quantidadePrevista),
        origem: String(r.origem),
        observacao: r.observacao ? String(r.observacao) : null,
      })),
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const { id } = await params;
    const idProgramacao = Number(id || 0);
    if (!Number.isFinite(idProgramacao) || idProgramacao <= 0) return fail(422, 'idProgramacao inválido');

    await ensureTables();

    const [[head]]: any = await conn.query(
      `SELECT id_obra AS idObra, status FROM engenharia_programacoes_semanais_insumos WHERE tenant_id = ? AND id_programacao_insumo = ? LIMIT 1`,
      [current.tenantId, idProgramacao]
    );
    if (!head) return fail(404, 'Programação não encontrada');
    if (!canAccessObra(current as any, Number(head.idObra))) return fail(403, 'Sem acesso à obra');
    if (String(head.status) !== 'RASCUNHO') return fail(422, 'Programação fechada');

    const body = await req.json().catch(() => null);
    const itens = Array.isArray(body?.itens) ? body.itens : [];

    await conn.beginTransaction();

    for (const it of itens) {
      const dataReferencia = normalizeDate(it?.dataReferencia);
      const codigoServico = String(it?.codigoServico || '').trim().toUpperCase();
      const itemDescricao = String(it?.itemDescricao || '').trim();
      if (!dataReferencia || !codigoServico || !itemDescricao) continue;

      const unidadeMedida = it?.unidadeMedida ? String(it.unidadeMedida).trim() : null;
      const quantidadePrevista = it?.quantidadePrevista == null ? null : toNumber(it.quantidadePrevista);
      const origem = normalizeOrigem(it?.origem);
      const observacao = it?.observacao ? String(it.observacao).trim() : null;

      await conn.query(
        `
        INSERT INTO engenharia_programacoes_semanais_insumos_itens
          (tenant_id, id_programacao_insumo, data_referencia, codigo_servico, item_descricao, unidade_medida, quantidade_prevista, origem, observacao)
        VALUES
          (?,?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE
          unidade_medida = VALUES(unidade_medida),
          quantidade_prevista = VALUES(quantidade_prevista),
          origem = VALUES(origem),
          observacao = VALUES(observacao),
          atualizado_em = CURRENT_TIMESTAMP
        `,
        [
          current.tenantId,
          idProgramacao,
          dataReferencia,
          codigoServico,
          itemDescricao,
          unidadeMedida,
          quantidadePrevista == null || Number.isNaN(quantidadePrevista) ? null : quantidadePrevista,
          origem,
          observacao,
        ]
      );
    }

    await conn.commit();
    return ok({ idProgramacao });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

