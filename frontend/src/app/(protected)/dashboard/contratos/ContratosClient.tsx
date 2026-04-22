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

function normalizeTipoContratante(v: unknown): ContratoRow["tipoContratante"] {
  const t = String(v || "PRIVADO").toUpperCase();
  if (t === "PUBLICO" || t === "PRIVADO" || t === "PF") return t;
  return "PRIVADO";
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

export default function ContratosClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const contratoId = sp.get("id");
  const urlStatus = sp.get("status") || "";
  const urlQ = sp.get("q") || "";

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<ContratoRow[]>([]);

  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState<string | null>(null);
  const [detail, setDetail] = useState<ContratoDetail | null>(null);

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

  const [status, setStatus] = useState(urlStatus);
  const [q, setQ] = useState(urlQ);

  useEffect(() => {
    if (contratoId) return;
    setStatus(urlStatus);
    setQ(urlQ);
  }, [contratoId, urlStatus, urlQ]);

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
    return rows.filter((r) => {
      if (status && String(r.statusCalculado || r.status).toUpperCase() !== status) return false;
      if (!qq) return true;
      const hay = `${r.numeroContrato || ""} ${r.nome || ""} ${r.objeto || ""} ${r.empresaParceiraNome || ""}`.toLowerCase();
      return hay.includes(qq);
    });
  }, [rows, q, status]);

  async function carregarLista() {
    try {
      setLoading(true);
      setErr(null);
      const res = await api.get("/api/contratos");
      setRows(
        (res.data as any[])?.map((x) => ({
          ...x,
          tipoContratante: normalizeTipoContratante(x.tipoContratante),
          prazoDias: x.prazoDias == null ? null : Number(x.prazoDias),
          valorConcedenteInicial: x.valorConcedenteInicial == null ? null : Number(x.valorConcedenteInicial),
          valorProprioInicial: x.valorProprioInicial == null ? null : Number(x.valorProprioInicial),
          valorTotalInicial: x.valorTotalInicial == null ? null : Number(x.valorTotalInicial),
          valorConcedenteAtual: x.valorConcedenteAtual == null ? null : Number(x.valorConcedenteAtual),
          valorProprioAtual: x.valorProprioAtual == null ? null : Number(x.valorProprioAtual),
          valorTotalAtual: x.valorTotalAtual == null ? null : Number(x.valorTotalAtual),
        })) ?? []
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

  useEffect(() => {
    carregarLista();
  }, []);

  useEffect(() => {
    realtimeClient.start(["contratos"]);
    const unsubs = [
      realtimeClient.subscribe("contratos", "contrato_atualizado", () => {
        carregarLista();
        if (contratoId) carregarDetalhe(contratoId);
      }),
      realtimeClient.subscribe("contratos", "evento_criado", () => {
        if (contratoId) carregarDetalhe(contratoId);
      }),
      realtimeClient.subscribe("contratos", "anexo_criado", () => {
        if (contratoId) carregarDetalhe(contratoId);
      }),
    ];
    return () => {
      for (const u of unsubs) u();
    };
  }, [contratoId]);

  useEffect(() => {
    if (contratoId) carregarDetalhe(contratoId);
    else {
      setDetail(null);
      setDetailErr(null);
    }
  }, [contratoId]);

  function abrirEdicao() {
    if (!detail) return;
    setEditErr(null);
    setEditLoading(false);
    setENumeroContrato(detail.numeroContrato || "");
    setENome(detail.nome || "");
    setEObjeto(detail.objeto || "");
    setEDescricao((detail.descricao as any) || "");
    setETipoContratante(normalizeTipoContratante(detail.tipoContratante));
    setEEmpresaParceiraNome(detail.empresaParceiraNome || "");
    setEEmpresaParceiraDocumento((detail.empresaParceiraDocumento as any) || "");
    setEStatus(String(detail.status || "ATIVO"));
    setEDataAssinatura(toDateInputValue(detail.dataAssinatura));
    setEDataOS(toDateInputValue(detail.dataOS));
    setEPrazoValor(detail.prazoDias == null ? "" : String(detail.prazoDias));
    setEPrazoUnidade("DIAS");

    const vci = Number((detail as any).valorConcedenteInicial || 0);
    const vpi = Number((detail as any).valorProprioInicial || 0);
    const vca = Number((detail as any).valorConcedenteAtual || 0);
    const vpa = Number((detail as any).valorProprioAtual || 0);
    const vti = Number((detail as any).valorTotalInicial || 0);
    const vta = Number((detail as any).valorTotalAtual || 0);

    setEValorConcedenteInicial(formatMoneyBRFromDigits(String(Math.round(vci * 100))));
    setEValorProprioInicial(formatMoneyBRFromDigits(String(Math.round(vpi * 100))));
    setEValorConcedenteAtual(formatMoneyBRFromDigits(String(Math.round(vca * 100))));
    setEValorProprioAtual(formatMoneyBRFromDigits(String(Math.round(vpa * 100))));
    setEValorTotalInicial(formatMoneyBRFromDigits(String(Math.round(vti * 100))));
    setEValorTotalAtual(formatMoneyBRFromDigits(String(Math.round(vta * 100))));

    setEditOpen(true);
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
              onClick={() => router.push(`/dashboard/contratos/planejamento?id=${contratoId}`)}
            >
              Planejamento (Gantt)
            </button>
            <button
              className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm text-[#111827] hover:bg-[#F9FAFB]"
              type="button"
              onClick={() => router.push(`/dashboard/contratos/aditivos?contratoId=${contratoId}`)}
            >
              Aditivos
            </button>
            <button
              className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm text-[#111827] hover:bg-[#F9FAFB]"
              type="button"
              onClick={() => router.push(`/dashboard/contratos/subcontratos?contratoId=${contratoId}`)}
            >
              Subcontratos
            </button>
            <button
              className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm text-[#111827] hover:bg-[#F9FAFB]"
              type="button"
              onClick={() => router.push(`/dashboard/contratos/medicoes?contratoId=${contratoId}`)}
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
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <section className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm lg:col-span-2">
              <div className="text-sm text-[#6B7280]">Número</div>
              <div className="text-xl font-semibold">{detail.numeroContrato}</div>
              <div className="mt-2 text-sm text-[#6B7280]">{detail.nome || detail.objeto || "—"}</div>

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
            </section>

            <section className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
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
              <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm lg:col-span-3">
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

            <section className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm lg:col-span-3">
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
                      <tr key={o.id} className="border-t border-[#E5E7EB]">
                        <td className="px-3 py-2">{o.name}</td>
                        <td className="px-3 py-2">{o.status}</td>
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

                  <div className="mt-2 text-sm font-semibold">Empresa parceira</div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <div className="flex items-end justify-between gap-2">
                        <div className="text-sm text-[#6B7280]">Nome / Razão social (autocompletar)</div>
                        <button
                          className="text-xs font-semibold text-[#2563EB] hover:underline"
                          type="button"
                          onClick={() => router.push("/dashboard/engenharia/contrapartes")}
                        >
                          CRUD empresas
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
          Novo contrato
        </button>
      </div>

      <section className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <div className="text-sm text-[#6B7280]">Busca</div>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Número/nome/empresa" />
          </div>
          <div>
            <div className="text-sm text-[#6B7280]">Status</div>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todos</option>
              <option value="A_VENCER">A vencer</option>
              <option value="VENCIDO">Vencido</option>
              <option value="EM_ANDAMENTO">Em andamento</option>
              <option value="CONCLUIDO">Concluído</option>
              <option value="SEM_RECURSOS">Sem recursos</option>
              <option value="NAO_INICIADO">Não iniciado</option>
              <option value="CANCELADO">Cancelado</option>
            </select>
          </div>
          <div className="flex items-end md:col-span-2 justify-end gap-2">
            <button
              className="rounded-lg border border-[#D1D5DB] bg-white px-4 py-2 text-sm text-[#111827] hover:bg-[#F9FAFB] disabled:opacity-50"
              type="button"
              onClick={carregarLista}
              disabled={loading}
            >
              {loading ? "Atualizando..." : "Atualizar"}
            </button>
          </div>
        </div>
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
