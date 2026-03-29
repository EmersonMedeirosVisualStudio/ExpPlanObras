"use client";

import { useMemo } from "react";
import { useParams, useRouter } from "next/navigation";

type Janela = { key: string; titulo: string; desc: string; href: (idObra: number) => string; nivel: "OPERACAO" | "GESTAO" | "CADASTRO" };

export default function EngenhariaObraHomePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const idObra = Number(params?.id || 0);

  const janelas = useMemo<Janela[]>(
    () => [
      {
        key: "programacao",
        titulo: "Programação Semanal",
        desc: "Mão de obra, equipamentos e insumos (planejado x executado).",
        href: (id) => `/dashboard/engenharia/obras/${id}/programacao`,
        nivel: "OPERACAO",
      },
      {
        key: "planilha",
        titulo: "Planilha contratada",
        desc: "Base oficial de serviços da obra (pré-requisito para iniciar programação e apropriação).",
        href: (id) => `/dashboard/engenharia/obras/${id}/planilha`,
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
        href: (id) => `/dashboard/obras/documentos?tipo=OBRA&id=${id}`,
        nivel: "GESTAO",
      },
      {
        key: "cronograma",
        titulo: "Cronograma (Físico-Financeiro)",
        desc: "Planejamento macro e coerência com o planejamento operacional.",
        href: () => `/dashboard/engenharia/painel`,
        nivel: "GESTAO",
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

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Obra #{idObra}</h1>
          <div className="text-sm text-slate-600">Janelas operacionais da obra selecionada.</div>
        </div>
        <button className="rounded-lg border px-4 py-2 text-sm" type="button" onClick={() => router.push("/dashboard/engenharia/obras")}>
          Trocar obra
        </button>
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
        <div className="text-lg font-semibold">Cadastros</div>
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
    </div>
  );
}
