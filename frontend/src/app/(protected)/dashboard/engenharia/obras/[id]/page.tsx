"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { setActiveObra } from "@/lib/obra/active";
import api from "@/lib/api";
import { ExternalLink, LayoutDashboard } from "lucide-react";

type ApiEnvelope<T> = { success: boolean; message?: string; data: T };
function unwrapApiData<T>(json: any): T {
  if (json && typeof json === "object" && "data" in json) return (json as ApiEnvelope<T>).data;
  return json as T;
}

type Janela = { key: string; titulo: string; desc: string; href: (idObra: number) => string; nivel: "OPERACAO" | "GESTAO" | "CADASTRO" };
type ObraBasica = {
  id: number;
  contratoId: number;
  name: string;
  type: "PUBLICA" | "PARTICULAR";
  status: string;
  valorPrevisto: number | null;
  contrato?: { id: number; numeroContrato: string | null; status: string | null; objeto: string | null } | null;
  enderecoObra?: {
    nomeEndereco?: string | null;
    cep?: string | null;
    logradouro?: string | null;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    cidade?: string | null;
    uf?: string | null;
    latitude?: string | null;
    longitude?: string | null;
  } | null;
};
type ContratoDaObra = {
  idObra: number;
  nomeObra: string;
  idContrato: number | null;
  numeroContrato: string;
  statusContrato: string | null;
  valorContratado: number;
  valorExecutado: number;
  valorPago: number;
};

type ResponsavelObraRow = {
  idObraResponsabilidade: number;
  idObra: number;
  tipo: "RESPONSAVEL_TECNICO" | "FISCAL_OBRA";
  nome: string;
  conselho: string | null;
  numeroRegistro: string | null;
  cpf: string | null;
  email: string | null;
  telefone: string | null;
  ativo: boolean;
  criadoEm?: string;
  atualizadoEm?: string;
};

function moeda(v: number | undefined | null) {
  const n = Number(v || 0);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number.isFinite(n) ? n : 0);
}

function formatEnderecoLinha(e?: ObraBasica["enderecoObra"] | null) {
  if (!e) return "-";
  const parts = [e.logradouro, e.numero, e.complemento, e.bairro, e.cidade, e.uf, e.cep].map((x) => String(x || "").trim()).filter(Boolean);
  return parts.length ? parts.join(" · ") : "-";
}

