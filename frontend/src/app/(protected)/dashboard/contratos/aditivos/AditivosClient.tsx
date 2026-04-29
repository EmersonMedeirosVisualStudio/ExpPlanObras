"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/api";
import { realtimeClient } from "@/lib/realtime/client";

type AditivoRow = {
  id: number;
  numeroAditivo: string;
  tipo: "PRAZO" | "VALOR" | "REPROGRAMACAO" | "AMBOS";
  alterouPlanilha?: boolean;
  status: "RASCUNHO" | "APROVADO" | "CANCELADO";
  dataAssinatura: string | null;
  dataInicioVigencia?: string | null;
  dataFimVigencia?: string | null;
  justificativa: string | null;
  descricao: string | null;
  prazoAdicionadoDias: number | null;
  valorTotalAdicionado: number | null;
  snapshotPrazoDias: number | null;
  snapshotVigenciaAtual: string | null;
  snapshotValorTotalAtual: number | null;
  snapshotPlanilhaVersao?: number | null;
  planilhaVersaoNova?: number | null;
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
  const raw = String(input || "").trim();
  const neg = raw.startsWith("-");
  const s = raw
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.]/g, "");
  const n = Number(s);
  const v = Number.isFinite(n) ? n : 0;
  return neg ? -Math.abs(v) : v;
}

