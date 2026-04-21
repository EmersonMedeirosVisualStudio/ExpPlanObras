"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/api";
import { realtimeClient } from "@/lib/realtime/client";

type ContratoLite = {
  id: number;
  contratoPrincipalId?: number | null;
  numeroContrato: string;
  nome: string | null;
  objeto: string | null;
  empresaParceiraNome: string | null;
  vigenciaAtual: string | null;
  valorTotalAtual: number | null;
};

type SubcontratoRow = {
  id: number;
  contratoPrincipalId: number;
  numeroContrato: string;
  empresaParceiraNome: string | null;
  empresaParceiraDocumento: string | null;
  objeto: string | null;
  status: "PLANEJADO" | "EM_EXECUCAO" | "AGUARDANDO" | "CONCLUIDO" | "BLOQUEADO";
  dataOS: string | null;
  vigenciaAtual: string | null;
  valorTotalAtual: number | null;
  indicadores: {
    valorContrato: number;
    totalMedidoAprovado: number;
    totalPago: number;
    aMedir: number;
    aPagar: number;
    percentualExecutado: number;
  };
  alertas: string[];
  createdAt: string;
  updatedAt: string;
};

type ResumoDTO = {
  contratoPrincipal: {
    id: number;
    numeroContrato: string;
    nome: string | null;
    objeto: string | null;
    empresaParceiraNome: string | null;
    vigenciaAtual: string | null;
    valorTotalAtual: number | null;
  };
  financeiro: {
    valorPrincipal: number;
    totalSubcontratado: number;
    saldoDisponivel: number;
    percentualComprometido: number;
  };
  alertas: string[];
};

type MedicaoRow = { id: number; contratoId: number; date: string; amount: number; status: "PENDENTE" | "APROVADO" | "REJEITADO" };
type PagamentoRow = { id: number; contratoId: number; medicaoId: number | null; date: string; amount: number };

