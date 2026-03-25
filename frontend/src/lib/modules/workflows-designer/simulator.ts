import { evaluateCondition } from '@/lib/modules/workflows/conditions';
import type { WorkflowDesignerEdgeDTO, WorkflowDesignerGraphDTO, WorkflowDesignerNodeDTO, WorkflowDesignerSimulationResult } from './types';
import { normalizeGraph, validateDesignerGraph } from './validator';

function isFinalNodeType(t: string) {
  return t === 'END_SUCCESS' || t === 'END_ERROR' || t === 'CANCEL';
}

export function simulateDesignerGraph(inputGraph: unknown, contexto: Record<string, unknown> | null | undefined): WorkflowDesignerSimulationResult {
  const graph = normalizeGraph(inputGraph);
  const validation = validateDesignerGraph(graph);
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];

  const start = nodes.find((n) => n.type === 'START') || null;
  const finals = nodes.filter((n) => isFinalNodeType(String(n.type)));

  const edgesBySource = new Map<string, WorkflowDesignerEdgeDTO[]>();
  for (const e of edges) {
    const s = String(e.source);
    if (!edgesBySource.has(s)) edgesBySource.set(s, []);
    edgesBySource.get(s)!.push(e);
  }

  const nodeById = new Map(nodes.map((n) => [String(n.id), n] as const));
  const ctx = contexto || {};

  const simulatedPath: WorkflowDesignerSimulationResult['simulatedPath'] = [];
  const steps: WorkflowDesignerSimulationResult['steps'] = [];

  if (!start) {
    return { ok: false, issues: validation.issues, startNodeId: null, finalNodeIds: finals.map((n) => String(n.id)), simulatedPath, steps };
  }

  let current: WorkflowDesignerNodeDTO | null = start;
  const visited = new Set<string>();
  const maxSteps = Math.max(10, nodes.length * 4);

  for (let i = 0; i < maxSteps && current; i++) {
    const nodeId: string = String(current.id);
    simulatedPath.push({ nodeId, nodeKey: String(current.data?.key || '').trim(), nodeLabel: String(current.data?.label || '').trim() });

    if (isFinalNodeType(String(current.type))) break;
    if (visited.has(nodeId)) break;
    visited.add(nodeId);

    const outs = (edgesBySource.get(nodeId) || []).slice();
    const candidates = outs.map((e) => {
      const cond = e?.data?.condition ?? null;
      let matched = true;
      if (cond) {
        try {
          matched = evaluateCondition(cond as any, ctx);
        } catch {
          matched = false;
        }
      }
      return { edgeId: String(e.id), edgeKey: String(e.data?.key || ''), edgeLabel: String(e.data?.label || ''), conditionMatched: matched };
    });

    const chosen = outs.find((e) => {
      const cond = e?.data?.condition ?? null;
      if (!cond) return true;
      try {
        return evaluateCondition(cond as any, ctx);
      } catch {
        return false;
      }
    });

    steps.push({
      fromNodeId: nodeId,
      candidates,
      chosenEdgeId: chosen ? String(chosen.id) : null,
      toNodeId: chosen ? String(chosen.target) : null,
    });

    if (!chosen) break;
    current = nodeById.get(String(chosen.target)) || null;
  }

  return {
    ok: validation.ok,
    issues: validation.issues,
    startNodeId: String(start.id),
    finalNodeIds: finals.map((n) => String(n.id)),
    simulatedPath,
    steps,
  };
}

