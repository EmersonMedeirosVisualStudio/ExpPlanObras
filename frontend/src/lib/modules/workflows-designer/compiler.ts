import type { WorkflowModeloSaveDTO } from '@/lib/modules/workflows/types';
import type { WorkflowDesignerGraphDTO, WorkflowDesignerNodeDTO } from './types';
import { normalizeGraph, validateDesignerGraph } from './validator';

function mapNodeTypeToWorkflowTipoEstado(nodeType: string): WorkflowModeloSaveDTO['estados'][number]['tipoEstado'] {
  if (nodeType === 'START') return 'INICIAL';
  if (nodeType === 'END_SUCCESS') return 'FINAL_SUCESSO';
  if (nodeType === 'END_ERROR') return 'FINAL_ERRO';
  if (nodeType === 'CANCEL') return 'CANCELADO';
  return 'INTERMEDIARIO';
}

function mapFieldTypeToWorkflowTipoCampo(t: string): WorkflowModeloSaveDTO['transicoes'][number]['campos'][number]['tipoCampo'] {
  if (t === 'TEXT') return 'TEXTO';
  if (t === 'TEXTAREA') return 'TEXTO_LONGO';
  if (t === 'NUMBER') return 'NUMERO';
  if (t === 'DATE') return 'DATA';
  if (t === 'BOOLEAN') return 'BOOLEAN';
  if (t === 'SELECT') return 'SELECT';
  return 'JSON';
}

function mapActionTypeToWorkflowTipoAcao(t: string): WorkflowModeloSaveDTO['transicoes'][number]['acoes'][number]['tipoAcao'] {
  if (t === 'NOTIFY') return 'NOTIFICAR';
  if (t === 'EMAIL') return 'EMAIL';
  if (t === 'REALTIME') return 'REALTIME';
  if (t === 'CREATE_APPROVAL') return 'CRIAR_APROVACAO';
  if (t === 'CREATE_TASK') return 'CRIAR_TAREFA';
  if (t === 'UPDATE_ENTITY_FIELD') return 'ATUALIZAR_CAMPO_ENTIDADE';
  return 'CHAMAR_HANDLER';
}

function normalizeEstadoKey(n: WorkflowDesignerNodeDTO) {
  const raw = String(n?.data?.key || '').trim();
  return raw.toUpperCase();
}

export function compileDesignerGraphToWorkflowModeloSave(input: unknown): { modelo: WorkflowModeloSaveDTO; designerGraph: WorkflowDesignerGraphDTO } {
  const graph = normalizeGraph(input);
  const validation = validateDesignerGraph(graph);
  if (!validation.ok) {
    const first = validation.issues.find((i) => i.level === 'ERROR');
    const msg = first ? first.message : 'Grafo inválido.';
    throw new Error(msg);
  }

  const estados: WorkflowModeloSaveDTO['estados'] = graph.nodes.map((n, idx) => {
    const chave = normalizeEstadoKey(n);
    return {
      chaveEstado: chave,
      nomeEstado: String(n?.data?.label || chave).trim().slice(0, 120),
      tipoEstado: mapNodeTypeToWorkflowTipoEstado(String(n.type)),
      corHex: n?.data?.color ?? null,
      ordemExibicao: idx + 1,
      editavelEntidade: Boolean(n?.data?.editavelEntidade),
      bloqueiaEntidade: Boolean(n?.data?.bloqueiaEntidade),
      exigeResponsavel: Boolean(n?.data?.exigeResponsavel),
      slaHoras: n?.data?.slaHoras !== undefined && n?.data?.slaHoras !== null ? Number(n.data.slaHoras) : null,
      ativo: true,
    };
  });

  const nodeById = new Map(graph.nodes.map((n) => [String(n.id), n] as const));
  const transicoes: WorkflowModeloSaveDTO['transicoes'] = graph.edges.map((e) => {
    const src = nodeById.get(String(e.source));
    const dst = nodeById.get(String(e.target));
    const origem = src ? normalizeEstadoKey(src) : String(e.source);
    const destino = dst ? normalizeEstadoKey(dst) : String(e.target);

    const tipoExecutorRaw = String(e?.data?.tipoExecutor || 'RESPONSAVEL_ATUAL').trim().toUpperCase();
    const tipoExecutor =
      (['SOLICITANTE', 'RESPONSAVEL_ATUAL', 'USUARIO', 'PERMISSAO', 'GESTOR_LOCAL', 'APROVADOR'].includes(tipoExecutorRaw) ? tipoExecutorRaw : 'RESPONSAVEL_ATUAL') as any;

    const campos = Array.isArray(e?.data?.fields) ? e.data.fields : [];
    const acoes = Array.isArray(e?.data?.actions) ? e.data.actions : [];

    return {
      chaveTransicao: String(e?.data?.key || '').trim().toUpperCase(),
      nomeTransicao: String(e?.data?.label || e?.data?.key || '').trim().slice(0, 120),
      estadoOrigemChave: origem,
      estadoDestinoChave: destino,
      tipoExecutor,
      idUsuarioExecutor: e?.data?.idUsuarioExecutor ?? null,
      permissaoExecutor: e?.data?.permissaoExecutor ?? null,
      exigeParecer: Boolean(e?.data?.exigeParecer),
      exigeAssinatura: Boolean(e?.data?.exigeAssinatura),
      visivelNoUi: true,
      permiteEmLote: Boolean(e?.data?.permiteEmLote),
      condicao: e?.data?.condition ?? null,
      ativo: true,
      campos: campos
        .slice()
        .sort((a, b) => Number(a.order) - Number(b.order))
        .map((c) => ({
          chaveCampo: String(c.key).trim(),
          labelCampo: String(c.label || c.key).trim().slice(0, 120),
          tipoCampo: mapFieldTypeToWorkflowTipoCampo(String(c.type)),
          obrigatorio: Boolean(c.required),
          ordemExibicao: Number(c.order || 0),
          opcoes: c.options ?? null,
          validacao: c.validation ?? null,
          valorPadrao: c.defaultValue ?? null,
          ativo: true,
        })),
      acoes: acoes
        .slice()
        .sort((a, b) => Number(a.order) - Number(b.order))
        .map((a) => ({
          ordemExecucao: Number(a.order || 0),
          tipoAcao: mapActionTypeToWorkflowTipoAcao(String(a.type)),
          configuracao: a.config ?? null,
          ativo: true,
        })),
    };
  });

  const modelo: WorkflowModeloSaveDTO = {
    codigo: String(graph.metadata.codigo).trim(),
    nome: String(graph.metadata.nomeModelo).trim().slice(0, 150),
    entidadeTipo: String(graph.metadata.entidadeTipo).trim().toUpperCase(),
    descricaoModelo: graph.metadata.descricaoModelo ?? null,
    ativo: true,
    permiteMultiplasInstancias: true,
    iniciaAutomaticamente: false,
    estados,
    transicoes,
  };

  return { modelo, designerGraph: graph };
}

