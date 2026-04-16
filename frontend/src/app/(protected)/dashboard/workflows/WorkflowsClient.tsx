"use client";

import { useEffect, useMemo, useState } from "react";
import { WorkflowsApi } from "@/lib/modules/workflows/api";
import type { WorkflowInstanciaDetalheDTO, WorkflowTransicaoDisponivelDTO } from "@/lib/modules/workflows/types";

function fmtDateTime(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("pt-BR");
}

export default function WorkflowsClient() {
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [tarefas, setTarefas] = useState<any[]>([]);
  const [detail, setDetail] = useState<WorkflowInstanciaDetalheDTO | null>(null);
  const [transicoes, setTransicoes] = useState<WorkflowTransicaoDisponivelDTO[]>([]);

  async function carregar() {
    setLoading(true);
    setErro(null);
    try {
      const t = await WorkflowsApi.minhasTarefas();
      setTarefas(Array.isArray(t) ? t : []);
    } catch (e: any) {
      setErro(e?.message || "Erro ao carregar workflows.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function abrirInstancia(id: number) {
    setLoading(true);
    setErro(null);
    try {
      const d = await WorkflowsApi.obterInstancia(id);
      setDetail(d);
      const tr = await WorkflowsApi.listarTransicoes(id);
      setTransicoes(Array.isArray(tr) ? tr : []);
    } catch (e: any) {
      setErro(e?.message || "Erro ao abrir instância.");
    } finally {
      setLoading(false);
    }
  }

  const estadoAtualNome = useMemo(() => {
    if (!detail) return "-";
    const e = (detail.estados || []).find((x) => x.chaveEstado === detail.instancia.chaveEstadoAtual);
    return e?.nomeEstado || detail.instancia.chaveEstadoAtual;
  }, [detail]);

  async function executar(chaveTransicao: string) {
    if (!detail) return;
    const t = transicoes.find((x) => x.chaveTransicao === chaveTransicao);
    if (!t) return;
    const parecer = t.exigeParecer ? (prompt("Parecer:") || "").trim() : (prompt("Parecer (opcional):") || "").trim();
    const formulario: Record<string, unknown> = {};
    for (const c of t.campos || []) {
      const key = c.chaveCampo;
      const label = c.labelCampo || c.chaveCampo;
      const raw = (prompt(`${label}${c.obrigatorio ? " (obrigatório)" : ""}:`) || "").trim();
      if (c.obrigatorio && !raw) return;
      if (!raw) continue;
      if (c.tipoCampo === "NUMERO") {
        const n = Number(raw);
        if (!Number.isFinite(n)) {
          alert(`Valor inválido para ${label}`);
          return;
        }
        formulario[key] = n;
      } else if (c.tipoCampo === "BOOLEAN") {
        formulario[key] = raw === "1" || raw.toLowerCase() === "true" || raw.toLowerCase() === "sim";
      } else if (c.tipoCampo === "JSON") {
        try {
          formulario[key] = JSON.parse(raw);
        } catch {
          alert(`JSON inválido para ${label}`);
          return;
        }
      } else {
        formulario[key] = raw;
      }
    }
    let assinatura: any = undefined;
    if (t.exigeAssinatura) {
      const pin = (prompt("PIN:") || "").trim();
      if (!pin) return;
      assinatura = { tipo: "PIN", pin };
    }
    try {
      setLoading(true);
      await WorkflowsApi.executarTransicao(detail.instancia.id, {
        chaveTransicao,
        parecer: parecer || undefined,
        assinatura,
        formulario: Object.keys(formulario).length ? formulario : undefined,
      });
      await abrirInstancia(detail.instancia.id);
      await carregar();
      alert("Transição executada.");
    } catch (e: any) {
      setErro(e?.message || "Erro ao executar transição.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-7xl space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Processos → Workflows</h1>
          <p className="text-sm text-slate-500">Minhas tarefas e instâncias com ações pendentes.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button type="button" className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50" onClick={carregar} disabled={loading}>
            Atualizar
          </button>
        </div>
      </div>

      {erro ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{erro}</div> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border bg-white p-4 shadow-sm lg:col-span-1">
          <div className="mb-3 text-sm font-semibold text-slate-700">Tarefas pendentes</div>
          {loading ? <div className="text-sm text-slate-500">Carregando...</div> : null}
          <div className="space-y-2">
            {tarefas.length ? (
              tarefas.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="w-full rounded-lg border px-3 py-2 text-left text-sm hover:bg-slate-50"
                  onClick={() => abrirInstancia(Number(t.idWorkflowInstancia))}
                >
                  <div className="font-medium truncate">{t.tituloTarefa || t.tituloInstancia}</div>
                  <div className="mt-1 text-xs text-slate-500 truncate">
                    Instância #{t.idWorkflowInstancia} • Estado: {t.chaveEstadoAtual} • Prazo: {fmtDateTime(t.prazoEm)}
                  </div>
                </button>
              ))
            ) : (
              <div className="text-sm text-slate-500">Nenhuma tarefa pendente.</div>
            )}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm lg:col-span-2">
          {!detail ? (
            <div className="text-sm text-slate-500">Selecione uma tarefa para ver a instância.</div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="text-xs text-slate-500">
                    #{detail.instancia.id} • {detail.instancia.entidadeTipo}:{detail.instancia.entidadeId}
                  </div>
                  <div className="text-lg font-semibold truncate">{detail.instancia.tituloInstancia}</div>
                  <div className="mt-1 text-sm text-slate-600">Estado atual: {estadoAtualNome}</div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {(transicoes || []).map((t) => (
                    <button
                      key={t.chaveTransicao}
                      type="button"
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
                      onClick={() => executar(t.chaveTransicao)}
                      disabled={loading}
                    >
                      {t.nomeTransicao}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-slate-500">Status</div>
                  <div className="text-sm font-semibold">{detail.instancia.statusInstancia}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-slate-500">Vencimento etapa</div>
                  <div className="text-sm font-semibold">{fmtDateTime(detail.instancia.vencimentoEtapaEm)}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-slate-500">Responsável atual</div>
                  <div className="text-sm font-semibold">{detail.instancia.idUsuarioResponsavelAtual ?? "-"}</div>
                </div>
              </div>

              <div className="rounded-lg border">
                <div className="border-b bg-slate-50 px-3 py-2 text-sm font-semibold">Histórico</div>
                <div className="p-3 space-y-2">
                  {(detail.historico || []).length ? (
                    (detail.historico || []).map((h) => (
                      <div key={h.id} className="rounded-md border px-3 py-2 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium">{h.acaoExecutada || "Evento"}</div>
                          <div className="text-xs text-slate-500">{fmtDateTime(h.criadoEm)}</div>
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {h.chaveEstadoAnterior || "-"} → {h.chaveEstadoNovo}
                        </div>
                        {h.parecer ? <div className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{h.parecer}</div> : null}
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-slate-500">Sem histórico.</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

