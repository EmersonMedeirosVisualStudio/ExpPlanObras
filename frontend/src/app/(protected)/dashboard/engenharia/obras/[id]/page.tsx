"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { setActiveObra } from "@/lib/obra/active";
import api from "@/lib/api";

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

function moeda(v: number | undefined | null) {
  const n = Number(v || 0);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number.isFinite(n) ? n : 0);
}

function formatEnderecoLinha(e?: ObraBasica["enderecoObra"] | null) {
  if (!e) return "-";
  const parts = [e.logradouro, e.numero, e.complemento, e.bairro, e.cidade, e.uf, e.cep].map((x) => String(x || "").trim()).filter(Boolean);
  return parts.length ? parts.join(" · ") : "-";
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

  useEffect(() => {
    if (!idObra) return;
    setActiveObra({ id: idObra, nome: obraNomeParam || undefined });
  }, [idObra, obraNomeParam]);

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
        href: () => `/dashboard/engenharia/obras/ativa/documentos`,
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
        key: "contrapartes",
        titulo: "Contrapartes e Contratos",
        desc: "Parceiros comerciais e contratos de locação/serviço.",
        href: () => `/dashboard/engenharia/contrapartes`,
        nivel: "CADASTRO",
      },
      {
        key: "responsaveis-tecnicos",
        titulo: "Responsáveis Técnicos",
        desc: "Cadastro de responsáveis técnicos por obra.",
        href: (id) => `/dashboard/engenharia/obras?obraId=${id}#cadastro-responsaveis`,
        nivel: "CADASTRO",
      },
      {
        key: "fiscais",
        titulo: "Fiscais",
        desc: "Cadastro de fiscais por obra.",
        href: (id) => `/dashboard/engenharia/obras?obraId=${id}#cadastro-responsaveis`,
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
        <button className="rounded-lg border px-4 py-2 text-sm" type="button" onClick={() => router.push("/dashboard/engenharia/obras")}>
          Voltar
        </button>
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
            <div className="text-sm font-semibold text-slate-700">Contrato</div>
            {carregandoContrato ? (
              <div className="mt-2 text-sm text-slate-500">Carregando…</div>
            ) : contrato ? (
              <div className="mt-2 space-y-1 text-sm text-slate-700">
                <div>
                  <span className="text-slate-500">Número:</span>{" "}
                  <span className="font-medium">{contratoNumero ? contratoNumero : "Sem número"}</span>
                </div>
                <div>
                  <span className="text-slate-500">Status:</span> <span className="font-medium">{contratoStatus || "—"}</span>
                </div>
                {contratoObjeto ? (
                  <div>
                    <span className="text-slate-500">Objeto:</span> <span className="font-medium">{contratoObjeto}</span>
                  </div>
                ) : null}
                <div className="pt-1 grid grid-cols-1 gap-1">
                  <div>
                    <span className="text-slate-500">Valor contratado:</span> <span className="font-medium">{moeda(contrato.valorContratado)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Valor executado:</span> <span className="font-medium">{moeda(contrato.valorExecutado)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Valor pago:</span> <span className="font-medium">{moeda(contrato.valorPago)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Saldo (contratado - executado):</span>{" "}
                    <span className="font-medium">{moeda((contrato.valorContratado || 0) - (contrato.valorExecutado || 0))}</span>
                  </div>
                </div>
                <button
                  className="mt-2 rounded-md border px-3 py-1.5 text-xs disabled:opacity-60"
                  type="button"
                  disabled={!contrato.idContrato}
                  onClick={() => router.push(`/dashboard/contratos?id=${contrato.idContrato}`)}
                >
                  Abrir contrato
                </button>
              </div>
            ) : (
              <div className="mt-2 text-sm text-slate-500">Não vinculado.</div>
            )}
          </div>

          <div className="rounded-lg border p-3">
            <div className="text-sm font-semibold text-slate-700">Dados básicos da obra</div>
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
                  <span className="text-slate-500">Status:</span> <span className="font-medium">{String(obra.status || "-")}</span>
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
