"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/api";
import { realtimeClient } from "@/lib/realtime/client";

type ContratoRow = {
  id: number;
  numeroContrato: string;
  nome: string | null;
  objeto: string | null;
  contratoPrincipalId?: number | null;
  tipoPapel?: "CONTRATADO" | "CONTRATANTE" | null;
  tipoContratante: "PUBLICO" | "PRIVADO" | "PF";
  empresaParceiraNome: string | null;
  empresaParceiraDocumento?: string | null;
  descricao?: string | null;
  status: string;
  statusCalculado?: "EM_ANDAMENTO" | "A_VENCER" | "VENCIDO" | "CONCLUIDO" | "SEM_RECURSOS" | "NAO_INICIADO" | "CANCELADO";
  alerta?: "OK" | "PENDENTE" | "CRITICO";
  alertas?: string[];
  dataAssinatura: string | null;
  dataOS: string | null;
  prazoDias: number | null;
  vigenciaInicial: string | null;
  vigenciaAtual: string | null;
  valorConcedenteInicial?: number | null;
  valorProprioInicial?: number | null;
  valorTotalInicial: number | null;
  valorConcedenteAtual?: number | null;
  valorProprioAtual?: number | null;
  valorTotalAtual: number | null;
  createdAt: string;
  updatedAt: string;
};

type ContratoDetail = ContratoRow & {
  obras: Array<{ id: number; name: string; status: string; valorPrevisto: number; createdAt: string; updatedAt: string }>;
  indicadores?: { valorExecutado: number | null; valorPago: number | null };
};

type ContratoVinculadoRow = {
  id: number;
  numeroContrato: string;
  empresaParceiraNome: string | null;
  status: string;
  valorTotalAtual: number | null;
};

type AditivoLiteRow = {
  id: number;
  numeroAditivo: string;
  tipo: "PRAZO" | "VALOR" | "REPROGRAMACAO" | string;
  status: string;
  dataAssinatura: string | null;
  prazoAdicionadoDias: number | null;
  valorTotalAdicionado: number | null;
  valorConcedenteAdicionado: number | null;
  valorProprioAdicionado: number | null;
};

type MedicaoLiteRow = {
  id: number;
  contratoId: number;
  date: string;
  amount: number;
  status: "PENDENTE" | "APROVADO" | "REJEITADO";
};

type ContraparteLite = {
  idContraparte: number;
  tipo: "PJ" | "PF";
  nomeRazao: string;
  documento: string | null;
  status?: "ATIVO" | "INATIVO";
};

type StatusCalc = NonNullable<ContratoRow["statusCalculado"]>;

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type ApiEnvelope<T> = { success: boolean; message?: string; data: T };
function unwrapApiData<T>(json: any): T {
  if (json && typeof json === "object" && "data" in json) return (json as ApiEnvelope<T>).data;
  return json as T;
}

function onlyDigits(value: string) {
  return String(value || "").replace(/\D/g, "");
}

