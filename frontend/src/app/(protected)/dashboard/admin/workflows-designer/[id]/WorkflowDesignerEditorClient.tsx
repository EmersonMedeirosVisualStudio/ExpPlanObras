"use client";

import "@xyflow/react/dist/style.css";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ReactFlow, { addEdge, Background, Controls, MiniMap, type Connection, type Edge, type Node, useEdgesState, useNodesState } from "@xyflow/react";
import { WorkflowsDesignerApi } from "@/lib/modules/workflows-designer/api";
import type { WorkflowDesignerEdgeDTO, WorkflowDesignerGraphDTO, WorkflowDesignerNodeDTO, WorkflowDesignerSimulationResult, WorkflowDesignerValidationResult } from "@/lib/modules/workflows-designer/types";

function fmtDateTime(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("pt-BR");
}

function genId(prefix: string) {
  const anyCrypto: any = typeof window !== "undefined" ? (window as any).crypto : null;
  if (anyCrypto?.randomUUID) return `${prefix}_${anyCrypto.randomUUID()}`;
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function safeJsonParse(v: string): any {
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

const NODE_TYPES = ["START", "STEP", "APPROVAL", "TASK", "END_SUCCESS", "END_ERROR", "CANCEL"] as const;

export default function WorkflowDesignerEditorClient() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const rascunhoId = Number(params?.id);

  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [info, setInfo] = useState<any | null>(null);
  const [validation, setValidation] = useState<WorkflowDesignerValidationResult | null>(null);
  const [simulation, setSimulation] = useState<WorkflowDesignerSimulationResult | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<WorkflowDesignerNodeDTO["data"]>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge<WorkflowDesignerEdgeDTO["data"]>>([]);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  const heartbeatRef = useRef<number | null>(null);

  const selectedNode = useMemo(() => (selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) || null : null), [nodes, selectedNodeId]);
  const selectedEdge = useMemo(() => (selectedEdgeId ? edges.find((e) => e.id === selectedEdgeId) || null : null), [edges, selectedEdgeId]);

  const graph: WorkflowDesignerGraphDTO | null = useMemo(() => {
    if (!info?.codigo) return null;
    const ns = nodes.map(
      (n) =>
        ({
          id: n.id,
          type: (n.type || "STEP") as any,
          position: { x: n.position.x, y: n.position.y },
          data: n.data as any,
        }) satisfies WorkflowDesignerNodeDTO
    );
    const es = edges.map(
      (e) =>
        ({
          id: e.id,
          source: String(e.source),
          target: String(e.target),
          data: e.data as any,
        }) satisfies WorkflowDesignerEdgeDTO
    );
    return {
      metadata: {
        codigo: String(info.codigo),
        nomeModelo: String(info.nomeModelo),
        entidadeTipo: String(info.entidadeTipo),
        descricaoModelo: info.descricaoModelo ?? null,
      },
      nodes: ns,
      edges: es,
    };
  }, [edges, info, nodes]);

  async function carregar() {
    if (!Number.isFinite(rascunhoId)) return;
    setLoading(true);
    setErro(null);
    try {
      const d = await WorkflowsDesignerApi.obterRascunho(rascunhoId);
      setInfo({
        id: d.id,
        codigo: d.codigo,
        nomeModelo: d.nomeModelo,
        entidadeTipo: d.entidadeTipo,
        descricaoModelo: d.descricaoModelo,
        statusRascunho: d.statusRascunho,
        idModeloBase: d.idModeloBase,
        changelogText: d.changelogText,
        lockedByUserId: d.lockedByUserId,
        lockExpiresAt: d.lockExpiresAt,
        criadoEm: d.criadoEm,
        atualizadoEm: d.atualizadoEm,
      });
      setValidation(d.validation || null);
      const ns = (d.graph.nodes || []).map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data as any })) as any[];
      const es = (d.graph.edges || []).map((e) => ({ id: e.id, source: e.source, target: e.target, data: e.data as any })) as any[];
      setNodes(ns);
      setEdges(es);
    } catch (e: any) {
      setErro(e?.message || "Erro ao carregar rascunho.");
    } finally {
      setLoading(false);
    }
  }

  async function lock() {
    if (!Number.isFinite(rascunhoId)) return;
    try {
      await WorkflowsDesignerApi.lock(rascunhoId);
    } catch (e: any) {
      setErro(e?.message || "Erro ao bloquear rascunho.");
    }
  }

  async function heartbeat() {
    if (!Number.isFinite(rascunhoId)) return;
    try {
      await WorkflowsDesignerApi.heartbeat(rascunhoId);
    } catch {}
  }

  useEffect(() => {
    carregar();
  }, [rascunhoId]);

  useEffect(() => {
    lock();
    heartbeatRef.current = window.setInterval(() => heartbeat(), 30_000);
    return () => {
      if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
    };
  }, [rascunhoId]);

  async function salvar(changelogText?: string | null) {
    if (!graph) return;
    try {
      setLoading(true);
      setErro(null);
      await WorkflowsDesignerApi.salvarRascunho(rascunhoId, graph, changelogText ?? null);
      await carregar();
      alert("Salvo.");
    } catch (e: any) {
      setErro(e?.message || "Erro ao salvar.");
    } finally {
      setLoading(false);
    }
  }

  async function validar() {
    try {
      setLoading(true);
      setErro(null);
      const v = await WorkflowsDesignerApi.validarRascunho(rascunhoId);
      setValidation(v);
      alert(v.ok ? "Validado sem erros." : "Validação encontrou erros.");
      await carregar();
    } catch (e: any) {
      setErro(e?.message || "Erro ao validar.");
    } finally {
      setLoading(false);
    }
  }

  async function simular() {
    const raw = (prompt('Contexto JSON para simulação (ex: {"valorReferencia":150000}):') || "").trim();
    if (!raw) return;
    const ctx = safeJsonParse(raw);
    if (!ctx || typeof ctx !== "object") {
      alert("JSON inválido.");
      return;
    }
    try {
      setLoading(true);
      setErro(null);
      const s = await WorkflowsDesignerApi.simularRascunho(rascunhoId, ctx);
      setSimulation(s);
      alert("Simulação concluída.");
    } catch (e: any) {
      setErro(e?.message || "Erro ao simular.");
    } finally {
      setLoading(false);
    }
  }

  async function publicar() {
    const changelogText = (prompt("Changelog (opcional):") || "").trim() || null;
    try {
      setLoading(true);
      setErro(null);
      await salvar(changelogText);
      const res = await WorkflowsDesignerApi.publicarRascunho(rascunhoId, changelogText);
      alert(`Publicado. Modelo #${res.idModeloPublicado}`);
      router.push("/dashboard/admin/workflows-modelos");
    } catch (e: any) {
      setErro(e?.message || "Erro ao publicar.");
    } finally {
      setLoading(false);
    }
  }

  function addNode() {
    const type = (prompt(`Tipo do nó (${NODE_TYPES.join(", ")}):`, "STEP") || "").trim().toUpperCase();
    if (!NODE_TYPES.includes(type as any)) {
      alert("Tipo inválido.");
      return;
    }
    const key = (prompt("Key do estado (ex: EM_ANALISE, AGUARDANDO_DIRETORIA):") || "").trim();
    if (!key) return;
    const label = (prompt("Label do estado:") || "").trim() || key;
    const id = genId("n");
    const position = { x: 100 + nodes.length * 40, y: 120 + nodes.length * 20 };
    setNodes((prev) => prev.concat({ id, type, position, data: { key, label } as any } as any));
  }

  function addFinal() {
    const key = (prompt("Key do final (ex: FINAL_SUCESSO):") || "").trim();
    if (!key) return;
    const label = (prompt("Label do final:") || "").trim() || key;
    const id = genId("n");
    const position = { x: 520 + nodes.length * 30, y: 180 + nodes.length * 20 };
    setNodes((prev) => prev.concat({ id, type: "END_SUCCESS", position, data: { key, label } as any } as any));
  }

  function onConnect(c: Connection) {
    if (!c.source || !c.target) return;
    const key = (prompt("Key da transição (ex: APROVAR, ENVIAR_PARA_RH):") || "").trim();
    if (!key) return;
    const label = (prompt("Label da transição:") || "").trim() || key;
    const tipoExecutor = (prompt("Executor (SOLICITANTE, RESPONSAVEL_ATUAL, USUARIO, PERMISSAO, GESTOR_LOCAL, APROVADOR):", "RESPONSAVEL_ATUAL") || "").trim();
    const data = { key, label, tipoExecutor } as any;
    const newEdge: Edge<any> = { id: genId("e"), source: c.source, target: c.target, data };
    setEdges((eds) => addEdge(newEdge, eds));
  }

  function patchSelectedNode(patch: Partial<WorkflowDesignerNodeDTO["data"]> & { type?: string }) {
    if (!selectedNodeId) return;
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id !== selectedNodeId) return n;
        return { ...n, type: patch.type ? (patch.type as any) : n.type, data: { ...(n.data as any), ...patch } as any };
      })
    );
  }

  function patchSelectedEdge(patch: Partial<WorkflowDesignerEdgeDTO["data"]>) {
    if (!selectedEdgeId) return;
    setEdges((prev) =>
      prev.map((e) => {
        if (e.id !== selectedEdgeId) return e;
        return { ...e, data: { ...(e.data as any), ...patch } as any };
      })
    );
  }

  const issues = validation?.issues || [];

  return (
    <div className="max-w-7xl space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="text-xs text-slate-500">
            Rascunho #{rascunhoId} • Status: {info?.statusRascunho || "-"} • Atualizado: {fmtDateTime(info?.atualizadoEm)}
          </div>
          <h1 className="text-2xl font-semibold text-slate-800 truncate">{info?.nomeModelo || "Workflow Designer"}</h1>
          <div className="mt-1 text-sm text-slate-600">
            Código: {info?.codigo || "-"} • Entidade: {info?.entidadeTipo || "-"}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button type="button" className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50" onClick={() => carregar()} disabled={loading}>
            Recarregar
          </button>
          <button type="button" className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50" onClick={() => salvar(null)} disabled={loading}>
            Salvar
          </button>
          <button type="button" className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50" onClick={validar} disabled={loading}>
            Validar
          </button>
          <button type="button" className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50" onClick={simular} disabled={loading}>
            Simular
          </button>
          <button type="button" className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700" onClick={publicar} disabled={loading}>
            Publicar
          </button>
        </div>
      </div>

      {erro ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</div> : null}

      <div className="grid gap-4 lg:grid-cols-4">
        <div className="rounded-xl border bg-white p-3 shadow-sm space-y-3 lg:col-span-1">
          <div className="text-sm font-semibold text-slate-700">Palette</div>
          <div className="flex gap-2 flex-wrap">
            <button type="button" className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-50" onClick={addNode} disabled={loading}>
              Adicionar nó
            </button>
            <button type="button" className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-50" onClick={addFinal} disabled={loading}>
              Final sucesso
            </button>
          </div>

          <div className="rounded-lg border p-3 space-y-2">
            <div className="text-sm font-semibold text-slate-700">Metadados</div>
            <div className="space-y-2">
              <label className="block text-xs text-slate-500">
                Código
                <input
                  className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                  value={info?.codigo || ""}
                  onChange={(e) => setInfo((p: any) => ({ ...(p || {}), codigo: e.target.value }))}
                />
              </label>
              <label className="block text-xs text-slate-500">
                Nome
                <input
                  className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                  value={info?.nomeModelo || ""}
                  onChange={(e) => setInfo((p: any) => ({ ...(p || {}), nomeModelo: e.target.value }))}
                />
              </label>
              <label className="block text-xs text-slate-500">
                Entidade
                <input
                  className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                  value={info?.entidadeTipo || ""}
                  onChange={(e) => setInfo((p: any) => ({ ...(p || {}), entidadeTipo: e.target.value }))}
                />
              </label>
            </div>
          </div>

          <div className="rounded-lg border p-3 space-y-2">
            <div className="text-sm font-semibold text-slate-700">Validação</div>
            <div className="text-xs text-slate-500">Issues: {issues.length}</div>
            <div className="max-h-56 overflow-auto space-y-1">
              {issues.length ? (
                issues.map((i, idx) => (
                  <div key={`${i.code}-${idx}`} className={`rounded-md border px-2 py-1 text-xs ${i.level === "ERROR" ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                    {i.code}: {i.message}
                  </div>
                ))
              ) : (
                <div className="text-xs text-slate-500">Sem validação ainda.</div>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-white shadow-sm lg:col-span-2" style={{ height: 620 }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, n) => {
              setSelectedEdgeId(null);
              setSelectedNodeId(n.id);
            }}
            onEdgeClick={(_, e) => {
              setSelectedNodeId(null);
              setSelectedEdgeId(e.id);
            }}
            fitView
          >
            <MiniMap />
            <Controls />
            <Background />
          </ReactFlow>
        </div>

        <div className="rounded-xl border bg-white p-3 shadow-sm space-y-3 lg:col-span-1">
          <div className="text-sm font-semibold text-slate-700">Propriedades</div>
          {!selectedNode && !selectedEdge ? <div className="text-sm text-slate-500">Selecione um nó ou transição.</div> : null}

          {selectedNode ? (
            <div className="space-y-2">
              <div className="text-xs text-slate-500">Nó: {selectedNode.id}</div>
              <label className="block text-xs text-slate-500">
                Tipo
                <select
                  className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                  value={String(selectedNode.type || "STEP")}
                  onChange={(e) => patchSelectedNode({ type: e.target.value })}
                >
                  {NODE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-slate-500">
                Key
                <input className="mt-1 w-full rounded-md border px-2 py-1 text-sm" value={String((selectedNode.data as any)?.key || "")} onChange={(e) => patchSelectedNode({ key: e.target.value })} />
              </label>
              <label className="block text-xs text-slate-500">
                Label
                <input className="mt-1 w-full rounded-md border px-2 py-1 text-sm" value={String((selectedNode.data as any)?.label || "")} onChange={(e) => patchSelectedNode({ label: e.target.value })} />
              </label>
              <label className="block text-xs text-slate-500">
                SLA (horas)
                <input
                  className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                  value={String((selectedNode.data as any)?.slaHoras ?? "")}
                  onChange={(e) => patchSelectedNode({ slaHoras: e.target.value ? Number(e.target.value) : null })}
                />
              </label>
            </div>
          ) : null}

          {selectedEdge ? (
            <div className="space-y-2">
              <div className="text-xs text-slate-500">Transição: {selectedEdge.id}</div>
              <label className="block text-xs text-slate-500">
                Key
                <input className="mt-1 w-full rounded-md border px-2 py-1 text-sm" value={String((selectedEdge.data as any)?.key || "")} onChange={(e) => patchSelectedEdge({ key: e.target.value })} />
              </label>
              <label className="block text-xs text-slate-500">
                Label
                <input className="mt-1 w-full rounded-md border px-2 py-1 text-sm" value={String((selectedEdge.data as any)?.label || "")} onChange={(e) => patchSelectedEdge({ label: e.target.value })} />
              </label>
              <label className="block text-xs text-slate-500">
                Executor
                <input
                  className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                  value={String((selectedEdge.data as any)?.tipoExecutor || "")}
                  onChange={(e) => patchSelectedEdge({ tipoExecutor: e.target.value })}
                />
              </label>
              <label className="block text-xs text-slate-500">
                Condição (JSON)
                <textarea
                  className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                  rows={4}
                  value={JSON.stringify((selectedEdge.data as any)?.condition ?? null, null, 2)}
                  onChange={(e) => patchSelectedEdge({ condition: safeJsonParse(e.target.value) })}
                />
              </label>
            </div>
          ) : null}

          {simulation ? (
            <div className="rounded-lg border p-3 space-y-2">
              <div className="text-sm font-semibold text-slate-700">Simulação</div>
              <div className="text-xs text-slate-500">Start: {simulation.startNodeId || "-"}</div>
              <div className="text-xs text-slate-500">Caminho: {simulation.simulatedPath.map((p) => p.nodeKey).join(" → ") || "-"}</div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

