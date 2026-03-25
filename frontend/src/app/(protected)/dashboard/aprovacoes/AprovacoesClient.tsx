"use client";

import { useEffect, useMemo, useState } from "react";
import { AprovacoesApi } from "@/lib/modules/aprovacoes/api";
import type { AprovacaoSolicitacaoDetalheDTO, MinhaAprovacaoPendenteDTO } from "@/lib/modules/aprovacoes/types";

type Tab = "PENDENTES" | "MINHAS";

function fmtDateTime(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("pt-BR");
}

function getCookieValue(name: string): string | null {
  try {
    const parts = String(document.cookie || "").split(";").map((p) => p.trim());
    for (const p of parts) {
      if (!p.startsWith(`${name}=`)) continue;
      return p.slice(name.length + 1);
    }
    return null;
  } catch {
    return null;
  }
}

function getCurrentUserId(): number | null {
  try {
    const raw = getCookieValue("exp_user");
    if (!raw) return null;
    const decoded = decodeURIComponent(raw);
    const obj = JSON.parse(decoded) as { id?: number };
    const id = Number(obj?.id);
    return Number.isFinite(id) ? id : null;
  } catch {
    return null;
  }
}

export default function AprovacoesClient() {
  const [tab, setTab] = useState<Tab>("PENDENTES");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendentes, setPendentes] = useState<MinhaAprovacaoPendenteDTO[]>([]);
  const [minhasIds, setMinhasIds] = useState<number[]>([]);
  const [detail, setDetail] = useState<AprovacaoSolicitacaoDetalheDTO | null>(null);

  const userId = useMemo(() => getCurrentUserId(), []);

  async function carregar() {
    setLoading(true);
    setErro(null);
    try {
      const [p, minhas] = await Promise.all([AprovacoesApi.minhasPendencias(), AprovacoesApi.listarSolicitacoes({ minhas: true, limit: 80 })]);
      setPendentes(Array.isArray(p) ? p : []);
      setMinhasIds(Array.isArray(minhas) ? minhas.map((s) => s.id) : []);
    } catch (e: any) {
      setErro(e?.message || "Erro ao carregar aprovações.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function abrirSolicitacao(id: number) {
    setLoading(true);
    setErro(null);
    try {
      const d = await AprovacoesApi.obterSolicitacao(id);
      setDetail(d);
    } catch (e: any) {
      setErro(e?.message || "Erro ao abrir solicitação.");
    } finally {
      setLoading(false);
    }
  }

  const etapaAtiva = useMemo(() => {
    const etapas = detail?.etapas || [];
    return etapas.find((e) => e.status === "EM_ANALISE" || e.status === "PENDENTE") || null;
  }, [detail]);

  const podeEnviar = useMemo(() => {
    if (!detail || !userId) return false;
    if (detail.solicitacao.idUsuarioSolicitante !== userId) return false;
    return detail.solicitacao.status === "RASCUNHO" || detail.solicitacao.status === "DEVOLVIDA";
  }, [detail, userId]);

  const podeDecidir = useMemo(() => {
    if (!detail || !userId || !etapaAtiva) return false;
    if (!["PENDENTE", "EM_ANALISE"].includes(detail.solicitacao.status)) return false;
    const aprovador = (detail.aprovadores || []).find((a) => a.idEtapa === etapaAtiva.id && a.idUsuarioAprovador === userId);
    return !!aprovador && aprovador.status === "PENDENTE";
  }, [detail, etapaAtiva, userId]);

  async function enviar() {
    if (!detail) return;
    try {
      setLoading(true);
      await AprovacoesApi.enviarSolicitacao(detail.solicitacao.id);
      await abrirSolicitacao(detail.solicitacao.id);
      await carregar();
      alert("Solicitação enviada.");
    } catch (e: any) {
      setErro(e?.message || "Erro ao enviar.");
    } finally {
      setLoading(false);
    }
  }

  async function decidir(acao: "APROVAR" | "REJEITAR" | "DEVOLVER") {
    if (!detail) return;
    const parecer = (prompt("Parecer (obrigatório em alguns casos):") || "").trim();
    const pin = (prompt("PIN do aprovador:") || "").trim();
    if (!pin) return;
    try {
      setLoading(true);
      await AprovacoesApi.decidir(detail.solicitacao.id, { acao, parecer: parecer || undefined, assinatura: { tipo: "PIN", pin } as any });
      await abrirSolicitacao(detail.solicitacao.id);
      await carregar();
      alert("Decisão registrada.");
    } catch (e: any) {
      setErro(e?.message || "Erro ao decidir.");
    } finally {
      setLoading(false);
    }
  }

  async function habilitarPin() {
    const pin = (prompt("Defina um PIN (mínimo 4 dígitos):") || "").trim();
    if (!pin) return;
    try {
      setLoading(true);
      await AprovacoesApi.habilitarPin(pin);
      alert("PIN habilitado com sucesso.");
    } catch (e: any) {
      setErro(e?.message || "Erro ao habilitar PIN.");
    } finally {
      setLoading(false);
    }
  }

  const pendentesVisiveis = tab === "PENDENTES" ? pendentes : [];
  const minhasVisiveis = tab === "MINHAS" ? minhasIds : [];

  return (
    <div className="max-w-7xl space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Aprovações</h1>
          <p className="text-sm text-slate-500">Central de decisões, trilha e histórico.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button type="button" className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50" onClick={carregar} disabled={loading}>
            Atualizar
          </button>
          <button type="button" className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50" onClick={habilitarPin} disabled={loading}>
            Habilitar PIN
          </button>
        </div>
      </div>

      {erro ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{erro}</div> : null}

      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setTab("PENDENTES")}
          className={`rounded-lg px-4 py-2 text-sm ${tab === "PENDENTES" ? "bg-blue-600 text-white" : "border hover:bg-slate-50"}`}
        >
          Pendentes ({pendentes.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("MINHAS")}
          className={`rounded-lg px-4 py-2 text-sm ${tab === "MINHAS" ? "bg-blue-600 text-white" : "border hover:bg-slate-50"}`}
        >
          Minhas solicitações ({minhasIds.length})
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border bg-white p-4 shadow-sm lg:col-span-1">
          <div className="mb-3 text-sm font-semibold text-slate-700">{tab === "PENDENTES" ? "Pendentes" : "Minhas solicitações"}</div>
          {loading ? <div className="text-sm text-slate-500">Carregando...</div> : null}

          {tab === "PENDENTES" ? (
            <div className="space-y-2">
              {pendentesVisiveis.length ? (
                pendentesVisiveis.map((p) => (
                  <button
                    key={`${p.idSolicitacao}-${p.etapaNome}`}
                    type="button"
                    className="w-full rounded-lg border px-3 py-2 text-left text-sm hover:bg-slate-50"
                    onClick={() => abrirSolicitacao(p.idSolicitacao)}
                  >
                    <div className="font-medium truncate">{p.tituloSolicitacao}</div>
                    <div className="mt-1 text-xs text-slate-500 truncate">
                      Etapa: {p.etapaNome} • Venc.: {fmtDateTime(p.vencimentoEm)}
                    </div>
                  </button>
                ))
              ) : (
                <div className="text-sm text-slate-500">Nenhuma pendência.</div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {minhasVisiveis.length ? (
                minhasVisiveis.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className="w-full rounded-lg border px-3 py-2 text-left text-sm hover:bg-slate-50"
                    onClick={() => abrirSolicitacao(id)}
                  >
                    <div className="font-medium">Solicitação #{id}</div>
                    <div className="mt-1 text-xs text-slate-500">Abrir detalhes</div>
                  </button>
                ))
              ) : (
                <div className="text-sm text-slate-500">Nenhuma solicitação.</div>
              )}
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm lg:col-span-2">
          {!detail ? (
            <div className="text-sm text-slate-500">Selecione uma solicitação.</div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="text-xs text-slate-500">
                    #{detail.solicitacao.id} • {detail.solicitacao.entidadeTipo}:{detail.solicitacao.entidadeId}
                  </div>
                  <div className="text-lg font-semibold truncate">{detail.solicitacao.tituloSolicitacao}</div>
                  <div className="mt-1 text-sm text-slate-600">{detail.solicitacao.descricaoSolicitacao || ""}</div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {podeEnviar ? (
                    <button type="button" className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700" onClick={enviar} disabled={loading}>
                      Enviar
                    </button>
                  ) : null}
                  {podeDecidir ? (
                    <>
                      <button
                        type="button"
                        className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700"
                        onClick={() => decidir("APROVAR")}
                        disabled={loading}
                      >
                        Aprovar
                      </button>
                      <button
                        type="button"
                        className="rounded-lg bg-amber-600 px-4 py-2 text-sm text-white hover:bg-amber-700"
                        onClick={() => decidir("DEVOLVER")}
                        disabled={loading}
                      >
                        Devolver
                      </button>
                      <button
                        type="button"
                        className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
                        onClick={() => decidir("REJEITAR")}
                        disabled={loading}
                      >
                        Rejeitar
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-slate-500">Status</div>
                  <div className="text-sm font-semibold">{detail.solicitacao.status}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-slate-500">Responsável atual</div>
                  <div className="text-sm font-semibold">{detail.solicitacao.idUsuarioResponsavelAtual ?? "-"}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-slate-500">Vencimento</div>
                  <div className="text-sm font-semibold">{fmtDateTime(detail.solicitacao.vencimentoAtualEm)}</div>
                </div>
              </div>

              <div className="rounded-lg border">
                <div className="border-b bg-slate-50 px-3 py-2 text-sm font-semibold">Etapas</div>
                <div className="p-3 space-y-2">
                  {(detail.etapas || []).map((e) => (
                    <div key={e.id} className="rounded-md border px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium">
                          {e.ordem}. {e.nome}
                        </div>
                        <div className="text-xs text-slate-500">{e.status}</div>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        Venc.: {fmtDateTime(e.vencimentoEm)} • Aprov.: {e.aprovacoesRealizadas}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border">
                <div className="border-b bg-slate-50 px-3 py-2 text-sm font-semibold">Decisões</div>
                <div className="p-3 space-y-2">
                  {(detail.decisoes || []).length ? (
                    (detail.decisoes || []).map((d) => (
                      <div key={d.id} className="rounded-md border px-3 py-2 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium">{d.decisao}</div>
                          <div className="text-xs text-slate-500">{fmtDateTime(d.criadoEm)}</div>
                        </div>
                        <div className="mt-1 text-xs text-slate-500">Usuário: {d.idUsuarioDecisor}</div>
                        {d.parecer ? <div className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">{d.parecer}</div> : null}
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-slate-500">Sem decisões.</div>
                  )}
                </div>
              </div>

              <div className="rounded-lg border">
                <div className="border-b bg-slate-50 px-3 py-2 text-sm font-semibold">Histórico</div>
                <div className="p-3 space-y-2">
                  {(detail.historico || []).length ? (
                    (detail.historico || []).map((h) => (
                      <div key={h.id} className="rounded-md border px-3 py-2 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium">{h.statusNovo}</div>
                          <div className="text-xs text-slate-500">{fmtDateTime(h.criadoEm)}</div>
                        </div>
                        <div className="mt-1 text-xs text-slate-500">{h.descricaoEvento}</div>
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