function formatMoneyBRFromDigits(digits: string) {
  const onlyDigits = (digits || "").replace(/\D/g, "");
  const cents = onlyDigits ? Number(onlyDigits) : 0;
  const value = cents / 100;
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatMoneyBRFromInput(input: string) {
  const raw = String(input || "").trim();
  const neg = raw.startsWith("-");
  const digits = raw.replace(/\D/g, "");
  const cents = digits ? Number(digits) : 0;
  const value = cents / 100;
  const formatted = value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (!neg) return formatted;
  if (cents === 0) return formatted;
  return `-${formatted}`;
}

function addDays(dateIso: string, days: number) {
  const base = new Date(`${String(dateIso).slice(0, 10)}T00:00:00`);
  const result = new Date(base);
  result.setDate(result.getDate() + Number(days || 0));
  return result.toISOString().slice(0, 10);
}

function parseDateInput(s: string) {
  const v = String(s || "").trim();
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateOnlyMs(d: Date) {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0);
}

function tipoLabel(tipo: AditivoRow["tipo"]) {
  const t = String(tipo || "").toUpperCase();
  if (t === "PRAZO") return "Prazo";
  if (t === "VALOR") return "Valor";
  if (t === "REPROGRAMACAO") return "Reprogramação";
  if (t === "AMBOS") return "Prazo + Valor";
  return t || "—";
}

function statusLabel(status: AditivoRow["status"]) {
  if (status === "APROVADO") return "Vigente";
  if (status === "CANCELADO") return "Encerrado";
  return "Rascunho";
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
  const returnTo = sp.get("returnTo");
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

  const [consolidado, setConsolidado] = useState<Consolidado | null>(null);
  const [aditivos, setAditivos] = useState<AditivoRow[]>([]);
  const [eventos, setEventos] = useState<EventoRow[]>([]);

  const [filtroContrato, setFiltroContrato] = useState(true);
  const [filtroAditivos, setFiltroAditivos] = useState(true);
  const [filtroObras, setFiltroObras] = useState(true);
  const [filtroDocumentos, setFiltroDocumentos] = useState(false);
  const [filtroObservacoes, setFiltroObservacoes] = useState(true);
  const [filtroTextoDraft, setFiltroTextoDraft] = useState("");
  const [filtroDesdeDraft, setFiltroDesdeDraft] = useState("");
  const [filtroAteDraft, setFiltroAteDraft] = useState("");
  const [filtroTexto, setFiltroTexto] = useState("");
  const [filtroDesde, setFiltroDesde] = useState("");
  const [filtroAte, setFiltroAte] = useState("");

  const [obsTexto, setObsTexto] = useState("");
  const [obsNivel, setObsNivel] = useState<"NORMAL" | "ALERTA" | "CRITICO">("NORMAL");
  const [obsFiles, setObsFiles] = useState<File[]>([]);
  const [filePreview, setFilePreview] = useState<{ file: File; url: string } | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [numeroAditivo, setNumeroAditivo] = useState("1");
  const [tipo, setTipo] = useState<"PRAZO" | "VALOR" | "REPROGRAMACAO">("PRAZO");
  const [alterouPlanilha, setAlterouPlanilha] = useState(false);
  const [dataAssinatura, setDataAssinatura] = useState("");
  const [dataInicioVigencia, setDataInicioVigencia] = useState("");
  const [dataFimVigencia, setDataFimVigencia] = useState("");
  const [prazoAdicionadoDias, setPrazoAdicionadoDias] = useState("");
  const [prazoUnidade, setPrazoUnidade] = useState<"DIAS" | "MESES" | "ANOS">("DIAS");
  const [valorTotalDefinido, setValorTotalDefinido] = useState("0,00");
  const [justificativa, setJustificativa] = useState("");
  const [descricao, setDescricao] = useState("");
  const [docPdf, setDocPdf] = useState<File | null>(null);
  const [formErr, setFormErr] = useState<string | null>(null);

  function setQuery(next: Record<string, string | null | undefined>) {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) {
      if (!v) p.delete(k);
      else p.set(k, v);
    }
    const s = p.toString();
    router.push(`/dashboard/contratos/aditivos${s ? `?${s}` : ""}`);
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
          texto: filtroTexto ? filtroTexto : undefined,
          desde: filtroDesde ? filtroDesde : undefined,
          ate: filtroAte ? filtroAte : undefined,
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
    carregarContratoSelecionado();
  }, [contratoId]);

  useEffect(() => {
    if (tab !== "eventos") return;
    carregarEventos();
  }, [tab, contratoId, filtroContrato, filtroAditivos, filtroObras, filtroDocumentos, filtroObservacoes, filtroTexto, filtroDesde, filtroAte]);

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
  }, [contratoId, tab, filtroContrato, filtroAditivos, filtroObras, filtroDocumentos, filtroObservacoes, filtroTexto, filtroDesde, filtroAte]);

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

  const prazoAddDias = useMemo(() => {
    const q = Math.trunc(Number(prazoAdicionadoDias || 0));
    if (!q || q <= 0) return 0;
    if (prazoUnidade === "MESES") return q * 30;
    if (prazoUnidade === "ANOS") return q * 365;
    return q;
  }, [prazoAdicionadoDias, prazoUnidade]);

  const assinaturaAditivo = useMemo(() => parseDateInput(dataAssinatura), [dataAssinatura]);
  const assinaturaContrato = useMemo(() => {
    const v = consolidado?.contrato?.dataAssinatura;
    if (!v) return null;
    const d = new Date(String(v));
    return Number.isNaN(d.getTime()) ? null : d;
  }, [consolidado?.contrato?.dataAssinatura]);
  const vigenciaContrato = useMemo(() => {
    const v = consolidado?.contrato?.vigenciaAtual;
    if (!v) return null;
    const d = new Date(String(v));
    return Number.isNaN(d.getTime()) ? null : d;
  }, [consolidado?.contrato?.vigenciaAtual]);

  const assinaturaErr = useMemo(() => {
    if (!formOpen) return null;
    if (!assinaturaAditivo) return "Data de assinatura é obrigatória.";
    const hoje = dateOnlyMs(new Date());
    const a = dateOnlyMs(assinaturaAditivo);
    if (a > hoje) return "A data de assinatura não pode ser no futuro.";
    if (assinaturaContrato) {
      const c = dateOnlyMs(assinaturaContrato);
      if (a < c) return "A data do aditivo deve ser maior ou igual à data de assinatura do contrato.";
    }
    if (vigenciaContrato) {
      const v = dateOnlyMs(vigenciaContrato);
      if (a > v) return "A data do aditivo não pode ultrapassar a vigência atual do contrato.";
    }
    return null;
  }, [formOpen, assinaturaAditivo, assinaturaContrato, vigenciaContrato]);

  useEffect(() => {
    if (!formOpen) return;
    if (tipo === "VALOR") setAlterouPlanilha(true);
    if (tipo === "PRAZO") setAlterouPlanilha(false);
    if (tipo === "REPROGRAMACAO") setAlterouPlanilha(true);

    if (tipo !== "PRAZO") {
      setPrazoAdicionadoDias("");
      setPrazoUnidade("DIAS");
      setDataInicioVigencia("");
      setDataFimVigencia("");
    }
    if (tipo !== "VALOR") {
      setValorTotalDefinido("0,00");
    }
  }, [formOpen, tipo]);

  useEffect(() => {
    if (!formOpen) return;
    if (tipo !== "PRAZO") return;
    if (!dataFimVigencia) return;
    const base = consolidado?.contrato?.vigenciaAtual ? String(consolidado.contrato.vigenciaAtual).slice(0, 10) : null;
    if (!base) return;
    const b = parseDateInput(base);
    const f = parseDateInput(dataFimVigencia);
    if (!b || !f) return;
    const diff = Math.round((dateOnlyMs(f) - dateOnlyMs(b)) / (24 * 3600 * 1000));
    if (diff > 0) {
      setPrazoAdicionadoDias(String(diff));
      setPrazoUnidade("DIAS");
    }
  }, [formOpen, tipo, dataFimVigencia, consolidado?.contrato?.vigenciaAtual]);

  const impactPreview = useMemo(() => {
    const c = consolidado?.contrato;
    if (!c) return null;
    const prazoAtual = c.prazoDias == null ? null : Number(c.prazoDias);
    const vigAtual = c.vigenciaAtual ? String(c.vigenciaAtual).slice(0, 10) : null;
    const novoPrazo = tipo === "PRAZO" ? (prazoAtual != null ? prazoAtual + prazoAddDias : prazoAddDias || null) : prazoAtual;
    const novaVig = tipo === "PRAZO" && vigAtual && prazoAddDias ? addDays(vigAtual, prazoAddDias) : null;

    const valorTotalAtual = c.valorTotalAtual == null ? 0 : Number(c.valorTotalAtual);
    const novoValor = tipo === "VALOR" ? parseMoneyBR(valorTotalDefinido) : valorTotalAtual;
    const deltaValor = tipo === "VALOR" ? novoValor - valorTotalAtual : 0;
    const variacaoPercent = valorTotalAtual > 0 && deltaValor !== 0 ? Number(((deltaValor / valorTotalAtual) * 100).toFixed(2)) : null;

    return {
      prazoAtual,
      vigAtual,
      novoPrazo,
      novaVigencia: tipo === "PRAZO" ? novaVig || vigAtual : vigAtual,
      valorAtual: valorTotalAtual,
      novoValor,
      deltaValor,
      deltaPrazo: tipo === "PRAZO" ? prazoAddDias : 0,
      variacaoPercent,
    };
  }, [consolidado, tipo, prazoAddDias, valorTotalDefinido]);

  async function criarAditivo() {
    if (!contratoId) return;
    try {
      setFormErr(null);
      if (assinaturaErr) {
        setFormErr(assinaturaErr);
        return;
      }
      const payload: any = {
        numeroAditivo: String(numeroAditivo).trim(),
        tipo,
        alterouPlanilha: tipo === "VALOR" ? true : Boolean(alterouPlanilha),
        dataAssinatura: new Date(`${dataAssinatura}T00:00:00`).toISOString(),
        dataInicioVigencia: dataInicioVigencia ? new Date(`${dataInicioVigencia}T00:00:00`).toISOString() : null,
        dataFimVigencia: dataFimVigencia ? new Date(`${dataFimVigencia}T00:00:00`).toISOString() : null,
        justificativa: justificativa || null,
        descricao: descricao || null,
      };
      if (tipo === "PRAZO") payload.prazoAdicionadoDias = prazoAddDias;
      if (tipo === "VALOR") {
        payload.valorTotalAdicionado = parseMoneyBR(valorTotalDefinido);
      }
      const res = await api.post(`/api/contratos/${contratoId}/aditivos`, payload);
      const aditivoId = Number((res.data as any)?.id || 0);
      if (docPdf && aditivoId) {
        const evRes = await api.post(`/api/contratos/${contratoId}/observacoes`, {
          texto: `Documento do aditivo ${String(numeroAditivo).trim()}`,
          nivel: "NORMAL",
          tipoOrigem: "ADITIVO",
          origemId: aditivoId,
        });
        const eventoId = Number((evRes.data as any)?.id || 0);
        if (eventoId) {
          const base64 = await fileToBase64(docPdf);
          await api.post(`/api/contratos/${contratoId}/eventos/${eventoId}/anexos`, {
            nomeArquivo: docPdf.name,
            mimeType: docPdf.type || "application/pdf",
            conteudoBase64: base64,
          });
        }
      }
      setFormOpen(false);
      setDocPdf(null);
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
    <div className="p-6 space-y-6 bg-[#f7f8fa] text-slate-900">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Aditivos de Contrato</h1>
          <div className="text-sm text-slate-600">Gerencie aditivos com histórico, snapshot e aplicação no contrato.</div>
        </div>
        <button
          className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50"
          type="button"
          onClick={() => {
            if (returnTo) router.push(returnTo);
            else if (contratoId) router.push(`/dashboard/contratos?id=${contratoId}`);
            else router.push("/dashboard/contratos");
          }}
        >
          {contratoId || returnTo ? "Voltar ao contrato" : "Voltar para Contratos"}
        </button>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      {!contratoId ? (
        <section className="rounded-xl border border-[#e6edf5] bg-white p-4 shadow-sm space-y-2">
          <div className="text-sm font-semibold">Abra pelo contrato</div>
          <div className="text-sm text-slate-600">A tela de aditivos é acessada pelo contrato selecionado.</div>
        </section>
      ) : (
        <section className="rounded-xl border border-[#e6edf5] bg-white p-4 shadow-sm space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <div className="text-sm text-slate-500">Contrato</div>
              <div className="text-lg font-semibold">
                {String((consolidado as any)?.contrato?.numeroContrato || "—")} — {String((consolidado as any)?.contrato?.nome || (consolidado as any)?.contrato?.objeto || "—")}
              </div>
              <div className="text-sm text-slate-600">
                {String((consolidado as any)?.contrato?.empresaParceiraNome || "Sem empresa")} • Vigência:{" "}
                {(consolidado as any)?.contrato?.vigenciaAtual ? new Date((consolidado as any).contrato.vigenciaAtual).toLocaleDateString("pt-BR") : "—"} • Valor atual:{" "}
                {moeda(Number((consolidado as any)?.contrato?.valorTotalAtual || 0))} • Planilha v
                {Math.trunc(Number((consolidado as any)?.contrato?.planilhaVersao ?? 1))}
              </div>
            </div>
            <div className="flex gap-2">
              <button className={`rounded-lg px-3 py-2 text-sm ${tab === "dashboard" ? "bg-slate-900 text-white" : "border bg-white hover:bg-slate-50"}`} type="button" onClick={() => setQuery({ tab: "dashboard" })}>
                Dashboard
              </button>
              <button className={`rounded-lg px-3 py-2 text-sm ${tab === "lista" ? "bg-slate-900 text-white" : "border bg-white hover:bg-slate-50"}`} type="button" onClick={() => setQuery({ tab: "lista" })}>
                Aditivos
              </button>
              <button className={`rounded-lg px-3 py-2 text-sm ${tab === "eventos" ? "bg-slate-900 text-white" : "border bg-white hover:bg-slate-50"}`} type="button" onClick={() => setQuery({ tab: "eventos" })}>
                Eventos
              </button>
            </div>
          </div>

          {tab === "dashboard" ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div className="rounded-xl border border-[#e6edf5] bg-white p-4">
                <div className="text-xs text-slate-500">Valor total atual</div>
                <div className="text-xl font-semibold">{moeda(consolidado?.kpis?.valorTotalAtual ?? 0)}</div>
              </div>
              <div className="rounded-xl border border-[#e6edf5] bg-white p-4">
                <div className="text-xs text-slate-500">Executado</div>
                <div className="text-xl font-semibold">{moeda(consolidado?.kpis?.valorExecutado ?? 0)}</div>
              </div>
              <div className="rounded-xl border border-[#e6edf5] bg-white p-4">
                <div className="text-xs text-slate-500">Saldo</div>
                <div className="text-xl font-semibold">{moeda((consolidado?.kpis?.valorTotalAtual ?? 0) - (consolidado?.kpis?.valorExecutado ?? 0))}</div>
              </div>
              <div className="rounded-xl border border-[#e6edf5] bg-white p-4">
                <div className="text-xs text-slate-500">Aditivos em aberto</div>
                <div className="text-xl font-semibold">{consolidado?.kpis?.aditivosEmAberto ?? 0}</div>
              </div>
            </div>
          ) : null}

          {tab === "lista" ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-sm font-semibold">Aditivos</div>
                <button className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white" type="button" onClick={() => setFormOpen(true)}>
                  Novo aditivo
                </button>
              </div>
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-slate-700">
                    <tr>
                      <th className="px-3 py-2">Nº</th>
                      <th className="px-3 py-2">Tipo</th>
                      <th className="px-3 py-2">Valor</th>
                      <th className="px-3 py-2">Δ Prazo</th>
                      <th className="px-3 py-2">Δ Planilha</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aditivos.map((a) => (
                      <tr key={a.id} className="border-t">
                        <td className="px-3 py-2 font-semibold">{a.numeroAditivo}</td>
                        <td className="px-3 py-2">{tipoLabel(a.tipo)}</td>
                        <td className="px-3 py-2">
                          {(() => {
                            if (a.tipo !== "VALOR" && a.tipo !== "AMBOS") return "—";
                            if (a.valorTotalAdicionado == null) return "—";
                            const v = Number(a.valorTotalAdicionado);
                            if (!Number.isFinite(v) || v <= 0) return "—";
                            return moeda(v);
                          })()}
                        </td>
                        <td className="px-3 py-2">
                          {(() => {
                            const d = a.prazoAdicionadoDias == null ? 0 : Number(a.prazoAdicionadoDias);
                            if (!d) return "—";
                            if (d > 0) return `+${d} dias`;
                            return `${d} dias`;
                          })()}
                        </td>
                        <td className="px-3 py-2">
                          {(() => {
                            const alterou = Boolean(a.alterouPlanilha) || a.tipo === "VALOR" || a.tipo === "AMBOS";
                            if (!alterou) return "❌";
                            if (a.planilhaVersaoNova) return `✅ v${a.planilhaVersaoNova}`;
                            return "✅";
                          })()}
                        </td>
                        <td className="px-3 py-2">{statusLabel(a.status)}</td>
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
                        <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
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
                  <div className="text-sm font-semibold text-slate-700">Filtro:</div>
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
                      setFiltroTextoDraft("");
                      setFiltroDesdeDraft("");
                      setFiltroAteDraft("");
                      setFiltroTexto("");
                      setFiltroDesde("");
                      setFiltroAte("");
                    }}
                  >
                    Limpar
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-12">
                  <div className="md:col-span-6">
                    <div className="text-xs text-slate-600">Buscar</div>
                    <input className="input bg-white text-slate-900" value={filtroTextoDraft} onChange={(e) => setFiltroTextoDraft(e.target.value)} placeholder="Pesquisar por texto" />
                  </div>
                  <div className="md:col-span-2">
                    <div className="text-xs text-slate-600">Desde</div>
                    <input className="input bg-white text-slate-900" type="date" value={filtroDesdeDraft} onChange={(e) => setFiltroDesdeDraft(e.target.value)} />
                  </div>
                  <div className="md:col-span-2">
                    <div className="text-xs text-slate-600">Até</div>
                    <input className="input bg-white text-slate-900" type="date" value={filtroAteDraft} onChange={(e) => setFiltroAteDraft(e.target.value)} />
                  </div>
                  <div className="md:col-span-2 flex items-end gap-2 justify-end">
                    <button
                      className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-50"
                      type="button"
                      disabled={loading}
                      onClick={() => {
                        setFiltroTexto(String(filtroTextoDraft || "").trim());
                        setFiltroDesde(String(filtroDesdeDraft || "").trim());
                        setFiltroAte(String(filtroAteDraft || "").trim());
                      }}
                    >
                      Aplicar
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-sm font-semibold">Adicionar observação</div>
                  <select className="input bg-white text-slate-900" value={obsNivel} onChange={(e) => setObsNivel(e.target.value as any)}>
                    <option value="NORMAL">Normal</option>
                    <option value="ALERTA">Alerta</option>
                    <option value="CRITICO">Crítico</option>
                  </select>
                </div>
                <textarea className="input min-h-[90px] bg-white text-slate-900" value={obsTexto} onChange={(e) => setObsTexto(e.target.value)} placeholder="Digite sua observação..." />
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
      )}

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
        <section className="rounded-xl border border-[#e6edf5] bg-white p-4 shadow-sm space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold">Novo aditivo (rascunho)</div>
            <button
              className="rounded-lg border bg-white px-3 py-1 text-sm hover:bg-slate-50"
              type="button"
              onClick={() => {
                setFormOpen(false);
                setDocPdf(null);
              }}
            >
              Fechar
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <div className="text-sm text-slate-600">Número</div>
              <input className="input bg-white text-slate-900" value={numeroAditivo} onChange={(e) => setNumeroAditivo(e.target.value)} placeholder="Ex: 1" />
            </div>
            <div>
              <div className="text-sm text-slate-600">Tipo</div>
              <select className="input bg-white text-slate-900" value={tipo} onChange={(e) => setTipo(e.target.value as any)}>
                <option value="PRAZO">Prazo</option>
                <option value="VALOR">Valor</option>
                <option value="REPROGRAMACAO">Reprogramação de Planilha</option>
              </select>
            </div>
            <div>
              <div className="text-sm text-slate-600">Data assinatura</div>
              <input className="input bg-white text-slate-900" type="date" value={dataAssinatura} onChange={(e) => setDataAssinatura(e.target.value)} />
              {assinaturaErr ? (
                <div className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{assinaturaErr}</div>
              ) : null}
            </div>

            <div className="md:col-span-3">
              <div className="text-sm text-slate-600">Alterou planilha?</div>
              <div className="flex items-center gap-3 flex-wrap">
                <select
                  className="input bg-white text-slate-900"
                  value={alterouPlanilha ? "SIM" : "NAO"}
                  onChange={(e) => setAlterouPlanilha(e.target.value === "SIM")}
                  disabled={tipo === "VALOR"}
                >
                  <option value="SIM">Sim</option>
                  <option value="NAO">Não</option>
                </select>
                {tipo === "VALOR" ? <div className="text-xs text-slate-600">Tipo = Valor → Alterou planilha é obrigatório (travado em Sim).</div> : null}
              </div>
            </div>

            {tipo === "PRAZO" ? (
              <div className="md:col-span-3 rounded-lg border border-[#e6edf5] bg-white p-3">
                <div className="text-sm font-semibold">Prazo</div>
                <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-6">
                  <div className="md:col-span-2">
                    <div className="text-sm text-slate-600">Início vigência do aditivo</div>
                    <input className="input bg-white text-slate-900" type="date" value={dataInicioVigencia} onChange={(e) => setDataInicioVigencia(e.target.value)} />
                  </div>
                  <div className="md:col-span-2">
                    <div className="text-sm text-slate-600">Fim vigência do aditivo</div>
                    <input className="input bg-white text-slate-900" type="date" value={dataFimVigencia} onChange={(e) => setDataFimVigencia(e.target.value)} />
                  </div>
                  <div className="md:col-span-2">
                    <div className="text-sm text-slate-600">Δ Prazo</div>
                    <div className="grid grid-cols-2 gap-2">
                      <input className="input bg-white text-slate-900" value={prazoAdicionadoDias} onChange={(e) => setPrazoAdicionadoDias(e.target.value)} placeholder="Ex: 2" />
                      <select className="input bg-white text-slate-900" value={prazoUnidade} onChange={(e) => setPrazoUnidade(e.target.value as any)}>
                        <option value="DIAS">Dias</option>
                        <option value="MESES">Meses</option>
                        <option value="ANOS">Anos</option>
                      </select>
                    </div>
                    <div className="mt-1 text-xs text-slate-600">{prazoAddDias ? `Equivale a ${prazoAddDias} dias` : "—"}</div>
                  </div>
                  <div className="md:col-span-3">
                    <div className="text-sm text-slate-600">Antes → Depois</div>
                    <div className="text-sm">
                      {(impactPreview?.prazoAtual ?? "—")} → {(impactPreview?.novoPrazo ?? "—")} ({impactPreview?.deltaPrazo ? `+${impactPreview.deltaPrazo}` : "+0"} dias)
                    </div>
                  </div>
                  <div className="md:col-span-3">
                    <div className="text-sm text-slate-600">Vigência atual</div>
                    <div className="text-sm">
                      {(impactPreview?.vigAtual ?? "—")} → {(impactPreview?.novaVigencia ?? "—")}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {tipo === "VALOR" ? (
              <div className="md:col-span-3 rounded-lg border border-[#e6edf5] bg-white p-3">
                <div className="text-sm font-semibold">Valor</div>
                <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div>
                    <div className="text-sm text-slate-600">Valor total (após aditivo)</div>
                    <input className="input bg-white text-slate-900" value={valorTotalDefinido} onChange={(e) => setValorTotalDefinido(formatMoneyBRFromInput(e.target.value))} />
                  </div>
                  <div className="md:col-span-2">
                    <div className="text-sm text-slate-600">Antes → Depois</div>
                    <div className="text-sm">
                      {moeda(impactPreview?.valorAtual ?? 0)} → {moeda(impactPreview?.novoValor ?? 0)} ({(impactPreview?.deltaValor ?? 0) >= 0 ? "+" : "-"}
                      {moeda(Math.abs(impactPreview?.deltaValor ?? 0))})
                    </div>
                    <div className="mt-1 text-xs text-slate-600">Variação: {impactPreview?.variacaoPercent == null ? "—" : `${impactPreview.variacaoPercent}%`}</div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="md:col-span-3">
              <div className="text-sm text-slate-600">Justificativa</div>
              <input className="input bg-white text-slate-900" value={justificativa} onChange={(e) => setJustificativa(e.target.value)} placeholder="Obrigatória para auditoria" />
            </div>
            <div className="md:col-span-3">
              <div className="text-sm text-slate-600">Descrição</div>
              <textarea className="input min-h-[90px] bg-white text-slate-900" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Detalhamento do aditivo" />
            </div>
            <div className="md:col-span-3">
              <div className="text-sm text-slate-600">Documento (PDF)</div>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => {
                    const file = (e.target.files || [])[0] || null;
                    setDocPdf(file);
                  }}
                />
                {docPdf ? (
                  <button className="rounded-lg border bg-white px-3 py-1 text-sm hover:bg-slate-50" type="button" onClick={() => setDocPdf(null)}>
                    Remover
                  </button>
                ) : null}
              </div>
              {docPdf ? <div className="mt-1 text-xs text-slate-600">📎 {docPdf.name}</div> : null}
            </div>
          </div>

          {formErr ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{formErr}</div> : null}

          <div className="flex justify-end gap-2">
            <button
              className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50"
              type="button"
              onClick={() => {
                setFormOpen(false);
                setDocPdf(null);
              }}
            >
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
