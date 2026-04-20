import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { canAccessObra } from '@/lib/auth/access';

export const runtime = 'nodejs';

const KANBAN_COLUMNS = [
  'SOLICITADO',
  'VALIDACAO',
  'RESERVADO',
  'ENTREGA',
  'DISPONIVEL',
  'DEVOLUCAO_ALMOX',
  'ESTOQUE_LOCAL',
  'CONSUMIDO',
  'ANALISE_CENTRAL',
  'TRANSFERENCIA',
  'COTACAO',
  'APROVACAO',
  'COMPRA_AUTORIZADA',
  'TRANSPORTE_FORNECEDOR',
  'RECEBIDO',
  'AVALIACAO',
  'DEVOLVIDO',
] as const;

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

function normalizeDate(v: unknown) {
  const s = String(v ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

const SLA_HOURS: Record<string, number> = {
  SOLICITADO: 4,
  VALIDACAO: 8,
  RESERVADO: 8,
  ENTREGA: 8,
  DISPONIVEL: 72,
  DEVOLUCAO_ALMOX: 12,
  ANALISE_CENTRAL: 24,
  TRANSFERENCIA: 24,
  COTACAO: 48,
  APROVACAO: 24,
  COMPRA_AUTORIZADA: 24,
  TRANSPORTE_FORNECEDOR: 72,
  RECEBIDO: 24,
  AVALIACAO: 24,
  DEVOLVIDO: 24,
};

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const idObra = Number(req.nextUrl.searchParams.get('idObra') || 0);
    const semanaInicio = normalizeDate(req.nextUrl.searchParams.get('semanaInicio'));
    if (!Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra é obrigatório');
    if (!semanaInicio) return fail(422, 'semanaInicio é obrigatório (YYYY-MM-DD)');
    if (!canAccessObra(current as any, idObra)) return fail(403, 'Sem acesso à obra');

    await ensureKanbanTables();

    const [rows]: any = await db.query(
      `
      SELECT
        id_workflow AS id,
        status,
        tipo_insumo AS tipoInsumo,
        natureza_custo AS naturezaCusto,
        codigo_insumo AS codigoInsumo,
        item_descricao AS nome,
        codigo_centro_custo AS cc,
        codigo_servico AS servico,
        quantidade,
        unidade_medida AS unidade,
        prioridade,
        prazo_necessidade AS prazo,
        custo_total AS custo,
        fornecedor_nome AS fornecedor,
        responsavel_nome AS responsavel,
        avaliacao_texto AS avaliacaoTexto,
        devolvido,
        solicitar_novamente AS solicitarNovamente,
        id_solicitacao_aquisicao AS idSolicitacaoAquisicao,
        criado_em AS criadoEm,
        atualizado_em AS atualizadoEm,
        validacao_saldo AS validacaoSaldo,
        validacao_reservas AS validacaoReservas,
        validacao_requisicoes AS validacaoRequisicoes,
        validacao_disponivel AS validacaoDisponivel,
        transferencia_origem_tipo_local AS transferenciaOrigemTipoLocal,
        transferencia_origem_id_local AS transferenciaOrigemIdLocal,
        transferencia_destino_tipo_local AS transferenciaDestinoTipoLocal,
        transferencia_destino_id_local AS transferenciaDestinoIdLocal,
        transferencia_frete_interno AS transferenciaFreteInterno
      FROM engenharia_pes_insumos_workflow
      WHERE tenant_id = ?
        AND id_obra = ?
        AND semana_inicio = ?
      ORDER BY id_workflow DESC
      `,
      [current.tenantId, idObra, semanaInicio]
    );

    const dataByStatus: Record<string, any[]> = {};
    KANBAN_COLUMNS.forEach((c) => {
      dataByStatus[c] = [];
    });

    const items = (rows as any[]).map((r) => {
      const status = String(r.status || 'SOLICITADO');
      const updatedAtIso = r.atualizadoEm ? new Date(r.atualizadoEm).toISOString() : new Date(r.criadoEm).toISOString();
      const slaHours = Math.max(0, (Date.now() - new Date(updatedAtIso).getTime()) / 3600000);
      const slaLimit = SLA_HOURS[status] ?? null;
      const slaAtrasado = slaLimit == null ? false : slaHours > slaLimit;
      const item = {
        id: Number(r.id),
        status,
        tipo: String(r.tipoInsumo || 'OUTRO'),
        naturezaCusto: r.naturezaCusto ? String(r.naturezaCusto) : null,
        codigo: String(r.codigoInsumo || ''),
        nome: String(r.nome || ''),
        cc: r.cc ? String(r.cc) : null,
        servico: r.servico ? String(r.servico) : null,
        quantidade: Number(r.quantidade || 0),
        unidade: r.unidade ? String(r.unidade) : null,
        prioridade: String(r.prioridade || 'MEDIA'),
        prazo: r.prazo ? String(r.prazo) : null,
        custo: Number(r.custo || 0),
        fornecedor: r.fornecedor ? String(r.fornecedor) : null,
        responsavel: r.responsavel ? String(r.responsavel) : null,
        avaliacaoTexto: r.avaliacaoTexto ? String(r.avaliacaoTexto) : null,
        devolvido: Number(r.devolvido || 0) ? true : false,
        solicitarNovamente: Number(r.solicitarNovamente || 0) ? true : false,
        idSolicitacaoAquisicao: r.idSolicitacaoAquisicao == null ? null : Number(r.idSolicitacaoAquisicao),
        criadoEm: String(r.criadoEm),
        atualizadoEm: updatedAtIso,
        slaHoras: Number(slaHours.toFixed(2)),
        slaLimiteHoras: slaLimit,
        slaAtrasado,
        validacao: {
          saldo: r.validacaoSaldo == null ? null : Number(r.validacaoSaldo),
          reservas: r.validacaoReservas == null ? null : Number(r.validacaoReservas),
          requisicoes: r.validacaoRequisicoes == null ? null : Number(r.validacaoRequisicoes),
          disponivel: r.validacaoDisponivel == null ? null : Number(r.validacaoDisponivel),
        },
        transferencia: {
          origemTipoLocal: r.transferenciaOrigemTipoLocal ? String(r.transferenciaOrigemTipoLocal) : null,
          origemIdLocal: r.transferenciaOrigemIdLocal == null ? null : Number(r.transferenciaOrigemIdLocal),
          destinoTipoLocal: r.transferenciaDestinoTipoLocal ? String(r.transferenciaDestinoTipoLocal) : null,
          destinoIdLocal: r.transferenciaDestinoIdLocal == null ? null : Number(r.transferenciaDestinoIdLocal),
          freteInterno: r.transferenciaFreteInterno == null ? null : Number(r.transferenciaFreteInterno),
        },
      };
      if (!dataByStatus[status]) dataByStatus[status] = [];
      dataByStatus[status].push(item);
      return item;
    });

    const naoAprovados = items.filter((i) => i.devolvido || i.status === 'DEVOLVIDO' || i.status === 'AVALIACAO');

    return ok({
      columns: KANBAN_COLUMNS,
      dataByStatus,
      items,
      naoAprovados,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
