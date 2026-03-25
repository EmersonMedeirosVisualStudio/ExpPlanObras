import { db } from '@/lib/db';
import { ApiError } from '@/lib/api/http';
import type { PortalParceiroPendenciaDTO, PortalParceiroResumoDTO, PortalParceiroTrabalhadorDTO } from './types';

function iso(v: any): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function assertSqlReady(err: unknown): never {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err || '').toLowerCase();
  if (msg.includes("doesn't exist") || msg.includes('unknown')) {
    throw new ApiError(501, 'Banco sem tabelas necessárias ao Portal do Parceiro. Aplique o SQL desta etapa para habilitar.');
  }
  throw err as any;
}

export async function obterResumoPortalParceiro(args: { tenantId: number; empresaParceiraId: number }): Promise<PortalParceiroResumoDTO> {
  try {
    const [[empresa]]: any = await db.query(
      `
      SELECT razao_social AS nome
      FROM empresas_parceiras
      WHERE tenant_id = ? AND id_empresa_parceira = ?
      LIMIT 1
      `,
      [args.tenantId, args.empresaParceiraId]
    );
    const empresaNome = empresa?.nome ? String(empresa.nome) : 'Empresa';

    let trabalhadoresAtivos = 0;
    let trabalhadoresBloqueados = 0;
    try {
      const [[rows]]: any = await db.query(
        `
        SELECT
          SUM(CASE WHEN t.status_trabalhador = 'ATIVO' THEN 1 ELSE 0 END) AS ativos,
          SUM(CASE WHEN t.status_trabalhador IN ('BLOQUEADO','INATIVO') THEN 1 ELSE 0 END) AS bloqueados
        FROM terceirizados_trabalhadores t
        WHERE t.tenant_id = ? AND t.id_empresa_parceira = ?
        `,
        [args.tenantId, args.empresaParceiraId]
      );
      trabalhadoresAtivos = Number(rows?.ativos || 0);
      trabalhadoresBloqueados = Number(rows?.bloqueados || 0);
    } catch {}

    let documentosPendentes = 0;
    let documentosRejeitados = 0;
    try {
      const [[rows]]: any = await db.query(
        `
        SELECT
          SUM(CASE WHEN e.status_entrega IN ('ENVIADO','EM_ANALISE') THEN 1 ELSE 0 END) AS pendentes,
          SUM(CASE WHEN e.status_entrega = 'REJEITADO' THEN 1 ELSE 0 END) AS rejeitados
        FROM parceiros_documentos_entregas e
        WHERE e.tenant_id = ? AND e.id_empresa_parceira = ?
        `,
        [args.tenantId, args.empresaParceiraId]
      );
      documentosPendentes = Number(rows?.pendentes || 0);
      documentosRejeitados = Number(rows?.rejeitados || 0);
    } catch {}

    let treinamentosVencidos = 0;
    let integracoesAgendadas = 0;
    try {
      const [[rows]]: any = await db.query(
        `
        SELECT
          SUM(CASE WHEN p.status_participante = 'VENCIDO' THEN 1 ELSE 0 END) AS vencidos,
          SUM(CASE WHEN tm.tipo_treinamento = 'INTEGRACAO' AND t.inicio_previsto >= CURRENT_DATE THEN 1 ELSE 0 END) AS integracoes
        FROM sst_treinamentos_participantes p
        INNER JOIN sst_treinamentos_turmas t ON t.id_treinamento_turma = p.id_treinamento_turma
        INNER JOIN sst_treinamentos_modelos tm ON tm.id_treinamento_modelo = t.id_treinamento_modelo
        WHERE p.tenant_id = ? AND p.id_empresa_parceira = ?
        `,
        [args.tenantId, args.empresaParceiraId]
      );
      treinamentosVencidos = Number(rows?.vencidos || 0);
      integracoesAgendadas = Number(rows?.integracoes || 0);
    } catch {}

    let episPendentes = 0;
    try {
      const [[rows]]: any = await db.query(
        `
        SELECT
          SUM(CASE WHEN fi.status_item IN ('PENDENTE','VENCIDO') THEN 1 ELSE 0 END) AS pendentes
        FROM sst_epi_fichas_itens fi
        INNER JOIN sst_epi_fichas f ON f.id_epi_ficha = fi.id_epi_ficha
        WHERE f.tenant_id = ? AND f.id_empresa_parceira = ?
        `,
        [args.tenantId, args.empresaParceiraId]
      );
      episPendentes = Number(rows?.pendentes || 0);
    } catch {}

    return {
      empresaId: args.empresaParceiraId,
      empresaNome,
      trabalhadoresAtivos,
      trabalhadoresBloqueados,
      documentosPendentes,
      documentosRejeitados,
      treinamentosVencidos,
      integracoesAgendadas,
      episPendentes,
    };
  } catch (e) {
    return assertSqlReady(e) as any;
  }
}