function formatCpfCnpj(value: string) {
  const d = onlyDigits(value).slice(0, 14);
  if (!d) return "";
  if (d.length <= 11) {
    const p1 = d.slice(0, 3);
    const p2 = d.slice(3, 6);
    const p3 = d.slice(6, 9);
    const p4 = d.slice(9, 11);
    let out = p1;
    if (p2) out += `.${p2}`;
    if (p3) out += `.${p3}`;
    if (p4) out += `-${p4}`;
    return out;
  }
  const p1 = d.slice(0, 2);
  const p2 = d.slice(2, 5);
  const p3 = d.slice(5, 8);
  const p4 = d.slice(8, 12);
  const p5 = d.slice(12, 14);
  let out = p1;
  if (p2) out += `.${p2}`;
  if (p3) out += `.${p3}`;
  if (p4) out += `/${p4}`;
  if (p5) out += `-${p5}`;
  return out;
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

function normalizeTipoContratante(v: unknown): ContratoRow["tipoContratante"] {
  const t = String(v || "PRIVADO").toUpperCase();
  if (t === "PUBLICO" || t === "PRIVADO" || t === "PF") return t;
  return "PRIVADO";
}

function parseDateOnlyValue(v: string | null) {
  const s = String(v || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function diffDays(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / (24 * 3600 * 1000));
}

function labelSubStatus(v: unknown) {
  const s = String(v || "").toUpperCase();
  if (s === "PLANEJADO") return "Planejado";
  if (s === "EM_EXECUCAO") return "Em execução";
  if (s === "AGUARDANDO") return "Aguardando";
  if (s === "CONCLUIDO") return "Concluído";
  if (s === "BLOQUEADO") return "Bloqueado";
  return s || "—";
}

function labelMedicaoStatus(v: unknown) {
  const s = String(v || "").toUpperCase();
  if (s === "PENDENTE") return "Pendente";
  if (s === "APROVADO") return "Aprovado";
  if (s === "REJEITADO") return "Rejeitado";
  return s || "—";
}

function formatAditivoImpacto(a: AditivoLiteRow) {
  const parts: string[] = [];
  const dias = a.prazoAdicionadoDias != null ? Number(a.prazoAdicionadoDias) : null;
  if (dias && Number.isFinite(dias) && dias !== 0) parts.push(`${dias > 0 ? "+" : ""}${dias} dias`);
  const vt = a.valorTotalAdicionado != null ? Number(a.valorTotalAdicionado) : null;
  const vc = a.valorConcedenteAdicionado != null ? Number(a.valorConcedenteAdicionado) : null;
  const vp = a.valorProprioAdicionado != null ? Number(a.valorProprioAdicionado) : null;
  if (vt && Number.isFinite(vt) && vt !== 0) parts.push(moeda(vt));
  else if ((vc && Number.isFinite(vc) && vc !== 0) || (vp && Number.isFinite(vp) && vp !== 0)) parts.push(`C:${moeda(vc || 0)} P:${moeda(vp || 0)}`);
  return parts.length ? parts.join(" • ") : "—";
}

function toDateInputValue(v: unknown) {
  if (!v) return "";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function alertaUi(alerta?: "OK" | "PENDENTE" | "CRITICO") {
  if (alerta === "CRITICO") return { icon: "✖", className: "text-red-600" };
  if (alerta === "PENDENTE") return { icon: "⚠", className: "text-amber-600" };
  return { icon: "✔", className: "text-emerald-600" };
}

function statusUi(status?: ContratoRow["statusCalculado"] | null) {
  const s = status || "EM_ANDAMENTO";
  switch (s) {
    case "A_VENCER":
      return { label: "A vencer", icon: "🟡", className: "text-amber-700" };
    case "VENCIDO":
      return { label: "Vencido", icon: "🔴", className: "text-red-700" };
    case "CONCLUIDO":
      return { label: "Concluído", icon: "🔵", className: "text-blue-700" };
    case "SEM_RECURSOS":
      return { label: "Sem recursos", icon: "🟣", className: "text-purple-700" };
    case "NAO_INICIADO":
      return { label: "Não iniciado", icon: "⚪", className: "text-slate-600" };
    case "CANCELADO":
      return { label: "Cancelado", icon: "⚫", className: "text-slate-800" };
    default:
      return { label: "Em andamento", icon: "🟢", className: "text-emerald-700" };
  }
}

const STATUS_FILTER_OPTIONS: Array<{ key: StatusCalc; label: string }> = [
  { key: "EM_ANDAMENTO", label: "Em andamento" },
  { key: "A_VENCER", label: "A vencer" },
  { key: "VENCIDO", label: "Vencido" },
  { key: "CONCLUIDO", label: "Concluído" },
  { key: "SEM_RECURSOS", label: "Sem recursos" },
  { key: "NAO_INICIADO", label: "Não iniciado" },
  { key: "CANCELADO", label: "Cancelado" },
];

function buildAllStatusSelected() {
  const next: Record<StatusCalc, boolean> = {} as any;
  for (const o of STATUS_FILTER_OPTIONS) next[o.key] = true;
  return next;
}

function parseStatusFilterParam(input: string | null): Record<StatusCalc, boolean> {
  const raw = String(input || "").trim();
  if (!raw) return buildAllStatusSelected();
  const parts = raw
    .split(/[,\s|]+/g)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  if (!parts.length) return buildAllStatusSelected();
  const next: Record<StatusCalc, boolean> = {} as any;
  for (const o of STATUS_FILTER_OPTIONS) next[o.key] = parts.includes(o.key);
  return next;
}

const OBRA_STATUS_COLOR_MAP: Record<string, string> = {
  AGUARDANDO_RECURSOS: "#EAB308",
  AGUARDANDO_CONTRATO: "#EAB308",
  AGUARDANDO_OS: "#F97316",
  NAO_INICIADA: "#9CA3AF",
  EM_ANDAMENTO: "#22C55E",
  PARADA: "#EF4444",
  FINALIZADA: "#3B82F6",
};

const OBRA_STATUS_LABEL_MAP: Record<string, string> = {
  AGUARDANDO_RECURSOS: "Aguardando recursos",
  AGUARDANDO_CONTRATO: "Aguardando assinatura",
  AGUARDANDO_OS: "Aguardando OS",
  NAO_INICIADA: "Não iniciada",
  EM_ANDAMENTO: "Em andamento",
  PARADA: "Parada",
  FINALIZADA: "Finalizada",
};

export default function ContratosClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const contratoId = sp.get("id");
  const urlStatus = sp.get("status");
  const urlQ = sp.get("q") || "";
  const urlContraparteId = sp.get("contraparteId");
  const urlPapel = sp.get("papel");
  const urlTipoContratante = sp.get("tipoContratante");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<ContratoRow[]>([]);
  const [contrapartes, setContrapartes] = useState<ContraparteLite[]>([]);
  const [contraparteFiltroId, setContraparteFiltroId] = useState<number | null>(() => {
    const n = urlContraparteId ? Number(urlContraparteId) : null;
    return n && Number.isFinite(n) ? n : null;
  });
  const [papelFiltro, setPapelFiltro] = useState<"" | "CONTRATADO" | "CONTRATANTE">(() => {
    const p = String(urlPapel || "").trim().toUpperCase();
    return p === "CONTRATADO" ? "CONTRATADO" : p === "CONTRATANTE" ? "CONTRATANTE" : "";
  });
  const [tipoContratanteFiltro, setTipoContratanteFiltro] = useState<"" | "PUBLICO" | "PRIVADO" | "PF">(() => {
    const t = String(urlTipoContratante || "").trim().toUpperCase();
    return t === "PUBLICO" ? "PUBLICO" : t === "PF" ? "PF" : t === "PRIVADO" ? "PRIVADO" : "";
  });
  const [filtrosOpen, setFiltrosOpen] = useState(false);

  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState<string | null>(null);
  const [detail, setDetail] = useState<ContratoDetail | null>(null);

  const [vinculadosLoading, setVinculadosLoading] = useState(false);
  const [vinculadosErr, setVinculadosErr] = useState<string | null>(null);
  const [vinculados, setVinculados] = useState<ContratoVinculadoRow[]>([]);

  const [aditivosLoading, setAditivosLoading] = useState(false);
  const [aditivosErr, setAditivosErr] = useState<string | null>(null);
  const [aditivos, setAditivos] = useState<AditivoLiteRow[]>([]);

  const [medicoesLoading, setMedicoesLoading] = useState(false);
  const [medicoesErr, setMedicoesErr] = useState<string | null>(null);
  const [medicoes, setMedicoes] = useState<MedicaoLiteRow[]>([]);

  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);

  const [eNumeroContrato, setENumeroContrato] = useState("");
  const [eNome, setENome] = useState("");
  const [eObjeto, setEObjeto] = useState("");
  const [eDescricao, setEDescricao] = useState("");
  const [eTipoContratante, setETipoContratante] = useState<ContratoRow["tipoContratante"]>("PRIVADO");
  const [eEmpresaParceiraNome, setEEmpresaParceiraNome] = useState("");
  const [eEmpresaParceiraDocumento, setEEmpresaParceiraDocumento] = useState("");
  const [empresaSugestoesOpen, setEmpresaSugestoesOpen] = useState(false);
  const [empresaSugestoesLoading, setEmpresaSugestoesLoading] = useState(false);
  const [empresaSugestoes, setEmpresaSugestoes] = useState<ContraparteLite[]>([]);
  const [eStatus, setEStatus] = useState("ATIVO");
  const [eDataAssinatura, setEDataAssinatura] = useState("");
  const [eDataOS, setEDataOS] = useState("");
  const [ePrazoValor, setEPrazoValor] = useState("");
  const [ePrazoUnidade, setEPrazoUnidade] = useState<"DIAS" | "MESES" | "ANOS">("DIAS");
  const [eVigenciaCalculada, setEVigenciaCalculada] = useState("");

  const [eValorConcedenteInicial, setEValorConcedenteInicial] = useState("0,00");
  const [eValorProprioInicial, setEValorProprioInicial] = useState("0,00");
  const [eValorConcedenteAtual, setEValorConcedenteAtual] = useState("0,00");
  const [eValorProprioAtual, setEValorProprioAtual] = useState("0,00");
  const [eValorTotalInicial, setEValorTotalInicial] = useState("0,00");
  const [eValorTotalAtual, setEValorTotalAtual] = useState("0,00");

  const [statusSel, setStatusSel] = useState<Record<StatusCalc, boolean>>(() => parseStatusFilterParam(urlStatus));
  const [q, setQ] = useState(urlQ);

  useEffect(() => {
    if (contratoId) return;
    setStatusSel(parseStatusFilterParam(urlStatus));
    setQ(urlQ);
    const n = urlContraparteId ? Number(urlContraparteId) : null;
    setContraparteFiltroId(n && Number.isFinite(n) ? n : null);
    const p = String(urlPapel || "").trim().toUpperCase();
    setPapelFiltro(p === "CONTRATADO" ? "CONTRATADO" : p === "CONTRATANTE" ? "CONTRATANTE" : "");
    const t = String(urlTipoContratante || "").trim().toUpperCase();
    setTipoContratanteFiltro(t === "PUBLICO" ? "PUBLICO" : t === "PF" ? "PF" : t === "PRIVADO" ? "PRIVADO" : "");
  }, [contratoId, urlStatus, urlQ, urlContraparteId, urlPapel, urlTipoContratante]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get("/api/v1/engenharia/contrapartes?status=ATIVO");
        const data = unwrapApiData<any>(res.data);
        if (cancelled) return;
        const rows: ContraparteLite[] = (Array.isArray(data) ? data : []).map((r: any) => ({
          idContraparte: Number(r.idContraparte),
          tipo: (r.tipo === "PF" ? "PF" : "PJ") as ContraparteLite["tipo"],
          nomeRazao: String(r.nomeRazao || ""),
          documento: r.documento ? String(r.documento) : null,
          status: (r.status === "INATIVO" ? "INATIVO" : "ATIVO") as NonNullable<ContraparteLite["status"]>,
        }));
        setContrapartes(rows.filter((r) => Number.isFinite(r.idContraparte) && r.idContraparte > 0 && r.nomeRazao));
      } catch {
        if (cancelled) return;
        setContrapartes([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const eIsPublico = eTipoContratante === "PUBLICO";
  const eBaseDate = useMemo(() => eDataOS || eDataAssinatura || "", [eDataOS, eDataAssinatura]);
  const ePrazoDias = useMemo(() => {
    const q = Math.trunc(Number(ePrazoValor || 0));
    if (!q || q <= 0) return 0;
    if (ePrazoUnidade === "MESES") return q * 30;
    if (ePrazoUnidade === "ANOS") return q * 365;
    return q;
  }, [ePrazoValor, ePrazoUnidade]);

  useEffect(() => {
    if (!editOpen) return;
    const q = String(eEmpresaParceiraNome || "").trim();
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
        const res = await api.get(`/api/v1/engenharia/contrapartes?${params.toString()}`);
        const data = res.data;
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
  }, [editOpen, eEmpresaParceiraNome]);

  useEffect(() => {
    if (!editOpen) return;
    if (!eBaseDate || !ePrazoDias || ePrazoDias <= 0) {
      setEVigenciaCalculada("");
      return;
    }
    const base = new Date(`${eBaseDate}T00:00:00`);
    if (Number.isNaN(base.getTime())) {
      setEVigenciaCalculada("");
      return;
    }
    const result = new Date(base);
    result.setDate(result.getDate() + ePrazoDias);
    setEVigenciaCalculada(result.toISOString().slice(0, 10));
  }, [editOpen, eBaseDate, ePrazoDias]);

  useEffect(() => {
    if (!editOpen || !eIsPublico) return;
    const total = parseMoneyBR(eValorConcedenteInicial) + parseMoneyBR(eValorProprioInicial);
    setEValorTotalInicial(formatMoneyBRFromDigits(String(Math.round(total * 100))));
  }, [editOpen, eIsPublico, eValorConcedenteInicial, eValorProprioInicial]);

  useEffect(() => {
    if (!editOpen || !eIsPublico) return;
    const total = parseMoneyBR(eValorConcedenteAtual) + parseMoneyBR(eValorProprioAtual);
    setEValorTotalAtual(formatMoneyBRFromDigits(String(Math.round(total * 100))));
  }, [editOpen, eIsPublico, eValorConcedenteAtual, eValorProprioAtual]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const totalSelected = Object.values(statusSel).filter(Boolean).length;
    const hasStatusFilter = totalSelected > 0 && totalSelected < STATUS_FILTER_OPTIONS.length;
    const contraparte = contraparteFiltroId ? contrapartes.find((c) => c.idContraparte === contraparteFiltroId) || null : null;
    const contraparteDocDigits = contraparte?.documento ? onlyDigits(contraparte.documento) : "";
    const contraparteNome = contraparte?.nomeRazao ? String(contraparte.nomeRazao).trim().toLowerCase() : "";
    return rows.filter((r) => {
      if (hasStatusFilter) {
        const s = (String(r.statusCalculado || "").toUpperCase() || "EM_ANDAMENTO") as StatusCalc;
        if (!statusSel[s]) return false;
      }
      if (papelFiltro) {
        const rp = String(r.tipoPapel || "").toUpperCase();
        if (rp !== papelFiltro) return false;
      }
      if (tipoContratanteFiltro) {
        const rt = String(r.tipoContratante || "").toUpperCase();
        if (rt !== tipoContratanteFiltro) return false;
      }
      if (contraparteFiltroId) {
        if (contraparteDocDigits) {
          const doc = onlyDigits(String(r.empresaParceiraDocumento || ""));
          if (!doc || doc !== contraparteDocDigits) return false;
        } else if (contraparteNome) {
          const nome = String(r.empresaParceiraNome || "").trim().toLowerCase();
          if (!nome || nome !== contraparteNome) return false;
        }
      }
      if (!qq) return true;
      const hay = `${r.numeroContrato || ""} ${r.nome || ""} ${r.objeto || ""} ${r.empresaParceiraNome || ""}`.toLowerCase();
      return hay.includes(qq);
    });
  }, [rows, q, statusSel, contraparteFiltroId, contrapartes, papelFiltro, tipoContratanteFiltro]);

  const statusAllSelected = useMemo(() => {
    return STATUS_FILTER_OPTIONS.every((o) => Boolean(statusSel[o.key]));
  }, [statusSel]);

  const filtrosAtivosCount = useMemo(() => {
    let c = 0;
    if (q.trim()) c += 1;
    if (contraparteFiltroId) c += 1;
    if (papelFiltro) c += 1;
    if (tipoContratanteFiltro) c += 1;
    if (!statusAllSelected) c += 1;
    return c;
  }, [contraparteFiltroId, papelFiltro, q, statusAllSelected, tipoContratanteFiltro]);

  const prazos = useMemo(() => {
    if (!detail) return { prazoInicialDias: null as number | null, prazoAtualDias: null as number | null, diasRestantes: null as number | null };
    const base = parseDateOnlyValue(detail.dataOS || detail.dataAssinatura || null);
    const vigInicial = parseDateOnlyValue(detail.vigenciaInicial);
    const vigAtual = parseDateOnlyValue(detail.vigenciaAtual);
    const prazoInicialDias = base && vigInicial ? Math.max(0, diffDays(base, vigInicial)) : null;
    const prazoAtualDias = base && vigAtual ? Math.max(0, diffDays(base, vigAtual)) : prazoInicialDias;
    const hoje = parseDateOnlyValue(new Date().toISOString());
    const diasRestantes = hoje && vigAtual ? Math.max(0, diffDays(hoje, vigAtual)) : null;
    return { prazoInicialDias, prazoAtualDias, diasRestantes };
  }, [detail]);

  function limparFiltros() {
    setQ("");
    setContraparteFiltroId(null);
    setPapelFiltro("");
    setTipoContratanteFiltro("");
    setStatusSel(buildAllStatusSelected());
  }

  async function carregarLista() {
    try {
      setLoading(true);
      setErr(null);
      const res = await api.get("/api/contratos", { params: { apenasPrincipais: "true" } });
      setRows(
        ((res.data as any[]) ?? [])
          .map((x) => ({
            ...x,
            tipoContratante: normalizeTipoContratante(x.tipoContratante),
            prazoDias: x.prazoDias == null ? null : Number(x.prazoDias),
            valorConcedenteInicial: x.valorConcedenteInicial == null ? null : Number(x.valorConcedenteInicial),
            valorProprioInicial: x.valorProprioInicial == null ? null : Number(x.valorProprioInicial),
            valorTotalInicial: x.valorTotalInicial == null ? null : Number(x.valorTotalInicial),
            valorConcedenteAtual: x.valorConcedenteAtual == null ? null : Number(x.valorConcedenteAtual),
            valorProprioAtual: x.valorProprioAtual == null ? null : Number(x.valorProprioAtual),
            valorTotalAtual: x.valorTotalAtual == null ? null : Number(x.valorTotalAtual),
          }))
          .filter((x) => !x?.contratoPrincipalId) ?? []
      );
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao carregar contratos");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function carregarDetalhe(id: string) {
    if (!id) return;
    try {
      setDetailLoading(true);
      setDetailErr(null);
      const res = await api.get(`/api/contratos/${id}`);
      const d = res.data as any;
      setDetail({
        ...d,
        tipoContratante: normalizeTipoContratante(d.tipoContratante),
        prazoDias: d.prazoDias == null ? null : Number(d.prazoDias),
        valorConcedenteInicial: d.valorConcedenteInicial == null ? null : Number(d.valorConcedenteInicial),
        valorProprioInicial: d.valorProprioInicial == null ? null : Number(d.valorProprioInicial),
        valorTotalInicial: d.valorTotalInicial == null ? null : Number(d.valorTotalInicial),
        valorConcedenteAtual: d.valorConcedenteAtual == null ? null : Number(d.valorConcedenteAtual),
        valorProprioAtual: d.valorProprioAtual == null ? null : Number(d.valorProprioAtual),
        valorTotalAtual: d.valorTotalAtual == null ? null : Number(d.valorTotalAtual),
        obras: (d.obras || []).map((o: any) => ({ ...o, valorPrevisto: Number(o.valorPrevisto || 0) })),
      });
    } catch (e: any) {
      setDetail(null);
      setDetailErr(e?.response?.data?.message || e?.message || "Erro ao carregar contrato");
    } finally {
      setDetailLoading(false);
    }
  }

  async function carregarVinculados(id: string) {
    if (!id) return;
    try {
      setVinculadosLoading(true);
      setVinculadosErr(null);
      const res = await api.get(`/api/contratos/${id}/subcontratos`);
      const rows = (res.data as any[]) || [];
      setVinculados(
        rows
          .map((r: any) => ({
            id: Number(r.id),
            numeroContrato: String(r.numeroContrato || ""),
            empresaParceiraNome: r.empresaParceiraNome ? String(r.empresaParceiraNome) : null,
            status: String(r.status || ""),
            valorTotalAtual: r.valorTotalAtual == null ? null : Number(r.valorTotalAtual),
          }))
          .filter((r: ContratoVinculadoRow) => Number.isFinite(r.id) && r.id > 0)
      );
    } catch (e: any) {
      setVinculados([]);
      setVinculadosErr(e?.response?.data?.message || e?.message || "Erro ao carregar contratos vinculados");
    } finally {
      setVinculadosLoading(false);
    }
  }

  async function carregarAditivos(id: string) {
    if (!id) return;
    try {
      setAditivosLoading(true);
      setAditivosErr(null);
      const res = await api.get(`/api/contratos/${id}/aditivos`);
      const rows = (res.data as any[]) || [];
      setAditivos(
        rows
          .map((r: any) => ({
            id: Number(r.id),
            numeroAditivo: String(r.numeroAditivo || ""),
            tipo: String(r.tipo || ""),
            status: String(r.status || ""),
            dataAssinatura: r.dataAssinatura ? String(r.dataAssinatura) : null,
            prazoAdicionadoDias: r.prazoAdicionadoDias == null ? null : Number(r.prazoAdicionadoDias),
            valorTotalAdicionado: r.valorTotalAdicionado == null ? null : Number(r.valorTotalAdicionado),
            valorConcedenteAdicionado: r.valorConcedenteAdicionado == null ? null : Number(r.valorConcedenteAdicionado),
            valorProprioAdicionado: r.valorProprioAdicionado == null ? null : Number(r.valorProprioAdicionado),
          }))
          .filter((r: AditivoLiteRow) => Number.isFinite(r.id) && r.id > 0)
      );
    } catch (e: any) {
      setAditivos([]);
      setAditivosErr(e?.response?.data?.message || e?.message || "Erro ao carregar aditivos");
    } finally {
      setAditivosLoading(false);
    }
  }

  async function carregarMedicoes(id: string) {
    if (!id) return;
    try {
      setMedicoesLoading(true);
      setMedicoesErr(null);
      const res = await api.get(`/api/contratos/${id}/medicoes`);
      const rows = (res.data as any[]) || [];
      setMedicoes(
        rows
          .map((r: any) => ({
            id: Number(r.id),
            contratoId: Number(r.contratoId),
            date: String(r.date || ""),
            amount: Number(r.amount || 0),
            status: (String(r.status || "PENDENTE").toUpperCase() as any) || "PENDENTE",
          }))
          .filter((r: MedicaoLiteRow) => Number.isFinite(r.id) && r.id > 0)
      );
    } catch (e: any) {
      setMedicoes([]);
      setMedicoesErr(e?.response?.data?.message || e?.message || "Erro ao carregar medições");
    } finally {
      setMedicoesLoading(false);
    }
  }

  async function carregarRelacionados(id: string) {
    await Promise.all([carregarVinculados(id), carregarAditivos(id), carregarMedicoes(id)]);
  }

  useEffect(() => {
    carregarLista();
  }, []);

  useEffect(() => {
    realtimeClient.start(["contratos"]);
    const unsubs = [
      realtimeClient.subscribe("contratos", "contrato_atualizado", () => {
        carregarLista();
        if (contratoId) {
          carregarDetalhe(contratoId);
          carregarRelacionados(contratoId);
        }
      }),
      realtimeClient.subscribe("contratos", "evento_criado", () => {
        if (contratoId) {
          carregarDetalhe(contratoId);
          carregarRelacionados(contratoId);
        }
      }),
      realtimeClient.subscribe("contratos", "anexo_criado", () => {
        if (contratoId) {
          carregarDetalhe(contratoId);
          carregarRelacionados(contratoId);
        }
      }),
    ];
    return () => {
      for (const u of unsubs) u();
    };
  }, [contratoId]);

  useEffect(() => {
    if (contratoId) {
      carregarDetalhe(contratoId);
      carregarRelacionados(contratoId);
    } else {
      setDetail(null);
      setDetailErr(null);
      setVinculados([]);
      setVinculadosErr(null);
      setAditivos([]);
      setAditivosErr(null);
      setMedicoes([]);
      setMedicoesErr(null);
    }
  }, [contratoId]);

  function abrirEdicao() {
    if (!contratoId) return;
    router.push(`/dashboard/contratos/novo?id=${contratoId}`);
  }

  async function salvarEdicao() {
    if (!contratoId) return;
    try {
      setEditLoading(true);
      setEditErr(null);
      if (!eBaseDate || !ePrazoDias || ePrazoDias <= 0) {
        setEditErr("Informe a data base (OS ou Assinatura) e o prazo (dias).");
        return;
      }

      const vti = parseMoneyBR(eValorTotalInicial);
      const vta = parseMoneyBR(eValorTotalAtual);
      if (vti <= 0 || vta <= 0) {
        setEditErr("Valor total do contrato deve ser maior que zero.");
        return;
      }

      const payload: any = {
        numeroContrato: eNumeroContrato,
        nome: eNome || null,
        objeto: eObjeto || null,
        descricao: eDescricao || null,
        tipoContratante: eTipoContratante,
        empresaParceiraNome: eEmpresaParceiraNome || null,
        empresaParceiraDocumento: eEmpresaParceiraDocumento || null,
        status: eStatus || null,
        dataAssinatura: eDataAssinatura ? new Date(`${eDataAssinatura}T00:00:00`).toISOString() : null,
        dataOS: eDataOS ? new Date(`${eDataOS}T00:00:00`).toISOString() : null,
        prazoDias: ePrazoDias,
        vigenciaInicial: eVigenciaCalculada ? new Date(`${eVigenciaCalculada}T00:00:00`).toISOString() : null,
        vigenciaAtual: eVigenciaCalculada ? new Date(`${eVigenciaCalculada}T00:00:00`).toISOString() : null,
        valorConcedenteInicial: eIsPublico ? parseMoneyBR(eValorConcedenteInicial) : null,
        valorProprioInicial: eIsPublico ? parseMoneyBR(eValorProprioInicial) : null,
        valorTotalInicial: parseMoneyBR(eValorTotalInicial),
        valorConcedenteAtual: eIsPublico ? parseMoneyBR(eValorConcedenteAtual) : null,
        valorProprioAtual: eIsPublico ? parseMoneyBR(eValorProprioAtual) : null,
        valorTotalAtual: parseMoneyBR(eValorTotalAtual),
      };

      await api.put(`/api/contratos/${contratoId}`, payload);
      setEditOpen(false);
      await carregarLista();
      await carregarDetalhe(contratoId);
    } catch (e: any) {
      setEditErr(e?.response?.data?.message || e?.message || "Erro ao salvar alterações");
    } finally {
      setEditLoading(false);
    }
  }

  if (contratoId) {
    return (
      <div className="space-y-4 text-[#111827]">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">Contrato #{contratoId}</h1>
            <div className="text-sm text-[#6B7280]">Detalhes, financeiro e vínculos com obras.</div>
          </div>
          <div className="flex gap-2">
            <button
              className="rounded-lg bg-[#2563EB] px-3 py-2 text-sm text-white hover:bg-[#1D4ED8]"
              type="button"
              onClick={() => {
                const returnTo = encodeURIComponent(`/dashboard/contratos?id=${contratoId}`);
                router.push(`/dashboard/contratos/planejamento?id=${contratoId}&returnTo=${returnTo}`);
              }}
            >
              Planejamento (Gantt)
            </button>
            <button
              className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm text-[#111827] hover:bg-[#F9FAFB]"
              type="button"
              onClick={() => {
                const returnTo = encodeURIComponent(`/dashboard/contratos?id=${contratoId}`);
                router.push(`/dashboard/contratos/aditivos?contratoId=${contratoId}&returnTo=${returnTo}`);
              }}
            >
              Aditivos
            </button>
            <button
              className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm text-[#111827] hover:bg-[#F9FAFB]"
              type="button"
              onClick={() => {
                const returnTo = encodeURIComponent(`/dashboard/contratos?id=${contratoId}`);
                router.push(`/dashboard/contratos/medicoes?contratoId=${contratoId}&returnTo=${returnTo}`);
              }}
            >
              Medições
            </button>
            <button
              className="rounded-lg bg-[#2563EB] px-3 py-2 text-sm text-white hover:bg-[#1D4ED8] disabled:opacity-60"
              type="button"
              onClick={abrirEdicao}
              disabled={!detail}
            >
              Editar contrato
            </button>
            <button
              className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm text-[#111827] hover:bg-[#F9FAFB]"
              type="button"
              onClick={() => router.push("/dashboard/contratos")}
            >
              Voltar
            </button>
          </div>
        </div>

        {detailErr ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{detailErr}</div> : null}
        {detailLoading ? <div className="text-sm text-[#6B7280]">Carregando...</div> : null}

        {detail ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <section className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm lg:col-span-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm text-[#6B7280]">Número</div>
                  <div className="text-xl font-semibold">{detail.numeroContrato}</div>
                  <div className="mt-2 text-sm text-[#6B7280]">{detail.nome || detail.objeto || "—"}</div>
                </div>
                <button
                  className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm text-[#111827] hover:bg-[#F9FAFB] disabled:opacity-60"
                  type="button"
                  onClick={abrirEdicao}
                  disabled={!detail}
                >
                  Editar contrato
                </button>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-[#E5E7EB] bg-white p-3">
                  <div className="text-xs text-[#6B7280]">Status</div>
                  <div className={`font-semibold ${statusUi(detail.statusCalculado).className}`}>
                    {statusUi(detail.statusCalculado).icon} {statusUi(detail.statusCalculado).label}
                  </div>
                </div>
                <div className="rounded-lg border border-[#E5E7EB] bg-white p-3">
                  <div className="text-xs text-[#6B7280]">Vigência inicial</div>
                  <div className="font-semibold">{detail.vigenciaInicial ? new Date(detail.vigenciaInicial).toLocaleDateString("pt-BR") : "—"}</div>
                </div>
                <div className="rounded-lg border border-[#E5E7EB] bg-white p-3">
                  <div className="text-xs text-[#6B7280]">Vigência atual</div>
                  <div className="font-semibold">{detail.vigenciaAtual ? new Date(detail.vigenciaAtual).toLocaleDateString("pt-BR") : "—"}</div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-[#E5E7EB] bg-white p-3">
                  <div className="text-xs text-[#6B7280]">Prazo inicial</div>
                  <div className="font-semibold">{prazos.prazoInicialDias != null ? `${prazos.prazoInicialDias} dias` : "—"}</div>
                </div>
                <div className="rounded-lg border border-[#E5E7EB] bg-white p-3">
                  <div className="text-xs text-[#6B7280]">Prazo atual</div>
                  <div className="font-semibold">{prazos.prazoAtualDias != null ? `${prazos.prazoAtualDias} dias` : "—"}</div>
                </div>
                <div className="rounded-lg border border-[#E5E7EB] bg-white p-3">
                  <div className="text-xs text-[#6B7280]">Dias restantes</div>
                  <div className="font-semibold">{prazos.diasRestantes != null ? `${prazos.diasRestantes} dias` : "—"}</div>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm lg:col-span-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-sm font-semibold">{String(detail.tipoPapel || "").toUpperCase() === "CONTRATANTE" ? "Empresa contratada" : "Empresa contratante"}</div>
                <button
                  className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-1.5 text-xs text-[#111827] hover:bg-[#F9FAFB]"
                  type="button"
                  onClick={() => router.push("/dashboard/engenharia/contrapartes")}
                >
                  Empresa
                </button>
              </div>
              <div className="mt-3 space-y-2 text-sm">
                <div className="rounded-lg border border-[#E5E7EB] bg-white p-3">
                  <div className="text-xs text-[#6B7280]">Nome</div>
                  <div className="font-semibold">{detail.empresaParceiraNome || "—"}</div>
                </div>
                <div className="rounded-lg border border-[#E5E7EB] bg-white p-3">
                  <div className="text-xs text-[#6B7280]">Documento</div>
                  <div className="font-semibold">{detail.empresaParceiraDocumento || "—"}</div>
                </div>
                <div className="text-xs text-[#6B7280]">
                  {detail.empresaParceiraNome ? "Dados exibidos do contrato (empresaParceira)." : "Cadastre/selecione a empresa no Editar contrato para preencher estes dados."}
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm lg:col-span-3">
              <div className="text-sm font-semibold">Financeiro</div>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[#6B7280]">Valor atual</div>
                  <div className="font-semibold">{moeda(Number(detail.valorTotalAtual || 0))}</div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[#6B7280]">Executado (medições)</div>
                  <div className="font-semibold">{moeda(Number(detail.indicadores?.valorExecutado || 0))}</div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[#6B7280]">Pago</div>
                  <div className="font-semibold">{moeda(Number(detail.indicadores?.valorPago || 0))}</div>
                </div>
              </div>
            </section>

            {detail.alerta && detail.alerta !== "OK" ? (
              <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm lg:col-span-12">
                <div className="text-sm font-semibold">Alertas</div>
                <div className="mt-2 text-sm text-amber-800">
                  {(detail.alertas || []).length ? (
                    <ul className="list-disc pl-6">
                      {(detail.alertas || []).map((m) => (
                        <li key={m}>{m}</li>
                      ))}
                    </ul>
                  ) : (
                    "Pendências encontradas."
                  )}
                </div>
              </section>
            ) : null}

            <section className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm lg:col-span-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">Contratos vinculados</div>
                  <div className="text-xs text-[#6B7280]">Contratos que referenciam este contrato como principal.</div>
                </div>
                <div className="text-xs text-[#6B7280]">{vinculados.length}</div>
              </div>
              {vinculadosErr ? <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{vinculadosErr}</div> : null}
              {vinculadosLoading ? <div className="mt-2 text-xs text-[#6B7280]">Carregando...</div> : null}
              <div className="mt-3 overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-[#F9FAFB] text-left text-[#111827]">
                    <tr>
                      <th className="px-3 py-2">Número</th>
                      <th className="px-3 py-2">Contraparte</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vinculados.map((r) => (
                      <tr key={r.id} className="border-t border-[#E5E7EB] cursor-pointer hover:bg-[#F9FAFB]" onClick={() => router.push(`/dashboard/contratos?id=${r.id}`)}>
                        <td className="px-3 py-2 font-semibold">{r.numeroContrato || `#${r.id}`}</td>
                        <td className="px-3 py-2">{r.empresaParceiraNome || "—"}</td>
                        <td className="px-3 py-2">{labelSubStatus(r.status)}</td>
                        <td className="px-3 py-2 text-right">{moeda(Number(r.valorTotalAtual || 0))}</td>
                      </tr>
                    ))}
                    {!vinculados.length && !vinculadosLoading ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-[#6B7280]">
                          Nenhum contrato vinculado.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm lg:col-span-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">Aditivos</div>
                  <div className="text-xs text-[#6B7280]">Histórico de mudanças no contrato.</div>
                </div>
                <div className="text-xs text-[#6B7280]">{aditivos.length}</div>
              </div>
              {aditivosErr ? <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{aditivosErr}</div> : null}
              {aditivosLoading ? <div className="mt-2 text-xs text-[#6B7280]">Carregando...</div> : null}
              <div className="mt-3 overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-[#F9FAFB] text-left text-[#111827]">
                    <tr>
                      <th className="px-3 py-2">Nº</th>
                      <th className="px-3 py-2">Tipo</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Assinatura</th>
                      <th className="px-3 py-2 text-right">Impacto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aditivos.map((a) => (
                      <tr
                        key={a.id}
                        className="border-t border-[#E5E7EB] cursor-pointer hover:bg-[#F9FAFB]"
                        onClick={() => router.push(`/dashboard/contratos/aditivos?contratoId=${contratoId}&tab=lista`)}
                      >
                        <td className="px-3 py-2 font-semibold">{a.numeroAditivo || `#${a.id}`}</td>
                        <td className="px-3 py-2">{String(a.tipo || "").toUpperCase()}</td>
                        <td className="px-3 py-2">{String(a.status || "").toUpperCase()}</td>
                        <td className="px-3 py-2">{a.dataAssinatura ? new Date(a.dataAssinatura).toLocaleDateString("pt-BR") : "—"}</td>
                        <td className="px-3 py-2 text-right">{formatAditivoImpacto(a)}</td>
                      </tr>
                    ))}
                    {!aditivos.length && !aditivosLoading ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-[#6B7280]">
                          Nenhum aditivo cadastrado.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm lg:col-span-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">Medições realizadas</div>
                  <div className="text-xs text-[#6B7280]">Lançamentos de execução financeira do contrato.</div>
                </div>
                <div className="text-xs text-[#6B7280]">{medicoes.length}</div>
              </div>
              {medicoesErr ? <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{medicoesErr}</div> : null}
              {medicoesLoading ? <div className="mt-2 text-xs text-[#6B7280]">Carregando...</div> : null}
              <div className="mt-3 overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-[#F9FAFB] text-left text-[#111827]">
                    <tr>
                      <th className="px-3 py-2">Data</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {medicoes.map((m) => (
                      <tr key={m.id} className="border-t border-[#E5E7EB]">
                        <td className="px-3 py-2">{m.date ? new Date(m.date).toLocaleDateString("pt-BR") : "—"}</td>
                        <td className="px-3 py-2">{labelMedicaoStatus(m.status)}</td>
                        <td className="px-3 py-2 text-right">{moeda(Number(m.amount || 0))}</td>
                      </tr>
                    ))}
                    {!medicoes.length && !medicoesLoading ? (
                      <tr>
                        <td colSpan={3} className="px-3 py-6 text-center text-[#6B7280]">
                          Nenhuma medição cadastrada.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm lg:col-span-12">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-sm font-semibold">Obras vinculadas</div>
                <div className="text-xs text-[#6B7280]">Regra: toda obra tem contrato; um contrato pode ter várias obras.</div>
              </div>
              <div className="mt-3 overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-[#F9FAFB] text-left text-[#111827]">
                    <tr>
                      <th className="px-3 py-2">Obra</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2 text-right">Valor previsto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.obras.map((o) => (
                      <tr
                        key={o.id}
                        className="border-t border-[#E5E7EB] cursor-pointer hover:bg-[#F9FAFB]"
                        onClick={() => router.push(`/dashboard/engenharia/obras/cadastro?obraId=${o.id}`)}
                      >
                        <td className="px-3 py-2">{o.name}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: OBRA_STATUS_COLOR_MAP[o.status] || "#9CA3AF" }} />
                            <span>{OBRA_STATUS_LABEL_MAP[o.status] || o.status}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">{moeda(o.valorPrevisto)}</td>
                      </tr>
                    ))}
                    {!detail.obras.length ? (
                      <tr>
                        <td colSpan={3} className="px-3 py-6 text-center text-[#6B7280]">
                          Nenhuma obra vinculada a este contrato.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        ) : null}

        {editOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setEditOpen(false)}>
            <div className="w-full max-w-4xl rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <div className="text-lg font-semibold">Editar contrato</div>
                  <div className="text-sm text-[#6B7280]">Atualize dados básicos, datas e valores.</div>
                </div>
                <div className="flex gap-2">
                  <button className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm text-[#111827] hover:bg-[#F9FAFB]" type="button" onClick={() => setEditOpen(false)}>
                    Cancelar
                  </button>
                  <button
                    className="rounded-lg bg-[#2563EB] px-4 py-2 text-sm text-white hover:bg-[#1D4ED8] disabled:opacity-50"
                    type="button"
                    onClick={salvarEdicao}
                    disabled={editLoading}
                  >
                    {editLoading ? "Salvando..." : "Salvar alterações"}
                  </button>
                </div>
              </div>

              {editErr ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{editErr}</div> : null}

              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <section className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm space-y-3">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <div className="text-sm text-[#6B7280]">Número do contrato</div>
                      <input className="input" value={eNumeroContrato} onChange={(e) => setENumeroContrato(e.target.value)} />
                    </div>
                    <div>
                      <div className="text-sm text-[#6B7280]">Status</div>
                      <select className="input" value={eStatus} onChange={(e) => setEStatus(e.target.value)}>
                        <option value="ATIVO">Ativo</option>
                        <option value="PENDENTE">Pendente</option>
                        <option value="PARALISADO">Paralisado</option>
                        <option value="ENCERRADO">Encerrado</option>
                        <option value="FINALIZADO">Finalizado</option>
                        <option value="CANCELADO">Cancelado</option>
                        <option value="RESCINDIDO">Rescindido</option>
                      </select>
                    </div>
                    <div>
                      <div className="text-sm text-[#6B7280]">Tipo de contratante</div>
                      <select className="input" value={eTipoContratante} onChange={(e) => setETipoContratante(normalizeTipoContratante(e.target.value))}>
                        <option value="PUBLICO">Órgão público</option>
                        <option value="PRIVADO">Empresa privada (PJ)</option>
                        <option value="PF">Pessoa física (PF)</option>
                      </select>
                    </div>
                    <div>
                      <div className="text-sm text-[#6B7280]">Nome do contrato</div>
                      <input className="input" value={eNome} onChange={(e) => setENome(e.target.value)} />
                    </div>
                    <div className="md:col-span-2">
                      <div className="text-sm text-[#6B7280]">Objeto</div>
                      <textarea className="input min-h-[90px]" value={eObjeto} onChange={(e) => setEObjeto(e.target.value)} />
                    </div>
                    <div className="md:col-span-2">
                      <div className="text-sm text-[#6B7280]">Descrição</div>
                      <textarea className="input min-h-[90px]" value={eDescricao} onChange={(e) => setEDescricao(e.target.value)} />
                    </div>
                  </div>
                </section>

                <section className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm space-y-3">
                  <div className="text-sm font-semibold">Datas</div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div>
                      <div className="text-sm text-[#6B7280]">Data assinatura</div>
                      <input className="input" type="date" value={eDataAssinatura} onChange={(e) => setEDataAssinatura(e.target.value)} />
                    </div>
                    <div>
                      <div className="text-sm text-[#6B7280]">Data OS (preferencial)</div>
                      <input className="input" type="date" value={eDataOS} onChange={(e) => setEDataOS(e.target.value)} />
                    </div>
                    <div>
                      <div className="text-sm text-[#6B7280]">Prazo</div>
                      <div className="flex gap-2">
                        <input className="input" value={ePrazoValor} onChange={(e) => setEPrazoValor(e.target.value)} placeholder="Ex: 180" />
                        <select className="input w-[140px]" value={ePrazoUnidade} onChange={(e) => setEPrazoUnidade(e.target.value as any)}>
                          <option value="DIAS">Dias</option>
                          <option value="MESES">Meses</option>
                          <option value="ANOS">Anos</option>
                        </select>
                      </div>
                    </div>
                    <div className="md:col-span-3">
                      <div className="text-sm text-[#6B7280]">Vigência (calculada)</div>
                      <input className="input" value={eVigenciaCalculada || "—"} disabled />
                    </div>
                  </div>

                  <div className="mt-2 text-sm font-semibold">Contraparte</div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <div className="flex items-end justify-between gap-2">
                        <div className="text-sm text-[#6B7280]">Nome / Razão social (autocompletar)</div>
                        <button
                          className="text-xs font-semibold text-[#2563EB] hover:underline"
                          type="button"
                          onClick={() => router.push("/dashboard/engenharia/contrapartes")}
                        >
                          Gerenciar contrapartes
                        </button>
                      </div>
                      <div className="relative">
                        <input
                          className="input"
                          value={eEmpresaParceiraNome}
                          onChange={(e) => {
                            setEEmpresaParceiraNome(e.target.value);
                            setEmpresaSugestoesOpen(true);
                          }}
                          onFocus={() => setEmpresaSugestoesOpen(true)}
                          onBlur={() => window.setTimeout(() => setEmpresaSugestoesOpen(false), 150)}
                          placeholder="Digite nome ou CNPJ/CPF"
                        />
                        {empresaSugestoesOpen ? (
                          <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-[#E5E7EB] bg-white shadow-lg">
                            {empresaSugestoesLoading ? (
                              <div className="px-3 py-2 text-sm text-[#6B7280]">Buscando…</div>
                            ) : empresaSugestoes.length ? (
                              <div className="max-h-64 overflow-auto">
                                {empresaSugestoes.slice(0, 30).map((r) => (
                                  <button
                                    key={r.idContraparte}
                                    type="button"
                                    className="w-full px-3 py-2 text-left text-sm hover:bg-[#F9FAFB]"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                      setEEmpresaParceiraNome(r.nomeRazao);
                                      setEEmpresaParceiraDocumento(r.documento ? String(r.documento) : "");
                                      setEmpresaSugestoesOpen(false);
                                    }}
                                  >
                                    <div className="font-semibold text-[#111827]">{r.nomeRazao}</div>
                                    <div className="text-xs text-[#6B7280]">
                                      {r.tipo} {r.documento ? `• ${r.documento}` : ""}
                                    </div>
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <div className="px-3 py-2 text-sm text-[#6B7280]">Nenhuma empresa encontrada.</div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-[#6B7280]">Documento</div>
                      <input className="input" value={eEmpresaParceiraDocumento} onChange={(e) => setEEmpresaParceiraDocumento(e.target.value)} placeholder="CNPJ/CPF" />
                    </div>
                  </div>

                  <div className="mt-2 text-sm font-semibold">Valores</div>
                  {eIsPublico ? (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div>
                        <div className="text-sm text-[#6B7280]">Concedente (inicial)</div>
                        <input className="input" value={eValorConcedenteInicial} onChange={(e) => setEValorConcedenteInicial(formatMoneyBRFromDigits(e.target.value))} />
                      </div>
                      <div>
                        <div className="text-sm text-[#6B7280]">Próprio (inicial)</div>
                        <input className="input" value={eValorProprioInicial} onChange={(e) => setEValorProprioInicial(formatMoneyBRFromDigits(e.target.value))} />
                      </div>
                      <div className="md:col-span-2">
                        <div className="text-sm text-[#6B7280]">Total (inicial)</div>
                        <input className="input" value={eValorTotalInicial} disabled />
                      </div>
                      <div>
                        <div className="text-sm text-[#6B7280]">Concedente (atual)</div>
                        <input className="input" value={eValorConcedenteAtual} onChange={(e) => setEValorConcedenteAtual(formatMoneyBRFromDigits(e.target.value))} />
                      </div>
                      <div>
                        <div className="text-sm text-[#6B7280]">Próprio (atual)</div>
                        <input className="input" value={eValorProprioAtual} onChange={(e) => setEValorProprioAtual(formatMoneyBRFromDigits(e.target.value))} />
                      </div>
                      <div className="md:col-span-2">
                        <div className="text-sm text-[#6B7280]">Total (atual)</div>
                        <input className="input" value={eValorTotalAtual} disabled />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div>
                        <div className="text-sm text-[#6B7280]">Valor total (inicial)</div>
                        <input className="input" value={eValorTotalInicial} onChange={(e) => setEValorTotalInicial(formatMoneyBRFromDigits(e.target.value))} />
                      </div>
                      <div>
                        <div className="text-sm text-[#6B7280]">Valor total (atual)</div>
                        <input className="input" value={eValorTotalAtual} onChange={(e) => setEValorTotalAtual(formatMoneyBRFromDigits(e.target.value))} />
                      </div>
                    </div>
                  )}
                </section>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6 text-[#111827]">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Contratos</h1>
          <div className="text-sm text-[#6B7280]">Cadastre, acompanhe e integre com medições/pagamentos e obras.</div>
        </div>
        <button className="rounded-lg bg-[#2563EB] px-4 py-2 text-sm text-white hover:bg-[#1D4ED8]" type="button" onClick={() => router.push("/dashboard/contratos/novo")}>
          Novo Contrato
        </button>
      </div>

      <section className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm text-[#111827] hover:bg-[#F9FAFB]"
              onClick={() => setFiltrosOpen((v) => !v)}
            >
              {filtrosOpen ? "Ocultar filtros" : "Exibir filtros"}
              {filtrosAtivosCount ? (
                <span className="ml-1 inline-flex items-center rounded-full bg-[#DBEAFE] px-2 py-0.5 text-xs font-semibold text-[#1D4ED8]">
                  {filtrosAtivosCount} ativo{filtrosAtivosCount > 1 ? "s" : ""}
                </span>
              ) : null}
            </button>
            {filtrosAtivosCount ? (
              <button
                type="button"
                className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm text-[#111827] hover:bg-[#F9FAFB]"
                onClick={limparFiltros}
              >
                Limpar
              </button>
            ) : null}
          </div>

          <button
            className="rounded-lg border border-[#D1D5DB] bg-white px-4 py-2 text-sm text-[#111827] hover:bg-[#F9FAFB] disabled:opacity-50"
            type="button"
            onClick={carregarLista}
            disabled={loading}
          >
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
        </div>

        {filtrosOpen ? (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
              <div className="lg:col-span-3">
                <div className="text-xs text-[#6B7280]">Busca</div>
                <input className="input h-9 text-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Número/nome/empresa" />
              </div>
              <div className="lg:col-span-3">
                <div className="text-xs text-[#6B7280]">Contraparte</div>
                <select
                  className="input h-9 text-sm"
                  value={contraparteFiltroId ? String(contraparteFiltroId) : ""}
                  onChange={(e) => setContraparteFiltroId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">Todos</option>
                  {contrapartes.map((c) => (
                    <option key={c.idContraparte} value={String(c.idContraparte)}>
                      #{c.idContraparte} - {c.nomeRazao} - {c.documento ? formatCpfCnpj(c.documento) : "-"}
                    </option>
                  ))}
                </select>
              </div>
              <div className="lg:col-span-3">
                <div className="text-xs text-[#6B7280]">Tipo de contrato (papel)</div>
                <select className="input h-9 text-sm" value={papelFiltro} onChange={(e) => setPapelFiltro(e.target.value as any)}>
                  <option value="">Todos</option>
                  <option value="CONTRATADO">Somos CONTRATADOS</option>
                  <option value="CONTRATANTE">Somos CONTRATANTES</option>
                </select>
              </div>
              <div className="lg:col-span-3">
                <div className="text-xs text-[#6B7280]">Tipo de contraparte</div>
                <select className="input h-9 text-sm" value={tipoContratanteFiltro} onChange={(e) => setTipoContratanteFiltro(e.target.value as any)}>
                  <option value="">Todos</option>
                  <option value="PUBLICO">Empresa pública</option>
                  <option value="PRIVADO">Empresa privada</option>
                  <option value="PF">Pessoa física</option>
                </select>
              </div>
            </div>

            <div>
              <div className="text-xs text-[#6B7280]">Status</div>
              <div className="rounded-lg border border-[#E5E7EB] bg-white p-3">
                <div className="flex items-center gap-4 overflow-x-auto whitespace-nowrap">
                  {STATUS_FILTER_OPTIONS.map((o) => (
                    <label key={o.key} className="flex items-center gap-1.5 text-xs">
                      <input type="checkbox" checked={Boolean(statusSel[o.key])} onChange={(e) => setStatusSel((p) => ({ ...p, [o.key]: e.target.checked }))} />
                      {o.label}
                    </label>
                  ))}
                  <div className="flex items-center gap-2 pl-2">
                    <button
                      className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-1.5 text-xs text-[#111827] hover:bg-[#F9FAFB]"
                      type="button"
                      onClick={() => setStatusSel(buildAllStatusSelected())}
                    >
                      Marcar todos
                    </button>
                    <button
                      className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-1.5 text-xs text-[#111827] hover:bg-[#F9FAFB]"
                      type="button"
                      onClick={() => {
                        const next: Record<StatusCalc, boolean> = {} as any;
                        for (const o of STATUS_FILTER_OPTIONS) next[o.key] = false;
                        setStatusSel(next);
                      }}
                    >
                      Limpar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
        {err ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}
      </section>

      <section className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold">Lista</div>
        <div className="mt-3 overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-[#F9FAFB] text-left text-[#111827]">
              <tr>
                <th className="px-3 py-2">Alerta</th>
                <th className="px-3 py-2">Nº</th>
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Empresa</th>
                <th className="px-3 py-2 text-right">Valor atual</th>
                <th className="px-3 py-2">Vigência atual</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="text-[#111827]">
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-[#E5E7EB] hover:bg-[#F3F4F6] cursor-pointer"
                  onClick={() => router.push(`/dashboard/contratos?id=${r.id}`)}
                >
                  <td className="px-3 py-2">
                    <span className={`font-semibold ${alertaUi(r.alerta).className}`} title={(r.alertas || []).join(" • ")}>
                      {alertaUi(r.alerta).icon}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-semibold">{r.numeroContrato}</td>
                  <td className="px-3 py-2">{r.nome || r.objeto || "—"}</td>
                  <td className="px-3 py-2">{r.tipoContratante}</td>
                  <td className="px-3 py-2">{r.empresaParceiraNome || "—"}</td>
                  <td className="px-3 py-2 text-right">{moeda(Number(r.valorTotalAtual || 0))}</td>
                  <td className="px-3 py-2">{r.vigenciaAtual ? new Date(r.vigenciaAtual).toLocaleDateString("pt-BR") : "—"}</td>
                  <td className={`px-3 py-2 ${statusUi(r.statusCalculado).className}`}>
                    {statusUi(r.statusCalculado).icon} {statusUi(r.statusCalculado).label}
                  </td>
                </tr>
              ))}
              {!filtered.length ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-[#6B7280]">
                    Nenhum contrato encontrado.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