type ContraparteLite = {
  idContraparte: number;
  tipo: "PJ" | "PF";
  nomeRazao: string;
  documento: string | null;
  status?: "ATIVO" | "INATIVO";
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

function toDateInputValue(v: unknown) {
  if (!v) return "";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function parseDateInput(s: string) {
  const v = String(s || "").trim();
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function pct(v: number) {
  const n = Number.isFinite(v) ? v : 0;
  return `${Math.round(n * 100)}%`;
}

export default function SubcontratosClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const contratoId = sp.get("contratoId");

  const [contratos, setContratos] = useState<ContratoLite[]>([]);
  const [contratosLoading, setContratosLoading] = useState(false);
  const [contratosErr, setContratosErr] = useState<string | null>(null);

  const [principalId, setPrincipalId] = useState<number | null>(contratoId ? Number(contratoId) : null);
  const [resumo, setResumo] = useState<ResumoDTO | null>(null);
  const [subs, setSubs] = useState<SubcontratoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return subs;
    return subs.filter((r) => {
      const a = `${r.numeroContrato} ${r.empresaParceiraNome || ""} ${r.objeto || ""}`.toLowerCase();
      return a.includes(s);
    });
  }, [subs, q]);

  const [subId, setSubId] = useState<number | null>(null);
  const subSelecionado = useMemo(() => subs.find((s) => s.id === subId) || null, [subs, subId]);

  const [tab, setTab] = useState<"GERAL" | "MEDICOES" | "PAGAMENTOS" | "HISTORICO">("GERAL");

  const [novoOpen, setNovoOpen] = useState(false);
  const [novoLoading, setNovoLoading] = useState(false);
  const [novoErr, setNovoErr] = useState<string | null>(null);
  const [nNumero, setNNumero] = useState("");
  const [nSubNome, setNSubNome] = useState("");
  const [nSubDoc, setNSubDoc] = useState("");
  const [nObjeto, setNObjeto] = useState("");
  const [nValor, setNValor] = useState("0,00");
  const [nInicio, setNInicio] = useState("");
  const [nFim, setNFim] = useState("");
  const [nStatus, setNStatus] = useState<SubcontratoRow["status"]>("EM_EXECUCAO");

  const [editLoading, setEditLoading] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);

  const [eSubNome, setESubNome] = useState("");
  const [eSubDoc, setESubDoc] = useState("");
  const [eObjeto, setEObjeto] = useState("");
  const [eValor, setEValor] = useState("0,00");
  const [eInicio, setEInicio] = useState("");
  const [eFim, setEFim] = useState("");
  const [eStatus, setEStatus] = useState<SubcontratoRow["status"]>("EM_EXECUCAO");

  const [empresaSugestoesOpen, setEmpresaSugestoesOpen] = useState(false);
  const [empresaSugestoesLoading, setEmpresaSugestoesLoading] = useState(false);
  const [empresaSugestoes, setEmpresaSugestoes] = useState<ContraparteLite[]>([]);

  const [medicoes, setMedicoes] = useState<MedicaoRow[]>([]);
  const [pagamentos, setPagamentos] = useState<PagamentoRow[]>([]);

  const [mDate, setMDate] = useState("");
  const [mAmount, setMAmount] = useState("0,00");
  const [mLoading, setMLoading] = useState(false);
  const [mErr, setMErr] = useState<string | null>(null);

  const [pDate, setPDate] = useState("");
  const [pAmount, setPAmount] = useState("0,00");
  const [pMedicaoId, setPMedicaoId] = useState("");
  const [pLoading, setPLoading] = useState(false);
  const [pErr, setPErr] = useState<string | null>(null);

  function syncQuery(id: number | null) {
    const params = new URLSearchParams(sp?.toString());
    if (id) params.set("contratoId", String(id));
    else params.delete("contratoId");
    const s = params.toString();
    router.push(`/dashboard/contratos/subcontratos${s ? `?${s}` : ""}`);
  }

  async function carregarContratos() {
    try {
      setContratosLoading(true);
      setContratosErr(null);
      const res = await api.get("/api/contratos");
      const rows = (res.data as any[]) || [];
      const norm: ContratoLite[] = rows
        .map((x) => ({
          id: Number(x.id),
          contratoPrincipalId: x.contratoPrincipalId == null ? null : Number(x.contratoPrincipalId),
          numeroContrato: String(x.numeroContrato),
          nome: x.nome ?? null,
          objeto: x.objeto ?? null,
          empresaParceiraNome: x.empresaParceiraNome ?? null,
          vigenciaAtual: x.vigenciaAtual ?? null,
          valorTotalAtual: x.valorTotalAtual == null ? null : Number(x.valorTotalAtual),
        }))
        .filter((c) => Number.isFinite(c.id) && !c.contratoPrincipalId);
      setContratos(norm);
    } catch (e: any) {
      setContratosErr(e?.response?.data?.message || e?.message || "Erro ao carregar contratos");
      setContratos([]);
    } finally {
      setContratosLoading(false);
    }
  }

  async function carregar() {
    if (!principalId) return;
    try {
      setLoading(true);
      setErr(null);
      const [resResumo, resSubs] = await Promise.all([
        api.get(`/api/contratos/${principalId}/subcontratos/resumo`),
        api.get(`/api/contratos/${principalId}/subcontratos`),
      ]);
      setResumo(resResumo.data as any);
      setSubs((resSubs.data as any[]) || []);
      if (subId) {
        const exists = ((resSubs.data as any[]) || []).some((r: any) => Number(r.id) === subId);
        if (!exists) setSubId(null);
      }
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao carregar subcontratos");
      setResumo(null);
      setSubs([]);
    } finally {
      setLoading(false);
    }
  }

  async function carregarFinanceiroContrato(contratoId: number) {
    try {
      const [mRes, pRes] = await Promise.all([api.get(`/api/contratos/${contratoId}/medicoes`), api.get(`/api/contratos/${contratoId}/pagamentos`)]);
      setMedicoes(((mRes.data as any[]) || []).map((r) => ({ ...r, id: Number(r.id), contratoId: Number(r.contratoId) })));
      setPagamentos(((pRes.data as any[]) || []).map((r) => ({ ...r, id: Number(r.id), contratoId: Number(r.contratoId), medicaoId: r.medicaoId == null ? null : Number(r.medicaoId) })));
    } catch {
      setMedicoes([]);
      setPagamentos([]);
    }
  }

  useEffect(() => {
    carregarContratos();
  }, []);

  useEffect(() => {
    if (principalId) syncQuery(principalId);
  }, [principalId]);

  useEffect(() => {
    if (!principalId) return;
    carregar();
    realtimeClient.start(["contratos", `contrato:${principalId}`]);
    const unsubs = [
      realtimeClient.subscribe("contratos", "contrato_atualizado", () => carregar()),
      realtimeClient.subscribe(`contrato:${principalId}`, "contrato_atualizado", () => carregar()),
    ];
    return () => {
      for (const u of unsubs) u();
    };
  }, [principalId]);

  useEffect(() => {
    if (!subSelecionado) return;
    setTab("GERAL");
    setEditErr(null);
    setESubNome(subSelecionado.empresaParceiraNome || "");
    setESubDoc(subSelecionado.empresaParceiraDocumento || "");
    setEObjeto(subSelecionado.objeto || "");
    setEValor(formatMoneyBRFromDigits(String(Math.round((subSelecionado.indicadores?.valorContrato || 0) * 100))));
    setEInicio(toDateInputValue(subSelecionado.dataOS));
    setEFim(toDateInputValue(subSelecionado.vigenciaAtual));
    setEStatus(subSelecionado.status);
    carregarFinanceiroContrato(subSelecionado.id);
  }, [subSelecionado?.id]);

  useEffect(() => {
    const q = String(eSubNome || "").trim();
    if (!q || q.length < 2) {
      setEmpresaSugestoes([]);
      setEmpresaSugestoesLoading(false);
      return;
    }

    let cancelled = false;
    setEmpresaSugestoesLoading(true);
    const t = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        params.set("q", q);
        params.set("status", "ATIVO");
        const res = await fetch(`/api/v1/engenharia/contrapartes?${params.toString()}`, { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.message || "Erro ao buscar empresas");
        if (cancelled) return;
        const rows: ContraparteLite[] = (Array.isArray(data) ? data : []).map((r: any) => ({
          idContraparte: Number(r.idContraparte),
          tipo: (r.tipo === "PF" ? "PF" : "PJ") as ContraparteLite["tipo"],
          nomeRazao: String(r.nomeRazao || ""),
          documento: r.documento ? String(r.documento) : null,
          status: (r.status === "INATIVO" ? "INATIVO" : "ATIVO") as NonNullable<ContraparteLite["status"]>,
        }));
        setEmpresaSugestoes(rows.filter((r: ContraparteLite) => Number.isFinite(r.idContraparte) && r.nomeRazao));
      } catch {
        if (cancelled) return;
        setEmpresaSugestoes([]);
      } finally {
        if (cancelled) return;
        setEmpresaSugestoesLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [eSubNome]);

  const principalFim = useMemo(() => {
    const v = resumo?.contratoPrincipal?.vigenciaAtual;
    if (!v) return null;
    const d = new Date(String(v));
    return Number.isNaN(d.getTime()) ? null : d;
  }, [resumo?.contratoPrincipal?.vigenciaAtual]);

  const novoFimDate = useMemo(() => parseDateInput(nFim), [nFim]);
  const editFimDate = useMemo(() => parseDateInput(eFim), [eFim]);

  const novoValorNum = useMemo(() => parseMoneyBR(nValor), [nValor]);
  const editValorNum = useMemo(() => parseMoneyBR(eValor), [eValor]);

  const alertNovoVigencia = useMemo(() => {
    if (!principalFim || !novoFimDate) return false;
    return novoFimDate.getTime() > principalFim.getTime();
  }, [principalFim, novoFimDate]);

  const alertEditVigencia = useMemo(() => {
    if (!principalFim || !editFimDate) return false;
    return editFimDate.getTime() > principalFim.getTime();
  }, [principalFim, editFimDate]);

  const alertNovoFinanceiro = useMemo(() => {
    const valorPrincipal = resumo?.financeiro?.valorPrincipal || 0;
    const totalAtual = resumo?.financeiro?.totalSubcontratado || 0;
    if (!valorPrincipal || valorPrincipal <= 0) return false;
    return totalAtual + novoValorNum > valorPrincipal;
  }, [resumo?.financeiro?.valorPrincipal, resumo?.financeiro?.totalSubcontratado, novoValorNum]);

  const alertEditFinanceiro = useMemo(() => {
    const valorPrincipal = resumo?.financeiro?.valorPrincipal || 0;
    const totalAtual = resumo?.financeiro?.totalSubcontratado || 0;
    if (!valorPrincipal || valorPrincipal <= 0) return false;
    const oldValor = subSelecionado?.indicadores?.valorContrato || 0;
    const novoTotal = totalAtual - oldValor + editValorNum;
    return novoTotal > valorPrincipal;
  }, [resumo?.financeiro?.valorPrincipal, resumo?.financeiro?.totalSubcontratado, subSelecionado?.id, editValorNum]);

  const principalSemValor = useMemo(() => {
    const valorPrincipal = resumo?.financeiro?.valorPrincipal || 0;
    return !valorPrincipal || valorPrincipal <= 0;
  }, [resumo?.financeiro?.valorPrincipal]);

  async function criarSubcontrato() {
    if (!principalId) return;
    if (principalSemValor || alertNovoFinanceiro || alertNovoVigencia) {
      const msgs: string[] = [];
      if (principalSemValor) msgs.push("ALERTA: contrato principal sem valor total definido. Não é possível validar o limite financeiro.");
      if (alertNovoFinanceiro) msgs.push("ALERTA: com esse valor, a soma dos subcontratos ultrapassa o valor total do contrato principal.");
      if (alertNovoVigencia) msgs.push("ALERTA: a data fim do subcontrato ultrapassa a vigência do contrato principal.");
      if (msgs.length && !window.confirm(`${msgs.join("\n")}\n\nDeseja criar mesmo assim?`)) return;
    }
    try {
      setNovoLoading(true);
      setNovoErr(null);
      const payload = {
        numeroContrato: nNumero.trim() ? nNumero.trim() : null,
        subcontratadaNome: nSubNome.trim(),
        subcontratadaDocumento: nSubDoc.trim() ? nSubDoc.trim() : null,
        objeto: nObjeto.trim(),
        valorTotal: parseMoneyBR(nValor),
        dataInicio: nInicio,
        dataFim: nFim,
        status: nStatus,
      };
      const res = await api.post(`/api/contratos/${principalId}/subcontratos`, payload);
      setNovoOpen(false);
      setNNumero("");
      setNSubNome("");
      setNSubDoc("");
      setNObjeto("");
      setNValor("0,00");
      setNInicio("");
      setNFim("");
      setNStatus("EM_EXECUCAO");
      await carregar();
      setSubId(Number((res.data as any)?.id) || null);
    } catch (e: any) {
      setNovoErr(e?.response?.data?.message || e?.message || "Erro ao criar subcontrato");
    } finally {
      setNovoLoading(false);
    }
  }

  async function salvarSubcontrato() {
    if (!principalId || !subSelecionado) return;
    if (principalSemValor || alertEditFinanceiro || alertEditVigencia) {
      const msgs: string[] = [];
      if (principalSemValor) msgs.push("ALERTA: contrato principal sem valor total definido. Não é possível validar o limite financeiro.");
      if (alertEditFinanceiro) msgs.push("ALERTA: com esse valor, a soma dos subcontratos ultrapassa o valor total do contrato principal.");
      if (alertEditVigencia) msgs.push("ALERTA: a data fim do subcontrato ultrapassa a vigência do contrato principal.");
      if (msgs.length && !window.confirm(`${msgs.join("\n")}\n\nDeseja salvar mesmo assim?`)) return;
    }
    try {
      setEditLoading(true);
      setEditErr(null);
      const payload = {
        subcontratadaNome: eSubNome.trim() ? eSubNome.trim() : null,
        subcontratadaDocumento: eSubDoc.trim() ? eSubDoc.trim() : null,
        objeto: eObjeto.trim() ? eObjeto.trim() : null,
        valorTotal: parseMoneyBR(eValor),
        dataInicio: eInicio || null,
        dataFim: eFim || null,
        status: eStatus,
      };
      await api.put(`/api/contratos/${principalId}/subcontratos/${subSelecionado.id}`, payload);
      await carregar();
    } catch (e: any) {
      setEditErr(e?.response?.data?.message || e?.message || "Erro ao salvar subcontrato");
    } finally {
      setEditLoading(false);
    }
  }

  async function excluirSubcontrato() {
    if (!principalId || !subSelecionado) return;
    if (!window.confirm("Excluir este subcontrato?")) return;
    try {
      setEditLoading(true);
      setEditErr(null);
      await api.delete(`/api/contratos/${principalId}/subcontratos/${subSelecionado.id}`);
      setSubId(null);
      await carregar();
    } catch (e: any) {
      setEditErr(e?.response?.data?.message || e?.message || "Erro ao excluir subcontrato");
    } finally {
      setEditLoading(false);
    }
  }

  async function criarMedicao() {
    if (!subSelecionado) return;
    try {
      setMLoading(true);
      setMErr(null);
      await api.post(`/api/contratos/${subSelecionado.id}/medicoes`, { date: mDate, amount: parseMoneyBR(mAmount), status: "PENDENTE" });
      setMDate("");
      setMAmount("0,00");
      await carregarFinanceiroContrato(subSelecionado.id);
      await carregar();
    } catch (e: any) {
      setMErr(e?.response?.data?.message || e?.message || "Erro ao criar medição");
    } finally {
      setMLoading(false);
    }
  }

  async function atualizarStatusMedicao(id: number, status: MedicaoRow["status"]) {
    if (!subSelecionado) return;
    try {
      await api.put(`/api/contratos/${subSelecionado.id}/medicoes/${id}`, { status });
      await carregarFinanceiroContrato(subSelecionado.id);
      await carregar();
    } catch (e: any) {
      setMErr(e?.response?.data?.message || e?.message || "Erro ao atualizar medição");
    }
  }

  async function criarPagamento() {
    if (!subSelecionado) return;
    try {
      setPLoading(true);
      setPErr(null);
      const medicaoId = pMedicaoId ? Number(pMedicaoId) : null;
      await api.post(`/api/contratos/${subSelecionado.id}/pagamentos`, { date: pDate, amount: parseMoneyBR(pAmount), medicaoId });
      setPDate("");
      setPAmount("0,00");
      setPMedicaoId("");
      await carregarFinanceiroContrato(subSelecionado.id);
      await carregar();
    } catch (e: any) {
      setPErr(e?.response?.data?.message || e?.message || "Erro ao criar pagamento");
    } finally {
      setPLoading(false);
    }
  }

  async function excluirPagamento(id: number) {
    if (!subSelecionado) return;
    if (!window.confirm("Excluir este pagamento?")) return;
    try {
      await api.delete(`/api/contratos/${subSelecionado.id}/pagamentos/${id}`);
      await carregarFinanceiroContrato(subSelecionado.id);
      await carregar();
    } catch (e: any) {
      setPErr(e?.response?.data?.message || e?.message || "Erro ao excluir pagamento");
    }
  }

  const medicoesAprovadas = useMemo(() => medicoes.filter((m) => m.status === "APROVADO"), [medicoes]);

  return (
    <div className="p-6 space-y-4 text-slate-900 dark:text-slate-100">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Subcontratos</h1>
          <div className="text-sm text-slate-600 dark:text-slate-300">Vincule subcontratos ao contrato principal e controle medições/pagamentos por subcontrato.</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-sm text-slate-600 dark:text-slate-300">Contrato principal</div>
          <select
            className="input min-w-[280px]"
            value={principalId ?? ""}
            onChange={(e) => setPrincipalId(e.target.value ? Number(e.target.value) : null)}
            disabled={contratosLoading}
          >
            <option value="">Selecione...</option>
            {contratos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.numeroContrato} {c.empresaParceiraNome ? `- ${c.empresaParceiraNome}` : ""}
              </option>
            ))}
          </select>
          <button className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800" type="button" onClick={carregarContratos}>
            Recarregar
          </button>
        </div>
      </div>

      {contratosErr ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{contratosErr}</div> : null}
      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      {principalId && resumo ? (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-[#e6edf5] bg-white p-4 shadow-sm dark:bg-slate-900 dark:border-slate-700">
            <div className="text-xs text-slate-500 dark:text-slate-300">Valor do contrato principal</div>
            <div className="mt-1 text-xl font-semibold">{moeda(resumo.financeiro.valorPrincipal || 0)}</div>
          </div>
          <div className="rounded-xl border border-[#e6edf5] bg-white p-4 shadow-sm dark:bg-slate-900 dark:border-slate-700">
            <div className="text-xs text-slate-500 dark:text-slate-300">Total subcontratado</div>
            <div className="mt-1 text-xl font-semibold">{moeda(resumo.financeiro.totalSubcontratado || 0)}</div>
          </div>
          <div className="rounded-xl border border-[#e6edf5] bg-white p-4 shadow-sm dark:bg-slate-900 dark:border-slate-700">
            <div className="text-xs text-slate-500 dark:text-slate-300">Saldo disponível</div>
            <div className="mt-1 text-xl font-semibold">{moeda(resumo.financeiro.saldoDisponivel || 0)}</div>
          </div>
          <div className="rounded-xl border border-[#e6edf5] bg-white p-4 shadow-sm dark:bg-slate-900 dark:border-slate-700">
            <div className="text-xs text-slate-500 dark:text-slate-300">% comprometido</div>
            <div className="mt-1 text-xl font-semibold">{pct(resumo.financeiro.percentualComprometido || 0)}</div>
          </div>
          {resumo.alertas?.length ? (
            <div className="md:col-span-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <div className="font-semibold">Alertas</div>
              <ul className="mt-2 list-disc pl-6">
                {resumo.alertas.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {principalId ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <section className="rounded-xl border bg-white p-4 shadow-sm dark:bg-slate-900 dark:border-slate-700">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold">Listagem</div>
              <button className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white" type="button" onClick={() => setNovoOpen(true)}>
                Novo subcontrato
              </button>
            </div>
            <div className="mt-3">
              <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por código/empresa/objeto" />
            </div>
            <div className="mt-3 overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  <tr>
                    <th className="px-3 py-2">Código</th>
                    <th className="px-3 py-2">Subcontratada</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="text-slate-900 dark:text-slate-100">
                  {filtered.map((r) => (
                    <tr
                      key={r.id}
                      className={`border-t cursor-pointer hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/60 ${r.id === subId ? "bg-slate-50 dark:bg-slate-800/60" : ""}`}
                      onClick={() => setSubId(r.id)}
                    >
                      <td className="px-3 py-2 font-semibold">
                        {r.numeroContrato}
                        {r.alertas?.length ? <div className="text-xs text-red-600 dark:text-red-300">⚠ {r.alertas[0]}</div> : null}
                      </td>
                      <td className="px-3 py-2">{r.empresaParceiraNome || "—"}</td>
                      <td className="px-3 py-2">{r.status.replace("_", " ")}</td>
                      <td className="px-3 py-2 text-right">{moeda(r.indicadores?.valorContrato || 0)}</td>
                    </tr>
                  ))}
                  {!filtered.length ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-slate-500 dark:text-slate-300">
                        {loading ? "Carregando..." : "Nenhum subcontrato encontrado."}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border bg-white p-4 shadow-sm lg:col-span-2 dark:bg-slate-900 dark:border-slate-700">
            {!subSelecionado ? (
              <div className="text-sm text-slate-600 dark:text-slate-300">Selecione um subcontrato na lista.</div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div>
                    <div className="text-lg font-semibold">
                      {subSelecionado.numeroContrato} {subSelecionado.empresaParceiraNome ? `- ${subSelecionado.empresaParceiraNome}` : ""}
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-300">
                      Valor: {moeda(subSelecionado.indicadores.valorContrato || 0)} • Executado: {pct(subSelecionado.indicadores.percentualExecutado || 0)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800"
                      type="button"
                      onClick={() => router.push(`/dashboard/contratos/aditivos?contratoId=${subSelecionado.id}`)}
                    >
                      Aditivos/Eventos
                    </button>
                    <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50" type="button" onClick={salvarSubcontrato} disabled={editLoading}>
                      {editLoading ? "Salvando..." : "Salvar alterações"}
                    </button>
                  </div>
                </div>

                {editErr ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{editErr}</div> : null}

                <div className="flex gap-2 flex-wrap">
                  <button className={`rounded-lg px-3 py-2 text-sm ${tab === "GERAL" ? "bg-blue-600 text-white" : "border bg-white hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800"}`} type="button" onClick={() => setTab("GERAL")}>
                    Geral
                  </button>
                  <button className={`rounded-lg px-3 py-2 text-sm ${tab === "MEDICOES" ? "bg-blue-600 text-white" : "border bg-white hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800"}`} type="button" onClick={() => setTab("MEDICOES")}>
                    Medições
                  </button>
                  <button className={`rounded-lg px-3 py-2 text-sm ${tab === "PAGAMENTOS" ? "bg-blue-600 text-white" : "border bg-white hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800"}`} type="button" onClick={() => setTab("PAGAMENTOS")}>
                    Pagamentos
                  </button>
                  <button className={`rounded-lg px-3 py-2 text-sm ${tab === "HISTORICO" ? "bg-blue-600 text-white" : "border bg-white hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800"}`} type="button" onClick={() => setTab("HISTORICO")}>
                    Histórico
                  </button>
                  <div className="flex-1" />
                  <button className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-red-700 hover:bg-red-50 dark:bg-slate-900 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/30" type="button" onClick={excluirSubcontrato} disabled={editLoading}>
                    Excluir
                  </button>
                </div>

                {tab === "GERAL" ? (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <div className="text-sm text-slate-600 dark:text-slate-300">Subcontratada (autocompletar)</div>
                      <div className="relative">
                        <input
                          className="input"
                          value={eSubNome}
                          onChange={(e) => {
                            setESubNome(e.target.value);
                            setEmpresaSugestoesOpen(true);
                          }}
                          onFocus={() => setEmpresaSugestoesOpen(true)}
                          onBlur={() => window.setTimeout(() => setEmpresaSugestoesOpen(false), 150)}
                          placeholder="Digite nome ou documento"
                        />
                        {empresaSugestoesOpen ? (
                          <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border bg-white shadow-lg dark:bg-slate-900 dark:border-slate-700">
                            {empresaSugestoesLoading ? (
                              <div className="px-3 py-2 text-sm text-slate-600 dark:text-slate-300">Buscando…</div>
                            ) : empresaSugestoes.length ? (
                              <div className="max-h-64 overflow-auto">
                                {empresaSugestoes.slice(0, 30).map((r) => (
                                  <button
                                    key={r.idContraparte}
                                    type="button"
                                    className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                      setESubNome(r.nomeRazao);
                                      setESubDoc(r.documento ? String(r.documento) : "");
                                      setEmpresaSugestoesOpen(false);
                                    }}
                                  >
                                    <div className="font-semibold text-slate-900 dark:text-slate-100">{r.nomeRazao}</div>
                                    <div className="text-xs text-slate-600 dark:text-slate-300">
                                      {r.tipo} {r.documento ? `• ${r.documento}` : ""}
                                    </div>
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <div className="px-3 py-2 text-sm text-slate-600 dark:text-slate-300">Nenhuma empresa encontrada.</div>
                            )}
                          </div>
                        ) : null}
                      </div>
                      <div className="mt-1">
                        <button className="text-xs font-semibold text-blue-700 hover:underline dark:text-blue-300" type="button" onClick={() => router.push("/dashboard/engenharia/contrapartes")}>
                          CRUD empresas
                        </button>
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-slate-600 dark:text-slate-300">Documento (CNPJ/CPF)</div>
                      <input className="input" value={eSubDoc} onChange={(e) => setESubDoc(e.target.value)} />
                    </div>
                    <div className="md:col-span-2">
                      <div className="text-sm text-slate-600 dark:text-slate-300">Objeto</div>
                      <textarea className="input min-h-[90px]" value={eObjeto} onChange={(e) => setEObjeto(e.target.value)} />
                    </div>
                    <div>
                      <div className="text-sm text-slate-600 dark:text-slate-300">Valor total</div>
                      <input className="input" value={eValor} onChange={(e) => setEValor(formatMoneyBRFromDigits(e.target.value))} />
                      {alertEditFinanceiro || principalSemValor ? (
                        <div className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                          {principalSemValor
                            ? "Alerta: contrato principal sem valor total definido (não dá para validar o limite)."
                            : "Alerta: com esse valor, a soma dos subcontratos ultrapassa o valor total do contrato principal."}
                        </div>
                      ) : null}
                    </div>
                    <div>
                      <div className="text-sm text-slate-600 dark:text-slate-300">Status</div>
                      <select className="input" value={eStatus} onChange={(e) => setEStatus(e.target.value as any)}>
                        <option value="PLANEJADO">Planejado</option>
                        <option value="EM_EXECUCAO">Em execução</option>
                        <option value="AGUARDANDO">Aguardando</option>
                        <option value="CONCLUIDO">Concluído</option>
                        <option value="BLOQUEADO">Bloqueado</option>
                      </select>
                    </div>
                    <div>
                      <div className="text-sm text-slate-600 dark:text-slate-300">Data início</div>
                      <input className="input" type="date" value={eInicio} onChange={(e) => setEInicio(e.target.value)} />
                    </div>
                    <div>
                      <div className="text-sm text-slate-600 dark:text-slate-300">Data fim</div>
                      <input className="input" type="date" value={eFim} onChange={(e) => setEFim(e.target.value)} />
                      {alertEditVigencia ? (
                        <div className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                          Alerta: a data fim ultrapassa a vigência do contrato principal.
                        </div>
                      ) : null}
                    </div>
                    {subSelecionado.alertas?.length ? (
                      <div className="md:col-span-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                        <div className="font-semibold">Alertas e pendências</div>
                        <ul className="mt-2 list-disc pl-6">
                          {subSelecionado.alertas.map((a) => (
                            <li key={a}>{a}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {tab === "MEDICOES" ? (
                  <div className="space-y-3">
                    {mErr ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{mErr}</div> : null}
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div>
                        <div className="text-sm text-slate-600 dark:text-slate-300">Data</div>
                        <input className="input" type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} />
                      </div>
                      <div>
                        <div className="text-sm text-slate-600 dark:text-slate-300">Valor</div>
                        <input className="input" value={mAmount} onChange={(e) => setMAmount(formatMoneyBRFromDigits(e.target.value))} />
                      </div>
                      <div className="flex items-end">
                        <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50" type="button" onClick={criarMedicao} disabled={mLoading || !mDate}>
                          {mLoading ? "Salvando..." : "Adicionar medição"}
                        </button>
                      </div>
                    </div>
                    <div className="overflow-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-slate-50 text-left text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          <tr>
                            <th className="px-3 py-2">Data</th>
                            <th className="px-3 py-2 text-right">Valor</th>
                            <th className="px-3 py-2">Status</th>
                          </tr>
                        </thead>
                        <tbody className="text-slate-900 dark:text-slate-100">
                          {medicoes.map((m) => (
                            <tr key={m.id} className="border-t dark:border-slate-700">
                              <td className="px-3 py-2">{new Date(m.date).toLocaleDateString("pt-BR")}</td>
                              <td className="px-3 py-2 text-right">{moeda(m.amount)}</td>
                              <td className="px-3 py-2">
                                <select className="input" value={m.status} onChange={(e) => atualizarStatusMedicao(m.id, e.target.value as any)}>
                                  <option value="PENDENTE">Pendente</option>
                                  <option value="APROVADO">Aprovado</option>
                                  <option value="REJEITADO">Rejeitado</option>
                                </select>
                              </td>
                            </tr>
                          ))}
                          {!medicoes.length ? (
                            <tr>
                              <td colSpan={3} className="px-3 py-6 text-center text-slate-500 dark:text-slate-300">
                                Nenhuma medição registrada.
                              </td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}

                {tab === "PAGAMENTOS" ? (
                  <div className="space-y-3">
                    {pErr ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{pErr}</div> : null}
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                      <div>
                        <div className="text-sm text-slate-600 dark:text-slate-300">Data</div>
                        <input className="input" type="date" value={pDate} onChange={(e) => setPDate(e.target.value)} />
                      </div>
                      <div>
                        <div className="text-sm text-slate-600 dark:text-slate-300">Valor</div>
                        <input className="input" value={pAmount} onChange={(e) => setPAmount(formatMoneyBRFromDigits(e.target.value))} />
                      </div>
                      <div>
                        <div className="text-sm text-slate-600 dark:text-slate-300">Vincular medição (opcional)</div>
                        <select className="input" value={pMedicaoId} onChange={(e) => setPMedicaoId(e.target.value)}>
                          <option value="">Sem vínculo</option>
                          {medicoesAprovadas.map((m) => (
                            <option key={m.id} value={String(m.id)}>
                              {new Date(m.date).toLocaleDateString("pt-BR")} - {moeda(m.amount)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-end">
                        <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50" type="button" onClick={criarPagamento} disabled={pLoading || !pDate}>
                          {pLoading ? "Salvando..." : "Adicionar pagamento"}
                        </button>
                      </div>
                    </div>
                    <div className="overflow-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-slate-50 text-left text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          <tr>
                            <th className="px-3 py-2">Data</th>
                            <th className="px-3 py-2 text-right">Valor</th>
                            <th className="px-3 py-2">Medição</th>
                            <th className="px-3 py-2" />
                          </tr>
                        </thead>
                        <tbody className="text-slate-900 dark:text-slate-100">
                          {pagamentos.map((p) => (
                            <tr key={p.id} className="border-t dark:border-slate-700">
                              <td className="px-3 py-2">{new Date(p.date).toLocaleDateString("pt-BR")}</td>
                              <td className="px-3 py-2 text-right">{moeda(p.amount)}</td>
                              <td className="px-3 py-2">{p.medicaoId ? `#${p.medicaoId}` : "—"}</td>
                              <td className="px-3 py-2 text-right">
                                <button className="text-sm text-red-700 hover:underline dark:text-red-300" type="button" onClick={() => excluirPagamento(p.id)}>
                                  Excluir
                                </button>
                              </td>
                            </tr>
                          ))}
                          {!pagamentos.length ? (
                            <tr>
                              <td colSpan={4} className="px-3 py-6 text-center text-slate-500 dark:text-slate-300">
                                Nenhum pagamento registrado.
                              </td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}

                {tab === "HISTORICO" ? (
                  <div className="space-y-3">
                    <div className="rounded-lg border bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                      O histórico completo (eventos, observações e anexos) fica na tela de Aditivos/Eventos do contrato selecionado.
                    </div>
                    <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" type="button" onClick={() => router.push(`/dashboard/contratos/aditivos?contratoId=${subSelecionado.id}`)}>
                      Abrir Histórico (Eventos/Observações/Anexos)
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </section>
        </div>
      ) : null}

      {novoOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setNovoOpen(false)}>
          <div className="w-full max-w-3xl rounded-xl border bg-white p-4 shadow-xl dark:bg-slate-900 dark:border-slate-700" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <div className="text-lg font-semibold">Novo subcontrato</div>
                <div className="text-sm text-slate-600 dark:text-slate-300">O subcontrato ficará vinculado ao contrato principal selecionado.</div>
              </div>
              <div className="flex gap-2">
                <button className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800" type="button" onClick={() => setNovoOpen(false)}>
                  Cancelar
                </button>
                <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50" type="button" onClick={criarSubcontrato} disabled={novoLoading}>
                  {novoLoading ? "Salvando..." : "Criar"}
                </button>
              </div>
            </div>

            {novoErr ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{novoErr}</div> : null}

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <div className="text-sm text-slate-600 dark:text-slate-300">Código (opcional)</div>
                <input className="input" value={nNumero} onChange={(e) => setNNumero(e.target.value)} placeholder="Ex: SUB-001/2026" />
              </div>
              <div>
                <div className="text-sm text-slate-600 dark:text-slate-300">Status</div>
                <select className="input" value={nStatus} onChange={(e) => setNStatus(e.target.value as any)}>
                  <option value="PLANEJADO">Planejado</option>
                  <option value="EM_EXECUCAO">Em execução</option>
                  <option value="AGUARDANDO">Aguardando</option>
                  <option value="CONCLUIDO">Concluído</option>
                  <option value="BLOQUEADO">Bloqueado</option>
                </select>
              </div>
              <div>
                <div className="text-sm text-slate-600 dark:text-slate-300">Subcontratada</div>
                <input className="input" value={nSubNome} onChange={(e) => setNSubNome(e.target.value)} />
              </div>
              <div>
                <div className="text-sm text-slate-600 dark:text-slate-300">Documento</div>
                <input className="input" value={nSubDoc} onChange={(e) => setNSubDoc(e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <div className="text-sm text-slate-600 dark:text-slate-300">Objeto</div>
                <textarea className="input min-h-[90px]" value={nObjeto} onChange={(e) => setNObjeto(e.target.value)} />
              </div>
              <div>
                <div className="text-sm text-slate-600 dark:text-slate-300">Valor total</div>
                <input className="input" value={nValor} onChange={(e) => setNValor(formatMoneyBRFromDigits(e.target.value))} />
                {alertNovoFinanceiro || principalSemValor ? (
                  <div className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                    {principalSemValor
                      ? "Alerta: contrato principal sem valor total definido (não dá para validar o limite)."
                      : "Alerta: com esse valor, a soma dos subcontratos ultrapassa o valor total do contrato principal."}
                  </div>
                ) : null}
              </div>
              <div>
                <div className="text-sm text-slate-600 dark:text-slate-300">Data início</div>
                <input className="input" type="date" value={nInicio} onChange={(e) => setNInicio(e.target.value)} />
              </div>
              <div>
                <div className="text-sm text-slate-600 dark:text-slate-300">Data fim</div>
                <input className="input" type="date" value={nFim} onChange={(e) => setNFim(e.target.value)} />
                {alertNovoVigencia ? (
                  <div className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                    Alerta: a data fim ultrapassa a vigência do contrato principal.
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
