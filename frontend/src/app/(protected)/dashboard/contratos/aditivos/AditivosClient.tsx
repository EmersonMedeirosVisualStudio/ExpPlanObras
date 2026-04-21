"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/api";
import { realtimeClient } from "@/lib/realtime/client";

type ContratoLite = {
  id: number;
  numeroContrato: string;
  nome: string | null;
  objeto: string | null;
  tipoContratante: "PUBLICO" | "PRIVADO" | "PF";
  empresaParceiraNome: string | null;
  vigenciaAtual: string | null;
  valorTotalAtual: number | null;
};

type AditivoRow = {
  id: number;
  numeroAditivo: string;
  tipo: "PRAZO" | "VALOR" | "AMBOS";
  status: "RASCUNHO" | "APROVADO" | "CANCELADO";
  dataAssinatura: string | null;
  justificativa: string | null;
  descricao: string | null;
  prazoAdicionadoDias: number | null;
  valorTotalAdicionado: number | null;
  valorConcedenteAdicionado: number | null;
  valorProprioAdicionado: number | null;
  snapshotPrazoDias: number | null;
  snapshotVigenciaAtual: string | null;
  snapshotValorTotalAtual: number | null;
  snapshotValorConcedenteAtual: number | null;
  snapshotValorProprioAtual: number | null;
  aplicadoEm: string | null;
  createdAt: string;
  updatedAt: string;
};

type EventoAnexo = {
  id: number;
  nomeArquivo: string;
  mimeType: string;
  tamanhoBytes: number;
  criadoEm: string;
  downloadUrl: string;
};

type EventoRow = {
  id: number;
  tipoOrigem: "CONTRATO" | "ADITIVO" | "OBRA" | "DOCUMENTO";
  origemId: number | null;
  tipoEvento: "INFO" | "CRIACAO" | "EDICAO" | "APROVACAO" | "CANCELAMENTO" | "OBSERVACAO";
  descricao: string;
  observacaoTexto: string | null;
  nivelObservacao: "NORMAL" | "ALERTA" | "CRITICO" | null;
  criadoEm: string;
  anexos: EventoAnexo[];
};

type Consolidado = {
  contrato: any;
  kpis: {
    prazoTotal: number | null;
    diasDecorridos: number | null;
    diasRestantes: number | null;
    percentualPrazo: number | null;
    valorTotalAtual: number;
    valorExecutado: number;
    valorPago: number;
    percentualFinanceiro: number | null;
    desvio: number | null;
    aditivosEmAberto: number;
  };
};

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseMoneyBR(input: string) {
  const s = String(input || "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function formatMoneyBRFromDigits(digits: string) {
  const onlyDigits = (digits || "").replace(/\D/g, "");
  const cents = onlyDigits ? Number(onlyDigits) : 0;
  const value = cents / 100;
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function addDays(dateIso: string, days: number) {
  const base = new Date(`${String(dateIso).slice(0, 10)}T00:00:00`);
  const result = new Date(base);
  result.setDate(result.getDate() + Number(days || 0));
  return result.toISOString().slice(0, 10);
}

function iconByTipoOrigem(t: string) {
  const v = String(t || "").toUpperCase();
  if (v === "ADITIVO") return "📝";
  if (v === "OBRA") return "🏗️";
  if (v === "DOCUMENTO") return "📄";
  return "📘";
}

function iconByEvento(e: EventoRow) {
  if (e.tipoEvento === "OBSERVACAO") return "💬";
  return iconByTipoOrigem(e.tipoOrigem);
}

async function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      if (comma >= 0) resolve(result.slice(comma + 1));
      else resolve(result);
    };
    reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
    reader.readAsDataURL(file);
  });
}

