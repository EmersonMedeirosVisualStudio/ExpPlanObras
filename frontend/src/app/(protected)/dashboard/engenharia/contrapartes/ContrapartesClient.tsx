"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/api";
import { FileText, Pencil, Plus, Trash2 } from "lucide-react";

const MapaObras = dynamic(() => import("@/components/MapaObras"), { ssr: false });

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
] as const;

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

const CLASSIFICACOES = ["EXCELENTE", "BOA", "REGULAR", "EM_AVALIACAO", "NAO_RECOMENDADO"] as const;
type ClassificacaoStatus = (typeof CLASSIFICACOES)[number];
function classificacaoLabel(v: ClassificacaoStatus) {
  if (v === "EXCELENTE") return "Excelente";
  if (v === "BOA") return "Boa";
  if (v === "REGULAR") return "Regular";
  if (v === "EM_AVALIACAO") return "Em avaliação";
  return "Não recomendado";
}
function classificacaoPill(v: ClassificacaoStatus | null | undefined) {
  const s = v || "EM_AVALIACAO";
  if (s === "EXCELENTE") return "bg-green-100 text-green-700";
  if (s === "BOA") return "bg-emerald-100 text-emerald-700";
  if (s === "REGULAR") return "bg-amber-100 text-amber-700";
  if (s === "NAO_RECOMENDADO") return "bg-red-100 text-red-700";
  return "bg-gray-100 text-gray-700";
}

type ContraparteDTO = {
  idContraparte: number;
  tipo: "PJ" | "PF";
  nomeRazao: string;
  documento: string | null;
  email: string | null;
  telefone: string | null;
  status: "ATIVO" | "INATIVO";
  classificacaoStatus: ClassificacaoStatus | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  latitude: string | null;
  longitude: string | null;
};

type ContratoDTO = { idContratoLocacao: number; tipo: "ATIVO" | "PASSIVO" | "SERVICO"; status: "ATIVO" | "ENCERRADO"; numero: string | null; codigoServico: string | null; valorMensal: number | null };
type AvaliacaoDTO = { idAvaliacao: number; nota: number | null; comentario: string | null; criadoEm: string };
type OcorrenciaDTO = {
  idOcorrencia: number;
  idContratoLocacao: number | null;
  tipo: string | null;
  gravidade: "BAIXA" | "MEDIA" | "ALTA" | "CRITICA";
  dataOcorrencia: string | null;
  descricao: string;
  criadoEm: string;
};

type DocumentoParceiroDTO = {
  idDocumento: number;
  nomeArquivo: string;
  mimeType: string;
  tamanhoBytes: number;
  criadoEm: string;
};

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Erro ao ler arquivo"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

function contraparteAlertUi(r: ContraparteDTO) {
  const issues: string[] = [];
  const nome = String(r.nomeRazao || "").trim();
  const docDigits = r.documento ? onlyDigits(r.documento) : "";
  if (!nome) issues.push("Nome/Razão social ausente");

  const invalidDoc = (r.tipo === "PF" && docDigits && docDigits.length !== 11) || (r.tipo === "PJ" && docDigits && docDigits.length !== 14);
  if (!docDigits) issues.push("Documento (CPF/CNPJ) ausente");
  if (invalidDoc) issues.push(r.tipo === "PF" ? "CPF inválido (precisa ter 11 dígitos)" : "CNPJ inválido (precisa ter 14 dígitos)");

  const contato = [r.email, r.telefone].map((x) => String(x || "").trim()).filter(Boolean);
  if (!contato.length) issues.push("Contato ausente (email/telefone)");

  const local = [r.cidade, r.uf].map((x) => String(x || "").trim()).filter(Boolean);
  if (!local.length) issues.push("Cidade/UF ausentes");

  const critical = !nome || invalidDoc;
  const icon = issues.length ? (critical ? "✖" : "⚠") : "✔";
  const className = issues.length ? (critical ? "text-red-600" : "text-amber-600") : "text-emerald-600";
  const title = issues.join(" • ");
  return { icon, className, title };
}

