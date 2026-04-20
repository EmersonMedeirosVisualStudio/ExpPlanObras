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
    CREATE TABLE IF NOT EXISTS engenharia_pes_insumos_extras (
      id_extra BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_obra BIGINT UNSIGNED NOT NULL,
      semana_inicio DATE NOT NULL,
      codigo_servico VARCHAR(80) NOT NULL,
      codigo_centro_custo VARCHAR(40) NULL,
      codigo_insumo VARCHAR(80) NULL,
      item_descricao VARCHAR(200) NOT NULL,
      unidade_medida VARCHAR(32) NULL,
      delta_quantidade DECIMAL(14,4) NOT NULL DEFAULT 0,
      observacao TEXT NULL,
      id_usuario BIGINT UNSIGNED NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_extra),
      KEY idx_obra_semana (tenant_id, id_obra, semana_inicio),
      KEY idx_serv_cc (tenant_id, codigo_servico, codigo_centro_custo),
      KEY idx_criado (tenant_id, criado_em)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
  await db.query(`ALTER TABLE engenharia_pes_insumos_extras ADD COLUMN codigo_insumo VARCHAR(80) NULL AFTER codigo_centro_custo`).catch(() => null);
}

async function ensureAquisicoesTables() {
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

async function ensureKanbanTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_pes_insumos_workflow (
      id_workflow BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_obra BIGINT UNSIGNED NOT NULL,
      semana_inicio DATE NOT NULL,
      id_extra BIGINT UNSIGNED NULL,
      codigo_servico VARCHAR(80) NOT NULL,
      codigo_centro_custo VARCHAR(40) NULL,
      codigo_insumo VARCHAR(80) NOT NULL,
      item_descricao VARCHAR(200) NOT NULL,
      unidade_medida VARCHAR(32) NULL,
      quantidade DECIMAL(14,4) NOT NULL DEFAULT 0,
      tipo_insumo ENUM('MATERIAL','FERRAMENTA','EQUIPAMENTO','OUTRO') NOT NULL DEFAULT 'MATERIAL',
      status VARCHAR(40) NOT NULL DEFAULT 'SOLICITADO',
      prioridade ENUM('BAIXA','MEDIA','ALTA','CRITICA') NOT NULL DEFAULT 'MEDIA',
      prazo_necessidade DATE NULL,
      custo_item DECIMAL(14,4) NOT NULL DEFAULT 0,
      custo_impostos DECIMAL(14,4) NOT NULL DEFAULT 0,
      custo_transporte_externo DECIMAL(14,4) NOT NULL DEFAULT 0,
      custo_transporte_interno DECIMAL(14,4) NOT NULL DEFAULT 0,
      custo_outros DECIMAL(14,4) NOT NULL DEFAULT 0,
      custo_total DECIMAL(14,4) NOT NULL DEFAULT 0,
      fornecedor_nome VARCHAR(180) NULL,
      responsavel_nome VARCHAR(120) NULL,
      avaliacao_texto TEXT NULL,
      devolvido TINYINT(1) NOT NULL DEFAULT 0,
      solicitar_novamente TINYINT(1) NOT NULL DEFAULT 1,
      id_solicitacao_aquisicao BIGINT UNSIGNED NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_workflow),
      UNIQUE KEY uk_extra (tenant_id, id_extra),
      KEY idx_obra_semana_status (tenant_id, id_obra, semana_inicio, status),
      KEY idx_insumo (tenant_id, codigo_insumo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
  await db.query(`ALTER TABLE engenharia_pes_insumos_workflow ADD COLUMN estoque_tipo_local VARCHAR(16) NULL AFTER semana_inicio`).catch(() => null);
  await db.query(`ALTER TABLE engenharia_pes_insumos_workflow ADD COLUMN estoque_id_local BIGINT UNSIGNED NULL AFTER estoque_tipo_local`).catch(() => null);
  await db.query(`ALTER TABLE engenharia_pes_insumos_workflow ADD COLUMN validacao_saldo DECIMAL(14,4) NULL`).catch(() => null);
  await db.query(`ALTER TABLE engenharia_pes_insumos_workflow ADD COLUMN validacao_reservas DECIMAL(14,4) NULL`).catch(() => null);
  await db.query(`ALTER TABLE engenharia_pes_insumos_workflow ADD COLUMN validacao_requisicoes DECIMAL(14,4) NULL`).catch(() => null);
  await db.query(`ALTER TABLE engenharia_pes_insumos_workflow ADD COLUMN validacao_disponivel DECIMAL(14,4) NULL`).catch(() => null);
}

function normalizeDate(v: unknown) {
  const s = String(v ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function normalizeCode(v: unknown) {
  const s = String(v ?? '')
    .trim()
    .toUpperCase();
  return s || null;
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const idObra = Number(req.nextUrl.searchParams.get('idObra') || 0);
    const semanaInicio = normalizeDate(req.nextUrl.searchParams.get('semanaInicio'));
    if (!Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra é obrigatório');
    if (!semanaInicio) return fail(422, 'semanaInicio é obrigatório (YYYY-MM-DD)');
    if (!canAccessObra(current as any, idObra)) return fail(403, 'Sem acesso à obra');

    await ensureTables();

    const [rows]: any = await db.query(
      `
      SELECT
        id_extra AS id,
        semana_inicio AS semanaInicio,
        codigo_servico AS codigoServico,
        codigo_centro_custo AS codigoCentroCusto,
        codigo_insumo AS codigoInsumo,
        item_descricao AS itemDescricao,
        unidade_medida AS unidadeMedida,
        delta_quantidade AS deltaQuantidade,
        observacao,
        criado_em AS criadoEm
      FROM engenharia_pes_insumos_extras
      WHERE tenant_id = ?
        AND id_obra = ?
        AND semana_inicio = ?
      ORDER BY id_extra DESC
      LIMIT 500
      `,
      [current.tenantId, idObra, semanaInicio]
    );

    return ok(
      (rows as any[]).map((r) => ({
        id: Number(r.id),
        semanaInicio: String(r.semanaInicio),
        codigoServico: String(r.codigoServico),
        codigoCentroCusto: r.codigoCentroCusto ? String(r.codigoCentroCusto) : null,
        codigoInsumo: r.codigoInsumo ? String(r.codigoInsumo) : null,
        itemDescricao: String(r.itemDescricao),
        unidadeMedida: r.unidadeMedida ? String(r.unidadeMedida) : null,
        deltaQuantidade: Number(r.deltaQuantidade || 0),
        observacao: r.observacao ? String(r.observacao) : null,
        criadoEm: String(r.criadoEm),
      }))
    );
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const body = await req.json().catch(() => null);
    const idObra = Number(body?.idObra || 0);
    const semanaInicio = normalizeDate(body?.semanaInicio);
    const codigoServico = normalizeCode(body?.codigoServico);
    const codigoCentroCusto = normalizeCode(body?.codigoCentroCusto);
    const codigoInsumo = normalizeCode(body?.codigoInsumo);
    const deltaQuantidade = Number(body?.deltaQuantidade ?? 0);
    const observacao = body?.observacao ? String(body.observacao).trim() : null;

    if (!Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra é obrigatório');
    if (!semanaInicio) return fail(422, 'semanaInicio é obrigatório (YYYY-MM-DD)');
    if (!codigoServico) return fail(422, 'codigoServico é obrigatório');
    if (!codigoInsumo) return fail(422, 'codigoInsumo é obrigatório');
    if (!Number.isFinite(deltaQuantidade) || deltaQuantidade === 0) return fail(422, 'deltaQuantidade deve ser um número diferente de 0');
    if (!canAccessObra(current as any, idObra)) return fail(403, 'Sem acesso à obra');

    await ensureTables();
    await ensureEngenhariaImportTables();

    const [[mat]]: any = await db.query(
      `
      SELECT codigo, descricao, unidade, preco_unitario AS precoUnitario
      FROM engenharia_materiais
      WHERE tenant_id = ? AND ativo = 1 AND codigo = ?
      LIMIT 1
      `,
      [current.tenantId, codigoInsumo]
    );
    if (!mat) return fail(422, 'Insumo não encontrado no catálogo. Cadastre o insumo em Engenharia → Insumos.');
    const itemDescricao = String(mat.descricao || '').trim();
    const unidadeMedida = mat.unidade ? String(mat.unidade).trim() : null;
    const custoUnitario = Number(mat.precoUnitario || 0);

    const [result]: any = await db.query(
      `
      INSERT INTO engenharia_pes_insumos_extras
        (tenant_id, id_obra, semana_inicio, codigo_servico, codigo_centro_custo, codigo_insumo, item_descricao, unidade_medida, delta_quantidade, observacao, id_usuario)
      VALUES
        (?,?,?,?,?,?,?,?,?,?,?)
      `,
      [
        current.tenantId,
        idObra,
        semanaInicio,
        codigoServico,
        codigoCentroCusto,
        codigoInsumo,
        itemDescricao,
        unidadeMedida,
        deltaQuantidade,
        observacao,
        current.id,
      ]
    );
    const idExtra = Number(result.insertId);

    await ensureKanbanTables();
    const quantidadeAbs = Math.abs(deltaQuantidade);
    const custoItem = Number((quantidadeAbs * (Number.isFinite(custoUnitario) ? custoUnitario : 0)).toFixed(4));
    await db.query(
      `
      INSERT INTO engenharia_pes_insumos_workflow
        (tenant_id, id_obra, semana_inicio, estoque_tipo_local, estoque_id_local, id_extra, codigo_servico, codigo_centro_custo, codigo_insumo, item_descricao, unidade_medida, quantidade, tipo_insumo, status, prioridade, prazo_necessidade, custo_item, custo_total, responsavel_nome)
      VALUES
        (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE
        quantidade = VALUES(quantidade),
        custo_item = VALUES(custo_item),
        custo_total = VALUES(custo_total),
        atualizado_em = CURRENT_TIMESTAMP
      `,
      [
        current.tenantId,
        idObra,
        semanaInicio,
        'OBRA',
        idObra,
        idExtra,
        codigoServico,
        codigoCentroCusto,
        codigoInsumo,
        itemDescricao,
        unidadeMedida,
        quantidadeAbs,
        'MATERIAL',
        'SOLICITADO',
        'MEDIA',
        semanaInicio,
        custoItem,
        custoItem,
        null,
      ]
    );

    let idSolicitacaoAquisicao: number | null = null;
    if (deltaQuantidade > 0) {
      await ensureAquisicoesTables();
      const descricao = `${codigoInsumo} - ${itemDescricao}`.slice(0, 255);
      const justificativa = [
        `Gerado automaticamente pelo PES`,
        `Obra ${idObra} / Semana ${semanaInicio}`,
        `Serviço ${codigoServico}${codigoCentroCusto ? ` / CC ${codigoCentroCusto}` : ''}`,
        observacao ? `Obs.: ${observacao}` : null,
      ]
        .filter(Boolean)
        .join(' | ');

      const [[exist]]: any = await db.query(
        `
        SELECT id_solicitacao AS idSolicitacao, quantidade
        FROM engenharia_solicitacoes_aquisicao
        WHERE tenant_id = ?
          AND tipo_local = 'OBRA'
          AND id_local = ?
          AND status = 'RASCUNHO'
          AND descricao = ?
          AND (codigo_servico <=> ?)
        ORDER BY id_solicitacao DESC
        LIMIT 1
        `,
        [current.tenantId, idObra, descricao, codigoServico]
      );

      if (exist?.idSolicitacao) {
        const nextQtd = Number(exist.quantidade || 0) + deltaQuantidade;
        await db.query(
          `
          UPDATE engenharia_solicitacoes_aquisicao
          SET quantidade = ?, unidade_medida = ?, justificativa = ?
          WHERE tenant_id = ? AND id_solicitacao = ?
          LIMIT 1
          `,
          [nextQtd, unidadeMedida ? unidadeMedida.slice(0, 32) : null, justificativa, current.tenantId, Number(exist.idSolicitacao)]
        );
        idSolicitacaoAquisicao = Number(exist.idSolicitacao);
      } else {
        const [ins]: any = await db.query(
          `
          INSERT INTO engenharia_solicitacoes_aquisicao
            (tenant_id, tipo_local, id_local, categoria, descricao, quantidade, unidade_medida, codigo_servico, prioridade, status, justificativa, id_usuario_solicitante)
          VALUES
            (?,?,?,?,?,?,?,?,?,'RASCUNHO',?,?)
          `,
          [
            current.tenantId,
            'OBRA',
            idObra,
            'OUTRO',
            descricao,
            deltaQuantidade,
            unidadeMedida ? unidadeMedida.slice(0, 32) : null,
            codigoServico ? codigoServico.slice(0, 80) : null,
            'MEDIA',
            justificativa,
            current.id,
          ]
        );
        idSolicitacaoAquisicao = Number(ins.insertId);
      }
    }

    return ok({ id: idExtra, idSolicitacaoAquisicao });
  } catch (e) {
    return handleApiError(e);
  }
}
