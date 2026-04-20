import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { canAccessObra } from '@/lib/auth/access';

export const runtime = 'nodejs';

const ALLOWED: Record<string, string[]> = {
  SOLICITADO: ['VALIDACAO'],
  VALIDACAO: ['RESERVADO', 'ANALISE_CENTRAL'],
  RESERVADO: ['ENTREGA'],
  ENTREGA: ['DISPONIVEL'],
  DISPONIVEL: ['CONSUMIDO', 'AVALIACAO', 'DEVOLUCAO_ALMOX'],
  DEVOLUCAO_ALMOX: ['ESTOQUE_LOCAL', 'TRANSFERENCIA', 'ANALISE_CENTRAL'],
  ESTOQUE_LOCAL: ['TRANSFERENCIA', 'ENTREGA', 'DISPONIVEL'],
  AVALIACAO: ['DISPONIVEL', 'DEVOLVIDO'],
  ANALISE_CENTRAL: ['TRANSFERENCIA', 'COTACAO'],
  TRANSFERENCIA: ['ENTREGA'],
  COTACAO: ['APROVACAO'],
  APROVACAO: ['COMPRA_AUTORIZADA', 'COTACAO'],
  COMPRA_AUTORIZADA: ['TRANSPORTE_FORNECEDOR'],
  TRANSPORTE_FORNECEDOR: ['RECEBIDO'],
  RECEBIDO: ['DISPONIVEL'],
  DEVOLVIDO: ['COTACAO', 'SOLICITADO'],
  CONSUMIDO: [],
};

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
  await db.query(`ALTER TABLE engenharia_pes_insumos_workflow ADD COLUMN transferencia_origem_tipo_local VARCHAR(16) NULL`).catch(() => null);
  await db.query(`ALTER TABLE engenharia_pes_insumos_workflow ADD COLUMN transferencia_origem_id_local BIGINT UNSIGNED NULL`).catch(() => null);
  await db.query(`ALTER TABLE engenharia_pes_insumos_workflow ADD COLUMN transferencia_destino_tipo_local VARCHAR(16) NULL`).catch(() => null);
  await db.query(`ALTER TABLE engenharia_pes_insumos_workflow ADD COLUMN transferencia_destino_id_local BIGINT UNSIGNED NULL`).catch(() => null);
  await db.query(`ALTER TABLE engenharia_pes_insumos_workflow ADD COLUMN transferencia_frete_interno DECIMAL(14,4) NULL`).catch(() => null);
  await db.query(`ALTER TABLE engenharia_pes_insumos_workflow ADD COLUMN natureza_custo ENUM('MAO','FERRAMENTA','EQUIPAMENTO','MATERIAL') NULL`).catch(() => null);
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