export default function AditivosClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const contratoId = sp.get("contratoId");
  const tab = sp.get("tab") || "dashboard";
  const apiBase = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/+$/, "");
  const tokenForLinks = useMemo(() => {
    try {
      return localStorage.getItem("token") || "";
    } catch {
      return "";
    }
  }, []);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [contratos, setContratos] = useState<ContratoLite[]>([]);
  const [qContrato, setQContrato] = useState("");

  const [consolidado, setConsolidado] = useState<Consolidado | null>(null);
  const [aditivos, setAditivos] = useState<AditivoRow[]>([]);
  const [eventos, setEventos] = useState<EventoRow[]>([]);

  const [filtroContrato, setFiltroContrato] = useState(true);
  const [filtroAditivos, setFiltroAditivos] = useState(true);
  const [filtroObras, setFiltroObras] = useState(false);
  const [filtroDocumentos, setFiltroDocumentos] = useState(false);
  const [filtroObservacoes, setFiltroObservacoes] = useState(true);

  const [obsTexto, setObsTexto] = useState("");
  const [obsNivel, setObsNivel] = useState<"NORMAL" | "ALERTA" | "CRITICO">("NORMAL");
  const [obsFiles, setObsFiles] = useState<File[]>([]);
  const [filePreview, setFilePreview] = useState<{ file: File; url: string } | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [numeroAditivo, setNumeroAditivo] = useState("1");
  const [tipo, setTipo] = useState<"PRAZO" | "VALOR" | "AMBOS">("PRAZO");
  const [dataAssinatura, setDataAssinatura] = useState("");
  const [prazoAdicionadoDias, setPrazoAdicionadoDias] = useState("");
  const [valorAdicionado, setValorAdicionado] = useState("0,00");
  const [valorConcedenteAdicionado, setValorConcedenteAdicionado] = useState("0,00");
  const [valorProprioAdicionado, setValorProprioAdicionado] = useState("0,00");
  const [justificativa, setJustificativa] = useState("");
  const [descricao, setDescricao] = useState("");
  const [formErr, setFormErr] = useState<string | null>(null);

  const contratoSelecionado = useMemo(() => {
    if (!contratoId) return null;
    const id = Number(contratoId);
    return contratos.find((c) => c.id === id) || null;
  }, [contratoId, contratos]);

  const contratosFiltrados = useMemo(() => {
    const q = qContrato.trim().toLowerCase();
    if (!q) return contratos;
    return contratos.filter((c) => `${c.numeroContrato} ${c.nome || ""} ${c.objeto || ""} ${c.empresaParceiraNome || ""}`.toLowerCase().includes(q));
  }, [contratos, qContrato]);

  function setQuery(next: Record<string, string | null | undefined>) {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) {
      if (!v) p.delete(k);
      else p.set(k, v);
    }
    const s = p.toString();
    router.push(`/dashboard/contratos/aditivos${s ? `?${s}` : ""}`);
  }

  async function carregarContratos() {
    try {
      setLoading(true);
      setErr(null);
      const res = await api.get("/api/contratos");
      setContratos(
        (res.data as any[])?.map((x) => ({
          id: Number(x.id),
          numeroContrato: String(x.numeroContrato),
          nome: x.nome ?? null,
          objeto: x.objeto ?? null,
          tipoContratante: String(x.tipoContratante || "PRIVADO").toUpperCase(),
          empresaParceiraNome: x.empresaParceiraNome ?? null,
          vigenciaAtual: x.vigenciaAtual ?? null,
          valorTotalAtual: x.valorTotalAtual == null ? null : Number(x.valorTotalAtual),
        })) ?? []
      );
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao carregar contratos");
      setContratos([]);
    } finally {
      setLoading(false);
    }
  }

  async function carregarContratoSelecionado() {
    if (!contratoId) return;
    try {
      setLoading(true);
      setErr(null);
      const [cres, ares] = await Promise.all([
        api.get(`/api/contratos/${contratoId}/consolidado`),
        api.get(`/api/contratos/${contratoId}/aditivos`),
      ]);
      setConsolidado(cres.data as any);
      setAditivos((ares.data as any[]) ?? []);
    } catch (e: any) {
      setConsolidado(null);
      setAditivos([]);
      setErr(e?.response?.data?.message || e?.message || "Erro ao carregar aditivos do contrato");
    } finally {
      setLoading(false);
    }
  }

  async function carregarEventos() {
    if (!contratoId) return;
    const origens: string[] = [];
    if (filtroContrato) origens.push("CONTRATO");
    if (filtroAditivos) origens.push("ADITIVO");
    if (filtroObras) origens.push("OBRA");
    if (filtroDocumentos) origens.push("DOCUMENTO");
    try {
      setLoading(true);
      setErr(null);
      const res = await api.get(`/api/contratos/${contratoId}/eventos`, {
        params: {
          origens: origens.join(","),
          incluirObservacoes: filtroObservacoes ? "true" : "false",
          limit: 200,
        },
      });
      setEventos((res.data as any[]) ?? []);
    } catch (e: any) {
      setEventos([]);
      setErr(e?.response?.data?.message || e?.message || "Erro ao carregar histórico");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarContratos();
  }, []);

  useEffect(() => {
    carregarContratoSelecionado();
  }, [contratoId]);

  useEffect(() => {
    if (tab !== "eventos") return;
    carregarEventos();
  }, [tab, contratoId, filtroContrato, filtroAditivos, filtroObras, filtroDocumentos, filtroObservacoes]);

  useEffect(() => {
    if (!contratoId) return;
    realtimeClient.start(["contratos", `contrato:${contratoId}`]);
    const unsubs = [
      realtimeClient.subscribe(`contrato:${contratoId}`, "contrato_atualizado", () => {
        carregarContratoSelecionado();
        if (tab === "eventos") carregarEventos();
      }),
      realtimeClient.subscribe(`contrato:${contratoId}`, "evento_criado", () => {
        if (tab === "eventos") carregarEventos();
      }),
      realtimeClient.subscribe(`contrato:${contratoId}`, "anexo_criado", () => {
        if (tab === "eventos") carregarEventos();
      }),
    ];
    return () => {
      for (const u of unsubs) u();
    };
  }, [contratoId, tab, filtroContrato, filtroAditivos, filtroObras, filtroDocumentos, filtroObservacoes]);

  useEffect(() => {
    if (!aditivos.length) return;
    const maxNum = Math.max(
      0,
      ...aditivos
        .map((a) => Number(String(a.numeroAditivo || "").replace(/\D/g, "")))
        .filter((n) => Number.isFinite(n))
    );
    if (maxNum) setNumeroAditivo(String(maxNum + 1));
  }, [aditivos]);

  const impactPreview = useMemo(() => {
    const c = consolidado?.contrato;
    if (!c) return null;
    const tipoContrato = String(c.tipoContratante || "PRIVADO").toUpperCase();
    const publico = tipoContrato === "PUBLICO";
    const prazoAtual = c.prazoDias == null ? null : Number(c.prazoDias);
    const vigAtual = c.vigenciaAtual ? String(c.vigenciaAtual).slice(0, 10) : null;
    const prazoAdd = Number(prazoAdicionadoDias || 0);
    const novoPrazo = prazoAtual != null ? prazoAtual + prazoAdd : prazoAdd || null;
    const novaVig = vigAtual && prazoAdd ? addDays(vigAtual, prazoAdd) : null;

    const valorTotalAtual = c.valorTotalAtual == null ? 0 : Number(c.valorTotalAtual);
    const vAddPriv = parseMoneyBR(valorAdicionado);
    const novoValorPriv = valorTotalAtual + vAddPriv;

    const vcAtual = c.valorConcedenteAtual == null ? 0 : Number(c.valorConcedenteAtual);
    const vpAtual = c.valorProprioAtual == null ? 0 : Number(c.valorProprioAtual);
    const vcAdd = parseMoneyBR(valorConcedenteAdicionado);
    const vpAdd = parseMoneyBR(valorProprioAdicionado);
    const novoVc = vcAtual + vcAdd;
    const novoVp = vpAtual + vpAdd;
    const novoTotalPub = novoVc + novoVp;

    return {
      publico,
      prazoAtual,
      vigAtual,
      novoPrazo: tipo === "VALOR" ? prazoAtual : novoPrazo,
      novaVigencia: tipo === "VALOR" ? vigAtual : novaVig || vigAtual,
      valorAtual: valorTotalAtual,
      novoValor: publico ? novoTotalPub : novoValorPriv,
      deltaValor: publico ? vcAdd + vpAdd : vAddPriv,
      deltaPrazo: prazoAdd,
    };
  }, [consolidado, tipo, prazoAdicionadoDias, valorAdicionado, valorConcedenteAdicionado, valorProprioAdicionado]);

  async function criarAditivo() {
    if (!contratoId) return;
    try {
      setFormErr(null);
      const payload: any = {
        numeroAditivo: String(numeroAditivo).trim(),
        tipo,
        dataAssinatura: dataAssinatura ? new Date(`${dataAssinatura}T00:00:00`).toISOString() : null,
        justificativa: justificativa || null,
        descricao: descricao || null,
      };
      if (tipo === "PRAZO" || tipo === "AMBOS") payload.prazoAdicionadoDias = Number(prazoAdicionadoDias || 0);
      if (tipo === "VALOR" || tipo === "AMBOS") {
        if (String(consolidado?.contrato?.tipoContratante || "").toUpperCase() === "PUBLICO") {
          payload.valorConcedenteAdicionado = parseMoneyBR(valorConcedenteAdicionado);
          payload.valorProprioAdicionado = parseMoneyBR(valorProprioAdicionado);
        } else {
          payload.valorTotalAdicionado = parseMoneyBR(valorAdicionado);
        }
      }
      await api.post(`/api/contratos/${contratoId}/aditivos`, payload);
      setFormOpen(false);
      await carregarContratoSelecionado();
      setQuery({ tab: "lista" });
    } catch (e: any) {
      setFormErr(e?.response?.data?.message || e?.message || "Erro ao criar aditivo");
    }
  }

  async function aprovar(aditivoId: number) {
    if (!contratoId) return;
    await api.post(`/api/contratos/${contratoId}/aditivos/${aditivoId}/aprovar`);
    await carregarContratoSelecionado();
    setQuery({ tab: "dashboard" });
  }

  async function cancelar(aditivoId: number) {
    if (!contratoId) return;
    await api.post(`/api/contratos/${contratoId}/aditivos/${aditivoId}/cancelar`);
    await carregarContratoSelecionado();
  }

  async function salvarObservacao() {
    if (!contratoId) return;
    const texto = obsTexto.trim();
    if (!texto) {
      setErr("Digite uma observação.");
      return;
    }
    try {
      setLoading(true);
      setErr(null);
      const res = await api.post(`/api/contratos/${contratoId}/observacoes`, { texto, nivel: obsNivel });
      const eventoId = Number((res.data as any)?.id || 0);
      if (!eventoId) throw new Error("Falha ao criar observação");

      for (const file of obsFiles) {
        const base64 = await fileToBase64(file);
        await api.post(`/api/contratos/${contratoId}/eventos/${eventoId}/anexos`, {
          nomeArquivo: file.name,
          mimeType: file.type || "application/octet-stream",
          conteudoBase64: base64,
        });
      }

      setObsTexto("");
      setObsNivel("NORMAL");
      setObsFiles([]);
      await carregarContratoSelecionado();
      await carregarEventos();
      setQuery({ tab: "eventos" });
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao salvar observação");
    } finally {
      setLoading(false);
    }
  }

  function abrirPreviewArquivo(file: File) {
    const url = URL.createObjectURL(file);
    setFilePreview({ file, url });
  }

  function fecharPreviewArquivo() {
    if (filePreview?.url) {
      try {
        URL.revokeObjectURL(filePreview.url);
      } catch {
      }
    }
    setFilePreview(null);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Aditivos de Contrato</h1>
          <div className="text-sm text-slate-600">Selecione um contrato e gerencie aditivos com histórico, snapshot e aplicação no contrato.</div>
        </div>
        <button className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50" type="button" onClick={() => router.push("/dashboard/contratos")}>
          Voltar para Contratos
        </button>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="text-sm font-semibold">Selecionar contrato</div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <input className="input md:col-span-2" value={qContrato} onChange={(e) => setQContrato(e.target.value)} placeholder="Buscar por nº, nome ou empresa" />
          <select className="input" value={contratoId || ""} onChange={(e) => setQuery({ contratoId: e.target.value || null, tab: "dashboard" })}>
            <option value="">Selecione</option>
            {contratosFiltrados.map((c) => (
              <option key={c.id} value={String(c.id)}>
                #{c.id} • {c.numeroContrato} • {c.nome || c.objeto || "—"}
              </option>
            ))}
          </select>
        </div>
        {loading ? <div className="text-sm text-slate-500">Carregando...</div> : null}
      </section>

      {contratoSelecionado ? (
        <section className="rounded-xl border bg-white p-4 shadow-sm space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <div className="text-sm text-slate-500">Contrato</div>
              <div className="text-lg font-semibold">
                {contratoSelecionado.numeroContrato} — {contratoSelecionado.nome || contratoSelecionado.objeto || "—"}
              </div>
              <div className="text-sm text-slate-600">
                {contratoSelecionado.empresaParceiraNome || "Sem empresa"} • Vigência:{" "}
                {contratoSelecionado.vigenciaAtual ? new Date(contratoSelecionado.vigenciaAtual).toLocaleDateString("pt-BR") : "—"} • Valor atual:{" "}
                {moeda(Number(contratoSelecionado.valorTotalAtual || 0))}
              </div>
            </div>
            <div className="flex gap-2">
              <button className={`rounded-lg px-3 py-2 text-sm ${tab === "dashboard" ? "bg-slate-900 text-white" : "border bg-white hover:bg-slate-50"}`} type="button" onClick={() => setQuery({ tab: "dashboard" })}>
                Dashboard
              </button>
              <button className={`rounded-lg px-3 py-2 text-sm ${tab === "lista" ? "bg-slate-900 text-white" : "border bg-white hover:bg-slate-50"}`} type="button" onClick={() => setQuery({ tab: "lista" })}>
                Aditivos (CRUD)
              </button>
              <button className={`rounded-lg px-3 py-2 text-sm ${tab === "eventos" ? "bg-slate-900 text-white" : "border bg-white hover:bg-slate-50"}`} type="button" onClick={() => setQuery({ tab: "eventos" })}>
                Eventos
              </button>
              <button className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white" type="button" onClick={() => setFormOpen(true)}>
                Novo aditivo
              </button>
            </div>
          </div>

          {tab === "dashboard" ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div className="rounded-xl border bg-slate-50 p-4">
                <div className="text-xs text-slate-500">Valor total atual</div>
                <div className="text-xl font-semibold">{moeda(consolidado?.kpis?.valorTotalAtual ?? 0)}</div>
              </div>
              <div className="rounded-xl border bg-slate-50 p-4">
                <div className="text-xs text-slate-500">Executado</div>
                <div className="text-xl font-semibold">{moeda(consolidado?.kpis?.valorExecutado ?? 0)}</div>
              </div>
              <div className="rounded-xl border bg-slate-50 p-4">
                <div className="text-xs text-slate-500">Saldo</div>
                <div className="text-xl font-semibold">{moeda((consolidado?.kpis?.valorTotalAtual ?? 0) - (consolidado?.kpis?.valorExecutado ?? 0))}</div>
              </div>
              <div className="rounded-xl border bg-slate-50 p-4">
                <div className="text-xs text-slate-500">Aditivos em aberto</div>
                <div className="text-xl font-semibold">{consolidado?.kpis?.aditivosEmAberto ?? 0}</div>
              </div>
            </div>
          ) : null}

          {tab === "lista" ? (
            <div className="space-y-3">
              <div className="text-sm font-semibold">Aditivos</div>
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-slate-700">
                    <tr>
                      <th className="px-3 py-2">Nº</th>
                      <th className="px-3 py-2">Tipo</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Impacto</th>
                      <th className="px-3 py-2">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aditivos.map((a) => (
                      <tr key={a.id} className="border-t">
                        <td className="px-3 py-2 font-semibold">{a.numeroAditivo}</td>
                        <td className="px-3 py-2">{a.tipo}</td>
                        <td className="px-3 py-2">{a.status}</td>
                        <td className="px-3 py-2">
                          {(a.prazoAdicionadoDias || 0) > 0 ? `Prazo +${a.prazoAdicionadoDias}d` : ""}
                          {(a.valorTotalAdicionado || 0) > 0 ? ` ${moeda(Number(a.valorTotalAdicionado || 0))}` : ""}
                          {(a.valorConcedenteAdicionado || 0) > 0 || (a.valorProprioAdicionado || 0) > 0
                            ? ` Concedente +${moeda(Number(a.valorConcedenteAdicionado || 0))} / Próprio +${moeda(Number(a.valorProprioAdicionado || 0))}`
                            : ""}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-2">
                            {a.status === "RASCUNHO" ? (
                              <>
                                <button className="rounded-lg bg-emerald-600 px-3 py-1 text-sm text-white" type="button" onClick={() => aprovar(a.id)}>
                                  Aprovar
                                </button>
                                <button className="rounded-lg border bg-white px-3 py-1 text-sm hover:bg-slate-50" type="button" onClick={() => cancelar(a.id)}>
                                  Cancelar
                                </button>
                              </>
                            ) : (
                              <span className="text-xs text-slate-500">{a.aplicadoEm ? `Aplicado em ${new Date(a.aplicadoEm).toLocaleDateString("pt-BR")}` : "—"}</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!aditivos.length ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                          Nenhum aditivo cadastrado.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {tab === "eventos" ? (
            <div className="space-y-4">
              <div className="rounded-xl border bg-slate-50 p-3">
                <div className="flex gap-4 flex-wrap items-center">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={filtroContrato} onChange={(e) => setFiltroContrato(e.target.checked)} />
                    Contrato
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={filtroAditivos} onChange={(e) => setFiltroAditivos(e.target.checked)} />
                    Aditivos
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={filtroObras} onChange={(e) => setFiltroObras(e.target.checked)} />
                    Obras
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={filtroDocumentos} onChange={(e) => setFiltroDocumentos(e.target.checked)} />
                    Documentos
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={filtroObservacoes} onChange={(e) => setFiltroObservacoes(e.target.checked)} />
                    Observações
                  </label>
                  <button
                    className="ml-auto text-sm underline"
                    type="button"
                    onClick={() => {
                      setFiltroContrato(true);
                      setFiltroAditivos(true);
                      setFiltroObras(true);
                      setFiltroDocumentos(true);
                      setFiltroObservacoes(true);
                    }}
                  >
                    Marcar todos
                  </button>
                  <button
                    className="text-sm underline"
                    type="button"
                    onClick={() => {
                      setFiltroContrato(false);
                      setFiltroAditivos(false);
                      setFiltroObras(false);
                      setFiltroDocumentos(false);
                      setFiltroObservacoes(false);
                    }}
                  >
                    Limpar
                  </button>
                </div>
              </div>

              <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-sm font-semibold">Adicionar observação</div>
                  <select className="input w-[160px]" value={obsNivel} onChange={(e) => setObsNivel(e.target.value as any)}>
                    <option value="NORMAL">Normal</option>
                    <option value="ALERTA">Alerta</option>
                    <option value="CRITICO">Crítico</option>
                  </select>
                </div>
                <textarea className="input min-h-[90px]" value={obsTexto} onChange={(e) => setObsTexto(e.target.value)} placeholder="Digite sua observação..." />
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="file"
                    multiple
                    accept="application/pdf,image/*"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      setObsFiles(files);
                    }}
                  />
                  <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50" type="button" onClick={salvarObservacao} disabled={loading || !obsTexto.trim()}>
                    Salvar
                  </button>
                </div>

                {obsFiles.length ? (
                  <div className="space-y-2">
                    {obsFiles.map((f) => (
                      <div key={f.name + f.size} className="flex items-center justify-between gap-2 rounded-lg border bg-slate-50 p-2 text-sm">
                        <div className="truncate">📎 {f.name}</div>
                        <button className="rounded-lg border bg-white px-3 py-1 text-sm hover:bg-slate-50" type="button" onClick={() => abrirPreviewArquivo(f)}>
                          Preview
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="rounded-xl border bg-white p-4 shadow-sm">
                <div className="text-sm font-semibold">Linha do tempo</div>
                <div className="mt-3 space-y-2">
                  {eventos.map((ev) => (
                    <div key={ev.id} className="flex gap-3 items-start border-b py-2">
                      <div className="w-6">{iconByEvento(ev)}</div>
                      <div className="flex-1">
                        {ev.tipoEvento === "OBSERVACAO" ? (
                          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-2 rounded">
                            <div className="text-sm">{ev.observacaoTexto}</div>
                            {ev.anexos?.length ? (
                              <div className="mt-2 flex flex-col gap-1">
                                {ev.anexos.map((a) => (
                                  <a key={a.id} href={`${apiBase}${a.downloadUrl}?token=${encodeURIComponent(tokenForLinks)}`} target="_blank" className="text-blue-600 text-xs underline">
                                    📎 {a.nomeArquivo}
                                  </a>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="text-sm">{ev.descricao}</div>
                        )}
                        <div className="text-xs text-slate-500 mt-1">{new Date(ev.criadoEm).toLocaleString("pt-BR")}</div>
                      </div>
                    </div>
                  ))}
                  {!eventos.length ? <div className="text-sm text-slate-500">Sem eventos.</div> : null}
                </div>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {filePreview ? (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={fecharPreviewArquivo}>
          <div className="bg-white p-4 rounded w-[90%] h-[90%] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm">{filePreview.file.name}</span>
              <button className="rounded-lg border bg-white px-3 py-1 text-sm hover:bg-slate-50" type="button" onClick={fecharPreviewArquivo}>
                Fechar
              </button>
            </div>
            <div className="flex-1 overflow-auto">
              {filePreview.file.type.includes("image") ? <img src={filePreview.url} className="max-w-full mx-auto" /> : null}
              {filePreview.file.type === "application/pdf" ? <iframe src={filePreview.url} className="w-full h-full" /> : null}
              {!filePreview.file.type.includes("image") && filePreview.file.type !== "application/pdf" ? (
                <div className="text-center text-slate-500 mt-10">Preview não disponível para este tipo de arquivo.</div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {formOpen ? (
        <section className="rounded-xl border bg-white p-4 shadow-sm space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold">Novo aditivo (rascunho)</div>
            <button className="rounded-lg border bg-white px-3 py-1 text-sm hover:bg-slate-50" type="button" onClick={() => setFormOpen(false)}>
              Fechar
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <div className="text-sm text-slate-600">Número</div>
              <input className="input" value={numeroAditivo} onChange={(e) => setNumeroAditivo(e.target.value)} placeholder="Ex: 1" />
            </div>
            <div>
              <div className="text-sm text-slate-600">Tipo</div>
              <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value as any)}>
                <option value="PRAZO">Prazo</option>
                <option value="VALOR">Valor</option>
                <option value="AMBOS">Prazo + Valor</option>
              </select>
            </div>
            <div>
              <div className="text-sm text-slate-600">Data assinatura</div>
              <input className="input" type="date" value={dataAssinatura} onChange={(e) => setDataAssinatura(e.target.value)} />
            </div>

            {(tipo === "PRAZO" || tipo === "AMBOS") ? (
              <div className="md:col-span-3 rounded-lg border bg-slate-50 p-3">
                <div className="text-sm font-semibold">Prazo</div>
                <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div>
                    <div className="text-sm text-slate-600">Prazo adicionado (dias)</div>
                    <input className="input" value={prazoAdicionadoDias} onChange={(e) => setPrazoAdicionadoDias(e.target.value)} placeholder="Ex: 60" />
                  </div>
                  <div>
                    <div className="text-sm text-slate-600">Antes → Depois</div>
                    <div className="text-sm">
                      {(impactPreview?.prazoAtual ?? "—")} → {(impactPreview?.novoPrazo ?? "—")} ({impactPreview?.deltaPrazo ? `+${impactPreview.deltaPrazo}` : "+0"}d)
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-slate-600">Vigência atual</div>
                    <div className="text-sm">
                      {(impactPreview?.vigAtual ?? "—")} → {(impactPreview?.novaVigencia ?? "—")}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {(tipo === "VALOR" || tipo === "AMBOS") ? (
              <div className="md:col-span-3 rounded-lg border bg-slate-50 p-3">
                <div className="text-sm font-semibold">Valor</div>
                {String(consolidado?.contrato?.tipoContratante || "").toUpperCase() === "PUBLICO" ? (
                  <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div>
                      <div className="text-sm text-slate-600">Concedente adicionado</div>
                      <input className="input" value={valorConcedenteAdicionado} onChange={(e) => setValorConcedenteAdicionado(formatMoneyBRFromDigits(e.target.value))} />
                    </div>
                    <div>
                      <div className="text-sm text-slate-600">Próprio adicionado</div>
                      <input className="input" value={valorProprioAdicionado} onChange={(e) => setValorProprioAdicionado(formatMoneyBRFromDigits(e.target.value))} />
                    </div>
                    <div>
                      <div className="text-sm text-slate-600">Antes → Depois</div>
                      <div className="text-sm">
                        {moeda(impactPreview?.valorAtual ?? 0)} → {moeda(impactPreview?.novoValor ?? 0)} ({moeda(impactPreview?.deltaValor ?? 0)})
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div>
                      <div className="text-sm text-slate-600">Valor adicionado</div>
                      <input className="input" value={valorAdicionado} onChange={(e) => setValorAdicionado(formatMoneyBRFromDigits(e.target.value))} />
                    </div>
                    <div className="md:col-span-2">
                      <div className="text-sm text-slate-600">Antes → Depois</div>
                      <div className="text-sm">
                        {moeda(impactPreview?.valorAtual ?? 0)} → {moeda(impactPreview?.novoValor ?? 0)} ({moeda(impactPreview?.deltaValor ?? 0)})
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            <div className="md:col-span-3">
              <div className="text-sm text-slate-600">Justificativa</div>
              <input className="input" value={justificativa} onChange={(e) => setJustificativa(e.target.value)} placeholder="Obrigatória para auditoria" />
            </div>
            <div className="md:col-span-3">
              <div className="text-sm text-slate-600">Descrição</div>
              <textarea className="input min-h-[90px]" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Detalhamento do aditivo" />
            </div>
          </div>

          {formErr ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{formErr}</div> : null}

          <div className="flex justify-end gap-2">
            <button className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50" type="button" onClick={() => setFormOpen(false)}>
              Cancelar
            </button>
            <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50" type="button" onClick={criarAditivo} disabled={!contratoId}>
              Salvar rascunho
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