function badgeClassFor(value: string) {
  const v = String(value || "").trim().toUpperCase();
  if (!v || v === "-" || v === "NAO_INFORMADO") return "bg-slate-100 text-slate-700 border-slate-200";
  if (["ATIVO", "EM_EXECUCAO", "EM_ANDAMENTO"].includes(v)) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (["FINALIZADO", "CONCLUIDO", "ENCERRADO"].includes(v)) return "bg-blue-50 text-blue-700 border-blue-200";
  if (["PARADO", "PARALISADO"].includes(v)) return "bg-amber-50 text-amber-800 border-amber-200";
  if (v.includes("AGUARD")) return "bg-amber-50 text-amber-800 border-amber-200";
  if (["PENDENTE"].includes(v)) return "bg-slate-50 text-slate-700 border-slate-200";
  if (["CANCELADO", "RESCINDIDO"].includes(v)) return "bg-red-50 text-red-700 border-red-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

export default function EngenhariaObraHomePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const sp = useSearchParams();

  const idObra = Number(params?.id || 0);
  const obraNomeParam = String(sp?.get("obraNome") || "").trim();
  const contratoIdParam = Number(sp?.get("contratoId") || 0);
  const contratoNumeroParam = String(sp?.get("contratoNumero") || "").trim();
  const [obra, setObra] = useState<ObraBasica | null>(null);
  const [carregandoObra, setCarregandoObra] = useState(false);
  const [erroObra, setErroObra] = useState<string | null>(null);
  const [contrato, setContrato] = useState<ContratoDaObra | null>(null);
  const [carregandoContrato, setCarregandoContrato] = useState(false);

  const [crudOpen, setCrudOpen] = useState(false);
  const [crudTipo, setCrudTipo] = useState<"RESPONSAVEL_TECNICO" | "FISCAL_OBRA">("RESPONSAVEL_TECNICO");
  const [crudApenasAtivos, setCrudApenasAtivos] = useState(false);
  const [crudRows, setCrudRows] = useState<ResponsavelObraRow[]>([]);
  const [crudLoading, setCrudLoading] = useState(false);
  const [crudErr, setCrudErr] = useState<string | null>(null);

  useEffect(() => {
    if (!idObra) return;
    setActiveObra({ id: idObra, nome: obraNomeParam || undefined });
  }, [idObra, obraNomeParam]);

  async function carregarResponsaveis(tipo: "RESPONSAVEL_TECNICO" | "FISCAL_OBRA", apenasAtivos: boolean) {
    if (!idObra) return;
    try {
      setCrudLoading(true);
      setCrudErr(null);
      const qp = new URLSearchParams();
      qp.set("idObra", String(idObra));
      qp.set("tipo", tipo);
      qp.set("apenasAtivos", apenasAtivos ? "1" : "0");
      const res = await api.get(`/api/v1/engenharia/obras/responsabilidades?${qp.toString()}`);
      const list = unwrapApiData<any[]>(res?.data || []);
      const rows = Array.isArray(list)
        ? (list
            .map((r) => ({
              ...r,
              idObraResponsabilidade: Number(r.idObraResponsabilidade),
              idObra: Number(r.idObra),
              tipo: String(r.tipo || "").toUpperCase() === "FISCAL_OBRA" ? "FISCAL_OBRA" : "RESPONSAVEL_TECNICO",
              nome: String(r.nome || ""),
              conselho: r.conselho == null ? null : String(r.conselho),
              numeroRegistro: r.numeroRegistro == null ? null : String(r.numeroRegistro),
              cpf: r.cpf == null ? null : String(r.cpf),
              email: r.email == null ? null : String(r.email),
              telefone: r.telefone == null ? null : String(r.telefone),
              ativo: Boolean(r.ativo),
              criadoEm: r.criadoEm ? String(r.criadoEm) : undefined,
              atualizadoEm: r.atualizadoEm ? String(r.atualizadoEm) : undefined,
            }))
            .filter((x) => Number.isFinite(x.idObraResponsabilidade) && x.idObraResponsabilidade > 0 && Number(x.idObra) === idObra)) as ResponsavelObraRow[]
        : [];
      setCrudRows(rows);
    } catch (e: any) {
      setCrudRows([]);
      setCrudErr(e?.response?.data?.message || e?.message || "Erro ao carregar responsáveis.");
    } finally {
      setCrudLoading(false);
    }
  }

  function abrirCrud(tipo: "RESPONSAVEL_TECNICO" | "FISCAL_OBRA") {
    setCrudTipo(tipo);
    setCrudOpen(true);
  }

  useEffect(() => {
    function syncFromHash() {
      const h = String(window.location.hash || "").toLowerCase();
      if (h === "#responsaveis-tecnicos") abrirCrud("RESPONSAVEL_TECNICO");
      if (h === "#fiscais") abrirCrud("FISCAL_OBRA");
    }
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  useEffect(() => {
    if (!crudOpen) return;
    carregarResponsaveis(crudTipo, crudApenasAtivos);
  }, [crudOpen, crudTipo, crudApenasAtivos]);

  async function criarResponsavel() {
    const idTecnicoRaw = (prompt("ID do técnico (deixe vazio para cadastrar um novo):") || "").trim();
    let idTecnico: number | null = null;
    if (idTecnicoRaw) {
      const n = Number(idTecnicoRaw);
      idTecnico = Number.isInteger(n) && n > 0 ? n : null;
      if (!idTecnico) return;
    } else {
      const nome = (prompt(crudTipo === "FISCAL_OBRA" ? "Nome do fiscal:" : "Nome do responsável técnico:") || "").trim();
      if (!nome) return;
      const conselho = (prompt("Conselho (ex.: CREA, CAU) (opcional):") || "").trim();
      const numeroRegistro = (prompt("Número do registro (opcional):") || "").trim();
      const cpf = (prompt("CPF (opcional):") || "").trim();
      const email = (prompt("E-mail (opcional):") || "").trim();
      const telefone = (prompt("Telefone (opcional):") || "").trim();
      const resTec = await api.post("/api/v1/engenharia/tecnicos", {
        nome,
        conselho: conselho || null,
        numeroRegistro: numeroRegistro || null,
        cpf: cpf || null,
        email: email || null,
        telefone: telefone || null,
        ativo: true,
      });
      const outTec = unwrapApiData<any>(resTec?.data || null) as any;
      const newId = Number(outTec?.idTecnico || 0);
      if (!Number.isInteger(newId) || newId <= 0) return;
      idTecnico = newId;
    }

    const ativoPrompt = (prompt("Ativo? (S/N)", "S") || "S").trim().toUpperCase();
    const ativo = ativoPrompt !== "N";
    try {
      setCrudLoading(true);
      setCrudErr(null);
      await api.post("/api/v1/engenharia/obras/responsabilidades", { idObra, tipo: crudTipo, idTecnico, ativo });
      await carregarResponsaveis(crudTipo, crudApenasAtivos);
    } catch (e: any) {
      setCrudErr(e?.response?.data?.message || e?.message || "Erro ao cadastrar.");
    } finally {
      setCrudLoading(false);
    }
  }

  async function editarResponsavel(r: ResponsavelObraRow) {
    const tipo = (prompt("Tipo (RESPONSAVEL_TECNICO / FISCAL_OBRA):", r.tipo) || r.tipo).trim().toUpperCase();
    const ativoPrompt = (prompt("Ativo? (S/N)", r.ativo ? "S" : "N") || (r.ativo ? "S" : "N")).trim().toUpperCase();
    const ativo = ativoPrompt !== "N";
    try {
      setCrudLoading(true);
      setCrudErr(null);
      await api.put(`/api/v1/engenharia/obras/responsabilidades/${r.idObraResponsabilidade}`, { tipo, ativo });
      await carregarResponsaveis(crudTipo, crudApenasAtivos);
    } catch (e: any) {
      setCrudErr(e?.response?.data?.message || e?.message || "Erro ao atualizar.");
    } finally {
      setCrudLoading(false);
    }
  }

  async function removerResponsavel(r: ResponsavelObraRow) {
    if (!confirm(`Remover "${r.nome}"?`)) return;
    try {
      setCrudLoading(true);
      setCrudErr(null);
      await api.delete(`/api/v1/engenharia/obras/responsabilidades/${r.idObraResponsabilidade}`);
      await carregarResponsaveis(crudTipo, crudApenasAtivos);
    } catch (e: any) {
      setCrudErr(e?.response?.data?.message || e?.message || "Erro ao remover.");
    } finally {
      setCrudLoading(false);
    }
  }

  useEffect(() => {
    if (!idObra) return;
    if (!contratoIdParam && !contratoNumeroParam) return;
    setContrato((prev) => {
      if (prev) return prev;
      return {
        idObra,
        nomeObra: obraNomeParam || `Obra #${idObra}`,
        idContrato: Number.isFinite(contratoIdParam) && contratoIdParam > 0 ? contratoIdParam : null,
        numeroContrato: contratoNumeroParam || "-",
        statusContrato: null,
        valorContratado: 0,
        valorExecutado: 0,
        valorPago: 0,
      };
    });
  }, [idObra, contratoIdParam, contratoNumeroParam, obraNomeParam]);

  useEffect(() => {
    if (!idObra) return;
    let active = true;
    (async () => {
      try {
        setCarregandoObra(true);
        setErroObra(null);
        const res = await api.get(`/api/obras/${idObra}`);
        const o: any = res?.data;
        if (!o?.id) throw new Error("Obra não encontrada");
        if (active) setObra(o as ObraBasica);
      } catch (e: any) {
        if (!active) return;
        setErroObra(e?.response?.data?.message || e?.message || "Erro ao carregar obra.");
        setObra(null);
      } finally {
        if (active) setCarregandoObra(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [idObra]);

  useEffect(() => {
    if (!idObra) return;
    let active = true;
    (async () => {
      try {
        setCarregandoContrato(true);
        const res = await api.get(`/api/v1/engenharia/obras/${idObra}/contrato`);
        const json: any = res?.data;
        if (!json?.success) throw new Error(json?.message || "Erro ao carregar contrato.");
        if (active) setContrato((json.data || null) as ContratoDaObra | null);
      } catch (e: any) {
        if (!active) return;
        if (!contratoIdParam && !contratoNumeroParam) setContrato(null);
      } finally {
        if (active) setCarregandoContrato(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [idObra, contratoIdParam, contratoNumeroParam]);

  const janelas = useMemo<Janela[]>(
    () => [
      {
        key: "planilha-orcamentaria",
        titulo: "Planilha orçamentária",
        desc: "Versões do orçamento da obra (itens, subitens e serviços). Base para cronograma e custos.",
        href: (id) => `/dashboard/engenharia/obras/${id}/planilha`,
        nivel: "GESTAO",
      },
      {
        key: "cronograma",
        titulo: "Programação financeira (cronograma)",
        desc: "Cronograma físico-financeiro da obra com histórico de versões e leitura de execução.",
        href: (id) => `/dashboard/engenharia/obras/${id}/cronograma`,
        nivel: "GESTAO",
      },
      {
        key: "centros-custo",
        titulo: "Centro de custos",
        desc: "Cadastros e vínculos do centro de custo (base da programação e apropriação).",
        href: () => `/dashboard/engenharia/centros-custo`,
        nivel: "GESTAO",
      },
      {
        key: "programacao",
        titulo: "PES (Programação de Execução de Serviços)",
        desc: "Planejamento operacional por centro de custo, com mão de obra, equipamentos e insumos.",
        href: (id) => `/dashboard/engenharia/obras/${id}/programacao`,
        nivel: "OPERACAO",
      },
      {
        key: "pes-dashboard",
        titulo: "Dashboard PES",
        desc: "Painel integrado: KPIs, caminho crítico, programação, recursos, alertas e visão diária.",
        href: () => `/dashboard/engenharia/obras/ativa/pes-dashboard`,
        nivel: "GESTAO",
      },
      {
        key: "apropriacao",
        titulo: "Apropriação",
        desc: "Registro do executado por serviço e centro de custo (base de produtividade e custos).",
        href: (id) => `/dashboard/engenharia/obras/${id}/apropriacao`,
        nivel: "OPERACAO",
      },
      {
        key: "diario-obra",
        titulo: "Diário de Obra",
        desc: "Rotina de campo (diário, evidências, ocorrências e histórico).",
        href: () => `/dashboard/fiscalizacao/painel`,
        nivel: "OPERACAO",
      },
      {
        key: "presencas",
        titulo: "Presença digital (RH)",
        desc: "Presença, horas e produção por funcionário, com envio ao RH.",
        href: () => `/dashboard/rh/presencas`,
        nivel: "OPERACAO",
      },
      {
        key: "documentos",
        titulo: "Documentos da Obra",
        desc: "ART, projetos, revisões, laudos, pareceres, relatórios e evidências.",
        href: (id) =>
          `/dashboard/obras/documentos?tipo=OBRA&id=${id}&returnTo=${encodeURIComponent(`/dashboard/engenharia/obras/${id}`)}`,
        nivel: "GESTAO",
      },
      {
        key: "medicoes",
        titulo: "Medições",
        desc: "Fiscalização e medições (acompanhamento e validação).",
        href: () => `/dashboard/fiscalizacao/painel`,
        nivel: "OPERACAO",
      },
      {
        key: "atividades",
        titulo: "Atividades",
        desc: "Atividades e progresso vinculados à obra (visão operacional).",
        href: () => `/dashboard/engenharia/painel`,
        nivel: "OPERACAO",
      },
      {
        key: "fiscalizacao",
        titulo: "Fiscalização e Medições",
        desc: "Diário, mídias, medições e relatórios (com rastreabilidade).",
        href: () => `/dashboard/fiscalizacao/painel`,
        nivel: "GESTAO",
      },
      {
        key: "equipamentos-ferramentas",
        titulo: "Equipamentos e Ferramentas",
        desc: "Cautelas, movimentações, horas, combustível, viagens, calendário e descartes.",
        href: () => `/dashboard/engenharia/ativos`,
        nivel: "OPERACAO",
      },
      {
        key: "aquisicoes",
        titulo: "Aquisições (Demandas)",
        desc: "Solicitações operacionais ligadas à obra/unidade (quando aplicável).",
        href: () => `/dashboard/engenharia/aquisicoes`,
        nivel: "OPERACAO",
      },
      {
        key: "consumos",
        titulo: "Consumos (Água/Energia/Esgoto)",
        desc: "Gestão de consumos e consolidação para análise gerencial.",
        href: () => `/dashboard/engenharia/consumos`,
        nivel: "GESTAO",
      },
      {
        key: "custos-equip",
        titulo: "Custos (Equipamentos)",
        desc: "Consolidação por serviço (SER-0001) com base em horas, combustível e viagens.",
        href: () => `/dashboard/engenharia/custos-ativos`,
        nivel: "GESTAO",
      },
      {
        key: "checklists",
        titulo: "Checklists (Campo)",
        desc: "Execução, equipamentos e qualidade via modelos e execuções.",
        href: () => `/dashboard/sst/checklists`,
        nivel: "GESTAO",
      },
      {
        key: "treinamentos",
        titulo: "Treinamentos",
        desc: "Modelos, turmas e aptidão por serviço (SST).",
        href: () => `/dashboard/sst/treinamentos`,
        nivel: "GESTAO",
      },
      {
        key: "produtividade",
        titulo: "Produtividade (Obra)",
        desc: "Consolidação de produtividade por funcionário e por serviço.",
        href: () => `/dashboard/rh/produtividade`,
        nivel: "GESTAO",
      },
      {
        key: "projetos",
        titulo: "Cadastro de Projetos",
        desc: "Cadastro e vínculo de projetos da obra.",
        href: (id) => `/dashboard/engenharia/obras/${id}/projetos?returnTo=${encodeURIComponent(`/dashboard/engenharia/obras/${id}`)}`,
        nivel: "CADASTRO",
      },
      {
        key: "responsaveis-tecnicos",
        titulo: "Responsáveis técnicos / Fiscais",
        desc: "Cadastro de profissionais vinculados à obra (responsáveis técnicos e fiscais).",
        href: (id) => `/dashboard/engenharia/obras/${id}#responsaveis-tecnicos`,
        nivel: "CADASTRO",
      },
    ],
    []
  );

  if (!idObra) {
    return (
      <div className="p-6 max-w-4xl">
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">Obra inválida.</div>
      </div>
    );
  }

  const grupos = {
    OPERACAO: janelas.filter((j) => j.nivel === "OPERACAO"),
    GESTAO: janelas.filter((j) => j.nivel === "GESTAO"),
    CADASTRO: janelas.filter((j) => j.nivel === "CADASTRO"),
  };

  const contratoNumero = String(contrato?.numeroContrato || obra?.contrato?.numeroContrato || "").trim();
  const contratoStatus = String(contrato?.statusContrato || obra?.contrato?.status || "").trim();
  const contratoObjeto = obra?.contrato?.objeto ? String(obra.contrato.objeto) : "";

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs text-slate-500">Engenharia → Obras → Obra - Menu Diversos</div>
          <h1 className="text-2xl font-semibold">Obra - Menu Diversos</h1>
          <div className="text-sm text-slate-600">
            {`Obra #${idObra}${obraNomeParam ? ` — ${obraNomeParam}` : ""}${contrato?.numeroContrato?.trim() ? ` — Contrato: ${contrato.numeroContrato}` : ""} — janelas operacionais da obra selecionada.`}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            className="rounded-lg border bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2"
            type="button"
            onClick={() => router.push("/dashboard/engenharia/obras/ativa/dashboard")}
          >
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </button>
          <button className="rounded-lg border px-4 py-2 text-sm" type="button" onClick={() => router.push("/dashboard/engenharia/obras")}>
            Voltar
          </button>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-lg font-semibold">Dados principais da obra</div>
            <div className="text-sm text-slate-600">Contrato e dados básicos da obra selecionada.</div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-lg border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm font-semibold text-slate-700">Contrato</div>
              <button
                className="rounded-lg border bg-white px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-60 inline-flex items-center gap-2"
                type="button"
                disabled={!contrato?.idContrato}
                onClick={() => {
                  if (!contrato?.idContrato) return;
                  router.push(`/dashboard/contratos?id=${contrato.idContrato}`);
                }}
              >
                Abrir contrato
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            </div>
            {carregandoContrato ? (
              <div className="mt-2 text-sm text-slate-500">Carregando…</div>
            ) : contrato ? (
              <div className="mt-2 space-y-1 text-sm text-slate-700">
                <div>
                  <span className="text-slate-500">Número:</span>{" "}
                  <span className="font-medium text-blue-700">{contratoNumero ? contratoNumero : "Sem número"}</span>
                </div>
                <div>
                  <span className="text-slate-500">Status:</span>{" "}
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${badgeClassFor(contratoStatus)}`}>
                    {contratoStatus || "—"}
                  </span>
                </div>
                {contratoObjeto ? (
                  <div>
                    <span className="text-slate-500">Objeto:</span> <span className="font-medium">{contratoObjeto}</span>
                  </div>
                ) : null}
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border bg-white p-2">
                    <div className="text-xs text-slate-500">Valor contratado</div>
                    <div className="text-sm font-semibold text-slate-900">{moeda(contrato.valorContratado)}</div>
                  </div>
                  <div className="rounded-lg border bg-white p-2">
                    <div className="text-xs text-slate-500">Valor executado</div>
                    <div className="text-sm font-semibold text-slate-900">{moeda(contrato.valorExecutado)}</div>
                  </div>
                  <div className="rounded-lg border bg-white p-2">
                    <div className="text-xs font-semibold text-blue-700">Saldo (contratado - executado)</div>
                    <div className="text-sm font-semibold text-blue-700">{moeda((contrato.valorContratado || 0) - (contrato.valorExecutado || 0))}</div>
                  </div>
                </div>
                <div className="mt-2 text-xs text-slate-600">
                  <span className="text-slate-500">Valor pago:</span> <span className="font-semibold text-slate-900">{moeda(contrato.valorPago)}</span>
                </div>
              </div>
            ) : (
              <div className="mt-2 text-sm text-slate-500">Não vinculado.</div>
            )}
          </div>

          <div className="rounded-lg border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm font-semibold text-slate-700">Dados básicos da obra</div>
              <button
                className="rounded-lg border bg-white px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2"
                type="button"
                onClick={() => router.push(`/dashboard/engenharia/obras/cadastro?obraId=${idObra}`)}
              >
                Obra selecionada
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            </div>
            {carregandoObra ? (
              <div className="mt-2 text-sm text-slate-500">Carregando…</div>
            ) : obra ? (
              <div className="mt-2 space-y-1 text-sm text-slate-700">
                <div>
                  <span className="text-slate-500">ID:</span> <span className="font-medium">#{obra.id}</span>
                </div>
                <div>
                  <span className="text-slate-500">Nome:</span> <span className="font-medium">{String(obra.name || obraNomeParam || `Obra #${idObra}`)}</span>
                </div>
                <div>
                  <span className="text-slate-500">Tipo:</span> <span className="font-medium">{obra.type === "PUBLICA" ? "Pública" : "Particular"}</span>
                </div>
                <div>
                  <span className="text-slate-500">Status:</span>{" "}
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${badgeClassFor(String(obra.status || ""))}`}>
                    {String(obra.status || "-")}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Endereço:</span> <span className="font-medium">{formatEnderecoLinha(obra.enderecoObra)}</span>
                </div>
                <div>
                  <span className="text-slate-500">Coordenadas:</span>{" "}
                  <span className="font-medium">
                    {obra.enderecoObra?.latitude && obra.enderecoObra?.longitude ? `${obra.enderecoObra.latitude}, ${obra.enderecoObra.longitude}` : "-"}
                  </span>
                </div>
              </div>
            ) : (
              <div className="mt-2 text-sm text-slate-500">Não carregado.</div>
            )}
          </div>
        </div>

        {erroObra ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erroObra}</div> : null}
      </div>

      {crudOpen ? (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCrudOpen(false)} />
          <div className="absolute left-1/2 top-1/2 w-[min(900px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-white shadow-lg">
            <div className="flex items-start justify-between gap-3 border-b p-4">
              <div>
                <div className="text-lg font-semibold">
                  Responsáveis técnicos / Fiscais — Obra #{idObra}
                </div>
                <div className="text-sm text-slate-600">Cadastro, edição e remoção de vínculos de profissionais por obra.</div>
              </div>
              <button className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50" type="button" onClick={() => setCrudOpen(false)}>
                Fechar
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex gap-2 flex-wrap">
                  <button
                    className={`rounded-lg border px-3 py-2 text-sm hover:bg-slate-50 ${crudTipo === "RESPONSAVEL_TECNICO" ? "bg-slate-50" : "bg-white"}`}
                    type="button"
                    onClick={() => setCrudTipo("RESPONSAVEL_TECNICO")}
                  >
                    Responsáveis técnicos
                  </button>
                  <button
                    className={`rounded-lg border px-3 py-2 text-sm hover:bg-slate-50 ${crudTipo === "FISCAL_OBRA" ? "bg-slate-50" : "bg-white"}`}
                    type="button"
                    onClick={() => setCrudTipo("FISCAL_OBRA")}
                  >
                    Fiscais
                  </button>
                  <button className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50" type="button" onClick={() => carregarResponsaveis(crudTipo, crudApenasAtivos)} disabled={crudLoading}>
                    Atualizar
                  </button>
                  <button className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-60" type="button" onClick={criarResponsavel} disabled={crudLoading}>
                    Novo
                  </button>
                </div>
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={crudApenasAtivos} onChange={(e) => setCrudApenasAtivos(e.target.checked)} />
                  Apenas ativos
                </label>
              </div>

              {crudErr ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{crudErr}</div> : null}

              <div className="overflow-auto rounded-lg border">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-slate-700">
                    <tr>
                      <th className="px-3 py-2">Técnico</th>
                      <th className="px-3 py-2">Conselho</th>
                      <th className="px-3 py-2">Registro</th>
                      <th className="px-3 py-2">CPF</th>
                      <th className="px-3 py-2">E-mail</th>
                      <th className="px-3 py-2">Telefone</th>
                      <th className="px-3 py-2">Ativo</th>
                      <th className="px-3 py-2 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {crudLoading ? (
                      <tr>
                        <td className="px-3 py-6 text-center text-slate-500" colSpan={8}>
                          Carregando...
                        </td>
                      </tr>
                    ) : crudRows.length ? (
                      crudRows.map((r) => (
                        <tr key={r.idObraResponsabilidade} className="border-t">
                          <td className="px-3 py-2 font-medium">{r.nome || "—"}</td>
                          <td className="px-3 py-2">{r.conselho || "—"}</td>
                          <td className="px-3 py-2">{r.numeroRegistro || "—"}</td>
                          <td className="px-3 py-2">{r.cpf || "—"}</td>
                          <td className="px-3 py-2">{r.email || "—"}</td>
                          <td className="px-3 py-2">{r.telefone || "—"}</td>
                          <td className="px-3 py-2">{r.ativo ? "Sim" : "Não"}</td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            <button className="rounded-lg border bg-white px-2 py-1 text-xs hover:bg-slate-50" type="button" onClick={() => editarResponsavel(r)} disabled={crudLoading}>
                              Editar
                            </button>{" "}
                            <button className="rounded-lg border border-red-200 bg-white px-2 py-1 text-xs text-red-700 hover:bg-red-50" type="button" onClick={() => removerResponsavel(r)} disabled={crudLoading}>
                              Remover
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="px-3 py-6 text-center text-slate-500" colSpan={8}>
                          Nenhum registro.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="space-y-4">
        <div className="text-lg font-semibold">Cadastro</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {grupos.CADASTRO.map((j) => (
            <button key={j.key} type="button" className="rounded-xl border bg-white p-4 shadow-sm text-left hover:bg-slate-50" onClick={() => router.push(j.href(idObra))}>
              <div className="font-semibold">{j.titulo}</div>
              <div className="text-sm text-slate-600">{j.desc}</div>
            </button>
          ))}
          {!grupos.CADASTRO.length ? <div className="rounded-xl border bg-white p-6 text-sm text-slate-500">Sem cadastros.</div> : null}
        </div>
      </div>

      <div className="space-y-4">
        <div className="text-lg font-semibold">Gestão</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {grupos.GESTAO.map((j) => (
            <button key={j.key} type="button" className="rounded-xl border bg-white p-4 shadow-sm text-left hover:bg-slate-50" onClick={() => router.push(j.href(idObra))}>
              <div className="font-semibold">{j.titulo}</div>
              <div className="text-sm text-slate-600">{j.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div className="text-lg font-semibold">Operação</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {grupos.OPERACAO.map((j) => (
            <button key={j.key} type="button" className="rounded-xl border bg-white p-4 shadow-sm text-left hover:bg-slate-50" onClick={() => router.push(j.href(idObra))}>
              <div className="font-semibold">{j.titulo}</div>
              <div className="text-sm text-slate-600">{j.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
