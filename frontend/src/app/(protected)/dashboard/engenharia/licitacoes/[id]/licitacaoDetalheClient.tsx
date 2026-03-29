"use client";

import { useEffect, useMemo, useState } from "react";

type DocEmpresa = {
  idDocumentoEmpresa: number;
  categoria: string;
  nome: string;
  dataValidade: string | null;
  status: string;
  idDocumentoRegistro: number;
};

type Acervo = {
  idAcervo: number;
  titulo: string;
  tipo: string;
  nomeObra: string | null;
  idDocumentoRegistro: number | null;
};

type ChecklistItem = {
  idItem: number;
  categoria: string;
  nome: string;
  obrigatorio: boolean;
  diasAlerta: number;
  status: string;
  idDocumentoRegistro: number | null;
  downloadUrl: string | null;
};

type OrcamentoLink = {
  idOrcamento: number;
  nome: string;
  tipo: string;
  versaoAtual: { idVersao: number; numeroVersao: number; status: string; tituloVersao: string | null } | null;
  totalVersoes: number;
};

export default function LicitacaoDetalheClient({ idLicitacao }: { idLicitacao: number }) {
  const [tab, setTab] = useState<"DOCUMENTOS" | "ACERVO" | "CHECKLIST" | "DOSSIE" | "ANDAMENTO" | "COMUNICACOES" | "RECURSOS" | "VALIDACAO">("DOCUMENTOS");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [cab, setCab] = useState<any>(null);
  const [cabEdit, setCabEdit] = useState<any>(null);
  const [orcamentoLink, setOrcamentoLink] = useState<OrcamentoLink | null>(null);

  const [docsEmpresa, setDocsEmpresa] = useState<DocEmpresa[]>([]);
  const [docsVinc, setDocsVinc] = useState<DocEmpresa[]>([]);
  const [qDoc, setQDoc] = useState("");

  const [acervoEmpresa, setAcervoEmpresa] = useState<Acervo[]>([]);
  const [acervoVinc, setAcervoVinc] = useState<Acervo[]>([]);
  const [qAcervo, setQAcervo] = useState("");

  const [checklist, setChecklist] = useState<{ resumo: any; itens: ChecklistItem[] }>({ resumo: null, itens: [] });
  const [dossie, setDossie] = useState<{ documentos: any[]; acervo: any[]; licitacao: any } | null>(null);
  const [bloqueioDossie, setBloqueioDossie] = useState<string | null>(null);
  const [andamento, setAndamento] = useState<any[]>([]);
  const [comunicacoes, setComunicacoes] = useState<any[]>([]);
  const [recursos, setRecursos] = useState<any[]>([]);
  const [validacao, setValidacao] = useState<any | null>(null);
  const [diasAlertaValidacao, setDiasAlertaValidacao] = useState("30");
  const [declCustomOpen, setDeclCustomOpen] = useState(false);
  const [declCustom, setDeclCustom] = useState({ categoria: "DECLARACOES", titulo: "", texto: "", numeroEdital: "", cidade: "", uf: "" });

  const docsFiltrados = useMemo(() => {
    const t = qDoc.trim().toLowerCase();
    if (!t) return docsEmpresa;
    return docsEmpresa.filter((d) => d.nome.toLowerCase().includes(t) || d.categoria.toLowerCase().includes(t));
  }, [qDoc, docsEmpresa]);

  const acervoFiltrado = useMemo(() => {
    const t = qAcervo.trim().toLowerCase();
    if (!t) return acervoEmpresa;
    return acervoEmpresa.filter((a) => a.titulo.toLowerCase().includes(t) || a.tipo.toLowerCase().includes(t) || (a.nomeObra || "").toLowerCase().includes(t));
  }, [qAcervo, acervoEmpresa]);

  async function carregar() {
    try {
      setErr(null);
      const [cabRes, d1, d2, a1, a2] = await Promise.all([
        fetch(`/api/v1/engenharia/licitacoes/${idLicitacao}`, { cache: "no-store" }).then((r) => r.json()),
        fetch(`/api/v1/engenharia/licitacoes/documentos-empresa`, { cache: "no-store" }).then((r) => r.json()),
        fetch(`/api/v1/engenharia/licitacoes/${idLicitacao}/documentos`, { cache: "no-store" }).then((r) => r.json()),
        fetch(`/api/v1/engenharia/licitacoes/acervo-empresa`, { cache: "no-store" }).then((r) => r.json()),
        fetch(`/api/v1/engenharia/licitacoes/${idLicitacao}/acervo`, { cache: "no-store" }).then((r) => r.json()),
      ]);
      if (cabRes?.success) {
        setCab(cabRes.data);
        setCabEdit(cabRes.data);
        const idOrc = cabRes.data?.idOrcamento ? Number(cabRes.data.idOrcamento) : null;
        if (idOrc && Number.isFinite(idOrc)) await carregarOrcamentoVinculado(idOrc);
        else setOrcamentoLink(null);
      }
      if (d1?.success) setDocsEmpresa(Array.isArray(d1.data) ? d1.data : []);
      if (d2?.success) setDocsVinc(Array.isArray(d2.data) ? d2.data : []);
      if (a1?.success) setAcervoEmpresa(Array.isArray(a1.data) ? a1.data : []);
      if (a2?.success) setAcervoVinc(Array.isArray(a2.data) ? a2.data : []);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar");
    }
  }

  async function carregarOrcamentoVinculado(idOrcamento: number) {
    try {
      const res = await fetch(`/api/v1/engenharia/orcamentos/${idOrcamento}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar orçamento");
      const orc = json.data?.orcamento;
      const versoes = Array.isArray(json.data?.versoes) ? json.data.versoes : [];
      const v0 = versoes.find((v: any) => String(v.status || "").toUpperCase() === "CONGELADO") || (versoes.length ? versoes[0] : null);
      setOrcamentoLink({
        idOrcamento: Number(orc.idOrcamento),
        nome: String(orc.nome),
        tipo: String(orc.tipo),
        versaoAtual: v0
          ? { idVersao: Number(v0.idVersao), numeroVersao: Number(v0.numeroVersao), status: String(v0.status), tituloVersao: v0.tituloVersao ? String(v0.tituloVersao) : null }
          : null,
        totalVersoes: versoes.length,
      });
    } catch {
      setOrcamentoLink(null);
    }
  }

  async function salvarVinculoOrcamento(idOrcamento: number | null) {
    try {
      setBusy(true);
      setErr(null);
      const payload: any = { idOrcamento };
      const res = await fetch(`/api/v1/engenharia/licitacoes/${idLicitacao}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao vincular orçamento");
      await carregar();
    } catch (e: any) {
      setErr(e?.message || "Erro ao vincular orçamento");
    } finally {
      setBusy(false);
    }
  }

  async function vincularOrcamentoPrompt() {
    const v = (prompt("ID do orçamento (tipo LICITACAO). Deixe vazio para desvincular:") || "").trim();
    if (!v) {
      await salvarVinculoOrcamento(null);
      return;
    }
    const idOrcamento = Number(v);
    if (!Number.isFinite(idOrcamento) || idOrcamento <= 0) {
      setErr("ID do orçamento inválido.");
      return;
    }
    await salvarVinculoOrcamento(idOrcamento);
  }

  async function gerarDeclaracao(template: "FATO_IMPEDITIVO" | "ART7" | "VISITA_TECNICA" | "ME_EPP") {
    try {
      setBusy(true);
      setErr(null);
      const numeroEdital = (prompt("Número do edital (opcional):") || "").trim();
      const cidade = (prompt("Cidade (opcional):") || "").trim();
      const uf = (prompt("UF (opcional):") || "").trim().toUpperCase();
      const payload: any = {
        template,
        numeroEdital: numeroEdital || null,
        cidade: cidade || null,
        uf: uf || null,
      };
      const res = await fetch(`/api/v1/engenharia/licitacoes/${idLicitacao}/declaracoes/gerar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao gerar declaração");
      await carregar();
      await carregarChecklist();
      await carregarValidacao();
      if (json.data?.abrirUrl) window.open(String(json.data.abrirUrl), "_blank");
    } catch (e: any) {
      setErr(e?.message || "Erro ao gerar declaração");
    } finally {
      setBusy(false);
    }
  }

  async function gerarDeclaracaoCustom() {
    try {
      setBusy(true);
      setErr(null);
      const payload: any = {
        template: "CUSTOM",
        categoria: declCustom.categoria.trim().toUpperCase(),
        titulo: declCustom.titulo.trim(),
        texto: declCustom.texto.trim(),
        numeroEdital: declCustom.numeroEdital.trim() || null,
        cidade: declCustom.cidade.trim() || null,
        uf: declCustom.uf.trim().toUpperCase() || null,
      };
      const res = await fetch(`/api/v1/engenharia/licitacoes/${idLicitacao}/declaracoes/gerar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao gerar declaração");
      setDeclCustom((p) => ({ ...p, titulo: "", texto: "" }));
      setDeclCustomOpen(false);
      await carregar();
      await carregarChecklist();
      await carregarValidacao();
      if (json.data?.abrirUrl) window.open(String(json.data.abrirUrl), "_blank");
    } catch (e: any) {
      setErr(e?.message || "Erro ao gerar declaração");
    } finally {
      setBusy(false);
    }
  }

  async function salvarCabecalho() {
    if (!cabEdit) return;
    try {
      setBusy(true);
      setErr(null);
      const payload: any = {
        titulo: cabEdit.titulo,
        orgao: cabEdit.orgao,
        objeto: cabEdit.objeto,
        status: cabEdit.status,
        fase: cabEdit.fase,
        dataAbertura: cabEdit.dataAbertura,
        dataEncerramento: cabEdit.dataEncerramento,
        responsavelNome: cabEdit.responsavelNome,
        portalUrl: cabEdit.portalUrl,
        observacoes: cabEdit.observacoes,
      };
      const res = await fetch(`/api/v1/engenharia/licitacoes/${idLicitacao}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao salvar");
      await carregar();
    } catch (e: any) {
      setErr(e?.message || "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  }

  async function carregarAndamento() {
    try {
      const res = await fetch(`/api/v1/engenharia/licitacoes/${idLicitacao}/andamento`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar andamento");
      setAndamento(Array.isArray(json.data) ? json.data : []);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar andamento");
      setAndamento([]);
    }
  }

  async function adicionarAndamento() {
    const dataEvento = (prompt("Data (AAAA-MM-DD):") || "").trim();
    if (!dataEvento) return;
    const tipo = (prompt("Tipo (ex.: PRAZO, STATUS, REUNIAO, PUBLICACAO):") || "").trim().toUpperCase();
    if (!tipo) return;
    const titulo = (prompt("Título:") || "").trim();
    if (!titulo) return;
    const descricao = (prompt("Descrição (opcional):") || "").trim();
    try {
      setBusy(true);
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/licitacoes/${idLicitacao}/andamento`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataEvento, tipo, titulo, descricao: descricao || null }) });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao adicionar");
      await carregarAndamento();
    } catch (e: any) {
      setErr(e?.message || "Erro ao adicionar");
    } finally {
      setBusy(false);
    }
  }

  async function removerAndamento(idEvento: number) {
    try {
      setBusy(true);
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/licitacoes/${idLicitacao}/andamento?idEvento=${idEvento}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao remover");
      await carregarAndamento();
    } catch (e: any) {
      setErr(e?.message || "Erro ao remover");
    } finally {
      setBusy(false);
    }
  }

  async function carregarComunicacoes() {
    try {
      const res = await fetch(`/api/v1/engenharia/licitacoes/${idLicitacao}/comunicacoes`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar comunicações");
      setComunicacoes(Array.isArray(json.data) ? json.data : []);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar comunicações");
      setComunicacoes([]);
    }
  }

  async function adicionarComunicacao() {
    const direcao = (prompt("Direção (ENVIADO ou RECEBIDO):") || "").trim().toUpperCase();
    if (!direcao) return;
    const canal = (prompt("Canal (EMAIL, PORTAL, OFICIO, WHATSAPP, OUTRO):") || "").trim().toUpperCase();
    const dataReferencia = (prompt("Data (AAAA-MM-DD):") || "").trim();
    if (!dataReferencia) return;
    const assunto = (prompt("Assunto:") || "").trim();
    if (!assunto) return;
    const descricao = (prompt("Descrição (opcional):") || "").trim();
    try {
      setBusy(true);
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/licitacoes/${idLicitacao}/comunicacoes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direcao, canal: canal || "EMAIL", dataReferencia, assunto, descricao: descricao || null, criarDocumento: true }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao adicionar");
      await carregarComunicacoes();
    } catch (e: any) {
      setErr(e?.message || "Erro ao adicionar");
    } finally {
      setBusy(false);
    }
  }

  async function removerComunicacao(idComunicacao: number) {
    try {
      setBusy(true);
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/licitacoes/${idLicitacao}/comunicacoes?idComunicacao=${idComunicacao}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao remover");
      await carregarComunicacoes();
    } catch (e: any) {
      setErr(e?.message || "Erro ao remover");
    } finally {
      setBusy(false);
    }
  }

  async function carregarRecursos() {
    try {
      const res = await fetch(`/api/v1/engenharia/licitacoes/${idLicitacao}/recursos`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar recursos");
      setRecursos(Array.isArray(json.data) ? json.data : []);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar recursos");
      setRecursos([]);
    }
  }

  async function adicionarRecurso() {
    const tipo = (prompt("Tipo (IMPUGNACAO, ESCLARECIMENTO, RECURSO_ADMINISTRATIVO, CONTRARRAZOES):") || "").trim().toUpperCase();
    if (!tipo) return;
    const fase = (prompt("Fase (opcional):") || "").trim();
    const status = (prompt("Status (RASCUNHO, ENVIADO, EM_ANALISE, DEFERIDO, INDEFERIDO, ENCERRADO):") || "").trim().toUpperCase();
    const dataEnvio = (prompt("Data envio (AAAA-MM-DD, opcional):") || "").trim();
    const prazoResposta = (prompt("Prazo resposta (AAAA-MM-DD, opcional):") || "").trim();
    const protocolo = (prompt("Protocolo (opcional):") || "").trim();
    const descricao = (prompt("Descrição (opcional):") || "").trim();
    try {
      setBusy(true);
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/licitacoes/${idLicitacao}/recursos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, fase: fase || null, status: status || "RASCUNHO", dataEnvio: dataEnvio || null, prazoResposta: prazoResposta || null, protocolo: protocolo || null, descricao: descricao || null }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao adicionar");
      await carregarRecursos();
    } catch (e: any) {
      setErr(e?.message || "Erro ao adicionar");
    } finally {
      setBusy(false);
    }
  }

  async function removerRecurso(idRecurso: number) {
    try {
      setBusy(true);
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/licitacoes/${idLicitacao}/recursos?idRecurso=${idRecurso}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao remover");
      await carregarRecursos();
    } catch (e: any) {
      setErr(e?.message || "Erro ao remover");
    } finally {
      setBusy(false);
    }
  }

  async function carregarChecklist() {
    try {
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/licitacoes/${idLicitacao}/checklist`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar checklist");
      setChecklist(json.data);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar checklist");
      setChecklist({ resumo: null, itens: [] });
    }
  }

  async function criarChecklistPadrao() {
    try {
      setBusy(true);
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/licitacoes/${idLicitacao}/checklist`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preset: "PADRAO" }) });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao criar checklist padrão");
      await carregarChecklist();
    } catch (e: any) {
      setErr(e?.message || "Erro ao criar checklist padrão");
    } finally {
      setBusy(false);
    }
  }

  async function adicionarChecklistItem() {
    const categoria = (prompt("Categoria (ex.: JURIDICO, FISCAL, TRABALHISTA, ECONOMICO, TECNICO):") || "").trim().toUpperCase();
    if (!categoria) return;
    const nome = (prompt("Nome do item:") || "").trim();
    if (!nome) return;
    try {
      setBusy(true);
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/licitacoes/${idLicitacao}/checklist`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ categoria, nome, obrigatorio: true, diasAlerta: 30, ordem: 0 }) });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao adicionar item");
      await carregarChecklist();
    } catch (e: any) {
      setErr(e?.message || "Erro ao adicionar item");
    } finally {
      setBusy(false);
    }
  }

  async function removerChecklistItem(idItem: number) {
    try {
      setBusy(true);
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/licitacoes/${idLicitacao}/checklist?idItem=${idItem}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao remover item");
      await carregarChecklist();
    } catch (e: any) {
      setErr(e?.message || "Erro ao remover item");
    } finally {
      setBusy(false);
    }
  }

  async function carregarDossie() {
    try {
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/licitacoes/${idLicitacao}/dossie`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar dossiê");
      setDossie(json.data);
      setBloqueioDossie(null);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar dossiê");
      setDossie(null);
    }
  }

  async function carregarValidacao() {
    try {
      setErr(null);
      const dias = Number(String(diasAlertaValidacao || "30").trim());
      const qs = Number.isFinite(dias) ? `?diasAlerta=${Math.max(0, dias)}` : "";
      const res = await fetch(`/api/v1/engenharia/licitacoes/${idLicitacao}/validar${qs}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao validar licitação");
      setValidacao(json.data);
      return json.data;
    } catch (e: any) {
      setErr(e?.message || "Erro ao validar licitação");
      setValidacao(null);
      return null;
    }
  }

  async function prepararDossie() {
    try {
      setBusy(true);
      setErr(null);
      const v = await carregarValidacao();
      const criticos = Number(v?.resumo?.criticos || 0);
      if (criticos > 0) {
        setDossie(null);
        setBloqueioDossie(`Dossiê bloqueado: existem ${criticos} pendência(s) crítica(s) na validação.`);
        return;
      }
      setBloqueioDossie(null);
      await carregarDossie();
    } catch (e: any) {
      setErr(e?.message || "Erro ao preparar dossiê");
    } finally {
      setBusy(false);
    }
  }

  async function vincularDoc(idDocumentoEmpresa: number) {
    try {
      setBusy(true);
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/licitacoes/${idLicitacao}/documentos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idDocumentoEmpresa }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao vincular");
      await carregar();
      await carregarChecklist();
    } catch (e: any) {
      setErr(e?.message || "Erro ao vincular");
    } finally {
      setBusy(false);
    }
  }

  async function removerDoc(idDocumentoEmpresa: number) {
    try {
      setBusy(true);
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/licitacoes/${idLicitacao}/documentos?idDocumentoEmpresa=${idDocumentoEmpresa}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao remover");
      await carregar();
      await carregarChecklist();
    } catch (e: any) {
      setErr(e?.message || "Erro ao remover");
    } finally {
      setBusy(false);
    }
  }

  async function vincularAcervo(idAcervo: number) {
    try {
      setBusy(true);
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/licitacoes/${idLicitacao}/acervo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idAcervo }) });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao vincular");
      await carregar();
    } catch (e: any) {
      setErr(e?.message || "Erro ao vincular");
    } finally {
      setBusy(false);
    }
  }

  async function removerAcervo(idAcervo: number) {
    try {
      setBusy(true);
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/licitacoes/${idLicitacao}/acervo?idAcervo=${idAcervo}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao remover");
      await carregar();
    } catch (e: any) {
      setErr(e?.message || "Erro ao remover");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!idLicitacao) return;
    carregar();
    carregarChecklist();
    carregarAndamento();
    carregarComunicacoes();
    carregarRecursos();
    carregarValidacao();
  }, [idLicitacao]);

  if (!idLicitacao) return <div className="p-6 rounded-xl border bg-white">Licitação inválida.</div>;

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Licitação #{idLicitacao}</h1>
          <div className="text-sm text-slate-600">Vincule documentos e acervos a partir das bibliotecas da empresa.</div>
        </div>
        <div className="flex gap-2">
          <a className="rounded-lg border px-4 py-2 text-sm" href="/dashboard/engenharia/licitacoes/documentos-empresa">
            Documentos da Empresa
          </a>
          <a className="rounded-lg border px-4 py-2 text-sm" href="/dashboard/engenharia/licitacoes/acervo-empresa">
            Acervo da Empresa
          </a>
        </div>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      <div className="flex flex-wrap gap-2">
        <button className={`rounded-lg border px-4 py-2 text-sm ${tab === "DOCUMENTOS" ? "bg-blue-50 border-blue-200" : ""}`} type="button" onClick={() => setTab("DOCUMENTOS")}>
          Documentos
        </button>
        <button className={`rounded-lg border px-4 py-2 text-sm ${tab === "ACERVO" ? "bg-blue-50 border-blue-200" : ""}`} type="button" onClick={() => setTab("ACERVO")}>
          Acervo
        </button>
        <button className={`rounded-lg border px-4 py-2 text-sm ${tab === "CHECKLIST" ? "bg-blue-50 border-blue-200" : ""}`} type="button" onClick={() => setTab("CHECKLIST")}>
          Checklist
        </button>
        <button
          className={`rounded-lg border px-4 py-2 text-sm ${tab === "DOSSIE" ? "bg-blue-50 border-blue-200" : ""}`}
          type="button"
          onClick={() => {
            setTab("DOSSIE");
            prepararDossie();
          }}
        >
          Dossiê
        </button>
        <button className={`rounded-lg border px-4 py-2 text-sm ${tab === "ANDAMENTO" ? "bg-blue-50 border-blue-200" : ""}`} type="button" onClick={() => setTab("ANDAMENTO")}>
          Andamento
        </button>
        <button
          className={`rounded-lg border px-4 py-2 text-sm ${tab === "COMUNICACOES" ? "bg-blue-50 border-blue-200" : ""}`}
          type="button"
          onClick={() => setTab("COMUNICACOES")}
        >
          Enviados/Recebidos
        </button>
        <button className={`rounded-lg border px-4 py-2 text-sm ${tab === "RECURSOS" ? "bg-blue-50 border-blue-200" : ""}`} type="button" onClick={() => setTab("RECURSOS")}>
          Recursos
        </button>
        <button
          className={`rounded-lg border px-4 py-2 text-sm ${tab === "VALIDACAO" ? "bg-blue-50 border-blue-200" : ""}`}
          type="button"
          onClick={() => {
            setTab("VALIDACAO");
            carregarValidacao();
          }}
        >
          Validação
        </button>
      </div>

      {tab === "DOCUMENTOS" ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
            <div className="text-lg font-semibold">Vinculados na licitação</div>
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-3 py-2">Categoria</th>
                    <th className="px-3 py-2">Nome</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {docsVinc.map((d) => (
                    <tr key={d.idDocumentoEmpresa} className="border-t">
                      <td className="px-3 py-2">{d.categoria}</td>
                      <td className="px-3 py-2">
                        <a className="underline font-medium" href={`/dashboard/documentos/${d.idDocumentoRegistro}`}>
                          {d.nome}
                        </a>
                        <div className="text-xs text-slate-500">{d.dataValidade ? `Validade: ${d.dataValidade}` : ""}</div>
                      </td>
                      <td className="px-3 py-2">{d.status}</td>
                      <td className="px-3 py-2 text-right">
                        <button className="rounded-lg border px-3 py-1 text-xs" type="button" onClick={() => removerDoc(d.idDocumentoEmpresa)} disabled={busy}>
                          Remover
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!docsVinc.length ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                        Nenhum documento vinculado.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-lg font-semibold">Biblioteca da empresa</div>
              <input className="input w-80" value={qDoc} onChange={(e) => setQDoc(e.target.value)} placeholder="Buscar" />
            </div>
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-3 py-2">Categoria</th>
                    <th className="px-3 py-2">Nome</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {docsFiltrados.map((d) => (
                    <tr key={d.idDocumentoEmpresa} className="border-t">
                      <td className="px-3 py-2">{d.categoria}</td>
                      <td className="px-3 py-2">{d.nome}</td>
                      <td className="px-3 py-2">{d.status}</td>
                      <td className="px-3 py-2 text-right">
                        <button className="rounded-lg bg-blue-600 px-3 py-1 text-xs text-white" type="button" onClick={() => vincularDoc(d.idDocumentoEmpresa)} disabled={busy}>
                          Vincular
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!docsFiltrados.length ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                        Sem itens.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      {tab === "ACERVO" ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
            <div className="text-lg font-semibold">Vinculados na licitação</div>
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2">Título</th>
                    <th className="px-3 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {acervoVinc.map((a) => (
                    <tr key={a.idAcervo} className="border-t">
                      <td className="px-3 py-2">{a.tipo}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{a.titulo}</div>
                        <div className="text-xs text-slate-500">{a.nomeObra || ""}</div>
                        {a.idDocumentoRegistro ? (
                          <a className="underline text-xs" href={`/dashboard/documentos/${a.idDocumentoRegistro}`}>
                            Documento
                          </a>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button className="rounded-lg border px-3 py-1 text-xs" type="button" onClick={() => removerAcervo(a.idAcervo)} disabled={busy}>
                          Remover
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!acervoVinc.length ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-6 text-center text-slate-500">
                        Nenhum item vinculado.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-lg font-semibold">Biblioteca da empresa</div>
              <input className="input w-80" value={qAcervo} onChange={(e) => setQAcervo(e.target.value)} placeholder="Buscar" />
            </div>
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2">Título</th>
                    <th className="px-3 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {acervoFiltrado.map((a) => (
                    <tr key={a.idAcervo} className="border-t">
                      <td className="px-3 py-2">{a.tipo}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{a.titulo}</div>
                        <div className="text-xs text-slate-500">{a.nomeObra || ""}</div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button className="rounded-lg bg-blue-600 px-3 py-1 text-xs text-white" type="button" onClick={() => vincularAcervo(a.idAcervo)} disabled={busy}>
                          Vincular
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!acervoFiltrado.length ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-6 text-center text-slate-500">
                        Sem itens.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      {tab === "CHECKLIST" ? (
        <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-lg font-semibold">Checklist da licitação</div>
              <div className="text-sm text-slate-600">Controla documentos obrigatórios e alerta validade/arquivo ausente.</div>
            </div>
            <div className="flex gap-2">
              <button className="rounded-lg border px-4 py-2 text-sm" type="button" onClick={adicionarChecklistItem} disabled={busy}>
                Adicionar item
              </button>
              <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" type="button" onClick={criarChecklistPadrao} disabled={busy}>
                Criar checklist padrão
              </button>
            </div>
          </div>

          {checklist?.resumo ? (
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-sm">
              <div className="rounded-lg border p-2">Total: {checklist.resumo.total}</div>
              <div className="rounded-lg border p-2">OK: {checklist.resumo.ok}</div>
              <div className="rounded-lg border p-2">A vencer: {checklist.resumo.aVencer}</div>
              <div className="rounded-lg border p-2">Vencido: {checklist.resumo.vencido}</div>
              <div className="rounded-lg border p-2">Sem arquivo: {checklist.resumo.semArquivo}</div>
              <div className="rounded-lg border p-2">Pendente: {checklist.resumo.pendente}</div>
            </div>
          ) : null}

          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2">Categoria</th>
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Arquivo</th>
                  <th className="px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {checklist.itens.map((i) => (
                  <tr key={i.idItem} className="border-t">
                    <td className="px-3 py-2">{i.categoria}</td>
                    <td className="px-3 py-2 font-medium">{i.nome}</td>
                    <td className="px-3 py-2">{i.status}</td>
                    <td className="px-3 py-2">
                      {i.downloadUrl ? (
                        <a className="underline" href={i.downloadUrl}>
                          Baixar PDF
                        </a>
                      ) : i.idDocumentoRegistro ? (
                        <a className="underline" href={`/dashboard/documentos/${i.idDocumentoRegistro}`}>
                          Abrir documento
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button className="rounded-lg border px-3 py-1 text-xs" type="button" onClick={() => removerChecklistItem(i.idItem)} disabled={busy}>
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
                {!checklist.itens.length ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                      Sem checklist. Clique em “Criar checklist padrão”.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "DOSSIE" ? (
        <div className="rounded-xl border bg-white p-4 shadow-sm space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-lg font-semibold">Dossiê da licitação</div>
              <div className="text-sm text-slate-600">Lista de documentos e acervo vinculados com links de download.</div>
            </div>
            <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" type="button" onClick={prepararDossie} disabled={busy}>
              {busy ? "Preparando..." : "Preparar/Atualizar"}
            </button>
          </div>

          {bloqueioDossie ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-center justify-between gap-3 flex-wrap">
              <div>{bloqueioDossie}</div>
              <button className="rounded-lg border px-3 py-2 text-sm" type="button" onClick={() => setTab("VALIDACAO")}>
                Ver validação
              </button>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="space-y-2">
              <div className="font-semibold">Documentos</div>
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left">
                    <tr>
                      <th className="px-3 py-2">Categoria</th>
                      <th className="px-3 py-2">Nome</th>
                      <th className="px-3 py-2 text-right">Download</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(dossie?.documentos || []).map((d: any) => (
                      <tr key={d.idDocumentoEmpresa} className="border-t">
                        <td className="px-3 py-2">{d.categoria}</td>
                        <td className="px-3 py-2">{d.nome}</td>
                        <td className="px-3 py-2 text-right">{d.downloadUrl ? <a className="underline" href={d.downloadUrl}>Baixar PDF</a> : "-"}</td>
                      </tr>
                    ))}
                    {!dossie?.documentos?.length ? (
                      <tr>
                        <td colSpan={3} className="px-3 py-6 text-center text-slate-500">
                          Sem documentos vinculados.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="space-y-2">
              <div className="font-semibold">Acervo</div>
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left">
                    <tr>
                      <th className="px-3 py-2">Tipo</th>
                      <th className="px-3 py-2">Título</th>
                      <th className="px-3 py-2 text-right">Download</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(dossie?.acervo || []).map((a: any) => (
                      <tr key={a.idAcervo} className="border-t">
                        <td className="px-3 py-2">{a.tipo}</td>
                        <td className="px-3 py-2">{a.titulo}</td>
                        <td className="px-3 py-2 text-right">{a.downloadUrl ? <a className="underline" href={a.downloadUrl}>Baixar PDF</a> : "-"}</td>
                      </tr>
                    ))}
                    {!dossie?.acervo?.length ? (
                      <tr>
                        <td colSpan={3} className="px-3 py-6 text-center text-slate-500">
                          Sem acervo vinculado.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {tab === "ANDAMENTO" ? (
        <div className="rounded-xl border bg-white p-4 shadow-sm space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-lg font-semibold">Andamento</div>
              <div className="text-sm text-slate-600">Linha do tempo e status da licitação.</div>
            </div>
            <div className="flex gap-2">
              <button className="rounded-lg border px-4 py-2 text-sm" type="button" onClick={adicionarAndamento} disabled={busy}>
                Adicionar evento
              </button>
              <button className="rounded-lg border px-4 py-2 text-sm" type="button" onClick={vincularOrcamentoPrompt} disabled={busy}>
                Vincular orçamento
              </button>
              <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" type="button" onClick={salvarCabecalho} disabled={busy || !cabEdit}>
                Salvar dados
              </button>
            </div>
          </div>

          <div className="rounded-lg border bg-slate-50 p-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm">
              <div className="text-slate-600">Planilha orçamentária (licitação)</div>
              {orcamentoLink ? (
                <div className="font-medium">
                  Orçamento #{orcamentoLink.idOrcamento} — {orcamentoLink.nome}{" "}
                  <span className="text-slate-600 font-normal">
                    {orcamentoLink.versaoAtual
                      ? `• versão atual: v${orcamentoLink.versaoAtual.numeroVersao} ${orcamentoLink.versaoAtual.status}`
                      : `• ${orcamentoLink.totalVersoes} versão(ões)`}
                  </span>
                </div>
              ) : (
                <div className="text-slate-600">Nenhum orçamento vinculado.</div>
              )}
            </div>
            {orcamentoLink ? (
              <a className="rounded-lg border bg-white px-4 py-2 text-sm" href={`/dashboard/engenharia/orcamentos/${orcamentoLink.idOrcamento}`}>
                Abrir orçamento
              </a>
            ) : null}
          </div>

          <div className="rounded-lg border bg-white p-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm">
              <div className="text-slate-600">Declarações (gerar automático)</div>
              <div className="text-slate-600">Gera PDF e já vincula na licitação (aparece em Documentos/Checklist/Dossiê).</div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button className="rounded-lg border px-3 py-2 text-sm" type="button" onClick={() => gerarDeclaracao("FATO_IMPEDITIVO")} disabled={busy}>
                Fato impeditivo
              </button>
              <button className="rounded-lg border px-3 py-2 text-sm" type="button" onClick={() => gerarDeclaracao("ART7")} disabled={busy}>
                Art. 7º
              </button>
              <button className="rounded-lg border px-3 py-2 text-sm" type="button" onClick={() => gerarDeclaracao("ME_EPP")} disabled={busy}>
                ME/EPP
              </button>
              <button className="rounded-lg border px-3 py-2 text-sm" type="button" onClick={() => gerarDeclaracao("VISITA_TECNICA")} disabled={busy}>
                Visita técnica
              </button>
              <button className="rounded-lg border px-3 py-2 text-sm" type="button" onClick={() => setDeclCustomOpen((v) => !v)} disabled={busy}>
                Declaração específica
              </button>
            </div>
          </div>

          {declCustomOpen ? (
            <div className="rounded-lg border bg-white p-4 space-y-3">
              <div className="text-sm text-slate-600">Declaração específica do edital</div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
                <div className="md:col-span-2">
                  <div className="text-sm text-slate-600">Categoria</div>
                  <input className="input" value={declCustom.categoria} onChange={(e) => setDeclCustom((p) => ({ ...p, categoria: e.target.value }))} placeholder="DECLARACOES" />
                </div>
                <div className="md:col-span-4">
                  <div className="text-sm text-slate-600">Título</div>
                  <input className="input" value={declCustom.titulo} onChange={(e) => setDeclCustom((p) => ({ ...p, titulo: e.target.value }))} placeholder="Declaração específica do edital" />
                </div>
                <div className="md:col-span-6">
                  <div className="text-sm text-slate-600">Texto</div>
                  <textarea className="input" style={{ minHeight: 160 }} value={declCustom.texto} onChange={(e) => setDeclCustom((p) => ({ ...p, texto: e.target.value }))} />
                </div>
                <div className="md:col-span-2">
                  <div className="text-sm text-slate-600">Edital (opcional)</div>
                  <input className="input" value={declCustom.numeroEdital} onChange={(e) => setDeclCustom((p) => ({ ...p, numeroEdital: e.target.value }))} />
                </div>
                <div className="md:col-span-2">
                  <div className="text-sm text-slate-600">Cidade (opcional)</div>
                  <input className="input" value={declCustom.cidade} onChange={(e) => setDeclCustom((p) => ({ ...p, cidade: e.target.value }))} />
                </div>
                <div className="md:col-span-2">
                  <div className="text-sm text-slate-600">UF (opcional)</div>
                  <input className="input" value={declCustom.uf} onChange={(e) => setDeclCustom((p) => ({ ...p, uf: e.target.value }))} />
                </div>
                <div className="md:col-span-6 flex justify-end gap-2">
                  <button className="rounded-lg border px-4 py-2 text-sm" type="button" onClick={() => setDeclCustomOpen(false)} disabled={busy}>
                    Cancelar
                  </button>
                  <button className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white" type="button" onClick={gerarDeclaracaoCustom} disabled={busy || !declCustom.titulo.trim() || !declCustom.texto.trim()}>
                    Gerar e vincular
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {cabEdit ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
              <div className="md:col-span-3">
                <div className="text-sm text-slate-600">Título</div>
                <input className="input" value={cabEdit.titulo || ""} onChange={(e) => setCabEdit((p: any) => ({ ...p, titulo: e.target.value }))} />
              </div>
              <div className="md:col-span-2">
                <div className="text-sm text-slate-600">Órgão/Contratante</div>
                <input className="input" value={cabEdit.orgao || ""} onChange={(e) => setCabEdit((p: any) => ({ ...p, orgao: e.target.value }))} />
              </div>
              <div>
                <div className="text-sm text-slate-600">Status</div>
                <select className="input" value={cabEdit.status || "EM_ANALISE"} onChange={(e) => setCabEdit((p: any) => ({ ...p, status: e.target.value }))}>
                  <option value="PREVISTA">PREVISTA</option>
                  <option value="EM_ANALISE">EM_ANALISE</option>
                  <option value="EM_PREPARACAO">EM_PREPARACAO</option>
                  <option value="PARTICIPANDO">PARTICIPANDO</option>
                  <option value="AGUARDANDO_RESULTADO">AGUARDANDO_RESULTADO</option>
                  <option value="ENCERRADA">ENCERRADA</option>
                  <option value="VENCIDA">VENCIDA</option>
                  <option value="DESISTIDA">DESISTIDA</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <div className="text-sm text-slate-600">Fase</div>
                <input className="input" value={cabEdit.fase || ""} onChange={(e) => setCabEdit((p: any) => ({ ...p, fase: e.target.value }))} placeholder="Ex.: Habilitação" />
              </div>
              <div>
                <div className="text-sm text-slate-600">Abertura</div>
                <input className="input" type="date" value={cabEdit.dataAbertura || ""} onChange={(e) => setCabEdit((p: any) => ({ ...p, dataAbertura: e.target.value }))} />
              </div>
              <div>
                <div className="text-sm text-slate-600">Encerramento</div>
                <input className="input" type="date" value={cabEdit.dataEncerramento || ""} onChange={(e) => setCabEdit((p: any) => ({ ...p, dataEncerramento: e.target.value }))} />
              </div>
              <div className="md:col-span-2">
                <div className="text-sm text-slate-600">Responsável</div>
                <input className="input" value={cabEdit.responsavelNome || ""} onChange={(e) => setCabEdit((p: any) => ({ ...p, responsavelNome: e.target.value }))} />
              </div>
              <div className="md:col-span-4">
                <div className="text-sm text-slate-600">Portal/Link</div>
                <input className="input" value={cabEdit.portalUrl || ""} onChange={(e) => setCabEdit((p: any) => ({ ...p, portalUrl: e.target.value }))} placeholder="https://..." />
              </div>
              <div className="md:col-span-6">
                <div className="text-sm text-slate-600">Observações</div>
                <input className="input" value={cabEdit.observacoes || ""} onChange={(e) => setCabEdit((p: any) => ({ ...p, observacoes: e.target.value }))} />
              </div>
            </div>
          ) : null}

          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Título</th>
                  <th className="px-3 py-2">Detalhe</th>
                  <th className="px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {andamento.map((e: any) => (
                  <tr key={e.idEvento} className="border-t">
                    <td className="px-3 py-2">{e.dataEvento}</td>
                    <td className="px-3 py-2">{e.tipo}</td>
                    <td className="px-3 py-2 font-medium">{e.titulo}</td>
                    <td className="px-3 py-2">{e.descricao || "-"}</td>
                    <td className="px-3 py-2 text-right">
                      <button className="rounded-lg border px-3 py-1 text-xs" type="button" onClick={() => removerAndamento(e.idEvento)} disabled={busy}>
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
                {!andamento.length ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                      Sem eventos.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "COMUNICACOES" ? (
        <div className="rounded-xl border bg-white p-4 shadow-sm space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-lg font-semibold">Documentos enviados/recebidos</div>
              <div className="text-sm text-slate-600">Registro de comunicação com geração de “Documento” para anexar PDF e manter histórico.</div>
            </div>
            <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" type="button" onClick={adicionarComunicacao} disabled={busy}>
              Adicionar comunicação
            </button>
          </div>

          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Direção</th>
                  <th className="px-3 py-2">Canal</th>
                  <th className="px-3 py-2">Assunto</th>
                  <th className="px-3 py-2">Arquivo</th>
                  <th className="px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {comunicacoes.map((c: any) => (
                  <tr key={c.idComunicacao} className="border-t">
                    <td className="px-3 py-2">{c.dataReferencia}</td>
                    <td className="px-3 py-2">{c.direcao}</td>
                    <td className="px-3 py-2">{c.canal}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{c.assunto}</div>
                      <div className="text-xs text-slate-500">{c.descricao || ""}</div>
                    </td>
                    <td className="px-3 py-2">
                      {c.downloadUrl ? (
                        <a className="underline" href={c.downloadUrl}>
                          Baixar PDF
                        </a>
                      ) : c.idDocumentoRegistro ? (
                        <a className="underline" href={`/dashboard/documentos/${c.idDocumentoRegistro}`}>
                          Abrir documento
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button className="rounded-lg border px-3 py-1 text-xs" type="button" onClick={() => removerComunicacao(c.idComunicacao)} disabled={busy}>
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
                {!comunicacoes.length ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                      Sem comunicações.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "RECURSOS" ? (
        <div className="rounded-xl border bg-white p-4 shadow-sm space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-lg font-semibold">Recursos / Impugnações / Esclarecimentos</div>
              <div className="text-sm text-slate-600">Controle do ciclo do recurso (envio, prazo, status, protocolo) com documento anexável.</div>
            </div>
            <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" type="button" onClick={adicionarRecurso} disabled={busy}>
              Adicionar recurso
            </button>
          </div>

          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Envio</th>
                  <th className="px-3 py-2">Prazo</th>
                  <th className="px-3 py-2">Protocolo</th>
                  <th className="px-3 py-2">Arquivo</th>
                  <th className="px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {recursos.map((r: any) => (
                  <tr key={r.idRecurso} className="border-t">
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.tipo}</div>
                      <div className="text-xs text-slate-500">{r.fase || ""}</div>
                    </td>
                    <td className="px-3 py-2">{r.status}</td>
                    <td className="px-3 py-2">{r.dataEnvio || "-"}</td>
                    <td className="px-3 py-2">{r.prazoResposta || "-"}</td>
                    <td className="px-3 py-2">{r.protocolo || "-"}</td>
                    <td className="px-3 py-2">
                      {r.downloadUrl ? (
                        <a className="underline" href={r.downloadUrl}>
                          Baixar PDF
                        </a>
                      ) : r.idDocumentoRegistro ? (
                        <a className="underline" href={`/dashboard/documentos/${r.idDocumentoRegistro}`}>
                          Abrir documento
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button className="rounded-lg border px-3 py-1 text-xs" type="button" onClick={() => removerRecurso(r.idRecurso)} disabled={busy}>
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
                {!recursos.length ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                      Sem recursos.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "VALIDACAO" ? (
        <div className="rounded-xl border bg-white p-4 shadow-sm space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-lg font-semibold">Validação da licitação</div>
              <div className="text-sm text-slate-600">Verifica pendências críticas (documentos, validade, prazos e anexos) antes de enviar a proposta.</div>
            </div>
            <div className="flex gap-2 items-end">
              <div>
                <div className="text-xs text-slate-600">Alerta de prazo (dias)</div>
                <input className="input w-28" value={diasAlertaValidacao} onChange={(e) => setDiasAlertaValidacao(e.target.value)} />
              </div>
              <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" type="button" onClick={carregarValidacao} disabled={busy}>
                Validar agora
              </button>
            </div>
          </div>

          {validacao?.resumo ? (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <div className="rounded-lg border p-3">
                <div className="text-sm text-slate-600">Críticos</div>
                <div className="text-2xl font-semibold">{validacao.resumo.criticos}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-sm text-slate-600">Alertas</div>
                <div className="text-2xl font-semibold">{validacao.resumo.alertas}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-sm text-slate-600">Informativos</div>
                <div className="text-2xl font-semibold">{validacao.resumo.infos}</div>
              </div>
            </div>
          ) : null}

          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2">Nível</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Mensagem</th>
                  <th className="px-3 py-2">Referência</th>
                  <th className="px-3 py-2 text-right">Abrir</th>
                </tr>
              </thead>
              <tbody>
                {(validacao?.issues || []).map((i: any, idx: number) => (
                  <tr key={`${i.tipo}-${idx}`} className={`border-t ${i.nivel === "CRITICO" ? "bg-red-50" : i.nivel === "ALERTA" ? "bg-amber-50" : ""}`}>
                    <td className="px-3 py-2 font-medium">{i.nivel}</td>
                    <td className="px-3 py-2">{i.tipo}</td>
                    <td className="px-3 py-2">{i.mensagem}</td>
                    <td className="px-3 py-2">{i.referencia || "-"}</td>
                    <td className="px-3 py-2 text-right">{i.link ? <a className="underline" href={i.link}>Abrir</a> : "-"}</td>
                  </tr>
                ))}
                {!validacao?.issues?.length ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                      Nenhuma pendência encontrada.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