export default function ContrapartesClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const urlIdContraparte = sp.get("idContraparte");
  const returnTo = sp.get("returnTo");
  const targetId = useMemo(() => {
    const n = urlIdContraparte ? Number(urlIdContraparte) : null;
    return n && Number.isFinite(n) && n > 0 ? n : null;
  }, [urlIdContraparte]);
  const [filtrosAberto, setFiltrosAberto] = useState(false);
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState<"" | "PJ" | "PF">("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [classificacaoSel, setClassificacaoSel] = useState<ClassificacaoStatus[]>(() => CLASSIFICACOES.filter((x) => x !== "NAO_RECOMENDADO"));
  const [rows, setRows] = useState<ContraparteDTO[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [coordMsg, setCoordMsg] = useState("");
  const [coordOrigem, setCoordOrigem] = useState<"LINK" | "CEP" | "MANUAL">("MANUAL");
  const [alertaCoordsPossivelmenteDesatualizadas, setAlertaCoordsPossivelmenteDesatualizadas] = useState(false);
  const [lastLinkSnapshot, setLastLinkSnapshot] = useState<{
    logradouro: string;
    numero: string;
    bairro: string;
    cidade: string;
    uf: string;
    cep: string;
  } | null>(null);
  const [cidadesUf, setCidadesUf] = useState<string[]>([]);
  const [ufsEncontradosPorCidade, setUfsEncontradosPorCidade] = useState<string[]>([]);
  const [cidadeUfInvalidaMsg, setCidadeUfInvalidaMsg] = useState<string>("");
  const [ibgeUfIdBySigla, setIbgeUfIdBySigla] = useState<Record<string, number>>({});
  const [localizacaoInformadaOpen, setLocalizacaoInformadaOpen] = useState(false);

  const [novo, setNovo] = useState({
    tipo: "PJ" as "PJ" | "PF",
    nomeRazao: "",
    documento: "",
    email: "",
    telefone: "",
    classificacaoStatus: "EM_AVALIACAO" as ClassificacaoStatus,
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
  const [edicaoId, setEdicaoId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const [idSelecionado, setIdSelecionado] = useState<number | null>(null);
  const [contratos, setContratos] = useState<ContratoDTO[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<AvaliacaoDTO[]>([]);
  const [ocorrencias, setOcorrencias] = useState<OcorrenciaDTO[]>([]);

  const [docsParceiro, setDocsParceiro] = useState<DocumentoParceiroDTO[]>([]);
  const [docUploadFile, setDocUploadFile] = useState<File | null>(null);
  const [docUploading, setDocUploading] = useState(false);
  const [docPreviewUrl, setDocPreviewUrl] = useState<string | null>(null);
  const [docPreviewMime, setDocPreviewMime] = useState<string | null>(null);
  const [docPreviewName, setDocPreviewName] = useState<string | null>(null);

  const [novaAvaliacao, setNovaAvaliacao] = useState({ nota: "", comentario: "" });
  const [novaOcorrencia, setNovaOcorrencia] = useState({ idContratoLocacao: "", tipo: "", gravidade: "MEDIA" as OcorrenciaDTO["gravidade"], dataOcorrencia: "", descricao: "" });

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (tipo) params.set("tipo", tipo);
    if (cidade.trim()) params.set("cidade", cidade.trim());
    if (uf.trim()) params.set("uf", uf.trim().toUpperCase());
    if (classificacaoSel.length) params.set("classificacaoStatus", classificacaoSel.join(","));
    const s = params.toString();
    return s ? `?${s}` : "";
  }, [q, tipo, cidade, uf, classificacaoSel]);

  const selecionado = useMemo(() => rows.find((r) => r.idContraparte === idSelecionado) || null, [rows, idSelecionado]);
  const cidadesOpcoes = useMemo(() => Array.from(new Set(rows.map((r) => String(r.cidade || "").trim()).filter(Boolean))).sort(), [rows]);
  const ufsOpcoes = useMemo(() => Array.from(new Set(rows.map((r) => String(r.uf || "").trim().toUpperCase()).filter(Boolean))).sort(), [rows]);

  function setNovoField<K extends keyof typeof novo>(key: K, value: (typeof novo)[K]) {
    setNovo((p) => ({ ...p, [key]: value }));
  }

  function limparFormularioCompleto() {
    setNovo({
      tipo: "PJ",
      nomeRazao: "",
      documento: "",
      email: "",
      telefone: "",
      classificacaoStatus: "EM_AVALIACAO",
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
    setCoordOrigem("MANUAL");
    setCoordMsg(coordMsgFromOrigem("MANUAL"));
    setAlertaCoordsPossivelmenteDesatualizadas(false);
    setLastLinkSnapshot(null);
    setCidadesUf([]);
    setUfsEncontradosPorCidade([]);
    setCidadeUfInvalidaMsg("");
    setLocalizacaoInformadaOpen(false);
  }

  async function carregar() {
    try {
      setLoading(true);
      setErr(null);
      const res = await api.get(`/api/v1/engenharia/contrapartes${queryString}`);
      const data = unwrapApiData<any>(res.data);
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao carregar contrapartes");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function carregarHistorico(idContraparte: number) {
    try {
      setLoading(true);
      setErr(null);
      const [contratosRes, avalRes, ocoRes] = await Promise.all([
        api.get(`/api/v1/engenharia/contratos-locacao?idContraparte=${idContraparte}`),
        api.get(`/api/v1/engenharia/contrapartes/${idContraparte}/avaliacoes`),
        api.get(`/api/v1/engenharia/contrapartes/${idContraparte}/ocorrencias`),
      ]);
      const contratosData = unwrapApiData<any>(contratosRes.data);
      const avalData = unwrapApiData<any>(avalRes.data);
      const ocoData = unwrapApiData<any>(ocoRes.data);
      setContratos(Array.isArray(contratosData) ? contratosData : []);
      setAvaliacoes(Array.isArray(avalData) ? avalData : []);
      setOcorrencias(Array.isArray(ocoData) ? ocoData : []);
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao carregar histórico");
      setContratos([]);
      setAvaliacoes([]);
      setOcorrencias([]);
    } finally {
      setLoading(false);
    }
  }

  async function carregarDocsParceiro(idContraparte: number) {
    try {
      setErr(null);
      const res = await api.get(`/api/v1/engenharia/contrapartes/${idContraparte}/documentos`);
      const data = unwrapApiData<any>(res.data);
      setDocsParceiro(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setDocsParceiro([]);
      setErr(e?.response?.data?.message || e?.message || "Erro ao carregar documentos do parceiro");
    }
  }

  async function adicionarDocParceiro() {
    if (!idSelecionado) return;
    if (!docUploadFile) return;
    try {
      setDocUploading(true);
      setErr(null);
      const conteudoBase64 = await fileToBase64(docUploadFile);
      const payload: any = {
        nomeArquivo: docUploadFile.name,
        mimeType: docUploadFile.type || "application/octet-stream",
        conteudoBase64,
      };
      await api.post(`/api/v1/engenharia/contrapartes/${idSelecionado}/documentos`, payload);
      setDocUploadFile(null);
      await carregarDocsParceiro(idSelecionado);
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao enviar documento do parceiro");
    } finally {
      setDocUploading(false);
    }
  }

  async function excluirDocParceiro(idDocumento: number) {
    if (!idSelecionado) return;
    if (!window.confirm("Excluir este documento do parceiro?")) return;
    try {
      setErr(null);
      await api.delete(`/api/v1/engenharia/contrapartes/${idSelecionado}/documentos/${idDocumento}`);
      if (docPreviewUrl) {
        URL.revokeObjectURL(docPreviewUrl);
        setDocPreviewUrl(null);
        setDocPreviewMime(null);
        setDocPreviewName(null);
      }
      await carregarDocsParceiro(idSelecionado);
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao excluir documento do parceiro");
    }
  }

  async function visualizarDocParceiro(doc: DocumentoParceiroDTO) {
    if (!idSelecionado) return;
    try {
      setErr(null);
      const res = await api.get(`/api/v1/engenharia/contrapartes/${idSelecionado}/documentos/${doc.idDocumento}/download`, { responseType: "blob" as any });
      const blob = res.data as Blob;
      const url = URL.createObjectURL(blob);
      if (docPreviewUrl) URL.revokeObjectURL(docPreviewUrl);
      setDocPreviewUrl(url);
      setDocPreviewMime(doc.mimeType || blob.type || "application/octet-stream");
      setDocPreviewName(doc.nomeArquivo);
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao baixar documento do parceiro");
    }
  }

  async function criarAvaliacao() {
    if (!idSelecionado) return;
    try {
      setErr(null);
      const payload: any = {
        nota: novaAvaliacao.nota ? Number(novaAvaliacao.nota) : null,
        comentario: novaAvaliacao.comentario || null,
      };
      await api.post(`/api/v1/engenharia/contrapartes/${idSelecionado}/avaliacoes`, payload);
      setNovaAvaliacao({ nota: "", comentario: "" });
      await carregarHistorico(idSelecionado);
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao registrar avaliação");
    }
  }

  async function criarOcorrencia() {
    if (!idSelecionado) return;
    try {
      setErr(null);
      const payload: any = {
        idContratoLocacao: novaOcorrencia.idContratoLocacao ? Number(novaOcorrencia.idContratoLocacao) : null,
        tipo: novaOcorrencia.tipo || null,
        gravidade: novaOcorrencia.gravidade,
        dataOcorrencia: novaOcorrencia.dataOcorrencia || null,
        descricao: novaOcorrencia.descricao,
      };
      await api.post(`/api/v1/engenharia/contrapartes/${idSelecionado}/ocorrencias`, payload);
      setNovaOcorrencia({ idContratoLocacao: "", tipo: "", gravidade: "MEDIA", dataOcorrencia: "", descricao: "" });
      await carregarHistorico(idSelecionado);
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao registrar ocorrência");
    }
  }

  async function buscarLocalizacaoPorLink() {
    const link = String(novo.linkGoogleMaps || "").trim();
    if (!link) {
      setErr("Informe um link do Google Maps.");
      return;
    }
    try {
      setLoading(true);
      setErr(null);
      const res = await api.post("/api/obras/enderecos/preview/link", { link });
      const d: any = res.data || {};
      setNovo((p) => {
        const next = {
          ...p,
          cep: d.cep ? String(d.cep) : p.cep,
          logradouro: d.logradouro ? String(d.logradouro) : p.logradouro,
          numero: d.numero ? String(d.numero) : p.numero,
          complemento: d.complemento ? String(d.complemento) : p.complemento,
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
      setCoordOrigem("LINK");
      setCoordMsg(coordMsgFromOrigem("LINK"));
      setAlertaCoordsPossivelmenteDesatualizadas(false);
      setCidadeUfInvalidaMsg("");
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao buscar localização pelo link.");
    } finally {
      setLoading(false);
    }
  }

  async function buscaEnderecoPorCep() {
    const cepDigits = normalizeCep(novo.cep);
    if (!cepDigits) {
      setErr("CEP inválido. Informe 8 dígitos (com ou sem máscara).");
      return;
    }
    try {
      setLoading(true);
      setErr(null);
      const res = await api.post("/api/obras/enderecos/preview/cep", { cep: cepDigits });
      const d: any = res.data || {};
      setNovo((p) => {
        const next: typeof novo = {
          ...p,
          cep: d.cep ? String(d.cep) : cepDigits,
          logradouro: d.logradouro ? String(d.logradouro) : p.logradouro,
          complemento: d.complemento ? String(d.complemento) : p.complemento,
          bairro: d.bairro ? String(d.bairro) : p.bairro,
          cidade: d.cidade ? String(d.cidade) : p.cidade,
          uf: d.uf ? String(d.uf).toUpperCase() : p.uf,
        };

        const coordsFromLink = coordOrigem === "LINK";
        const hasCoords = Boolean(String(p.latitude || "").trim()) && Boolean(String(p.longitude || "").trim());
        const canSetCoords = !coordsFromLink && !hasCoords;
        if (canSetCoords && d.latitude && d.longitude) {
          next.latitude = String(d.latitude);
          next.longitude = String(d.longitude);
          setCoordOrigem("CEP");
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
    const ufSigla = String(novo.uf || "").trim().toUpperCase();
    const cidadeNome = String(novo.cidade || "").trim();
    const logradouroNome = String(novo.logradouro || "").trim();
    if (!logradouroNome || !cidadeNome || !ufSigla) {
      setErr("Para buscar o CEP, informe Rua, Cidade e UF.");
      return;
    }
    try {
      setLoading(true);
      setErr(null);
      const res = await api.post("/api/obras/enderecos/preview/buscar-cep", {
        logradouro: logradouroNome,
        numero: String(novo.numero || "").trim() || null,
        bairro: String(novo.bairro || "").trim() || null,
        cidade: cidadeNome,
        uf: ufSigla,
      });
      const d: any = res.data || {};
      if (d.cep) setNovoField("cep", String(d.cep) as any);
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao buscar CEP.");
    } finally {
      setLoading(false);
    }
  }

  async function criar() {
    try {
      setErr(null);
      const payload = {
        tipo: novo.tipo,
        nomeRazao: novo.nomeRazao,
        documento: novo.documento ? onlyDigits(novo.documento) : null,
        email: novo.email || null,
        telefone: novo.telefone || null,
        classificacaoStatus: novo.classificacaoStatus,
        cep: novo.cep || null,
        logradouro: novo.logradouro || null,
        numero: novo.numero || null,
        complemento: novo.complemento || null,
        bairro: novo.bairro || null,
        cidade: novo.cidade || null,
        uf: novo.uf || null,
        latitude: novo.latitude || null,
        longitude: novo.longitude || null,
      };
      await api.post("/api/v1/engenharia/contrapartes", payload);
      limparFormularioCompleto();
      setFormOpen(false);
      await carregar();
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao criar contraparte");
    }
  }

  async function salvarEdicao() {
    if (!edicaoId) return;
    try {
      setErr(null);
      const payload = {
        tipo: novo.tipo,
        nomeRazao: novo.nomeRazao,
        documento: novo.documento ? onlyDigits(novo.documento) : null,
        email: novo.email || null,
        telefone: novo.telefone || null,
        classificacaoStatus: novo.classificacaoStatus,
        cep: novo.cep || null,
        logradouro: novo.logradouro || null,
        numero: novo.numero || null,
        complemento: novo.complemento || null,
        bairro: novo.bairro || null,
        cidade: novo.cidade || null,
        uf: novo.uf || null,
        latitude: novo.latitude || null,
        longitude: novo.longitude || null,
      };
      await api.put(`/api/v1/engenharia/contrapartes/${edicaoId}`, payload);
      setEdicaoId(null);
      limparFormularioCompleto();
      setFormOpen(false);
      await carregar();
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao atualizar contraparte");
    }
  }

  async function excluirContraparte(idContraparte: number) {
    if (!window.confirm("Excluir esta contraparte?")) return;
    try {
      setErr(null);
      await api.delete(`/api/v1/engenharia/contrapartes/${idContraparte}`);
      if (idSelecionado === idContraparte) setIdSelecionado(null);
      if (edicaoId === idContraparte) {
        setEdicaoId(null);
        limparFormularioCompleto();
        setFormOpen(false);
      }
      await carregar();
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao excluir contraparte");
    }
  }

  function prepararEdicao(contraparte: ContraparteDTO) {
    setEdicaoId(contraparte.idContraparte);
    setNovo({
      tipo: contraparte.tipo,
      nomeRazao: contraparte.nomeRazao || "",
      documento: contraparte.documento ? formatCpfCnpj(contraparte.documento) : "",
      email: contraparte.email || "",
      telefone: contraparte.telefone || "",
      classificacaoStatus: (contraparte.classificacaoStatus || "EM_AVALIACAO") as ClassificacaoStatus,
      linkGoogleMaps: "",
      cep: contraparte.cep || "",
      logradouro: contraparte.logradouro || "",
      numero: contraparte.numero || "",
      complemento: contraparte.complemento || "",
      bairro: contraparte.bairro || "",
      cidade: contraparte.cidade || "",
      uf: contraparte.uf || "",
      latitude: contraparte.latitude || "",
      longitude: contraparte.longitude || "",
    });
    setCoordOrigem("MANUAL");
    setCoordMsg(coordMsgFromOrigem("MANUAL"));
    setAlertaCoordsPossivelmenteDesatualizadas(false);
    setLastLinkSnapshot(null);
    setCidadeUfInvalidaMsg("");
    setFormOpen(true);
  }

  useEffect(() => {
    carregar();
  }, []);

  useEffect(() => {
    if (!targetId) return;
    if (idSelecionado) return;
    if (!rows.length) return;
    if (rows.some((r) => r.idContraparte === targetId)) setIdSelecionado(targetId);
  }, [targetId, rows, idSelecionado]);

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
    const origem = String(coordOrigem || "MANUAL").toUpperCase();
    setCoordMsg(coordMsgFromOrigem(origem));
  }, [coordOrigem]);

  useEffect(() => {
    const ufSigla = String(novo.uf || "")
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 2);
    if (ufSigla !== novo.uf) setNovoField("uf", ufSigla as any);
    if (!ufSigla || ufSigla.length !== 2 || !UF_LIST.includes(ufSigla as any)) {
      setCidadesUf([]);
      setCidadeUfInvalidaMsg("");
      return;
    }
    const ufId = ibgeUfIdBySigla[ufSigla];
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
        const cidadeAtual = String(novo.cidade || "").trim();
        if (cidadeAtual) {
          const ok = cidades.some((c) => c.toLowerCase() === cidadeAtual.toLowerCase());
          if (!ok) {
            setNovoField("cidade", "" as any);
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
  }, [novo.uf, ibgeUfIdBySigla]);

  useEffect(() => {
    const cidadeNome = String(novo.cidade || "").trim();
    if (cidadeNome.length < 3) {
      setUfsEncontradosPorCidade([]);
      return;
    }
    const ufSigla = String(novo.uf || "").trim().toUpperCase();
    if (ufSigla && ufSigla.length === 2 && UF_LIST.includes(ufSigla as any)) {
      setUfsEncontradosPorCidade([]);
      return;
    }
    const slug = toIbgeSlug(cidadeNome);
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
              .filter((x: string) => x && UF_LIST.includes(x as any))
          )
        );
        if (ufs.length === 1) {
          setNovoField("uf", ufs[0] as any);
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
  }, [novo.cidade, novo.uf]);

  useEffect(() => {
    if (!lastLinkSnapshot) return;
    if (coordOrigem !== "LINK") return;
    const changed =
      String(novo.logradouro || "") !== lastLinkSnapshot.logradouro ||
      String(novo.numero || "") !== lastLinkSnapshot.numero ||
      String(novo.bairro || "") !== lastLinkSnapshot.bairro ||
      String(novo.cidade || "") !== lastLinkSnapshot.cidade ||
      String(novo.uf || "") !== lastLinkSnapshot.uf ||
      String(novo.cep || "") !== lastLinkSnapshot.cep;
    setAlertaCoordsPossivelmenteDesatualizadas(changed);
  }, [coordOrigem, novo.logradouro, novo.numero, novo.bairro, novo.cidade, novo.uf, novo.cep, lastLinkSnapshot]);

  useEffect(() => {
    if (!idSelecionado) return;
    carregarHistorico(idSelecionado);
    carregarDocsParceiro(idSelecionado);
  }, [idSelecionado]);

  return (
    <div className="space-y-6 text-[#111827]">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Parceiros Comerciais (Contrapartes)</h1>
          <p className="text-sm text-[#6B7280]">Cadastro unificado de pessoas jurídicas e pessoas físicas.</p>
        </div>
        <div className="flex items-center gap-2">
          {returnTo ? (
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm text-[#111827] hover:bg-[#F9FAFB]"
              onClick={() => router.push(returnTo)}
            >
              Voltar
            </button>
          ) : null}
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-[#16A34A] px-4 py-2 text-sm text-white hover:bg-[#15803D] disabled:opacity-60"
            onClick={() => {
              setEdicaoId(null);
              limparFormularioCompleto();
              setFormOpen(true);
            }}
            disabled={loading}
          >
            <Plus className="h-4 w-4" />
            Nova contraparte
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#2563EB]" />
            <div>
              <div className="text-sm font-semibold">Filtros</div>
              <div className="text-xs text-[#6B7280]">Use filtros de seleção e status (caixa de marcar).</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm text-[#111827] hover:bg-[#F9FAFB]"
              onClick={() => setFiltrosAberto((v) => !v)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M3 5h18M6 12h12M10 19h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              {filtrosAberto ? "Ocultar" : "Exibir"}
            </button>
            <button
              className="rounded-lg bg-[#2563EB] px-4 py-2 text-sm text-white hover:bg-[#1D4ED8] disabled:opacity-60"
              type="button"
              onClick={carregar}
              disabled={loading}
            >
              {loading ? "Carregando..." : "Aplicar"}
            </button>
          </div>
        </div>

        {filtrosAberto ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
              <div className="md:col-span-2">
                <div className="text-sm text-[#6B7280]">Busca</div>
                <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, documento, email ou telefone" />
              </div>
              <div>
                <div className="text-sm text-[#6B7280]">Tipo</div>
                <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value as any)}>
                  <option value="">Todos</option>
                  <option value="PJ">PJ</option>
                  <option value="PF">PF</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <div className="text-sm text-[#6B7280]">Cidade</div>
                <input className="input" value={cidade} onChange={(e) => setCidade(e.target.value)} list="contrapartes-cidades" placeholder="Selecione ou digite" />
                <datalist id="contrapartes-cidades">
                  {cidadesOpcoes.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div>
                <div className="text-sm text-[#6B7280]">UF</div>
                <input className="input" value={uf} onChange={(e) => setUf(e.target.value)} list="contrapartes-ufs" placeholder="Selecione" />
                <datalist id="contrapartes-ufs">
                  {ufsOpcoes.map((u) => (
                    <option key={u} value={u} />
                  ))}
                </datalist>
              </div>
            </div>

            <div>
              <div className="text-sm text-[#6B7280]">Status</div>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {CLASSIFICACOES.map((s) => {
                  const checked = classificacaoSel.includes(s);
                  return (
                    <label key={s} className="flex items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const on = e.target.checked;
                          setClassificacaoSel((prev) => (on ? Array.from(new Set([...prev, s])) : prev.filter((x) => x !== s)));
                        }}
                      />
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${classificacaoPill(s)}`}>{classificacaoLabel(s)}</span>
                    </label>
                  );
                })}
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-[#D1D5DB] bg-white px-4 py-2 text-sm text-[#111827] hover:bg-[#F9FAFB]"
                  onClick={() => {
                    setQ("");
                    setTipo("");
                    setCidade("");
                    setUf("");
                    setClassificacaoSel(CLASSIFICACOES.filter((x) => x !== "NAO_RECOMENDADO"));
                  }}
                >
                  Limpar
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}
      </div>

      {formOpen ? (
        <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#16A34A]" />
            <div>
              <div className="text-sm font-semibold">{edicaoId ? "Editar contraparte" : "Nova contraparte"}</div>
              <div className="text-xs text-[#6B7280]">Cadastre uma nova pessoa jurídica ou física.</div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <div>
            <div className="text-sm text-[#6B7280]">Tipo</div>
            <select className="input" value={novo.tipo} onChange={(e) => setNovoField("tipo", e.target.value as any)}>
              <option value="PJ">PJ</option>
              <option value="PF">PF</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <div className="text-sm text-[#6B7280]">Nome/Razão Social</div>
            <input className="input" value={novo.nomeRazao} onChange={(e) => setNovoField("nomeRazao", e.target.value as any)} />
          </div>
          <div>
            <div className="text-sm text-[#6B7280]">Documento</div>
            <input className="input" value={novo.documento} onChange={(e) => setNovoField("documento", formatCpfCnpj(e.target.value) as any)} />
          </div>
          <div>
            <div className="text-sm text-[#6B7280]">Status</div>
            <select className="input" value={novo.classificacaoStatus} onChange={(e) => setNovoField("classificacaoStatus", e.target.value as any)}>
              {CLASSIFICACOES.map((s) => (
                <option key={s} value={s}>
                  {classificacaoLabel(s)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-sm text-[#6B7280]">Email</div>
            <input className="input" value={novo.email} onChange={(e) => setNovoField("email", e.target.value as any)} />
          </div>
          <div>
            <div className="text-sm text-[#6B7280]">Telefone</div>
            <input className="input" value={novo.telefone} onChange={(e) => setNovoField("telefone", e.target.value as any)} />
          </div>
        </div>
        <div className="mt-3 rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-3 space-y-3">
          <div className="text-sm font-semibold">Endereço</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <div className="md:col-span-4">
              <div className="text-sm text-[#6B7280]">Link Google Maps</div>
              <div className="flex items-center gap-2">
                <input className="input" value={novo.linkGoogleMaps} onChange={(e) => setNovoField("linkGoogleMaps", e.target.value as any)} placeholder="Cole o link do Google Maps" />
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
                <input className="input" value={novo.cep} onChange={(e) => setNovoField("cep", e.target.value as any)} placeholder="00000-000" />
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
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <div className="md:col-span-3">
              <div className="text-sm text-[#6B7280]">Rua</div>
              <input className="input" value={novo.logradouro} onChange={(e) => setNovoField("logradouro", e.target.value as any)} />
            </div>
            <div>
              <div className="text-sm text-[#6B7280]">Número</div>
              <input className="input" value={novo.numero} onChange={(e) => setNovoField("numero", e.target.value as any)} />
            </div>
            <div className="md:col-span-2">
              <div className="text-sm text-[#6B7280]">Complemento</div>
              <input className="input" value={novo.complemento} onChange={(e) => setNovoField("complemento", e.target.value as any)} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <div className="md:col-span-2">
              <div className="text-sm text-[#6B7280]">Bairro</div>
              <input className="input" value={novo.bairro} onChange={(e) => setNovoField("bairro", e.target.value as any)} />
            </div>
            <div className="md:col-span-2">
              <div className="text-sm text-[#6B7280]">Cidade</div>
              <input className="input" value={novo.cidade} onChange={(e) => setNovoField("cidade", e.target.value as any)} list={cidadesUf.length ? "contrapartes-ibge-cidades" : undefined} />
              {cidadesUf.length ? (
                <datalist id="contrapartes-ibge-cidades">
                  {cidadesUf.slice(0, 2000).map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              ) : null}
              {cidadeUfInvalidaMsg ? <div className="mt-1 text-xs text-amber-700">{cidadeUfInvalidaMsg}</div> : null}
            </div>
            <div>
              <div className="text-sm text-[#6B7280]">Estado (sigla)</div>
              <input className="input" value={novo.uf} onChange={(e) => setNovoField("uf", e.target.value as any)} placeholder="SP" />
              {ufsEncontradosPorCidade.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {ufsEncontradosPorCidade.map((u) => (
                    <button key={u} type="button" className="rounded-lg border border-[#D1D5DB] bg-white px-2 py-1 text-xs text-[#111827] hover:bg-[#F9FAFB]" onClick={() => setNovoField("uf", u as any)}>
                      {u}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div>
              <div className="text-sm text-[#6B7280]">Latitude</div>
              <input
                className="input"
                value={novo.latitude}
                onChange={(e) => {
                  setNovoField("latitude", e.target.value as any);
                  setCoordOrigem("MANUAL");
                }}
              />
            </div>
            <div>
              <div className="text-sm text-[#6B7280]">Longitude</div>
              <input
                className="input"
                value={novo.longitude}
                onChange={(e) => {
                  setNovoField("longitude", e.target.value as any);
                  setCoordOrigem("MANUAL");
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
                    if (!isValidLatLng(novo.latitude, novo.longitude)) {
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
        </div>
        <div className="flex justify-end">
          <div className="flex gap-2">
            <button
              className="rounded-lg border border-[#D1D5DB] bg-white px-4 py-2 text-sm text-[#111827] hover:bg-[#F9FAFB]"
              type="button"
              onClick={() => {
                setEdicaoId(null);
                limparFormularioCompleto();
                setFormOpen(false);
              }}
            >
              Fechar
            </button>
            <button
              className="rounded-lg border border-[#D1D5DB] bg-white px-4 py-2 text-sm text-[#111827] hover:bg-[#F9FAFB]"
              type="button"
              onClick={limparFormularioCompleto}
            >
              Limpar
            </button>
            <button
              className="rounded-lg bg-[#16A34A] px-4 py-2 text-sm text-white hover:bg-[#15803D] disabled:opacity-60"
              type="button"
              onClick={edicaoId ? salvarEdicao : criar}
              disabled={loading}
            >
              Salvar
            </button>
          </div>
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
                    name: novo.nomeRazao || "Localização informada",
                    type: "PARTICULAR",
                    status: "EM_ANDAMENTO",
                    enderecoObra: { latitude: novo.latitude, longitude: novo.longitude },
                    contratoNumero: null,
                    hoverTitle: novo.nomeRazao ? novo.nomeRazao : "Localização informada",
                  } as any,
                ]}
                selectedObraId={-1}
              />
            </div>
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-semibold">Contrapartes cadastradas</div>
            <div className="text-xs text-[#6B7280]">Lista de todas as contrapartes registradas no sistema.</div>
          </div>
        </div>
        <div className="mt-3 overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-[#F9FAFB] text-left text-[#111827]">
              <tr>
                <th className="px-3 py-2">Alerta</th>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Nome/Razão</th>
                <th className="px-3 py-2">Documento</th>
                <th className="px-3 py-2">Cidade/UF</th>
                <th className="px-3 py-2">Contato</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Situação</th>
                <th className="px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.idContraparte}
                  className={`border-t border-[#E5E7EB] cursor-pointer hover:bg-[#F9FAFB] ${idSelecionado === r.idContraparte ? "bg-[#EFF6FF]" : ""}`}
                  onClick={() => {
                    setIdSelecionado(r.idContraparte);
                    setFormOpen(false);
                  }}
                >
                  <td className="px-3 py-2">
                    <span className={`font-semibold ${contraparteAlertUi(r).className}`} title={contraparteAlertUi(r).title}>
                      {contraparteAlertUi(r).icon}
                    </span>
                  </td>
                  <td className="px-3 py-2">{r.idContraparte}</td>
                  <td className="px-3 py-2">{r.tipo}</td>
                  <td className="px-3 py-2">{r.nomeRazao}</td>
                  <td className="px-3 py-2">{r.documento ? formatCpfCnpj(r.documento) : "-"}</td>
                  <td className="px-3 py-2">{[r.cidade, r.uf].filter(Boolean).join(" / ") || "-"}</td>
                  <td className="px-3 py-2">{[r.email, r.telefone].filter(Boolean).join(" · ") || "-"}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${classificacaoPill(r.classificacaoStatus)}`}>
                      {classificacaoLabel((r.classificacaoStatus || "EM_AVALIACAO") as ClassificacaoStatus)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                        r.status === "ATIVO" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                      }`}
                    >
                      {r.status === "ATIVO" ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="rounded-lg border border-[#D1D5DB] bg-white p-2 text-[#111827] hover:bg-[#F9FAFB]"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIdSelecionado(r.idContraparte);
                          prepararEdicao(r);
                        }}
                        title="Editar contraparte"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-[#D1D5DB] bg-white p-2 text-[#111827] hover:bg-[#F9FAFB]"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/dashboard/contratos?contraparteId=${r.idContraparte}`);
                        }}
                        title="Visualizar contratos com a contraparte"
                      >
                        <FileText className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-red-200 bg-white p-2 text-red-700 hover:bg-red-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          excluirContraparte(r.idContraparte);
                        }}
                        title="Excluir"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td className="px-3 py-6 text-center text-[#6B7280]" colSpan={10}>
                    Sem dados.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-[#7C3AED]" />
          <div>
            <div className="text-sm font-semibold">Histórico do parceiro</div>
            <div className="text-xs text-[#6B7280]">Selecione uma contraparte na tabela para visualizar o histórico completo.</div>
          </div>
        </div>
        {!selecionado ? <div className="text-sm text-[#6B7280]">Selecione uma contraparte na tabela acima para visualizar o histórico.</div> : null}

        {selecionado ? (
          <>
            <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-3 text-sm">
              {selecionado.nomeRazao} ({selecionado.tipo}) • ID {selecionado.idContraparte}
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="rounded-lg border p-3 space-y-2">
                <div className="font-semibold">Contratos</div>
                <div className="overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-[#F9FAFB] text-left text-[#111827]">
                      <tr>
                        <th className="px-2 py-1">ID</th>
                        <th className="px-2 py-1">Tipo</th>
                        <th className="px-2 py-1">Status</th>
                        <th className="px-2 py-1">Serviço</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contratos.map((c) => (
                        <tr key={c.idContratoLocacao} className="border-t border-[#E5E7EB]">
                          <td className="px-2 py-1">{c.idContratoLocacao}</td>
                          <td className="px-2 py-1">{c.tipo}</td>
                          <td className="px-2 py-1">{c.status}</td>
                          <td className="px-2 py-1">{c.codigoServico || "-"}</td>
                        </tr>
                      ))}
                      {!contratos.length ? (
                        <tr>
                          <td className="px-2 py-3 text-center text-[#6B7280]" colSpan={4}>
                            Sem contratos.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-lg border p-3 space-y-3">
                <div className="font-semibold">Avaliações</div>
                <div className="grid grid-cols-1 gap-2">
                  <div>
                    <div className="text-sm text-[#6B7280]">Nota (0–10)</div>
                    <input className="input" value={novaAvaliacao.nota} onChange={(e) => setNovaAvaliacao((p) => ({ ...p, nota: e.target.value }))} />
                  </div>
                  <div>
                    <div className="text-sm text-[#6B7280]">Comentário</div>
                    <input className="input" value={novaAvaliacao.comentario} onChange={(e) => setNovaAvaliacao((p) => ({ ...p, comentario: e.target.value }))} />
                  </div>
                  <div className="flex justify-end">
                    <button className="rounded-lg bg-[#16A34A] px-4 py-2 text-sm text-white hover:bg-[#15803D] disabled:opacity-60" type="button" onClick={criarAvaliacao} disabled={loading}>
                      Registrar
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  {avaliacoes.map((a) => (
                    <div key={a.idAvaliacao} className="rounded-md border border-[#E5E7EB] p-2 text-sm">
                      <div className="font-semibold">{a.nota == null ? "Sem nota" : `Nota ${a.nota}`}</div>
                      <div className="text-[#6B7280]">{a.comentario || "-"}</div>
                      <div className="text-xs text-[#6B7280]">{String(a.criadoEm || "").slice(0, 19).replace("T", " ")}</div>
                    </div>
                  ))}
                  {!avaliacoes.length ? <div className="text-sm text-[#6B7280]">Sem avaliações.</div> : null}
                </div>
              </div>

              <div className="rounded-lg border p-3 space-y-3">
                <div className="font-semibold">Ocorrências</div>
                <div className="grid grid-cols-1 gap-2">
                  <div>
                    <div className="text-sm text-[#6B7280]">Contrato (opcional)</div>
                    <input
                      className="input"
                      value={novaOcorrencia.idContratoLocacao}
                      onChange={(e) => setNovaOcorrencia((p) => ({ ...p, idContratoLocacao: e.target.value }))}
                      placeholder="ID do contrato"
                    />
                  </div>
                  <div>
                    <div className="text-sm text-[#6B7280]">Tipo</div>
                    <input className="input" value={novaOcorrencia.tipo} onChange={(e) => setNovaOcorrencia((p) => ({ ...p, tipo: e.target.value }))} placeholder="Ex.: atraso" />
                  </div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <div>
                      <div className="text-sm text-[#6B7280]">Gravidade</div>
                      <select className="input" value={novaOcorrencia.gravidade} onChange={(e) => setNovaOcorrencia((p) => ({ ...p, gravidade: e.target.value as any }))}>
                        <option value="BAIXA">Baixa</option>
                        <option value="MEDIA">Média</option>
                        <option value="ALTA">Alta</option>
                        <option value="CRITICA">Crítica</option>
                      </select>
                    </div>
                    <div>
                      <div className="text-sm text-[#6B7280]">Data</div>
                      <input className="input" type="date" value={novaOcorrencia.dataOcorrencia} onChange={(e) => setNovaOcorrencia((p) => ({ ...p, dataOcorrencia: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-[#6B7280]">Descrição</div>
                    <input className="input" value={novaOcorrencia.descricao} onChange={(e) => setNovaOcorrencia((p) => ({ ...p, descricao: e.target.value }))} />
                  </div>
                  <div className="flex justify-end">
                    <button className="rounded-lg bg-[#16A34A] px-4 py-2 text-sm text-white hover:bg-[#15803D] disabled:opacity-60" type="button" onClick={criarOcorrencia} disabled={loading}>
                      Registrar
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  {ocorrencias.map((o) => (
                    <div key={o.idOcorrencia} className="rounded-md border border-[#E5E7EB] p-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold">{o.tipo || "Ocorrência"}</div>
                        <div className="text-xs">{o.gravidade}</div>
                      </div>
                      <div className="text-[#6B7280]">{o.descricao}</div>
                      <div className="text-xs text-[#6B7280]">
                        {o.dataOcorrencia || String(o.criadoEm || "").slice(0, 10)} • Contrato {o.idContratoLocacao ?? "-"}
                      </div>
                    </div>
                  ))}
                  {!ocorrencias.length ? <div className="text-sm text-[#6B7280]">Sem ocorrências.</div> : null}
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>

      <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-[#0EA5E9]" />
          <div>
            <div className="text-sm font-semibold">Documentos do parceiro</div>
            <div className="text-xs text-[#6B7280]">Arquivos anexados à contraparte (PDF, imagem etc.).</div>
          </div>
        </div>
        {!selecionado ? <div className="text-sm text-[#6B7280]">Selecione uma contraparte na tabela acima para visualizar os documentos.</div> : null}

        {selecionado ? (
          <>
            <div className="flex items-end justify-between gap-3 flex-wrap">
              <div className="text-sm text-[#6B7280]">
                {selecionado.nomeRazao} • ID {selecionado.idContraparte}
              </div>
              <div className="flex items-center gap-2">
                <input
                  className="input"
                  type="file"
                  onChange={(e) => setDocUploadFile(e.target.files?.[0] || null)}
                  disabled={docUploading}
                />
                <button
                  type="button"
                  className="rounded-lg bg-[#2563EB] px-4 py-2 text-sm text-white hover:bg-[#1D4ED8] disabled:opacity-60"
                  onClick={adicionarDocParceiro}
                  disabled={!docUploadFile || docUploading}
                >
                  {docUploading ? "Enviando..." : "Adicionar"}
                </button>
              </div>
            </div>

            {docPreviewUrl ? (
              <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-3 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-sm font-semibold">{docPreviewName || "Documento"}</div>
                  <button
                    type="button"
                    className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm text-[#111827] hover:bg-[#F9FAFB]"
                    onClick={() => {
                      if (docPreviewUrl) URL.revokeObjectURL(docPreviewUrl);
                      setDocPreviewUrl(null);
                      setDocPreviewMime(null);
                      setDocPreviewName(null);
                    }}
                  >
                    Fechar visualização
                  </button>
                </div>
                {docPreviewMime?.includes("pdf") ? (
                  <iframe className="w-full h-[520px] rounded-lg bg-white" src={docPreviewUrl} />
                ) : docPreviewMime?.startsWith("image/") ? (
                  <img className="max-h-[520px] w-auto rounded-lg border border-[#E5E7EB] bg-white" src={docPreviewUrl} alt={docPreviewName || "Documento"} />
                ) : (
                  <a className="text-sm text-[#2563EB] underline" href={docPreviewUrl} target="_blank" rel="noreferrer">
                    Abrir documento
                  </a>
                )}
              </div>
            ) : null}

            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-[#F9FAFB] text-left text-[#111827]">
                  <tr>
                    <th className="px-3 py-2">Arquivo</th>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2">Tamanho</th>
                    <th className="px-3 py-2">Criado em</th>
                    <th className="px-3 py-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {docsParceiro.map((d) => (
                    <tr key={d.idDocumento} className="border-t border-[#E5E7EB]">
                      <td className="px-3 py-2">{d.nomeArquivo}</td>
                      <td className="px-3 py-2">{d.mimeType}</td>
                      <td className="px-3 py-2">{Math.round((Number(d.tamanhoBytes || 0) / 1024) * 10) / 10} KB</td>
                      <td className="px-3 py-2">{String(d.criadoEm || "").slice(0, 19).replace("T", " ")}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm text-[#111827] hover:bg-[#F9FAFB]"
                            onClick={() => visualizarDocParceiro(d)}
                          >
                            Exibir
                          </button>
                          <button
                            type="button"
                            className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                            onClick={() => excluirDocParceiro(d.idDocumento)}
                          >
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!docsParceiro.length ? (
                    <tr>
                      <td className="px-3 py-6 text-center text-[#6B7280]" colSpan={5}>
                        Sem documentos.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