async function ensureApropriacaoTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_pes_apropriacoes (
      id_apropriacao BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_obra BIGINT UNSIGNED NOT NULL,
      semana_inicio DATE NOT NULL,
      id_workflow BIGINT UNSIGNED NULL,
      codigo_centro_custo VARCHAR(40) NULL,
      codigo_servico VARCHAR(80) NULL,
      natureza_custo ENUM('MAO','FERRAMENTA','EQUIPAMENTO','MATERIAL') NOT NULL,
      quantidade DECIMAL(14,4) NOT NULL DEFAULT 0,
      unidade_medida VARCHAR(32) NULL,
      custo_unitario DECIMAL(14,6) NOT NULL DEFAULT 0,
      custo_total DECIMAL(14,4) NOT NULL DEFAULT 0,
      observacao TEXT NULL,
      id_usuario BIGINT UNSIGNED NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_apropriacao),
      UNIQUE KEY uk_workflow_natureza (tenant_id, id_workflow, natureza_custo),
      KEY idx_obra_semana (tenant_id, id_obra, semana_inicio),
      KEY idx_cc_servico (tenant_id, codigo_centro_custo, codigo_servico),
      KEY idx_natureza (tenant_id, natureza_custo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

async function ensureStockTables() {
  await db
    .query(
      `
      CREATE TABLE IF NOT EXISTS estoque_itens (
        id_item BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        tenant_id BIGINT UNSIGNED NOT NULL,
        codigo VARCHAR(80) NOT NULL,
        descricao VARCHAR(255) NOT NULL,
        unidade_medida VARCHAR(32) NULL,
        ativo TINYINT(1) NOT NULL DEFAULT 1,
        criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id_item),
        UNIQUE KEY uk_tenant_codigo (tenant_id, codigo),
        KEY idx_tenant (tenant_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `
    )
    .catch(() => null);

  await db
    .query(
      `
      CREATE TABLE IF NOT EXISTS estoque_saldos (
        id_saldo BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        tenant_id BIGINT UNSIGNED NOT NULL,
        id_item BIGINT UNSIGNED NOT NULL,
        tipo_local ENUM('ALMOXARIFADO','UNIDADE','OBRA') NOT NULL DEFAULT 'ALMOXARIFADO',
        id_almoxarifado BIGINT UNSIGNED NULL,
        id_unidade BIGINT UNSIGNED NULL,
        id_obra BIGINT UNSIGNED NULL,
        saldo_atual DECIMAL(14,4) NOT NULL DEFAULT 0,
        estoque_minimo DECIMAL(14,4) NULL,
        atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id_saldo),
        KEY idx_item (tenant_id, id_item),
        KEY idx_local (tenant_id, tipo_local, id_almoxarifado, id_unidade, id_obra)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `
    )
    .catch(() => null);
  await db
    .query(
      `ALTER TABLE estoque_saldos ADD UNIQUE KEY uk_saldo (tenant_id, id_item, tipo_local, id_almoxarifado, id_unidade, id_obra)`
    )
    .catch(() => null);

  await db
    .query(
      `
      CREATE TABLE IF NOT EXISTS estoque_movimentos (
        id_movimento BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        tenant_id BIGINT UNSIGNED NOT NULL,
        id_item BIGINT UNSIGNED NOT NULL,
        tipo_local ENUM('ALMOXARIFADO','UNIDADE','OBRA') NOT NULL,
        id_almoxarifado BIGINT UNSIGNED NULL,
        id_unidade BIGINT UNSIGNED NULL,
        id_obra BIGINT UNSIGNED NULL,
        quantidade DECIMAL(14,4) NOT NULL DEFAULT 0,
        origem VARCHAR(40) NOT NULL,
        referencia VARCHAR(120) NULL,
        criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id_movimento),
        KEY idx_tenant (tenant_id),
        KEY idx_item (tenant_id, id_item)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `
    )
    .catch(() => null);
}

async function getOrCreateEstoqueItem(tenantId: number, codigo: string, descricao: string, unidadeMedida: string | null) {
  await ensureStockTables();
  const [[row]]: any = await db.query(`SELECT id_item AS idItem FROM estoque_itens WHERE tenant_id = ? AND codigo = ? LIMIT 1`, [tenantId, codigo]);
  if (row?.idItem) return Number(row.idItem);
  const [ins]: any = await db.query(
    `INSERT INTO estoque_itens (tenant_id, codigo, descricao, unidade_medida, ativo) VALUES (?,?,?,?,1)`,
    [tenantId, codigo, descricao.slice(0, 255), unidadeMedida ? unidadeMedida.slice(0, 32) : null]
  );
  return Number(ins.insertId);
}

function buildSaldoWhere(tipoLocal: string, idLocal: number) {
  const t = String(tipoLocal || '').toUpperCase();
  if (t === 'UNIDADE') return { tipoLocal: 'UNIDADE', where: 'tipo_local = ? AND id_unidade = ?', params: ['UNIDADE', idLocal] };
  if (t === 'OBRA') return { tipoLocal: 'OBRA', where: 'tipo_local = ? AND id_obra = ?', params: ['OBRA', idLocal] };
  return { tipoLocal: 'ALMOXARIFADO', where: 'tipo_local = ? AND id_almoxarifado = ?', params: ['ALMOXARIFADO', idLocal] };
}

async function getSaldoFisico(tenantId: number, tipoLocal: string, idLocal: number, codigoInsumo: string) {
  await ensureStockTables();
  const [[it]]: any = await db.query(`SELECT id_item AS idItem FROM estoque_itens WHERE tenant_id = ? AND codigo = ? LIMIT 1`, [tenantId, codigoInsumo]);
  const idItem = it?.idItem ? Number(it.idItem) : 0;
  if (!idItem) return 0;
  const loc = buildSaldoWhere(tipoLocal, idLocal);
  const [[row]]: any = await db.query(
    `SELECT COALESCE(SUM(saldo_atual), 0) AS saldo FROM estoque_saldos WHERE tenant_id = ? AND id_item = ? AND ${loc.where}`,
    [tenantId, idItem, ...loc.params]
  );
  const saldo = Number(row?.saldo || 0);
  return Number.isFinite(saldo) ? saldo : 0;
}

async function ajustarSaldo(tenantId: number, tipoLocal: string, idLocal: number, codigoInsumo: string, descricao: string, unidadeMedida: string | null, delta: number, origem: string, referencia: string) {
  const idItem = await getOrCreateEstoqueItem(tenantId, codigoInsumo, descricao, unidadeMedida);
  const loc = buildSaldoWhere(tipoLocal, idLocal);
  const cols = loc.tipoLocal === 'UNIDADE' ? { id_almoxarifado: null, id_unidade: idLocal, id_obra: null } : loc.tipoLocal === 'OBRA' ? { id_almoxarifado: null, id_unidade: null, id_obra: idLocal } : { id_almoxarifado: idLocal, id_unidade: null, id_obra: null };

  await db.query(
    `
    INSERT INTO estoque_saldos (tenant_id, id_item, tipo_local, id_almoxarifado, id_unidade, id_obra, saldo_atual)
    VALUES (?,?,?,?,?,?,?)
    ON DUPLICATE KEY UPDATE saldo_atual = saldo_atual + VALUES(saldo_atual), atualizado_em = CURRENT_TIMESTAMP
    `,
    [tenantId, idItem, loc.tipoLocal, cols.id_almoxarifado, cols.id_unidade, cols.id_obra, delta]
  );

  await db.query(
    `
    INSERT INTO estoque_movimentos (tenant_id, id_item, tipo_local, id_almoxarifado, id_unidade, id_obra, quantidade, origem, referencia)
    VALUES (?,?,?,?,?,?,?,?,?)
    `,
    [tenantId, idItem, loc.tipoLocal, cols.id_almoxarifado, cols.id_unidade, cols.id_obra, delta, origem, referencia.slice(0, 120)]
  );
}

function normalizeStatus(v: unknown) {
  return String(v ?? '')
    .trim()
    .toUpperCase();
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const id = Number(params.id || 0);
    if (!Number.isFinite(id) || id <= 0) return fail(422, 'id inválido');

    const body = await req.json().catch(() => null);
    const nextStatus = normalizeStatus(body?.status);
    if (!nextStatus) return fail(422, 'status é obrigatório');
    const destinoTipoLocal = body?.destinoTipoLocal ? normalizeStatus(body.destinoTipoLocal) : null;
    const destinoIdLocal = body?.destinoIdLocal == null ? null : Number(body.destinoIdLocal);
    const freteInternoTotal = body?.freteInternoTotal == null ? null : Number(body.freteInternoTotal);
    const naturezaCustoBody = body?.naturezaCusto ? normalizeStatus(body.naturezaCusto) : null;
    const quantidadeConsumidaBody = body?.quantidadeConsumida == null ? null : Number(body.quantidadeConsumida);
    const custoUnitarioBody = body?.custoUnitario == null ? null : Number(body.custoUnitario);
    const observacaoApropriacaoBody = body?.observacaoApropriacao == null ? null : String(body.observacaoApropriacao).trim();

    await ensureKanbanTables();
    const [[row]]: any = await db.query(
      `
      SELECT
        id_workflow AS idWorkflow,
        id_obra AS idObra,
        status,
        semana_inicio AS semanaInicio,
        estoque_tipo_local AS estoqueTipoLocal,
        estoque_id_local AS estoqueIdLocal,
        codigo_centro_custo AS codigoCentroCusto,
        codigo_insumo AS codigoInsumo,
        item_descricao AS itemDescricao,
        tipo_insumo AS tipoInsumo,
        quantidade,
        unidade_medida AS unidadeMedida,
        codigo_servico AS codigoServico
      FROM engenharia_pes_insumos_workflow
      WHERE tenant_id = ? AND id_workflow = ?
      LIMIT 1
      `,
      [current.tenantId, id]
    );
    if (!row) return fail(404, 'Card não encontrado');
    if (!canAccessObra(current as any, Number(row.idObra || 0))) return fail(403, 'Sem acesso à obra');

    const currentStatus = String(row.status || 'SOLICITADO');
    const allowed = ALLOWED[currentStatus] || [];
    if (currentStatus !== nextStatus && !allowed.includes(nextStatus)) {
      return fail(422, `Transição inválida: ${currentStatus} → ${nextStatus}`);
    }

    let statusFinal = nextStatus;
    let validacaoSaldo: number | null = null;
    let validacaoReservas: number | null = null;
    let validacaoRequisicoes: number | null = null;
    let validacaoDisponivel: number | null = null;

    if (nextStatus === 'VALIDACAO') {
      const tipoLocal = row.estoqueTipoLocal ? String(row.estoqueTipoLocal) : 'OBRA';
      const idLocal = row.estoqueIdLocal ? Number(row.estoqueIdLocal) : Number(row.idObra);
      validacaoSaldo = await getSaldoFisico(current.tenantId, tipoLocal, idLocal, String(row.codigoInsumo || ''));

      const [[rsv]]: any = await db.query(
        `
        SELECT COALESCE(SUM(quantidade),0) AS total
        FROM engenharia_pes_insumos_workflow
        WHERE tenant_id = ?
          AND estoque_tipo_local = ?
          AND estoque_id_local = ?
          AND codigo_insumo = ?
          AND status IN ('RESERVADO','ENTREGA')
          AND id_workflow <> ?
        `,
        [current.tenantId, String(tipoLocal).toUpperCase(), idLocal, String(row.codigoInsumo || ''), id]
      );
      validacaoReservas = Number(rsv?.total || 0);
      if (!Number.isFinite(validacaoReservas)) validacaoReservas = 0;

      const [[reqs]]: any = await db.query(
        `
        SELECT COALESCE(SUM(quantidade),0) AS total
        FROM engenharia_pes_insumos_workflow
        WHERE tenant_id = ?
          AND estoque_tipo_local = ?
          AND estoque_id_local = ?
          AND codigo_insumo = ?
          AND status IN ('SOLICITADO','VALIDACAO')
          AND id_workflow <> ?
        `,
        [current.tenantId, String(tipoLocal).toUpperCase(), idLocal, String(row.codigoInsumo || ''), id]
      );
      validacaoRequisicoes = Number(reqs?.total || 0);
      if (!Number.isFinite(validacaoRequisicoes)) validacaoRequisicoes = 0;

      const qtd = Number(row.quantidade || 0);
      validacaoDisponivel = Number((validacaoSaldo - validacaoReservas - validacaoRequisicoes).toFixed(4));
      statusFinal = validacaoDisponivel >= qtd ? 'RESERVADO' : 'ANALISE_CENTRAL';
    }

    const custoItem = body?.custoItem == null ? null : Number(body.custoItem);
    const custoImpostos = body?.custoImpostos == null ? null : Number(body.custoImpostos);
    const custoTransporteExterno = body?.custoTransporteExterno == null ? null : Number(body.custoTransporteExterno);
    const custoTransporteInterno = body?.custoTransporteInterno == null ? null : Number(body.custoTransporteInterno);
    const custoOutros = body?.custoOutros == null ? null : Number(body.custoOutros);
    const avaliacaoTexto = body?.avaliacaoTexto == null ? null : String(body.avaliacaoTexto).trim();
    const solicitarNovamente = body?.solicitarNovamente == null ? null : (body.solicitarNovamente ? 1 : 0);
    const fornecedorNome = body?.fornecedorNome == null ? null : String(body.fornecedorNome).trim().slice(0, 180);
    const responsavelNome = body?.responsavelNome == null ? null : String(body.responsavelNome).trim().slice(0, 120);

    const [currRows]: any = await db.query(
      `
      SELECT custo_item AS custoItem, custo_impostos AS custoImpostos, custo_transporte_externo AS custoTransporteExterno, custo_transporte_interno AS custoTransporteInterno, custo_outros AS custoOutros
      FROM engenharia_pes_insumos_workflow
      WHERE tenant_id = ? AND id_workflow = ?
      LIMIT 1
      `,
      [current.tenantId, id]
    );
    const curr = currRows?.[0] || {};
    const ci = custoItem == null || !Number.isFinite(custoItem) ? Number(curr.custoItem || 0) : custoItem;
    const cim = custoImpostos == null || !Number.isFinite(custoImpostos) ? Number(curr.custoImpostos || 0) : custoImpostos;
    const cte = custoTransporteExterno == null || !Number.isFinite(custoTransporteExterno) ? Number(curr.custoTransporteExterno || 0) : custoTransporteExterno;
    const cti = custoTransporteInterno == null || !Number.isFinite(custoTransporteInterno) ? Number(curr.custoTransporteInterno || 0) : custoTransporteInterno;
    const co = custoOutros == null || !Number.isFinite(custoOutros) ? Number(curr.custoOutros || 0) : custoOutros;
    let ctiFinal = cti;

    let idSolicitacaoAquisicao: number | null = null;
    if (statusFinal === 'DEVOLVIDO' && body?.devolver === true && (solicitarNovamente == null ? true : !!solicitarNovamente)) {
      await ensureAquisicoesTables();
      const descricao = `${String(row.codigoInsumo || '')} - ${String(row.itemDescricao || '')}`.slice(0, 255);
      const justificativa = `Gerado automaticamente por devolução no Kanban PES.`;
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
          Number(row.idObra),
          'OUTRO',
          descricao,
          Number(row.quantidade || 0),
          row.unidadeMedida ? String(row.unidadeMedida).slice(0, 32) : null,
          row.codigoServico ? String(row.codigoServico).slice(0, 80) : null,
          'MEDIA',
          justificativa,
          current.id,
        ]
      );
      idSolicitacaoAquisicao = Number(ins.insertId);
    }

    if (statusFinal === 'DEVOLUCAO_ALMOX') {
      const tipoLocal = row.estoqueTipoLocal ? String(row.estoqueTipoLocal) : 'OBRA';
      const idLocal = row.estoqueIdLocal ? Number(row.estoqueIdLocal) : Number(row.idObra);
      await ajustarSaldo(
        current.tenantId,
        tipoLocal,
        idLocal,
        String(row.codigoInsumo || ''),
        String(row.itemDescricao || ''),
        row.unidadeMedida ? String(row.unidadeMedida) : null,
        Number(row.quantidade || 0),
        'DEVOLUCAO_ALMOX',
        `WF:${id}`
      );
    }

    let trOrigTipo: string | null = null;
    let trOrigId: number | null = null;
    let trDestTipo: string | null = null;
    let trDestId: number | null = null;
    let trFrete: number | null = null;

    if (statusFinal === 'TRANSFERENCIA') {
      const origemTipo = row.estoqueTipoLocal ? normalizeStatus(row.estoqueTipoLocal) : 'OBRA';
      const origemId = row.estoqueIdLocal ? Number(row.estoqueIdLocal) : Number(row.idObra);
      if (!destinoTipoLocal || !['ALMOXARIFADO', 'UNIDADE', 'OBRA'].includes(destinoTipoLocal)) {
        return fail(422, 'destinoTipoLocal é obrigatório para TRANSFERENCIA (ALMOXARIFADO|UNIDADE|OBRA)');
      }
      if (!Number.isFinite(destinoIdLocal || NaN) || Number(destinoIdLocal) <= 0) {
        return fail(422, 'destinoIdLocal é obrigatório para TRANSFERENCIA');
      }
      if (origemTipo === destinoTipoLocal && origemId === Number(destinoIdLocal)) {
        return fail(422, 'Origem e destino não podem ser iguais');
      }

      const qtd = Number(row.quantidade || 0);
      const saldoOrigem = await getSaldoFisico(current.tenantId, origemTipo, origemId, String(row.codigoInsumo || ''));
      if (saldoOrigem < qtd) {
        return fail(422, `Saldo insuficiente na origem para transferência. Saldo: ${saldoOrigem}, necessário: ${qtd}`);
      }

      await ajustarSaldo(
        current.tenantId,
        origemTipo,
        origemId,
        String(row.codigoInsumo || ''),
        String(row.itemDescricao || ''),
        row.unidadeMedida ? String(row.unidadeMedida) : null,
        -qtd,
        'TRANSFERENCIA_SAIDA',
        `WF:${id}`
      );
      await ajustarSaldo(
        current.tenantId,
        destinoTipoLocal,
        Number(destinoIdLocal),
        String(row.codigoInsumo || ''),
        String(row.itemDescricao || ''),
        row.unidadeMedida ? String(row.unidadeMedida) : null,
        qtd,
        'TRANSFERENCIA_ENTRADA',
        `WF:${id}`
      );

      const frete = freteInternoTotal == null || !Number.isFinite(freteInternoTotal) || freteInternoTotal < 0 ? 0 : freteInternoTotal;
      ctiFinal = Number((ctiFinal + frete).toFixed(4));

      trOrigTipo = origemTipo;
      trOrigId = origemId;
      trDestTipo = destinoTipoLocal;
      trDestId = Number(destinoIdLocal);
      trFrete = Number(frete.toFixed(4));
    }

    let naturezaCustoFinal: string | null = null;
    if (statusFinal === 'CONSUMIDO') {
      await ensureApropriacaoTables();
      if (naturezaCustoBody && ['MAO', 'FERRAMENTA', 'EQUIPAMENTO', 'MATERIAL'].includes(naturezaCustoBody)) {
        naturezaCustoFinal = naturezaCustoBody;
      } else {
        const tipo = normalizeStatus(row.tipoInsumo || 'MATERIAL');
        if (tipo === 'FERRAMENTA') naturezaCustoFinal = 'FERRAMENTA';
        else if (tipo === 'EQUIPAMENTO') naturezaCustoFinal = 'EQUIPAMENTO';
        else naturezaCustoFinal = 'MATERIAL';
      }

      const qtdConsumida = quantidadeConsumidaBody == null || !Number.isFinite(quantidadeConsumidaBody) ? Number(row.quantidade || 0) : quantidadeConsumidaBody;
      if (qtdConsumida <= 0) return fail(422, 'quantidadeConsumida deve ser maior que zero para apropriar');
      const baseQtd = Math.max(0.0001, Number(row.quantidade || 0));
      const custoTotalPadrao = Number((ci + cim + cte + ctiFinal + co).toFixed(4));
      const custoUnitPadrao = Number((custoTotalPadrao / baseQtd).toFixed(6));
      const custoUnitario = custoUnitarioBody == null || !Number.isFinite(custoUnitarioBody) || custoUnitarioBody < 0 ? custoUnitPadrao : custoUnitarioBody;
      const custoTotalConsumido = Number((qtdConsumida * custoUnitario).toFixed(4));

      await db.query(
        `
        INSERT INTO engenharia_pes_apropriacoes
          (tenant_id, id_obra, semana_inicio, id_workflow, codigo_centro_custo, codigo_servico, natureza_custo, quantidade, unidade_medida, custo_unitario, custo_total, observacao, id_usuario)
        VALUES
          (?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE
          quantidade = VALUES(quantidade),
          custo_unitario = VALUES(custo_unitario),
          custo_total = VALUES(custo_total),
          observacao = VALUES(observacao),
          id_usuario = VALUES(id_usuario),
          atualizado_em = CURRENT_TIMESTAMP
        `,
        [
          current.tenantId,
          Number(row.idObra),
          String(row.semanaInicio).slice(0, 10),
          id,
          row.codigoCentroCusto ? String(row.codigoCentroCusto).slice(0, 40) : null,
          row.codigoServico ? String(row.codigoServico).slice(0, 80) : null,
          naturezaCustoFinal,
          qtdConsumida,
          row.unidadeMedida ? String(row.unidadeMedida).slice(0, 32) : null,
          custoUnitario,
          custoTotalConsumido,
          observacaoApropriacaoBody,
          current.id,
        ]
      );
    }

    const total = Number((ci + cim + cte + ctiFinal + co).toFixed(4));

    await db.query(
      `
      UPDATE engenharia_pes_insumos_workflow
      SET
        status = ?,
        custo_item = ?,
        custo_impostos = ?,
        custo_transporte_externo = ?,
        custo_transporte_interno = ?,
        custo_outros = ?,
        custo_total = ?,
        estoque_tipo_local = COALESCE(?, estoque_tipo_local),
        estoque_id_local = COALESCE(?, estoque_id_local),
        transferencia_origem_tipo_local = COALESCE(?, transferencia_origem_tipo_local),
        transferencia_origem_id_local = COALESCE(?, transferencia_origem_id_local),
        transferencia_destino_tipo_local = COALESCE(?, transferencia_destino_tipo_local),
        transferencia_destino_id_local = COALESCE(?, transferencia_destino_id_local),
        transferencia_frete_interno = COALESCE(?, transferencia_frete_interno),
        natureza_custo = COALESCE(?, natureza_custo),
        validacao_saldo = ?,
        validacao_reservas = ?,
        validacao_requisicoes = ?,
        validacao_disponivel = ?,
        avaliacao_texto = COALESCE(?, avaliacao_texto),
        fornecedor_nome = COALESCE(?, fornecedor_nome),
        responsavel_nome = COALESCE(?, responsavel_nome),
        devolvido = ?,
        solicitar_novamente = COALESCE(?, solicitar_novamente),
        id_solicitacao_aquisicao = COALESCE(?, id_solicitacao_aquisicao),
        atualizado_em = CURRENT_TIMESTAMP
      WHERE tenant_id = ? AND id_workflow = ?
      LIMIT 1
      `,
      [
        statusFinal,
        ci,
        cim,
        cte,
        ctiFinal,
        co,
        total,
        trDestTipo,
        trDestId,
        trOrigTipo,
        trOrigId,
        trDestTipo,
        trDestId,
        trFrete,
        naturezaCustoFinal,
        validacaoSaldo,
        validacaoReservas,
        validacaoRequisicoes,
        validacaoDisponivel,
        avaliacaoTexto,
        fornecedorNome,
        responsavelNome,
        statusFinal === 'DEVOLVIDO' ? 1 : 0,
        solicitarNovamente,
        idSolicitacaoAquisicao,
        current.tenantId,
        id,
      ]
    );

    return ok({
      id,
      status: statusFinal,
      custoTotal: total,
      naturezaCusto: naturezaCustoFinal,
      idSolicitacaoAquisicao,
      validacao: { saldo: validacaoSaldo, reservas: validacaoReservas, requisicoes: validacaoRequisicoes, disponivel: validacaoDisponivel },
    });
  } catch (e) {
    return handleApiError(e);
  }
}
