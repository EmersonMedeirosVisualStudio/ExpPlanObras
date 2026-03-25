import type { WorkflowDesignerEdgeDTO, WorkflowDesignerGraphDTO, WorkflowDesignerNodeDTO, WorkflowDesignerValidationIssue, WorkflowDesignerValidationResult } from './types';

function issue(level: WorkflowDesignerValidationIssue['level'], code: string, message: string, extra?: { nodeId?: string; edgeId?: string }) {
  return { level, code, message, ...(extra || {}) } satisfies WorkflowDesignerValidationIssue;
}

function nonEmpty(v: unknown) {
  return typeof v === 'string' && v.trim().length > 0;
}

export function validateDesignerGraph(graph: WorkflowDesignerGraphDTO): WorkflowDesignerValidationResult {
  const issues: WorkflowDesignerValidationIssue[] = [];
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];

  if (!graph?.metadata || !nonEmpty(graph.metadata.codigo) || !nonEmpty(graph.metadata.nomeModelo) || !nonEmpty(graph.metadata.entidadeTipo)) {
    issues.push(issue('ERROR', 'METADATA_INVALID', 'metadata.codigo, metadata.nomeModelo e metadata.entidadeTipo são obrigatórios.'));
  }

  const startNodes = nodes.filter((n) => n.type === 'START');
  if (startNodes.length !== 1) {
    issues.push(issue('ERROR', 'START_NODE_COUNT', 'Deve existir exatamente 1 nó START.'));
  }

  const finalNodes = nodes.filter((n) => ['END_SUCCESS', 'END_ERROR', 'CANCEL'].includes(String(n.type)));
  if (!finalNodes.length) {
    issues.push(issue('ERROR', 'FINAL_NODE_MISSING', 'Deve existir pelo menos 1 nó final (END_SUCCESS, END_ERROR ou CANCEL).'));
  }

  const keySet = new Set<string>();
  for (const n of nodes) {
    const k = String(n?.data?.key || '').trim();
    if (!k) issues.push(issue('ERROR', 'NODE_KEY_REQUIRED', 'Todo nó precisa de data.key.', { nodeId: n.id }));
    const id = String(n?.id || '').trim();
    if (!id) issues.push(issue('ERROR', 'NODE_ID_REQUIRED', 'Todo nó precisa de id.', { nodeId: n.id }));
    if (k) {
      const kk = k.toUpperCase();
      if (keySet.has(kk)) issues.push(issue('ERROR', 'NODE_KEY_DUPLICATE', `Chave de nó duplicada: ${k}`, { nodeId: n.id }));
      keySet.add(kk);
    }
  }

  const edgeKeySet = new Set<string>();
  const nodeIdSet = new Set(nodes.map((n) => String(n.id)));
  for (const e of edges) {
    const k = String(e?.data?.key || '').trim();
    if (!k) issues.push(issue('ERROR', 'EDGE_KEY_REQUIRED', 'Toda transição precisa de data.key.', { edgeId: e.id }));
    const id = String(e?.id || '').trim();
    if (!id) issues.push(issue('ERROR', 'EDGE_ID_REQUIRED', 'Toda transição precisa de id.', { edgeId: e.id }));
    if (k) {
      const kk = k.toUpperCase();
      if (edgeKeySet.has(kk)) issues.push(issue('ERROR', 'EDGE_KEY_DUPLICATE', `Chave de transição duplicada: ${k}`, { edgeId: e.id }));
      edgeKeySet.add(kk);
    }
    if (!nodeIdSet.has(String(e.source))) issues.push(issue('ERROR', 'EDGE_SOURCE_INVALID', 'Transição aponta para source inexistente.', { edgeId: e.id }));
    if (!nodeIdSet.has(String(e.target))) issues.push(issue('ERROR', 'EDGE_TARGET_INVALID', 'Transição aponta para target inexistente.', { edgeId: e.id }));
    if (String(e.source) === String(e.target)) issues.push(issue('WARNING', 'EDGE_SELF_LOOP', 'Transição com origem e destino iguais.', { edgeId: e.id }));

    const fields = Array.isArray(e?.data?.fields) ? e.data.fields : [];
    const fieldKeys = new Set<string>();
    for (const f of fields) {
      const fk = String(f?.key || '').trim();
      if (!fk) {
        issues.push(issue('ERROR', 'FIELD_KEY_REQUIRED', 'Campo precisa de key.', { edgeId: e.id }));
        continue;
      }
      const fkk = fk.toUpperCase();
      if (fieldKeys.has(fkk)) issues.push(issue('ERROR', 'FIELD_KEY_DUPLICATE', `Campo duplicado na transição: ${fk}`, { edgeId: e.id }));
      fieldKeys.add(fkk);
    }
  }

  const edgesBySource = new Map<string, WorkflowDesignerEdgeDTO[]>();
  const incomingCount = new Map<string, number>();
  for (const n of nodes) incomingCount.set(n.id, 0);
  for (const e of edges) {
    const s = String(e.source);
    if (!edgesBySource.has(s)) edgesBySource.set(s, []);
    edgesBySource.get(s)!.push(e);
    incomingCount.set(String(e.target), (incomingCount.get(String(e.target)) || 0) + 1);
  }

  const startId = startNodes[0]?.id ? String(startNodes[0].id) : null;

  for (const n of nodes) {
    const isFinal = ['END_SUCCESS', 'END_ERROR', 'CANCEL'].includes(String(n.type));
    const out = edgesBySource.get(String(n.id)) || [];
    const inc = incomingCount.get(String(n.id)) || 0;

    if (String(n.id) !== startId && inc === 0) issues.push(issue('WARNING', 'NODE_ORPHAN_IN', 'Nó sem entrada (órfão).', { nodeId: n.id }));
    if (String(n.id) === startId && inc > 0) issues.push(issue('WARNING', 'START_HAS_INCOMING', 'START não deveria ter entrada.', { nodeId: n.id }));
    if (!isFinal && String(n.id) !== startId && out.length === 0) issues.push(issue('ERROR', 'NODE_NO_OUTGOING', 'Nó não-final não pode ficar sem saída.', { nodeId: n.id }));
    if (isFinal && out.length > 0) issues.push(issue('ERROR', 'FINAL_HAS_OUTGOING', 'Nó final não pode ter saídas.', { nodeId: n.id }));
  }

  if (startId) {
    const reachable = new Set<string>();
    const stack = [startId];
    while (stack.length) {
      const id = stack.pop()!;
      if (reachable.has(id)) continue;
      reachable.add(id);
      for (const e of edgesBySource.get(id) || []) {
        const t = String(e.target);
        if (!reachable.has(t)) stack.push(t);
      }
    }
    const finalsReachable = finalNodes.filter((n) => reachable.has(String(n.id)));
    if (!finalsReachable.length) issues.push(issue('ERROR', 'NO_PATH_TO_FINAL', 'Não existe caminho do START até um nó final.'));

    for (const n of nodes) {
      if (!reachable.has(String(n.id))) issues.push(issue('WARNING', 'NODE_UNREACHABLE', 'Nó inalcançável a partir do START.', { nodeId: n.id }));
    }
  }

  const ok = issues.every((i) => i.level !== 'ERROR');
  return { ok, issues };
}

export function normalizeGraph(input: unknown): WorkflowDesignerGraphDTO {
  const g = (input || {}) as any;
  const nodes = Array.isArray(g.nodes) ? (g.nodes as WorkflowDesignerNodeDTO[]) : [];
  const edges = Array.isArray(g.edges) ? (g.edges as WorkflowDesignerEdgeDTO[]) : [];
  const metadata = g.metadata || {};
  return {
    metadata: {
      codigo: String(metadata.codigo || '').trim(),
      nomeModelo: String(metadata.nomeModelo || '').trim(),
      entidadeTipo: String(metadata.entidadeTipo || '').trim().toUpperCase(),
      descricaoModelo: metadata.descricaoModelo !== undefined && metadata.descricaoModelo !== null ? String(metadata.descricaoModelo) : null,
    },
    nodes,
    edges,
  };
}