export async function listarTrabalhadoresPortalParceiro(args: { tenantId: number; empresaParceiraId: number; limit?: number }): Promise<PortalParceiroTrabalhadorDTO[]> {
  const max = Math.min(Math.max(Number(args.limit || 200), 1), 500);
  try {
    const [rows]: any = await db.query(
      `
      SELECT
        t.id_terceirizado_trabalhador AS id,
        t.nome_completo AS nome,
        t.cpf AS cpf,
        t.funcao AS funcao,
        al.tipo_local AS tipoLocal,
        COALESCE(o.nome_obra, u.nome_unidade) AS localNome,
        COALESCE(intg.pendente, 0) AS integracaoPendente,
        COALESCE(trn.vencido, 0) AS treinamentoVencido,
        COALESCE(epi.pendente, 0) AS epiPendente,
        CASE WHEN t.status_trabalhador IN ('BLOQUEADO','INATIVO') THEN 1 ELSE 0 END AS bloqueado
      FROM terceirizados_trabalhadores t
      LEFT JOIN terceirizados_alocacoes al ON al.id_terceirizado_trabalhador = t.id_terceirizado_trabalhador AND al.atual = 1
      LEFT JOIN obras o ON o.id_obra = al.id_obra
      LEFT JOIN unidades u ON u.id_unidade = al.id_unidade
      LEFT JOIN (
        SELECT p.id_terceirizado_trabalhador, 1 AS pendente
        FROM sst_treinamentos_participantes p
        INNER JOIN sst_treinamentos_turmas t ON t.id_treinamento_turma = p.id_treinamento_turma
        INNER JOIN sst_treinamentos_modelos tm ON tm.id_treinamento_modelo = t.id_treinamento_modelo
        WHERE tm.tipo_treinamento = 'INTEGRACAO' AND p.status_participante IN ('NAO_INICIADO','INSCRITO')
      ) intg ON intg.id_terceirizado_trabalhador = t.id_terceirizado_trabalhador
      LEFT JOIN (
        SELECT p.id_terceirizado_trabalhador, 1 AS vencido
        FROM sst_treinamentos_participantes p
        WHERE p.status_participante = 'VENCIDO'
      ) trn ON trn.id_terceirizado_trabalhador = t.id_terceirizado_trabalhador
      LEFT JOIN (
        SELECT f.id_terceirizado_trabalhador, 1 AS pendente
        FROM sst_epi_fichas f
        INNER JOIN sst_epi_fichas_itens fi ON fi.id_epi_ficha = f.id_epi_ficha
        WHERE fi.status_item IN ('PENDENTE','VENCIDO')
      ) epi ON epi.id_terceirizado_trabalhador = t.id_terceirizado_trabalhador
      WHERE t.tenant_id = ? AND t.id_empresa_parceira = ?
      ORDER BY t.nome_completo ASC
      LIMIT ${max}
      `,
      [args.tenantId, args.empresaParceiraId]
    );
    return (rows as any[]).map((r) => ({
      id: Number(r.id),
      nome: String(r.nome),
      cpfMascarado: r.cpf ? String(r.cpf).replace(/(\d{3})\d{5}(\d{3})/, '$1*****$2') : null,
      funcao: r.funcao ? String(r.funcao) : null,
      tipoLocalAtual: r.tipoLocal ? (String(r.tipoLocal) as any) : null,
      localNomeAtual: r.localNome ? String(r.localNome) : null,
      integracaoPendente: Boolean(r.integracaoPendente),
      treinamentoVencido: Boolean(r.treinamentoVencido),
      epiPendente: Boolean(r.epiPendente),
      bloqueado: Boolean(r.bloqueado),
    }));
  } catch (e) {
    return assertSqlReady(e) as any;
  }
}

export async function listarPendenciasPortalParceiro(args: { tenantId: number; empresaParceiraId: number; limit?: number }): Promise<PortalParceiroPendenciaDTO[]> {
  const out: PortalParceiroPendenciaDTO[] = [];
  try {
    const [docRows]: any = await db.query(
      `
      SELECT id_parceiro_documento_entrega AS id, status_entrega AS status, id_documento_registro AS idDoc
      FROM parceiros_documentos_entregas
      WHERE tenant_id = ? AND id_empresa_parceira = ? AND status_entrega IN ('ENVIADO','EM_ANALISE','REJEITADO')
      ORDER BY atualizado_em DESC
      LIMIT 200
      `,
      [args.tenantId, args.empresaParceiraId]
    );
    for (const r of docRows as any[]) {
      out.push({
        tipo: 'DOCUMENTO',
        titulo: String(r.status) === 'REJEITADO' ? 'Documento rejeitado' : 'Documento pendente',
        subtitulo: `Registro #${r.idDoc}`,
        criticidade: String(r.status) === 'REJEITADO' ? 'ALTA' : 'MEDIA',
        rota: '/portal/documentos',
        referenciaId: Number(r.id),
      });
    }
  } catch {}
  return out.slice(0, Math.min(Math.max(Number(args.limit || 100), 1), 500));
}
