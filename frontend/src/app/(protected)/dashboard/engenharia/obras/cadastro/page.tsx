"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/api";
import { setActiveObra } from "@/lib/obra/active";

const MapaObras = dynamic(() => import("@/components/MapaObras"), {
  ssr: false,
  loading: () => <div className="h-[420px] w-full rounded-lg border border-[#E5E7EB] bg-[#F3F4F6]" />,
});

type ContratoRow = {
  id: number;
  numeroContrato: string;
  objeto: string | null;
  valorTotalAtual?: number | null;
  prazoDias?: number | null;
  vigenciaInicial?: string | null;
  vigenciaAtual?: string | null;
};
type ObraRow = {
  id: number;
  contratoId: number;
  name: string;
  type: "PUBLICA" | "PARTICULAR";
  status: string;
  valorPrevisto: number | null;
  enderecoObra?: { latitude?: string | null; longitude?: string | null } | null;
};

type EnderecoRow = {
  id: number;
  tenantId: number;
  obraId: number;
  nomeEndereco: string;
  principal: boolean;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  latitude: string | null;
  longitude: string | null;
  origemEndereco: string;
  origemCoordenada: string;
};

function moeda(v: number) {
  const n = Number(v || 0);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number.isFinite(n) ? n : 0);
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

function fmtDateShort(v: unknown) {
  if (!v) return "-";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("pt-BR");
}

function daysDiffFromToday(dateIso: unknown) {
  if (!dateIso) return null;
  const d = new Date(String(dateIso));
  if (Number.isNaN(d.getTime())) return null;
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const nowD = new Date();
  const start = new Date(nowD.getFullYear(), nowD.getMonth(), nowD.getDate()).getTime();
  return Math.floor((end - start) / 86400000);
}

function onlyDigits(value: string) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeCep(value: string) {
  const d = onlyDigits(value);
  return d.length === 8 ? d : "";
}

function removeDiacritics(s: string) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function toIbgeSlug(s: string) {
  const raw = removeDiacritics(String(s || "").trim()).toLowerCase();
  return raw
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
}

const UF_LIST = [
  "AC",
  "AL",
  "AM",
  "AP",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MG",
  "MS",
  "MT",
  "PA",
  "PB",
  "PE",
  "PI",
  "PR",
  "RJ",
  "RN",
  "RO",
  "RR",
  "RS",
  "SC",
  "SE",
  "SP",
  "TO",
];

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

export default function EngenhariaCadastroObraPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [obrasContrato, setObrasContrato] = useState<ObraRow[]>([]);
  const [contratos, setContratos] = useState<ContratoRow[]>([]);
  const [financeiroByObraId, setFinanceiroByObraId] = useState<Record<number, { valorTotal: number; valorMedido: number }>>({});

  const [contratoId, setContratoId] = useState<number>(0);
  const [obraId, setObraId] = useState<number | null>(null);
  const [enderecoId, setEnderecoId] = useState<number | null>(null);
  const [enderecos, setEnderecos] = useState<EnderecoRow[]>([]);
  const [obraFormAberto, setObraFormAberto] = useState(false);
  const [enderecoFormAberto, setEnderecoFormAberto] = useState(false);
  const [pendingSelectObraId, setPendingSelectObraId] = useState<number | null>(null);
  const [coordMsg, setCoordMsg] = useState<string>("");
  const [alertaCoordsPossivelmenteDesatualizadas, setAlertaCoordsPossivelmenteDesatualizadas] = useState(false);
  const [cidadesUf, setCidadesUf] = useState<string[]>([]);
  const [ufsEncontradosPorCidade, setUfsEncontradosPorCidade] = useState<string[]>([]);
  const [cidadeUfInvalidaMsg, setCidadeUfInvalidaMsg] = useState<string>("");
  const [ibgeUfIdBySigla, setIbgeUfIdBySigla] = useState<Record<string, number>>({});
  const [localizacaoInformadaOpen, setLocalizacaoInformadaOpen] = useState(false);
  const [lastLinkSnapshot, setLastLinkSnapshot] = useState<{
    logradouro: string;
    numero: string;
    bairro: string;
    cidade: string;
    uf: string;
    cep: string;
  } | null>(null);

  const [formObra, setFormObra] = useState({
    name: "",
    type: "PARTICULAR" as "PARTICULAR" | "PUBLICA",
    status: "NAO_INICIADA",
    description: "",
    valorPrevisto: "",
  });

  async function carregarContratos() {
    try {
      const res = await api.get("/api/contratos", { params: { apenasPrincipais: "true" } });
      const data = Array.isArray(res.data) ? res.data : [];
      const mapped = data.map((c: any) => ({
        id: Number(c.id),
        numeroContrato: String(c.numeroContrato || ""),
        objeto: c.objeto ?? null,
        valorTotalAtual: c.valorTotalAtual == null ? null : Number(c.valorTotalAtual),
        prazoDias: c.prazoDias == null ? null : Number(c.prazoDias),
        vigenciaInicial: c.vigenciaInicial ?? null,
        vigenciaAtual: c.vigenciaAtual ?? null,
      }));
      setContratos(mapped);
      if (!contratoId && mapped.length > 0) {
        const nonPending = mapped.find((c) => String(c.numeroContrato).toUpperCase() !== "PENDENTE");
        setContratoId((nonPending || mapped[0]).id);
      }
    } catch {
      setContratos([]);
    }
  }

  async function carregarResumoFinanceiro(idContrato: number) {
    if (!idContrato) {
      setFinanceiroByObraId({});
      return;
    }
    try {
      const res = await api.get(`/api/obras/resumo-financeiro?contratoId=${idContrato}`);
      const data = Array.isArray(res.data) ? res.data : [];
      const map: Record<number, { valorTotal: number; valorMedido: number }> = {};
      for (const r of data as any[]) {
        const obraId = Number(r.obraId);
        if (!Number.isFinite(obraId) || obraId <= 0) continue;
        map[obraId] = { valorTotal: Number(r.valorTotal || 0), valorMedido: Number(r.valorMedido || 0) };
      }
      setFinanceiroByObraId(map);
    } catch {
      setFinanceiroByObraId({});
    }
  }

  async function carregarObrasContrato(idContrato: number) {
    if (!idContrato) {
      setObrasContrato([]);
      return;
    }
    try {
      setErr(null);
      const res = await api.get(`/api/obras?contratoId=${idContrato}`);
      const data = Array.isArray(res.data) ? res.data : [];
      setObrasContrato(
        data.map((o: any) => ({
          id: Number(o.id),
          contratoId: Number(o.contratoId),
          name: String(o.name || `Obra #${o.id}`),
          type: (String(o.type || "PARTICULAR").toUpperCase() === "PUBLICA" ? "PUBLICA" : "PARTICULAR") as any,
          status: String(o.status || "NAO_INICIADA"),
          valorPrevisto: o.valorPrevisto == null ? null : Number(o.valorPrevisto),
          enderecoObra: o.enderecoObra ?? null,
        }))
      );
    } catch (e: any) {
      setObrasContrato([]);
      setErr(e?.response?.data?.message || e?.message || "Erro ao carregar obras do contrato");
    }
  }

  async function carregarObraParaEdicao(id: number) {
    try {
      setErr(null);
      const res = await api.get(`/api/obras/${id}`);
      const o: any = res.data;
      if (!o?.id) throw new Error("Obra não encontrada");
      setObraFormAberto(true);
      setObraId(Number(o.id));
      setFormObra({
        name: String(o.name || ""),
        type: (String(o.type || "PARTICULAR").toUpperCase() === "PUBLICA" ? "PUBLICA" : "PARTICULAR") as any,
        status: String(o.status || "NAO_INICIADA"),
        description: String(o.description || ""),
        valorPrevisto: o.valorPrevisto == null ? "" : Number(o.valorPrevisto || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      });
      await carregarEnderecos(Number(o.id));
      setEnderecoId(null);
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao carregar obra");
    }
  }

  async function carregarEnderecos(idObra: number) {
    try {
      const res = await api.get(`/api/obras/${idObra}/enderecos`);
      const data = Array.isArray(res.data) ? res.data : [];
      setEnderecos(data);
    } catch (e: any) {
      setEnderecos([]);
      setErr(e?.response?.data?.message || e?.message || "Erro ao carregar endereços da obra");
    }
  }

  async function salvar() {
    try {
      setLoading(true);
      setErr(null);
      setOkMsg(null);
      const obraPayload: any = {
        name: formObra.name.trim(),
        contratoId,
        type: formObra.type,
        status: formObra.status,
        description: formObra.description.trim() || undefined,
        valorPrevisto: formObra.valorPrevisto.trim() ? parseMoneyBR(formObra.valorPrevisto) : undefined,
      };
      let id = obraId;
      if (obraId) {
        await api.put(`/api/obras/${obraId}`, obraPayload);
        id = obraId;
      } else {
        const created = await api.post("/api/obras", obraPayload);
        id = Number(created.data?.id || created.data?.obra?.id || created.data?.data?.id || 0);
      }
      if (id && id > 0) await api.post(`/api/obras/${id}/planilha/minima`).catch(() => null);
      await carregarObrasContrato(contratoId);
      if (id && id > 0) {
        setObraId(id);
        await carregarEnderecos(id);
      }
      setObraFormAberto(false);
      setEnderecoFormAberto(false);
      setEnderecoId(null);
      setOkMsg(obraId ? "Obra atualizada." : "Obra cadastrada.");
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao cadastrar obra");
    } finally {
      setLoading(false);
    }
  }

  const [formEndereco, setFormEndereco] = useState({
    nomeEndereco: "Principal",
    principal: true,
    origemEndereco: "MANUAL" as "MANUAL" | "CEP" | "LINK",
    origemCoordenada: "MANUAL" as "MANUAL" | "CEP" | "LINK",
    linkGoogleMaps: "",
    cep: "",
    logradouro: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    uf: "",
    latitude: "",
    longitude: "",
  });

  function setFieldEndereco<K extends keyof typeof formEndereco>(key: K, value: (typeof formEndereco)[K]) {
    setFormEndereco((p) => ({ ...p, [key]: value }));
  }

  function limparEnderecoForm() {
    setEnderecoFormAberto(true);
    setEnderecoId(null);
    setCoordMsg("");
    setAlertaCoordsPossivelmenteDesatualizadas(false);
    setLastLinkSnapshot(null);
    setCidadesUf([]);
    setUfsEncontradosPorCidade([]);
    setCidadeUfInvalidaMsg("");
    setFormEndereco({
      nomeEndereco: "Principal",
      principal: enderecos.length === 0,
      origemEndereco: "MANUAL",
      origemCoordenada: "MANUAL",
      linkGoogleMaps: "",
      cep: "",
      logradouro: "",
      numero: "",
      complemento: "",
      bairro: "",
      cidade: "",
      uf: "",
      latitude: "",
      longitude: "",
    });
  }

  function coordMsgFromOrigem(origem: string) {
    const o = String(origem || "MANUAL").toUpperCase();
    if (o === "LINK") return "Coordenadas obtidas a partir do link do Google Maps.";
    if (o === "CEP") return "Coordenadas obtidas a partir do CEP (geocodificação).";
    return "Coordenadas informadas manualmente.";
  }

  function isValidLatLng(lat: string, lng: string) {
    const la = Number(String(lat || "").trim());
    const lo = Number(String(lng || "").trim());
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return false;
    if (la < -90 || la > 90) return false;
    if (lo < -180 || lo > 180) return false;
    return true;
  }

  async function buscarLocalizacaoPorLink() {
    const link = String(formEndereco.linkGoogleMaps || "").trim();
    if (!link) {
      setErr("Informe um link do Google Maps.");
      return;
    }
    try {
      setLoading(true);
      setErr(null);
      const res = await api.post("/api/obras/enderecos/preview/link", { link });
      const d: any = res.data || {};
      setFormEndereco((p) => {
        const next = {
          ...p,
          origemEndereco: "LINK" as const,
          origemCoordenada: "LINK" as const,
          cep: d.cep ? String(d.cep) : p.cep,
          logradouro: d.logradouro ? String(d.logradouro) : p.logradouro,
          bairro: d.bairro ? String(d.bairro) : p.bairro,
          cidade: d.cidade ? String(d.cidade) : p.cidade,
          uf: d.uf ? String(d.uf).toUpperCase() : p.uf,
          latitude: d.latitude ? String(d.latitude) : p.latitude,
          longitude: d.longitude ? String(d.longitude) : p.longitude,
        };
        setLastLinkSnapshot({
          logradouro: String(next.logradouro || ""),
          numero: String(next.numero || ""),
          bairro: String(next.bairro || ""),
          cidade: String(next.cidade || ""),
          uf: String(next.uf || ""),
          cep: String(next.cep || ""),
        });
        return next;
      });
      setCoordMsg("Coordenadas obtidas a partir do link do Google Maps.");
      setAlertaCoordsPossivelmenteDesatualizadas(false);
      setCidadeUfInvalidaMsg("");
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao buscar localização pelo link.");
    } finally {
      setLoading(false);
    }
  }

  async function buscaEnderecoPorCep() {
    const cepDigits = normalizeCep(formEndereco.cep);
    if (!cepDigits) {
      setErr("CEP inválido. Informe 8 dígitos (com ou sem máscara).");
      return;
    }
    try {
      setLoading(true);
      setErr(null);
      const res = await api.post("/api/obras/enderecos/preview/cep", { cep: cepDigits });
      const d: any = res.data || {};
      setFormEndereco((p) => {
        const next: typeof formEndereco = {
          ...p,
          origemEndereco: "CEP",
          cep: d.cep ? String(d.cep) : cepDigits,
          logradouro: d.logradouro ? String(d.logradouro) : p.logradouro,
          complemento: d.complemento ? String(d.complemento) : p.complemento,
          bairro: d.bairro ? String(d.bairro) : p.bairro,
          cidade: d.cidade ? String(d.cidade) : p.cidade,
          uf: d.uf ? String(d.uf).toUpperCase() : p.uf,
        };

        const coordsFromLink = String(p.origemCoordenada || "").toUpperCase() === "LINK";
        const hasCoords = Boolean(String(p.latitude || "").trim()) && Boolean(String(p.longitude || "").trim());
        const canSetCoords = !coordsFromLink && !hasCoords;
        if (canSetCoords && d.latitude && d.longitude) {
          next.latitude = String(d.latitude);
          next.longitude = String(d.longitude);
          next.origemCoordenada = "CEP";
          setCoordMsg(coordMsgFromOrigem("CEP"));
        } else if (coordsFromLink) {
          setCoordMsg(coordMsgFromOrigem("LINK"));
        }
        return next;
      });
      setCidadeUfInvalidaMsg("");
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao buscar endereço por CEP.");
    } finally {
      setLoading(false);
    }
  }

  async function buscarCepPeloEndereco() {
    const uf = String(formEndereco.uf || "").trim().toUpperCase();
    const cidade = String(formEndereco.cidade || "").trim();
    const logradouro = String(formEndereco.logradouro || "").trim();
    if (!logradouro || !cidade || !uf) {
      setErr("Para buscar o CEP, informe Rua, Cidade e UF.");
      return;
    }
    try {
      setLoading(true);
      setErr(null);
      const res = await api.post("/api/obras/enderecos/preview/buscar-cep", {
        logradouro,
        numero: String(formEndereco.numero || "").trim() || null,
        bairro: String(formEndereco.bairro || "").trim() || null,
        cidade,
        uf,
      });
      const d: any = res.data || {};
      if (d.cep) setFieldEndereco("cep", String(d.cep));
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao buscar CEP.");
    } finally {
      setLoading(false);
    }
  }

  async function salvarEndereco() {
    if (!obraId) return;
    try {
      setLoading(true);
      setErr(null);
      setOkMsg(null);
      const payload: any = {
        nomeEndereco: formEndereco.nomeEndereco.trim() || "Principal",
        principal: Boolean(formEndereco.principal),
        origem: "MANUAL",
        origemEndereco: formEndereco.origemEndereco,
        origemCoordenada: formEndereco.origemCoordenada,
        cep: formEndereco.cep || null,
        logradouro: formEndereco.logradouro || null,
        numero: formEndereco.numero || null,
        complemento: formEndereco.complemento || null,
        bairro: formEndereco.bairro || null,
        cidade: formEndereco.cidade || null,
        uf: formEndereco.uf || null,
        latitude: formEndereco.latitude || null,
        longitude: formEndereco.longitude || null,
      };

      if (enderecoId) {
        await api.put(`/api/obras/${obraId}/enderecos/${enderecoId}`, payload);
      } else {
        await api.post(`/api/obras/${obraId}/enderecos`, payload);
      }
      await carregarEnderecos(obraId);
      setOkMsg(enderecoId ? "Endereço atualizado." : "Endereço cadastrado.");
      setEnderecoFormAberto(false);
      setEnderecoId(null);
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao salvar endereço");
    } finally {
      setLoading(false);
    }
  }

  async function removerEndereco(id: number) {
    if (!obraId) return;
    if (!window.confirm("Remover este endereço?")) return;
    try {
      setLoading(true);
      setErr(null);
      await api.delete(`/api/obras/${obraId}/enderecos/${id}`);
      if (enderecoId === id) {
        setEnderecoId(null);
        setEnderecoFormAberto(false);
      }
      await carregarEnderecos(obraId);
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao remover endereço");
    } finally {
      setLoading(false);
    }
  }

  function selecionarEndereco(e: EnderecoRow) {
    setEnderecoFormAberto(true);
    setEnderecoId(e.id);
    setAlertaCoordsPossivelmenteDesatualizadas(false);
    setLastLinkSnapshot(null);
    setCidadesUf([]);
    setUfsEncontradosPorCidade([]);
    setCidadeUfInvalidaMsg("");
    setFormEndereco({
      nomeEndereco: e.nomeEndereco || "Principal",
      principal: Boolean(e.principal),
      origemEndereco: (String(e.origemEndereco || "MANUAL").toUpperCase() === "LINK"
        ? "LINK"
        : String(e.origemEndereco || "MANUAL").toUpperCase() === "CEP"
          ? "CEP"
          : "MANUAL") as any,
      origemCoordenada: (String(e.origemCoordenada || "MANUAL").toUpperCase() === "LINK"
        ? "LINK"
        : String(e.origemCoordenada || "MANUAL").toUpperCase() === "CEP"
          ? "CEP"
          : "MANUAL") as any,
      linkGoogleMaps: "",
      cep: e.cep || "",
      logradouro: e.logradouro || "",
      numero: e.numero || "",
      complemento: e.complemento || "",
      bairro: e.bairro || "",
      cidade: e.cidade || "",
      uf: e.uf || "",
      latitude: e.latitude || "",
      longitude: e.longitude || "",
    });
    setCoordMsg(coordMsgFromOrigem(e.origemCoordenada || "MANUAL"));
  }

  useEffect(() => {
    carregarContratos();
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const r = await fetch("https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome", { cache: "force-cache" });
        const json: any = await r.json().catch(() => null);
        if (!active) return;
        const map: Record<string, number> = {};
        if (Array.isArray(json)) {
          for (const row of json) {
            const sigla = String(row?.sigla || "").toUpperCase();
            const id = Number(row?.id || 0);
            if (sigla && Number.isFinite(id) && id > 0) map[sigla] = id;
          }
        }
        setIbgeUfIdBySigla(map);
      } catch {
        setIbgeUfIdBySigla({});
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const raw = sp?.get("obraId");
    if (!raw) return;
    const id = Number(raw);
    if (!Number.isFinite(id) || id <= 0) return;
    let active = true;
    (async () => {
      try {
        const res = await api.get(`/api/obras/${id}`);
        const o: any = res.data;
        const cId = Number(o?.contratoId || 0);
        if (!Number.isFinite(cId) || cId <= 0) return;
        if (!active) return;
        setPendingSelectObraId(id);
        setContratoId(cId);
      } catch {
        return;
      }
    })();
    return () => {
      active = false;
    };
  }, [sp]);

  useEffect(() => {
    if (!obraId) return;
    const selected = obrasContrato.find((o) => o.id === obraId) || null;
    setActiveObra({ id: obraId, nome: selected?.name || undefined });
  }, [obraId, obrasContrato]);

  useEffect(() => {
    if (!contratoId) return;
    setObraId(null);
    setEnderecoId(null);
    setEnderecos([]);
    setObraFormAberto(false);
    setEnderecoFormAberto(false);
    setFormObra({ name: "", type: "PARTICULAR", status: "NAO_INICIADA", description: "", valorPrevisto: "" });
    carregarObrasContrato(contratoId);
    carregarResumoFinanceiro(contratoId);
  }, [contratoId]);

  useEffect(() => {
    if (!enderecoFormAberto) return;
    const origem = String(formEndereco.origemCoordenada || "MANUAL").toUpperCase();
    setCoordMsg(coordMsgFromOrigem(origem));
  }, [enderecoFormAberto, formEndereco.origemCoordenada]);

  useEffect(() => {
    if (!enderecoFormAberto) return;
    const uf = String(formEndereco.uf || "")
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 2);
    if (uf !== formEndereco.uf) setFieldEndereco("uf", uf as any);
    if (!uf || uf.length !== 2 || !UF_LIST.includes(uf)) {
      setCidadesUf([]);
      setCidadeUfInvalidaMsg("");
      return;
    }
    const ufId = ibgeUfIdBySigla[uf];
    if (!ufId) return;
    let cancelled = false;
    setCidadeUfInvalidaMsg("");
    (async () => {
      try {
        const r = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${ufId}/municipios?orderBy=nome&view=nivelado`, { cache: "force-cache" });
        const json: any = await r.json().catch(() => null);
        if (cancelled) return;
        const cidades = (Array.isArray(json) ? json : [])
          .map((x: any) => String(x?.nome || "").trim())
          .filter(Boolean);
        setCidadesUf(cidades);
        const cidadeAtual = String(formEndereco.cidade || "").trim();
        if (cidadeAtual) {
          const ok = cidades.some((c) => c.toLowerCase() === cidadeAtual.toLowerCase());
          if (!ok) {
            setFieldEndereco("cidade", "" as any);
            setCidadeUfInvalidaMsg("A cidade informada não pertence ao UF selecionado. Selecione uma cidade da lista.");
          }
        }
      } catch {
        if (cancelled) return;
        setCidadesUf([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enderecoFormAberto, formEndereco.uf, ibgeUfIdBySigla]);

  useEffect(() => {
    if (!enderecoFormAberto) return;
    const cidade = String(formEndereco.cidade || "").trim();
    if (cidade.length < 3) {
      setUfsEncontradosPorCidade([]);
      return;
    }
    const uf = String(formEndereco.uf || "").trim().toUpperCase();
    if (uf && uf.length === 2 && UF_LIST.includes(uf)) {
      setUfsEncontradosPorCidade([]);
      return;
    }
    const slug = toIbgeSlug(cidade);
    if (!slug) return;
    let cancelled = false;
    const t = window.setTimeout(async () => {
      try {
        const r = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/municipios/${encodeURIComponent(slug)}?view=nivelado`, { cache: "no-store" });
        const json: any = await r.json().catch(() => null);
        if (cancelled) return;
        const rows = Array.isArray(json) ? json : json ? [json] : [];
        const ufs = Array.from(
          new Set(
            rows
              .map((row: any) => String(row?.microrregiao?.mesorregiao?.UF?.sigla || row?.["regiao-imediata"]?.["regiao-intermediaria"]?.UF?.sigla || "").toUpperCase())
              .filter((x: string) => x && UF_LIST.includes(x))
          )
        );
        if (ufs.length === 1) {
          setFieldEndereco("uf", ufs[0] as any);
          setUfsEncontradosPorCidade([]);
        } else {
          setUfsEncontradosPorCidade(ufs);
        }
      } catch {
        if (cancelled) return;
        setUfsEncontradosPorCidade([]);
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [enderecoFormAberto, formEndereco.cidade, formEndereco.uf]);

  useEffect(() => {
    if (!enderecoFormAberto) return;
    if (!lastLinkSnapshot) return;
    if (String(formEndereco.origemCoordenada || "").toUpperCase() !== "LINK") return;
    const changed =
      String(formEndereco.logradouro || "") !== lastLinkSnapshot.logradouro ||
      String(formEndereco.numero || "") !== lastLinkSnapshot.numero ||
      String(formEndereco.bairro || "") !== lastLinkSnapshot.bairro ||
      String(formEndereco.cidade || "") !== lastLinkSnapshot.cidade ||
      String(formEndereco.uf || "") !== lastLinkSnapshot.uf ||
      String(formEndereco.cep || "") !== lastLinkSnapshot.cep;
    setAlertaCoordsPossivelmenteDesatualizadas(changed);
  }, [
    enderecoFormAberto,
    formEndereco.origemCoordenada,
    formEndereco.logradouro,
    formEndereco.numero,
    formEndereco.bairro,
    formEndereco.cidade,
    formEndereco.uf,
    formEndereco.cep,
    lastLinkSnapshot,
  ]);

  useEffect(() => {
    if (!pendingSelectObraId) return;
    if (!obrasContrato.some((o) => o.id === pendingSelectObraId)) return;
    selecionarObraSomente(pendingSelectObraId);
    setPendingSelectObraId(null);
  }, [pendingSelectObraId, obrasContrato]);

  const contratoSelecionado = useMemo(() => contratos.find((c) => c.id === contratoId) || null, [contratos, contratoId]);
  const obraSelecionada = useMemo(() => obrasContrato.find((o) => o.id === obraId) || null, [obrasContrato, obraId]);
  const diasRestantesContrato = useMemo(() => daysDiffFromToday(contratoSelecionado?.vigenciaAtual), [contratoSelecionado?.vigenciaAtual]);
  const totalObrasContrato = useMemo(() => {
    let sum = 0;
    for (const o of obrasContrato) sum += Number(o.valorPrevisto || 0);
    return sum;
  }, [obrasContrato]);
  const saldoContrato = useMemo(() => {
    const valorContrato = Number(contratoSelecionado?.valorTotalAtual || 0);
    return valorContrato - totalObrasContrato;
  }, [contratoSelecionado?.valorTotalAtual, totalObrasContrato]);

  const mapaData = useMemo(() => {
    const contratoNumero = contratoSelecionado?.numeroContrato || null;
    if (obraSelecionada && enderecos.length > 0) {
      const fin = financeiroByObraId[obraSelecionada.id];
      const total = fin?.valorTotal ?? (obraSelecionada.valorPrevisto ?? 0);
      const medido = fin?.valorMedido ?? 0;
      return enderecos.map((e) => ({
        id: e.id,
        name: `${obraSelecionada.name} - ${e.nomeEndereco || "Principal"}`,
        type: obraSelecionada.type,
        status: obraSelecionada.status as any,
        enderecoObra: { latitude: e.latitude, longitude: e.longitude },
        valorPrevisto: obraSelecionada.valorPrevisto ?? undefined,
        contratoNumero,
        valorMedido: medido,
        valorAMedir: total - medido,
        hoverTitle: `#${obraSelecionada.id} - ${obraSelecionada.name}`,
      }));
    }
    return obrasContrato.map((o) => ({
      id: o.id,
      name: o.name,
      type: o.type,
      status: o.status as any,
      enderecoObra: o.enderecoObra ?? null,
      valorPrevisto: o.valorPrevisto ?? undefined,
      contratoNumero,
      valorMedido: financeiroByObraId[o.id]?.valorMedido ?? 0,
      valorAMedir: (financeiroByObraId[o.id]?.valorTotal ?? (o.valorPrevisto ?? 0)) - (financeiroByObraId[o.id]?.valorMedido ?? 0),
      hoverTitle: `#${o.id} - ${o.name}`,
    }));
  }, [obrasContrato, obraSelecionada, enderecos, contratoSelecionado, financeiroByObraId]);

  const mapaSelectedId = useMemo(() => {
    if (obraSelecionada && enderecos.length > 0) return enderecoId;
    return obraId;
  }, [obraId, enderecoId, obraSelecionada, enderecos]);

  const enderecoCodigo = useMemo(() => {
    if (!obraId) return "";
    const nome = formEndereco.nomeEndereco.trim() || "Principal";
    const numeroContrato = contratoSelecionado?.numeroContrato ? String(contratoSelecionado.numeroContrato) : "-";
    return `${numeroContrato}/${obraId} - ${nome}`;
  }, [obraId, formEndereco.nomeEndereco, contratoSelecionado?.numeroContrato]);

  async function selecionarObraSomente(id: number) {
    const obraIdNum = Number(id || 0);
    if (!Number.isFinite(obraIdNum) || obraIdNum <= 0) return;
    setObraId(obraIdNum);
    setEnderecoId(null);
    setEnderecoFormAberto(false);
    await carregarEnderecos(obraIdNum);
  }

  function selecionarEnderecoSomente(e: EnderecoRow) {
    setEnderecoId(e.id);
    setEnderecoFormAberto(false);
  }

  return (
    <div className="space-y-6 text-[#111827]">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Engenharia → Obra selecionada</h1>
          <div className="text-sm text-slate-600">Cadastre/edite a obra selecionada e acesse Planejar/Executar.</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-lg border bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            disabled={!obraId}
            onClick={() => router.push(`/dashboard/engenharia/obras/ativa/dashboard`)}
          >
            Dashboard
          </button>
          <button
            type="button"
            className="rounded-lg border bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            disabled={!obraId}
            onClick={() => router.push(`/dashboard/obras/documentos?tipo=OBRA&id=${obraId}`)}
          >
            Documentos da obra
          </button>
          <button
            type="button"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-60"
            disabled={!obraId}
            onClick={() => router.push(`/dashboard/engenharia/obras/${obraId}/planilha`)}
          >
            Planejamento
          </button>
          <button
            type="button"
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-500 disabled:opacity-60"
            disabled={!obraId}
            onClick={() => router.push(`/dashboard/engenharia/obras/${obraId}/programacao`)}
          >
            Executar
          </button>
          <button type="button" className="rounded-lg border px-4 py-2 text-sm" onClick={() => router.push("/dashboard/engenharia/obras")}>
            Voltar
          </button>
        </div>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}
      {okMsg ? <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{okMsg}</div> : null}

      <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-semibold">Selecionar contrato</div>
            <div className="text-xs text-[#6B7280]">Selecione um contrato para visualizar e cadastrar obras vinculadas.</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-[#D1D5DB] bg-white px-4 py-2 text-sm text-[#111827] hover:bg-[#F9FAFB] disabled:opacity-60"
              disabled={!contratoId}
              onClick={() => router.push(`/dashboard/contratos?id=${contratoId}`)}
            >
              Visualizar contrato
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <div className="md:col-span-2">
            <div className="text-sm text-[#6B7280]">Contrato</div>
            <select className="input" value={String(contratoId || "")} onChange={(e) => setContratoId(Number(e.target.value) || 0)}>
              <option value="">Selecione</option>
              {contratos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.numeroContrato}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-4">
            <div className="text-sm text-[#6B7280]">Objeto do contrato</div>
            <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-3 text-sm min-h-[44px]">
              {contratoSelecionado?.objeto ? contratoSelecionado.objeto : "-"}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-3">
            <div className="text-sm text-[#6B7280]">Valor do contrato</div>
            <div className="rounded-lg border border-[#E5E7EB] bg-white p-2 text-xs font-semibold">{contratoSelecionado?.valorTotalAtual != null ? moeda(contratoSelecionado.valorTotalAtual) : "-"}</div>
          </div>
          <div className="md:col-span-3">
            <div className="text-sm text-[#6B7280]">Prazo</div>
            <div className="rounded-lg border border-[#E5E7EB] bg-white p-2 text-xs font-semibold">
              {contratoSelecionado?.prazoDias != null && Number.isFinite(contratoSelecionado.prazoDias) ? `${contratoSelecionado.prazoDias} dias` : "-"}
            </div>
          </div>
          <div className="md:col-span-3">
            <div className="text-sm text-[#6B7280]">Dias restantes</div>
            <div className={`rounded-lg border border-[#E5E7EB] bg-white p-2 text-xs font-semibold ${diasRestantesContrato != null && diasRestantesContrato < 0 ? "text-red-700" : ""}`}>
              {diasRestantesContrato == null ? "-" : diasRestantesContrato < 0 ? `Vencido há ${Math.abs(diasRestantesContrato)} dias` : `${diasRestantesContrato} dias`}
            </div>
          </div>
          <div className="md:col-span-3">
            <div className="text-sm text-[#6B7280]">Vigência</div>
            <div className="rounded-lg border border-[#E5E7EB] bg-white p-2 text-xs font-semibold">
              {contratoSelecionado?.vigenciaInicial || contratoSelecionado?.vigenciaAtual
                ? `${fmtDateShort(contratoSelecionado?.vigenciaInicial)} → ${fmtDateShort(contratoSelecionado?.vigenciaAtual)}`
                : "-"}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-semibold">Obras do contrato</div>
            <div className="text-xs text-[#6B7280]">Quando selecionar um contrato, aparece a lista de obras já cadastradas.</div>
          </div>
          <button
            type="button"
            className="rounded-lg bg-[#2563EB] px-4 py-2 text-sm text-white hover:bg-[#1D4ED8] disabled:opacity-60"
            disabled={!contratoId}
            onClick={() => {
              if (obraFormAberto && !obraId) {
                setObraFormAberto(false);
                return;
              }
              setObraFormAberto(true);
              setObraId(null);
              setEnderecoId(null);
              setEnderecos([]);
              setFormObra({ name: "", type: "PARTICULAR", status: "NAO_INICIADA", description: "", valorPrevisto: "" });
              setEnderecoFormAberto(false);
              setFormEndereco({
                nomeEndereco: "Principal",
                principal: true,
                origemEndereco: "MANUAL",
                origemCoordenada: "MANUAL",
                linkGoogleMaps: "",
                cep: "",
                logradouro: "",
                numero: "",
                complemento: "",
                bairro: "",
                cidade: "",
                uf: "",
                latitude: "",
                longitude: "",
              });
            }}
          >
            Nova Obra
          </button>
        </div>
        {contratoSelecionado?.valorTotalAtual != null ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <div className="md:col-span-3 rounded-lg border border-[#E5E7EB] bg-white p-3">
              <div className="text-xs text-[#6B7280]">Valor total das obras (somatório)</div>
              <div className="text-lg font-semibold">{moeda(totalObrasContrato)}</div>
            </div>
            <div className={`md:col-span-3 rounded-lg border border-[#E5E7EB] bg-white p-3 ${saldoContrato < 0 ? "border-red-200 bg-red-50" : ""}`}>
              <div className="text-xs text-[#6B7280]">Falta no contrato</div>
              <div className={`text-lg font-semibold ${saldoContrato < 0 ? "text-red-700" : ""}`}>{moeda(saldoContrato)}</div>
              {saldoContrato < 0 ? <div className="mt-1 text-xs text-red-700">Alerta: o somatório das obras ultrapassou o valor do contrato.</div> : null}
            </div>
          </div>
        ) : null}
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-[#F9FAFB] text-left text-[#111827]">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Valor previsto</th>
                <th className="px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {obrasContrato.map((o) => (
                <tr
                  key={o.id}
                  className={`border-t border-[#E5E7EB] cursor-pointer hover:bg-[#F9FAFB] ${obraId === o.id ? "bg-[#EFF6FF]" : ""}`}
                  onClick={() => {
                    selecionarObraSomente(o.id);
                  }}
                >
                  <td className="px-3 py-2">{o.id}</td>
                  <td className="px-3 py-2">{o.name}</td>
                  <td className="px-3 py-2">{o.type}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: OBRA_STATUS_COLOR_MAP[o.status] || "#9CA3AF" }} />
                      <span>{OBRA_STATUS_LABEL_MAP[o.status] || o.status}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {o.valorPrevisto == null ? "-" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(o.valorPrevisto)}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="rounded-lg border border-[#D1D5DB] bg-white px-2 py-1 text-xs text-[#111827] hover:bg-[#F9FAFB]"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        carregarObraParaEdicao(o.id);
                      }}
                    >
                      Editar obra
                    </button>
                  </td>
                </tr>
              ))}
              {!obrasContrato.length ? (
                <tr>
                  <td className="px-3 py-6 text-center text-[#6B7280]" colSpan={6}>
                    Selecione um contrato.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {obraFormAberto ? (
        <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm space-y-4">
          <div>
            <div className="text-sm font-semibold">Cadastro / Edição de Obra</div>
            <div className="text-xs text-[#6B7280]">{obraId ? `Editando a obra #${obraId}` : "Nova obra"}</div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <div className="md:col-span-4">
              <div className="text-sm text-[#6B7280]">Nome da Obra</div>
              <input className="input" value={formObra.name} onChange={(e) => setFormObra((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <div className="text-sm text-[#6B7280]">Tipo</div>
              <select className="input" value={formObra.type} onChange={(e) => setFormObra((p) => ({ ...p, type: e.target.value as any }))}>
                <option value="PARTICULAR">Particular</option>
                <option value="PUBLICA">Pública</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <div className="text-sm text-[#6B7280]">Status</div>
              <select className="input" value={formObra.status} onChange={(e) => setFormObra((p) => ({ ...p, status: e.target.value }))}>
                <option value="NAO_INICIADA">Não iniciada</option>
                <option value="EM_ANDAMENTO">Em andamento</option>
                <option value="PARADA">Parada</option>
                <option value="FINALIZADA">Finalizada</option>
                <option value="AGUARDANDO_RECURSOS">Aguardando recursos</option>
                <option value="AGUARDANDO_CONTRATO">Aguardando contrato</option>
                <option value="AGUARDANDO_OS">Aguardando OS</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <div className="text-sm text-[#6B7280]">Valor Previsto (R$)</div>
              <input className="input" value={formObra.valorPrevisto} onChange={(e) => setFormObra((p) => ({ ...p, valorPrevisto: formatMoneyBRFromDigits(e.target.value) }))} />
            </div>
            <div className="md:col-span-6">
              <div className="text-sm text-[#6B7280]">Descrição</div>
              <textarea className="input min-h-24" value={formObra.description} onChange={(e) => setFormObra((p) => ({ ...p, description: e.target.value }))} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              className="rounded-lg border border-[#D1D5DB] bg-white px-4 py-2 text-sm text-[#111827] hover:bg-[#F9FAFB]"
              type="button"
              onClick={() => {
                setObraFormAberto(false);
                setObraId(null);
                setEnderecoId(null);
                setEnderecos([]);
                setEnderecoFormAberto(false);
                setFormObra({ name: "", type: "PARTICULAR", status: "NAO_INICIADA", description: "", valorPrevisto: "" });
              }}
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              className="rounded-lg border border-[#D1D5DB] bg-white px-4 py-2 text-sm text-[#111827] hover:bg-[#F9FAFB]"
              type="button"
              onClick={() => carregarObrasContrato(contratoId)}
              disabled={!contratoId || loading}
            >
              Recarregar
            </button>
            <button
              className="rounded-lg bg-[#16A34A] px-4 py-2 text-sm text-white hover:bg-[#15803D] disabled:opacity-60"
              type="button"
              disabled={loading || !contratoId || formObra.name.trim().length < 3}
              onClick={salvar}
            >
              {loading ? "Salvando..." : obraId ? "Salvar Obra" : "Cadastrar Obra"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-semibold">
              Endereços já cadastrados nesta obra: {obraSelecionada ? `#${obraSelecionada.id} - ${obraSelecionada.name}` : "-"}
            </div>
            <div className="text-xs text-[#6B7280]">A obra pode ter vários endereços. Selecione um para editar.</div>
          </div>
          <button
            type="button"
            className="rounded-lg bg-[#2563EB] px-4 py-2 text-sm text-white hover:bg-[#1D4ED8] disabled:opacity-60"
            disabled={!obraId}
            onClick={() => {
              if (enderecoFormAberto && !enderecoId) {
                setEnderecoFormAberto(false);
                return;
              }
              limparEnderecoForm();
            }}
          >
            Novo Endereço
          </button>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-[#F9FAFB] text-left text-[#111827]">
              <tr>
                <th className="px-3 py-2">Código</th>
                <th className="px-3 py-2">Nome do endereço</th>
                <th className="px-3 py-2">Principal</th>
                <th className="px-3 py-2">Endereço completo</th>
                <th className="px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {enderecos.map((e) => (
                <tr
                  key={e.id}
                  className={`border-t border-[#E5E7EB] cursor-pointer hover:bg-[#F9FAFB] ${enderecoId === e.id ? "bg-[#EFF6FF]" : ""}`}
                  onClick={() => selecionarEnderecoSomente(e)}
                >
                  <td className="px-3 py-2">
                    {contratoSelecionado?.numeroContrato ? `${contratoSelecionado.numeroContrato}/${e.obraId} - ${e.nomeEndereco || "Principal"}` : `#${e.obraId} - ${e.nomeEndereco || "Principal"}`}
                  </td>
                  <td className="px-3 py-2">{e.nomeEndereco || "Principal"}</td>
                  <td className="px-3 py-2">{e.principal ? "Sim" : "Não"}</td>
                  <td className="px-3 py-2">
                    {[e.logradouro, e.numero, e.bairro, [e.cidade, e.uf].filter(Boolean).join(" / "), e.cep].filter(Boolean).join(", ") || "-"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="rounded-lg border border-[#D1D5DB] bg-white px-2 py-1 text-xs text-[#111827] hover:bg-[#F9FAFB]"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          selecionarEndereco(e);
                        }}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-[#D1D5DB] bg-white px-2 py-1 text-xs text-[#111827] hover:bg-[#F9FAFB]"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          removerEndereco(e.id);
                        }}
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!enderecos.length ? (
                <tr>
                  <td className="px-3 py-6 text-center text-[#6B7280]" colSpan={5}>
                    Selecione uma obra para gerenciar endereços.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {enderecoFormAberto ? (
        <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm space-y-4">
          <div>
            <div className="text-sm font-semibold">Cadastrar / Editar Endereço da Obra</div>
            <div className="text-xs text-[#6B7280]">{enderecoId ? `Editando o endereço #${enderecoId}` : "Novo endereço"}</div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <div className="md:col-span-3">
              <div className="text-sm text-[#6B7280]">Código do endereço (automático)</div>
              <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-3 text-sm">{obraId ? enderecoCodigo : "-"}</div>
            </div>
            <div className="md:col-span-2">
              <div className="text-sm text-[#6B7280]">Nome do endereço</div>
              <input className="input" value={formEndereco.nomeEndereco} onChange={(e) => setFieldEndereco("nomeEndereco", e.target.value as any)} />
            </div>
            <div className="md:col-span-1 flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={formEndereco.principal} onChange={(e) => setFieldEndereco("principal", e.target.checked as any)} />
                Definir como principal
              </label>
            </div>
            <div className="md:col-span-4">
              <div className="text-sm text-[#6B7280]">Link Google Maps</div>
              <div className="flex items-center gap-2">
                <input className="input" value={formEndereco.linkGoogleMaps} onChange={(e) => setFieldEndereco("linkGoogleMaps", e.target.value as any)} placeholder="Cole o link do Google Maps" />
                <button
                  type="button"
                  className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm text-[#111827] hover:bg-[#F9FAFB] disabled:opacity-60 whitespace-nowrap"
                  onClick={buscarLocalizacaoPorLink}
                  disabled={loading}
                >
                  Buscar localização
                </button>
              </div>
            </div>

            <div className="md:col-span-2">
              <div className="text-sm text-[#6B7280]">CEP</div>
              <div className="flex items-center gap-2">
                <input className="input" value={formEndereco.cep} onChange={(e) => setFieldEndereco("cep", e.target.value as any)} placeholder="00000-000" />
                <button
                  type="button"
                  className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm text-[#111827] hover:bg-[#F9FAFB] disabled:opacity-60 whitespace-nowrap"
                  onClick={buscaEnderecoPorCep}
                  disabled={loading}
                >
                  Busca Endereço por CEP
                </button>
              </div>
              <div className="mt-2">
                <button
                  type="button"
                  className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm text-[#111827] hover:bg-[#F9FAFB] disabled:opacity-60"
                  onClick={buscarCepPeloEndereco}
                  disabled={loading}
                >
                  Buscar CEP
                </button>
              </div>
            </div>

            <div className="md:col-span-4">
              <div className="text-sm text-[#6B7280]">Rua</div>
              <input
                className="input"
                value={formEndereco.logradouro}
                onChange={(e) => {
                  setFieldEndereco("logradouro", e.target.value as any);
                  setFieldEndereco("origemEndereco", "MANUAL" as any);
                }}
              />
            </div>
            <div className="md:col-span-2">
              <div className="text-sm text-[#6B7280]">Número</div>
              <input
                className="input"
                value={formEndereco.numero}
                onChange={(e) => {
                  setFieldEndereco("numero", e.target.value as any);
                  setFieldEndereco("origemEndereco", "MANUAL" as any);
                }}
              />
            </div>

            <div className="md:col-span-2">
              <div className="text-sm text-[#6B7280]">Bairro</div>
              <input
                className="input"
                value={formEndereco.bairro}
                onChange={(e) => {
                  setFieldEndereco("bairro", e.target.value as any);
                  setFieldEndereco("origemEndereco", "MANUAL" as any);
                }}
              />
            </div>
            <div className="md:col-span-2">
              <div className="text-sm text-[#6B7280]">Cidade</div>
              <input
                className="input"
                value={formEndereco.cidade}
                onChange={(e) => {
                  setFieldEndereco("cidade", e.target.value as any);
                  setFieldEndereco("origemEndereco", "MANUAL" as any);
                }}
                list={cidadesUf.length ? "cidadesUfList" : undefined}
              />
              {cidadesUf.length ? (
                <datalist id="cidadesUfList">
                  {cidadesUf.slice(0, 2000).map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              ) : null}
              {cidadeUfInvalidaMsg ? <div className="mt-1 text-xs text-amber-700">{cidadeUfInvalidaMsg}</div> : null}
            </div>
            <div className="md:col-span-2">
              <div className="text-sm text-[#6B7280]">Estado (sigla)</div>
              <input
                className="input"
                value={formEndereco.uf}
                onChange={(e) => {
                  setFieldEndereco("uf", e.target.value as any);
                  setFieldEndereco("origemEndereco", "MANUAL" as any);
                }}
                placeholder="SP"
              />
              {ufsEncontradosPorCidade.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {ufsEncontradosPorCidade.map((uf) => (
                    <button
                      key={uf}
                      type="button"
                      className="rounded-lg border border-[#D1D5DB] bg-white px-2 py-1 text-xs text-[#111827] hover:bg-[#F9FAFB]"
                      onClick={() => setFieldEndereco("uf", uf as any)}
                    >
                      {uf}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="md:col-span-2">
              <div className="text-sm text-[#6B7280]">Complemento</div>
              <input className="input" value={formEndereco.complemento} onChange={(e) => setFieldEndereco("complemento", e.target.value as any)} />
            </div>

            <div className="md:col-span-3">
              <div className="text-sm text-[#6B7280]">Latitude</div>
              <input
                className="input"
                value={formEndereco.latitude}
                onChange={(e) => {
                  setFieldEndereco("latitude", e.target.value as any);
                  setFieldEndereco("origemCoordenada", "MANUAL" as any);
                }}
              />
            </div>
            <div className="md:col-span-3">
              <div className="text-sm text-[#6B7280]">Longitude</div>
              <input
                className="input"
                value={formEndereco.longitude}
                onChange={(e) => {
                  setFieldEndereco("longitude", e.target.value as any);
                  setFieldEndereco("origemCoordenada", "MANUAL" as any);
                }}
              />
            </div>
            <div className="md:col-span-6">
              <div className="text-xs text-[#6B7280]">{coordMsg}</div>
              {alertaCoordsPossivelmenteDesatualizadas ? (
                <div className="mt-1 text-xs text-amber-700">
                  Você alterou o endereço após obter as coordenadas pelo link. As coordenadas podem não corresponder exatamente. Se quiser atualizar, clique em “Buscar localização”.
                </div>
              ) : null}
              <div className="mt-2">
                <button
                  type="button"
                  className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm text-[#111827] hover:bg-[#F9FAFB] disabled:opacity-60"
                  onClick={() => {
                    if (!isValidLatLng(formEndereco.latitude, formEndereco.longitude)) {
                      setErr("Latitude/Longitude inválidas. Informe valores válidos para abrir o mapa.");
                      return;
                    }
                    setLocalizacaoInformadaOpen(true);
                  }}
                  disabled={loading}
                >
                  Localização informada
                </button>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded-lg border border-[#D1D5DB] bg-white px-4 py-2 text-sm text-[#111827] hover:bg-[#F9FAFB] disabled:opacity-60"
              onClick={() => {
                setEnderecoFormAberto(false);
                setEnderecoId(null);
              }}
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="rounded-lg bg-[#16A34A] px-4 py-2 text-sm text-white hover:bg-[#15803D] disabled:opacity-60"
              onClick={salvarEndereco}
              disabled={!obraId || loading || formEndereco.nomeEndereco.trim().length < 1}
            >
              {loading ? "Salvando..." : enderecoId ? "Salvar Endereço" : "Cadastrar Endereço"}
            </button>
          </div>
        </div>
      ) : null}

      {localizacaoInformadaOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setLocalizacaoInformadaOpen(false)}>
          <div className="w-full max-w-5xl rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <div className="text-sm font-semibold">Localização informada</div>
                <div className="text-xs text-[#6B7280]">Mapa baseado na latitude e longitude registradas.</div>
              </div>
              <button
                type="button"
                className="rounded-lg border border-[#D1D5DB] bg-white px-4 py-2 text-sm text-[#111827] hover:bg-[#F9FAFB]"
                onClick={() => setLocalizacaoInformadaOpen(false)}
              >
                Fechar
              </button>
            </div>
            <div className="mt-3">
              <MapaObras
                obras={[
                  {
                    id: -1,
                    name: obraSelecionada ? obraSelecionada.name : "Localização informada",
                    type: (obraSelecionada?.type || "PARTICULAR") as any,
                    status: (obraSelecionada?.status || "EM_ANDAMENTO") as any,
                    enderecoObra: { latitude: formEndereco.latitude, longitude: formEndereco.longitude },
                    contratoNumero: contratoSelecionado?.numeroContrato || null,
                    hoverTitle: obraSelecionada ? `#${obraSelecionada.id} - ${obraSelecionada.name}` : "Localização informada",
                  } as any,
                ]}
                selectedObraId={-1}
              />
            </div>
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm space-y-3">
        <div>
          <div className="text-sm font-semibold">Mapa</div>
          <div className="text-xs text-[#6B7280]">
            Ao selecionar uma obra ou endereço na lista, ele fica iluminado na lista e no mapa.
          </div>
        </div>
        <MapaObras obras={mapaData as any} selectedObraId={mapaSelectedId as any} />
      </div>
    </div>
  );
}
