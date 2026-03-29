"use client";

import { useEffect, useMemo, useState } from "react";

type AtivoDTO = {
  idAtivo: number;
  categoria: "EQUIPAMENTO" | "FERRAMENTA" | "VEICULO";
  descricao: string;
  codigoInterno: string | null;
  patrimonio: string | null;
  proprietario: "PROPRIO" | "TERCEIRO";
  status: "ATIVO" | "MANUTENCAO" | "DESCARTADO" | "INATIVO";
  localTipo: "OBRA" | "UNIDADE" | "ALMOXARIFADO" | "TERCEIRO" | null;
  localId: number | null;
};

type CautelaHead = { idCautela: number; tipoLocal: "OBRA" | "UNIDADE"; idLocal: number; dataReferencia: string; status: "ABERTA" | "FECHADA" };
type CautelaItem = {
  idItem: number;
  idAtivo: number;
  ativoDescricao: string;
  ativoCategoria: string;
  acao: "ENTREGA" | "DEVOLUCAO";
  quantidade: number;
  idFuncionarioDestinatario: number | null;
  codigoServico: string | null;
  observacao: string | null;
};
type MovDTO = {
  idMov: number;
  tipo: "TRANSFERENCIA" | "LOCALIZACAO" | "ENTRADA" | "SAIDA" | "MANUTENCAO" | "DESCARTE";
  deLocalTipo: string | null;
  deLocalId: number | null;
  paraLocalTipo: string | null;
  paraLocalId: number | null;
  dataReferencia: string;
  observacao: string | null;
  criadoEm: string;
};
type HorasDTO = { idApontamento: number; idAtivo: number; dataReferencia: string; codigoServico: string; horasProdutivas: number; horasImprodutivas: number; observacao: string | null };
type CombustivelDTO = {
  idRegistro: number;
  idAtivo: number;
  dataReferencia: string;
  codigoServico: string;
  litros: number;
  valorTotal: number;
  odometroHorimetro: number | null;
  observacao: string | null;
};
type ViagemDTO = { idViagem: number; idAtivo: number; dataReferencia: string; codigoServico: string; origem: string | null; destino: string | null; tipoCarga: string | null; km: number | null; observacao: string | null };
type CalendarioDTO = { idAtivo: number; competencia: string; tipoLocal: "OBRA" | "UNIDADE"; idLocal: number; planejamento: any };
type DescarteDTO = {
  idDescarte: number;
  idAtivo: number;
  ativoDescricao: string;
  ativoCategoria: string;
  tipoLocal: string | null;
  idLocal: number | null;
  dataSolicitacao: string;
  motivo: string;
  laudoUrl: string | null;
  status: "PENDENTE" | "APROVADO" | "REJEITADO";
  aprovadoEm: string | null;
  rejeitadoEm: string | null;
};

export default function AtivosClient() {
  const [q, setQ] = useState("");
  const [categoria, setCategoria] = useState<AtivoDTO["categoria"] | "">("");
  const [status, setStatus] = useState<AtivoDTO["status"] | "">("ATIVO");
  const [idObra, setIdObra] = useState("");
  const [idUnidade, setIdUnidade] = useState("");
  const [rows, setRows] = useState<AtivoDTO[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [tab, setTab] = useState<
    "CADASTRO" | "CAUTELAS" | "MOVIMENTACOES" | "HORAS" | "COMBUSTIVEL" | "VIAGENS" | "CALENDARIO" | "DESCARTES"
  >("CADASTRO");

  const [novo, setNovo] = useState({
    categoria: "EQUIPAMENTO" as AtivoDTO["categoria"],
    descricao: "",
    codigoInterno: "",
    patrimonio: "",
    proprietario: "PROPRIO" as AtivoDTO["proprietario"],
    status: "ATIVO" as AtivoDTO["status"],
    localTipo: "" as "" | "OBRA" | "UNIDADE",
    localId: "",
    idContraparte: "",
    idContratoLocacao: "",
  });

  const [cautelaLocal, setCautelaLocal] = useState({ tipoLocal: "OBRA" as "OBRA" | "UNIDADE", idLocal: "", data: new Date().toISOString().slice(0, 10) });
  const [cautelaHead, setCautelaHead] = useState<CautelaHead | null>(null);
  const [cautelaItens, setCautelaItens] = useState<CautelaItem[]>([]);
  const [cautelaItem, setCautelaItem] = useState({ acao: "ENTREGA" as "ENTREGA" | "DEVOLUCAO", idAtivo: "", quantidade: "1", idFuncionarioDestinatario: "", codigoServico: "", observacao: "" });

  const [idAtivoMov, setIdAtivoMov] = useState("");
  const [movs, setMovs] = useState<MovDTO[]>([]);
  const [novoMov, setNovoMov] = useState({ tipo: "TRANSFERENCIA" as MovDTO["tipo"], paraLocalTipo: "OBRA" as "OBRA" | "UNIDADE" | "ALMOXARIFADO" | "TERCEIRO", paraLocalId: "", dataReferencia: new Date().toISOString().slice(0, 10), observacao: "" });

  const [horasFiltro, setHorasFiltro] = useState({ tipoLocal: "OBRA" as "OBRA" | "UNIDADE", idLocal: "", competencia: "" });
  const [horasRows, setHorasRows] = useState<HorasDTO[]>([]);
  const [horasNovo, setHorasNovo] = useState({ idAtivo: "", dataReferencia: new Date().toISOString().slice(0, 10), codigoServico: "", horasProdutivas: "0", horasImprodutivas: "0", observacao: "" });

  const [combFiltro, setCombFiltro] = useState({ tipoLocal: "OBRA" as "OBRA" | "UNIDADE", idLocal: "", competencia: "" });
  const [combRows, setCombRows] = useState<CombustivelDTO[]>([]);
  const [combNovo, setCombNovo] = useState({ idAtivo: "", dataReferencia: new Date().toISOString().slice(0, 10), codigoServico: "", litros: "0", valorTotal: "0", odometroHorimetro: "", observacao: "" });

  const [viagemFiltro, setViagemFiltro] = useState({ tipoLocal: "OBRA" as "OBRA" | "UNIDADE", idLocal: "", competencia: "" });
  const [viagemRows, setViagemRows] = useState<ViagemDTO[]>([]);
  const [viagemNovo, setViagemNovo] = useState({ idAtivo: "", dataReferencia: new Date().toISOString().slice(0, 10), codigoServico: "", origem: "", destino: "", tipoCarga: "", km: "", observacao: "" });

  const [calFiltro, setCalFiltro] = useState({ idAtivo: "", competencia: "", tipoLocal: "OBRA" as "OBRA" | "UNIDADE", idLocal: "" });
  const [calData, setCalData] = useState<CalendarioDTO | null>(null);
  const [calText, setCalText] = useState("");

  const [descFiltro, setDescFiltro] = useState({ status: "PENDENTE", tipoLocal: "" as "" | "OBRA" | "UNIDADE", idLocal: "" });
  const [descRows, setDescRows] = useState<DescarteDTO[]>([]);
  const [descNovo, setDescNovo] = useState({ idAtivo: "", dataSolicitacao: new Date().toISOString().slice(0, 10), motivo: "", laudoUrl: "" });

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (categoria) params.set("categoria", categoria);
    if (status) params.set("status", status);
    const obra = Number(idObra || 0);
    const un = Number(idUnidade || 0);
    if (obra) params.set("idObra", String(obra));
    if (un) params.set("idUnidade", String(un));
    const s = params.toString();
    return s ? `?${s}` : "";
  }, [q, categoria, status, idObra, idUnidade]);

  async function carregar() {
    try {
      setLoading(true);
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/ativos${queryString}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Erro ao carregar ativos");
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar ativos");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function criar() {
    try {
      setErr(null);
      const payload: any = {
        categoria: novo.categoria,
        descricao: novo.descricao,
        codigoInterno: novo.codigoInterno || null,
        patrimonio: novo.patrimonio || null,
        proprietario: novo.proprietario,
        status: novo.status,
        idContraparte: novo.idContraparte ? Number(novo.idContraparte) : null,
        idContratoLocacao: novo.idContratoLocacao ? Number(novo.idContratoLocacao) : null,
      };
      if (novo.localTipo && Number(novo.localId || 0)) {
        payload.localTipo = novo.localTipo;
        payload.localId = Number(novo.localId);
      }
      const res = await fetch("/api/v1/engenharia/ativos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "Erro ao criar ativo");
      setNovo({
        categoria: "EQUIPAMENTO",
        descricao: "",
        codigoInterno: "",
        patrimonio: "",
        proprietario: "PROPRIO",
        status: "ATIVO",
        localTipo: "",
        localId: "",
        idContraparte: "",
        idContratoLocacao: "",
      });
      await carregar();
    } catch (e: any) {
      setErr(e?.message || "Erro ao criar ativo");
    }
  }

  async function abrirCautelaAtivos() {
    const idLocalNum = Number(cautelaLocal.idLocal || 0);
    if (!idLocalNum) return;
    try {
      setLoading(true);
      setErr(null);
      const res = await fetch("/api/v1/engenharia/ativos/cautelas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipoLocal: cautelaLocal.tipoLocal, idLocal: idLocalNum, dataReferencia: cautelaLocal.data }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || "Erro ao abrir cautela");
      const idCautela = Number(json?.idCautela || 0);
      if (!idCautela) throw new Error("Cautela inválida");
      setCautelaHead({ idCautela, tipoLocal: cautelaLocal.tipoLocal, idLocal: idLocalNum, dataReferencia: cautelaLocal.data, status: "ABERTA" });
      await carregarItensCautelaAtivos(idCautela);
    } catch (e: any) {
      setErr(e?.message || "Erro ao abrir cautela");
      setCautelaHead(null);
      setCautelaItens([]);
    } finally {
      setLoading(false);
    }
  }

  async function carregarItensCautelaAtivos(idCautela: number) {
    const res = await fetch(`/api/v1/engenharia/ativos/cautelas/${idCautela}/itens`, { cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.message || "Erro ao carregar itens da cautela");
    setCautelaItens(Array.isArray(json) ? json : []);
  }

  async function registrarItemCautelaAtivos() {
    if (!cautelaHead?.idCautela) return;
    try {
      setErr(null);
      const payload: any = {
        idAtivo: Number(cautelaItem.idAtivo || 0),
        acao: cautelaItem.acao,
        quantidade: Number(cautelaItem.quantidade.replace(",", ".")),
        idFuncionarioDestinatario: cautelaItem.idFuncionarioDestinatario ? Number(cautelaItem.idFuncionarioDestinatario) : null,
        codigoServico: cautelaItem.codigoServico || null,
        observacao: cautelaItem.observacao || null,
      };
      const res = await fetch(`/api/v1/engenharia/ativos/cautelas/${cautelaHead.idCautela}/itens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || "Erro ao registrar item da cautela");
      await carregarItensCautelaAtivos(cautelaHead.idCautela);
      setCautelaItem({ acao: "ENTREGA", idAtivo: "", quantidade: "1", idFuncionarioDestinatario: "", codigoServico: "", observacao: "" });
    } catch (e: any) {
      setErr(e?.message || "Erro ao registrar item da cautela");
    }
  }

  async function carregarMovimentacoes() {
    const idAtivoNum = Number(idAtivoMov || 0);
    if (!idAtivoNum) return;
    try {
      setLoading(true);
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/ativos/movimentacoes?idAtivo=${idAtivoNum}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || "Erro ao carregar movimentações");
      setMovs(Array.isArray(json) ? json : []);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar movimentações");
      setMovs([]);
    } finally {
      setLoading(false);
    }
  }

  async function registrarMovimentacao() {
    const idAtivoNum = Number(idAtivoMov || 0);
    if (!idAtivoNum) return;
    try {
      setErr(null);
      const payload: any = {
        idAtivo: idAtivoNum,
        tipo: novoMov.tipo,
        paraLocalTipo: novoMov.paraLocalTipo,
        paraLocalId: novoMov.paraLocalId ? Number(novoMov.paraLocalId) : null,
        dataReferencia: novoMov.dataReferencia,
        observacao: novoMov.observacao || null,
      };
      const res = await fetch("/api/v1/engenharia/ativos/movimentacoes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || "Erro ao registrar movimentação");
      await carregarMovimentacoes();
    } catch (e: any) {
      setErr(e?.message || "Erro ao registrar movimentação");
    }
  }

  async function carregarHoras() {
    const idLocalNum = Number(horasFiltro.idLocal || 0);
    if (!idLocalNum) return;
    try {
      setLoading(true);
      setErr(null);
      const qs = new URLSearchParams({ tipoLocal: horasFiltro.tipoLocal, idLocal: String(idLocalNum) });
      if (horasFiltro.competencia) qs.set("competencia", horasFiltro.competencia);
      const res = await fetch(`/api/v1/engenharia/ativos/apontamentos-horas?${qs.toString()}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || "Erro ao carregar horas");
      setHorasRows(Array.isArray(json) ? json : []);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar horas");
      setHorasRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function registrarHoras() {
    const idLocalNum = Number(horasFiltro.idLocal || 0);
    if (!idLocalNum) return;
    try {
      setErr(null);
      const payload: any = {
        tipoLocal: horasFiltro.tipoLocal,
        idLocal: idLocalNum,
        idAtivo: Number(horasNovo.idAtivo || 0),
        dataReferencia: horasNovo.dataReferencia,
        codigoServico: horasNovo.codigoServico,
        horasProdutivas: Number(horasNovo.horasProdutivas.replace(",", ".")),
        horasImprodutivas: Number(horasNovo.horasImprodutivas.replace(",", ".")),
        observacao: horasNovo.observacao || null,
      };
      const res = await fetch("/api/v1/engenharia/ativos/apontamentos-horas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || "Erro ao registrar horas");
      await carregarHoras();
      setHorasNovo({ idAtivo: "", dataReferencia: new Date().toISOString().slice(0, 10), codigoServico: "", horasProdutivas: "0", horasImprodutivas: "0", observacao: "" });
    } catch (e: any) {
      setErr(e?.message || "Erro ao registrar horas");
    }
  }

  async function carregarCombustivel() {
    const idLocalNum = Number(combFiltro.idLocal || 0);
    if (!idLocalNum) return;
    try {
      setLoading(true);
      setErr(null);
      const qs = new URLSearchParams({ tipoLocal: combFiltro.tipoLocal, idLocal: String(idLocalNum) });
      if (combFiltro.competencia) qs.set("competencia", combFiltro.competencia);
      const res = await fetch(`/api/v1/engenharia/ativos/combustivel?${qs.toString()}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || "Erro ao carregar combustível");
      setCombRows(Array.isArray(json) ? json : []);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar combustível");
      setCombRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function registrarCombustivel() {
    const idLocalNum = Number(combFiltro.idLocal || 0);
    if (!idLocalNum) return;
    try {
      setErr(null);
      const payload: any = {
        tipoLocal: combFiltro.tipoLocal,
        idLocal: idLocalNum,
        idAtivo: Number(combNovo.idAtivo || 0),
        dataReferencia: combNovo.dataReferencia,
        codigoServico: combNovo.codigoServico,
        litros: Number(combNovo.litros.replace(",", ".")),
        valorTotal: Number(combNovo.valorTotal.replace(",", ".")),
        odometroHorimetro: combNovo.odometroHorimetro ? Number(combNovo.odometroHorimetro.replace(",", ".")) : null,
        observacao: combNovo.observacao || null,
      };
      const res = await fetch("/api/v1/engenharia/ativos/combustivel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || "Erro ao registrar combustível");
      await carregarCombustivel();
      setCombNovo({ idAtivo: "", dataReferencia: new Date().toISOString().slice(0, 10), codigoServico: "", litros: "0", valorTotal: "0", odometroHorimetro: "", observacao: "" });
    } catch (e: any) {
      setErr(e?.message || "Erro ao registrar combustível");
    }
  }

  async function carregarViagens() {
    const idLocalNum = Number(viagemFiltro.idLocal || 0);
    if (!idLocalNum) return;
    try {
      setLoading(true);
      setErr(null);
      const qs = new URLSearchParams({ tipoLocal: viagemFiltro.tipoLocal, idLocal: String(idLocalNum) });
      if (viagemFiltro.competencia) qs.set("competencia", viagemFiltro.competencia);
      const res = await fetch(`/api/v1/engenharia/ativos/viagens?${qs.toString()}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || "Erro ao carregar viagens");
      setViagemRows(Array.isArray(json) ? json : []);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar viagens");
      setViagemRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function registrarViagem() {
    const idLocalNum = Number(viagemFiltro.idLocal || 0);
    if (!idLocalNum) return;
    try {
      setErr(null);
      const payload: any = {
        tipoLocal: viagemFiltro.tipoLocal,
        idLocal: idLocalNum,
        idAtivo: Number(viagemNovo.idAtivo || 0),
        dataReferencia: viagemNovo.dataReferencia,
        codigoServico: viagemNovo.codigoServico,
        origem: viagemNovo.origem || null,
        destino: viagemNovo.destino || null,
        tipoCarga: viagemNovo.tipoCarga || null,
        km: viagemNovo.km ? Number(viagemNovo.km.replace(",", ".")) : null,
        observacao: viagemNovo.observacao || null,
      };
      const res = await fetch("/api/v1/engenharia/ativos/viagens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || "Erro ao registrar viagem");
      await carregarViagens();
      setViagemNovo({ idAtivo: "", dataReferencia: new Date().toISOString().slice(0, 10), codigoServico: "", origem: "", destino: "", tipoCarga: "", km: "", observacao: "" });
    } catch (e: any) {
      setErr(e?.message || "Erro ao registrar viagem");
    }
  }

  async function carregarCalendario() {
    const idAtivoNum = Number(calFiltro.idAtivo || 0);
    const idLocalNum = Number(calFiltro.idLocal || 0);
    if (!idAtivoNum || !idLocalNum || !calFiltro.competencia) return;
    try {
      setLoading(true);
      setErr(null);
      const qs = new URLSearchParams({
        idAtivo: String(idAtivoNum),
        competencia: calFiltro.competencia,
        tipoLocal: calFiltro.tipoLocal,
        idLocal: String(idLocalNum),
      });
      const res = await fetch(`/api/v1/engenharia/ativos/calendario?${qs.toString()}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || "Erro ao carregar calendário");
      setCalData(json as any);
      setCalText(JSON.stringify((json as any)?.planejamento ?? {}, null, 2));
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar calendário");
      setCalData(null);
      setCalText("");
    } finally {
      setLoading(false);
    }
  }

  async function salvarCalendario() {
    const idAtivoNum = Number(calFiltro.idAtivo || 0);
    const idLocalNum = Number(calFiltro.idLocal || 0);
    if (!idAtivoNum || !idLocalNum || !calFiltro.competencia) return;
    try {
      setErr(null);
      const planejamento = JSON.parse(calText || "{}");
      const payload: any = { idAtivo: idAtivoNum, competencia: calFiltro.competencia, tipoLocal: calFiltro.tipoLocal, idLocal: idLocalNum, planejamento };
      const res = await fetch("/api/v1/engenharia/ativos/calendario", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || "Erro ao salvar calendário");
      await carregarCalendario();
    } catch (e: any) {
      setErr(e?.message || "Erro ao salvar calendário");
    }
  }

  async function carregarDescartes() {
    try {
      setLoading(true);
      setErr(null);
      const qs = new URLSearchParams();
      if (descFiltro.status) qs.set("status", descFiltro.status);
      if (descFiltro.tipoLocal && descFiltro.idLocal) {
        qs.set("tipoLocal", descFiltro.tipoLocal);
        qs.set("idLocal", String(Number(descFiltro.idLocal || 0)));
      }
      const res = await fetch(`/api/v1/engenharia/ativos/descartes?${qs.toString()}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || "Erro ao carregar descartes");
      setDescRows(Array.isArray(json) ? json : []);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar descartes");
      setDescRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function solicitarDescarte() {
    try {
      setErr(null);
      const payload: any = {
        idAtivo: Number(descNovo.idAtivo || 0),
        dataSolicitacao: descNovo.dataSolicitacao,
        motivo: descNovo.motivo,
        laudoUrl: descNovo.laudoUrl || null,
      };
      const res = await fetch("/api/v1/engenharia/ativos/descartes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || "Erro ao solicitar descarte");
      setDescNovo({ idAtivo: "", dataSolicitacao: new Date().toISOString().slice(0, 10), motivo: "", laudoUrl: "" });
      await carregarDescartes();
    } catch (e: any) {
      setErr(e?.message || "Erro ao solicitar descarte");
    }
  }

  async function aprovarDescarte(idDescarte: number) {
    try {
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/ativos/descartes/${idDescarte}/aprovar`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || "Erro ao aprovar descarte");
      await carregarDescartes();
    } catch (e: any) {
      setErr(e?.message || "Erro ao aprovar descarte");
    }
  }

  async function rejeitarDescarte(idDescarte: number) {
    try {
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/ativos/descartes/${idDescarte}/rejeitar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ motivoRejeicao: "Rejeitado" }) });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || "Erro ao rejeitar descarte");
      await carregarDescartes();
    } catch (e: any) {
      setErr(e?.message || "Erro ao rejeitar descarte");
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Controle de Equipamentos e Ferramentas</h1>
        <p className="text-sm text-slate-600">Cadastro e consulta por obra/unidade, com vínculo por código do serviço nas apropriações.</p>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <div className="md:col-span-2">
            <div className="text-sm text-slate-600">Busca</div>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Descrição, código interno, patrimônio" />
          </div>
          <div>
            <div className="text-sm text-slate-600">Categoria</div>
            <select className="input" value={categoria} onChange={(e) => setCategoria(e.target.value as any)}>
              <option value="">Todas</option>
              <option value="EQUIPAMENTO">Equipamento</option>
              <option value="FERRAMENTA">Ferramenta</option>
              <option value="VEICULO">Veículo</option>
            </select>
          </div>
          <div>
            <div className="text-sm text-slate-600">Status</div>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value as any)}>
              <option value="">Todos</option>
              <option value="ATIVO">Ativo</option>
              <option value="MANUTENCAO">Manutenção</option>
              <option value="INATIVO">Inativo</option>
              <option value="DESCARTADO">Descartado</option>
            </select>
          </div>
          <div>
            <div className="text-sm text-slate-600">Obra</div>
            <input className="input" value={idObra} onChange={(e) => setIdObra(e.target.value)} placeholder="ID Obra" />
          </div>
          <div>
            <div className="text-sm text-slate-600">Unidade</div>
            <input className="input" value={idUnidade} onChange={(e) => setIdUnidade(e.target.value)} placeholder="ID Unidade" />
          </div>
        </div>
        <div className="flex justify-end">
          <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" type="button" onClick={carregar} disabled={loading}>
            {loading ? "Carregando..." : "Atualizar"}
          </button>
        </div>
        {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <button className={`rounded-lg px-3 py-2 text-sm ${tab === "CADASTRO" ? "bg-blue-600 text-white" : "bg-white border"}`} type="button" onClick={() => setTab("CADASTRO")}>
          Cadastro
        </button>
        <button className={`rounded-lg px-3 py-2 text-sm ${tab === "CAUTELAS" ? "bg-blue-600 text-white" : "bg-white border"}`} type="button" onClick={() => setTab("CAUTELAS")}>
          Cautelas
        </button>
        <button className={`rounded-lg px-3 py-2 text-sm ${tab === "MOVIMENTACOES" ? "bg-blue-600 text-white" : "bg-white border"}`} type="button" onClick={() => setTab("MOVIMENTACOES")}>
          Movimentações
        </button>
        <button className={`rounded-lg px-3 py-2 text-sm ${tab === "HORAS" ? "bg-blue-600 text-white" : "bg-white border"}`} type="button" onClick={() => setTab("HORAS")}>
          Horas
        </button>
        <button className={`rounded-lg px-3 py-2 text-sm ${tab === "COMBUSTIVEL" ? "bg-blue-600 text-white" : "bg-white border"}`} type="button" onClick={() => setTab("COMBUSTIVEL")}>
          Combustível
        </button>
        <button className={`rounded-lg px-3 py-2 text-sm ${tab === "VIAGENS" ? "bg-blue-600 text-white" : "bg-white border"}`} type="button" onClick={() => setTab("VIAGENS")}>
          Viagens
        </button>
        <button className={`rounded-lg px-3 py-2 text-sm ${tab === "CALENDARIO" ? "bg-blue-600 text-white" : "bg-white border"}`} type="button" onClick={() => setTab("CALENDARIO")}>
          Calendário
        </button>
        <button className={`rounded-lg px-3 py-2 text-sm ${tab === "DESCARTES" ? "bg-blue-600 text-white" : "bg-white border"}`} type="button" onClick={() => setTab("DESCARTES")}>
          Descartes
        </button>
      </div>

      {tab === "CADASTRO" ? (
        <>
          <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
            <div className="text-lg font-semibold">Novo ativo</div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
              <div>
                <div className="text-sm text-slate-600">Categoria</div>
                <select className="input" value={novo.categoria} onChange={(e) => setNovo((p) => ({ ...p, categoria: e.target.value as any }))}>
                  <option value="EQUIPAMENTO">Equipamento</option>
                  <option value="FERRAMENTA">Ferramenta</option>
                  <option value="VEICULO">Veículo</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <div className="text-sm text-slate-600">Descrição</div>
                <input className="input" value={novo.descricao} onChange={(e) => setNovo((p) => ({ ...p, descricao: e.target.value }))} />
              </div>
              <div>
                <div className="text-sm text-slate-600">Código interno</div>
                <input className="input" value={novo.codigoInterno} onChange={(e) => setNovo((p) => ({ ...p, codigoInterno: e.target.value }))} />
              </div>
              <div>
                <div className="text-sm text-slate-600">Patrimônio</div>
                <input className="input" value={novo.patrimonio} onChange={(e) => setNovo((p) => ({ ...p, patrimonio: e.target.value }))} />
              </div>
              <div>
                <div className="text-sm text-slate-600">Proprietário</div>
                <select className="input" value={novo.proprietario} onChange={(e) => setNovo((p) => ({ ...p, proprietario: e.target.value as any }))}>
                  <option value="PROPRIO">Próprio</option>
                  <option value="TERCEIRO">Terceiro</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
              <div>
                <div className="text-sm text-slate-600">Status</div>
                <select className="input" value={novo.status} onChange={(e) => setNovo((p) => ({ ...p, status: e.target.value as any }))}>
                  <option value="ATIVO">Ativo</option>
                  <option value="MANUTENCAO">Manutenção</option>
                  <option value="INATIVO">Inativo</option>
                  <option value="DESCARTADO">Descartado</option>
                </select>
              </div>
              <div>
                <div className="text-sm text-slate-600">Local</div>
                <select className="input" value={novo.localTipo} onChange={(e) => setNovo((p) => ({ ...p, localTipo: e.target.value as any }))}>
                  <option value="">Sem vínculo</option>
                  <option value="OBRA">Obra</option>
                  <option value="UNIDADE">Unidade</option>
                </select>
              </div>
              <div>
                <div className="text-sm text-slate-600">ID Local</div>
                <input className="input" value={novo.localId} onChange={(e) => setNovo((p) => ({ ...p, localId: e.target.value }))} placeholder="Ex.: 12" />
              </div>
              <div>
                <div className="text-sm text-slate-600">ID Contraparte</div>
                <input className="input" value={novo.idContraparte} onChange={(e) => setNovo((p) => ({ ...p, idContraparte: e.target.value }))} placeholder="Opcional" />
              </div>
              <div>
                <div className="text-sm text-slate-600">ID Contrato (Locação/Serviço)</div>
                <input className="input" value={novo.idContratoLocacao} onChange={(e) => setNovo((p) => ({ ...p, idContratoLocacao: e.target.value }))} placeholder="Opcional" />
              </div>
              <div className="flex items-end justify-end">
                <button className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white" type="button" onClick={criar}>
                  Criar
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="text-lg font-semibold">Ativos</div>
            <div className="mt-3 overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-3 py-2">ID</th>
                    <th className="px-3 py-2">Categoria</th>
                    <th className="px-3 py-2">Descrição</th>
                    <th className="px-3 py-2">Código</th>
                    <th className="px-3 py-2">Patrimônio</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Local</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.idAtivo} className="border-t">
                      <td className="px-3 py-2">{r.idAtivo}</td>
                      <td className="px-3 py-2">{r.categoria}</td>
                      <td className="px-3 py-2">{r.descricao}</td>
                      <td className="px-3 py-2">{r.codigoInterno || "-"}</td>
                      <td className="px-3 py-2">{r.patrimonio || "-"}</td>
                      <td className="px-3 py-2">{r.status}</td>
                      <td className="px-3 py-2">{r.localTipo ? `${r.localTipo} #${r.localId}` : "-"}</td>
                    </tr>
                  ))}
                  {!rows.length ? (
                    <tr>
                      <td className="px-3 py-6 text-center text-slate-500" colSpan={7}>
                        Sem dados.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}

      {tab === "CAUTELAS" ? (
        <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
          <div className="text-lg font-semibold">Cautelas diárias (ativos)</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <div>
              <div className="text-sm text-slate-600">Tipo local</div>
              <select className="input" value={cautelaLocal.tipoLocal} onChange={(e) => setCautelaLocal((p) => ({ ...p, tipoLocal: e.target.value as any }))}>
                <option value="OBRA">Obra</option>
                <option value="UNIDADE">Unidade</option>
              </select>
            </div>
            <div>
              <div className="text-sm text-slate-600">ID Local</div>
              <input className="input" value={cautelaLocal.idLocal} onChange={(e) => setCautelaLocal((p) => ({ ...p, idLocal: e.target.value }))} />
            </div>
            <div>
              <div className="text-sm text-slate-600">Data</div>
              <input className="input" type="date" value={cautelaLocal.data} onChange={(e) => setCautelaLocal((p) => ({ ...p, data: e.target.value }))} />
            </div>
            <div className="flex items-end justify-end md:col-span-3">
              <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" type="button" onClick={abrirCautelaAtivos} disabled={loading}>
                {loading ? "Abrindo..." : cautelaHead ? "Reabrir/atualizar" : "Abrir cautela"}
              </button>
            </div>
          </div>

          {cautelaHead ? (
            <>
              <div className="rounded-lg border bg-slate-50 p-3 text-sm">
                Cautela #{cautelaHead.idCautela} • {cautelaHead.tipoLocal} #{cautelaHead.idLocal} • {cautelaHead.dataReferencia}
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
                <div>
                  <div className="text-sm text-slate-600">Ação</div>
                  <select className="input" value={cautelaItem.acao} onChange={(e) => setCautelaItem((p) => ({ ...p, acao: e.target.value as any }))}>
                    <option value="ENTREGA">Entrega</option>
                    <option value="DEVOLUCAO">Devolução</option>
                  </select>
                </div>
                <div>
                  <div className="text-sm text-slate-600">ID Ativo</div>
                  <input className="input" value={cautelaItem.idAtivo} onChange={(e) => setCautelaItem((p) => ({ ...p, idAtivo: e.target.value }))} />
                </div>
                <div>
                  <div className="text-sm text-slate-600">Qtd</div>
                  <input className="input" value={cautelaItem.quantidade} onChange={(e) => setCautelaItem((p) => ({ ...p, quantidade: e.target.value }))} />
                </div>
                <div>
                  <div className="text-sm text-slate-600">ID Funcionário</div>
                  <input className="input" value={cautelaItem.idFuncionarioDestinatario} onChange={(e) => setCautelaItem((p) => ({ ...p, idFuncionarioDestinatario: e.target.value }))} />
                </div>
                <div className="md:col-span-2">
                  <div className="text-sm text-slate-600">Serviço (SER-0001)</div>
                  <input className="input" value={cautelaItem.codigoServico} onChange={(e) => setCautelaItem((p) => ({ ...p, codigoServico: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
                <div className="md:col-span-5">
                  <div className="text-sm text-slate-600">Observação</div>
                  <input className="input" value={cautelaItem.observacao} onChange={(e) => setCautelaItem((p) => ({ ...p, observacao: e.target.value }))} />
                </div>
                <div className="flex items-end justify-end">
                  <button className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white" type="button" onClick={registrarItemCautelaAtivos}>
                    Registrar
                  </button>
                </div>
              </div>

              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left">
                    <tr>
                      <th className="px-3 py-2">Ação</th>
                      <th className="px-3 py-2">Ativo</th>
                      <th className="px-3 py-2">Qtd</th>
                      <th className="px-3 py-2">Funcionário</th>
                      <th className="px-3 py-2">Serviço</th>
                      <th className="px-3 py-2">Obs.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cautelaItens.map((i) => (
                      <tr key={i.idItem} className="border-t">
                        <td className="px-3 py-2">{i.acao}</td>
                        <td className="px-3 py-2">
                          #{i.idAtivo} - {i.ativoDescricao}
                        </td>
                        <td className="px-3 py-2">{Number(i.quantidade || 0).toFixed(2)}</td>
                        <td className="px-3 py-2">{i.idFuncionarioDestinatario ?? "-"}</td>
                        <td className="px-3 py-2">{i.codigoServico || "-"}</td>
                        <td className="px-3 py-2">{i.observacao || "-"}</td>
                      </tr>
                    ))}
                    {!cautelaItens.length ? (
                      <tr>
                        <td className="px-3 py-6 text-center text-slate-500" colSpan={6}>
                          Sem itens.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="text-sm text-slate-500">Abra uma cautela para registrar entregas/devoluções.</div>
          )}
        </div>
      ) : null}

      {tab === "MOVIMENTACOES" ? (
        <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
          <div className="text-lg font-semibold">Movimentações / Transferências</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <div className="md:col-span-2">
              <div className="text-sm text-slate-600">ID Ativo</div>
              <input className="input" value={idAtivoMov} onChange={(e) => setIdAtivoMov(e.target.value)} />
            </div>
            <div className="flex items-end justify-end md:col-span-4">
              <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" type="button" onClick={carregarMovimentacoes} disabled={loading}>
                {loading ? "Carregando..." : "Carregar"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <div>
              <div className="text-sm text-slate-600">Tipo</div>
              <select className="input" value={novoMov.tipo} onChange={(e) => setNovoMov((p) => ({ ...p, tipo: e.target.value as any }))}>
                <option value="TRANSFERENCIA">Transferência</option>
                <option value="LOCALIZACAO">Localização</option>
                <option value="ENTRADA">Entrada</option>
                <option value="SAIDA">Saída</option>
              </select>
            </div>
            <div>
              <div className="text-sm text-slate-600">Para tipo</div>
              <select className="input" value={novoMov.paraLocalTipo} onChange={(e) => setNovoMov((p) => ({ ...p, paraLocalTipo: e.target.value as any }))}>
                <option value="OBRA">Obra</option>
                <option value="UNIDADE">Unidade</option>
                <option value="ALMOXARIFADO">Almoxarifado</option>
                <option value="TERCEIRO">Terceiro</option>
              </select>
            </div>
            <div>
              <div className="text-sm text-slate-600">Para ID</div>
              <input className="input" value={novoMov.paraLocalId} onChange={(e) => setNovoMov((p) => ({ ...p, paraLocalId: e.target.value }))} />
            </div>
            <div>
              <div className="text-sm text-slate-600">Data</div>
              <input className="input" type="date" value={novoMov.dataReferencia} onChange={(e) => setNovoMov((p) => ({ ...p, dataReferencia: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <div className="text-sm text-slate-600">Observação</div>
              <input className="input" value={novoMov.observacao} onChange={(e) => setNovoMov((p) => ({ ...p, observacao: e.target.value }))} />
            </div>
          </div>
          <div className="flex justify-end">
            <button className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white" type="button" onClick={registrarMovimentacao}>
              Registrar
            </button>
          </div>

          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">De</th>
                  <th className="px-3 py-2">Para</th>
                  <th className="px-3 py-2">Obs.</th>
                </tr>
              </thead>
              <tbody>
                {movs.map((m) => (
                  <tr key={m.idMov} className="border-t">
                    <td className="px-3 py-2">{m.dataReferencia}</td>
                    <td className="px-3 py-2">{m.tipo}</td>
                    <td className="px-3 py-2">{m.deLocalTipo ? `${m.deLocalTipo} #${m.deLocalId}` : "-"}</td>
                    <td className="px-3 py-2">{m.paraLocalTipo ? `${m.paraLocalTipo} #${m.paraLocalId}` : "-"}</td>
                    <td className="px-3 py-2">{m.observacao || "-"}</td>
                  </tr>
                ))}
                {!movs.length ? (
                  <tr>
                    <td className="px-3 py-6 text-center text-slate-500" colSpan={5}>
                      Sem dados.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "HORAS" ? (
        <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
          <div className="text-lg font-semibold">Horas produtivas/improdutivas</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <div>
              <div className="text-sm text-slate-600">Tipo local</div>
              <select className="input" value={horasFiltro.tipoLocal} onChange={(e) => setHorasFiltro((p) => ({ ...p, tipoLocal: e.target.value as any }))}>
                <option value="OBRA">Obra</option>
                <option value="UNIDADE">Unidade</option>
              </select>
            </div>
            <div>
              <div className="text-sm text-slate-600">ID Local</div>
              <input className="input" value={horasFiltro.idLocal} onChange={(e) => setHorasFiltro((p) => ({ ...p, idLocal: e.target.value }))} />
            </div>
            <div>
              <div className="text-sm text-slate-600">Competência</div>
              <input className="input" value={horasFiltro.competencia} onChange={(e) => setHorasFiltro((p) => ({ ...p, competencia: e.target.value }))} placeholder="YYYY-MM" />
            </div>
            <div className="flex items-end justify-end md:col-span-3">
              <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" type="button" onClick={carregarHoras} disabled={loading}>
                {loading ? "Carregando..." : "Carregar"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <div>
              <div className="text-sm text-slate-600">ID Ativo</div>
              <input className="input" value={horasNovo.idAtivo} onChange={(e) => setHorasNovo((p) => ({ ...p, idAtivo: e.target.value }))} />
            </div>
            <div>
              <div className="text-sm text-slate-600">Data</div>
              <input className="input" type="date" value={horasNovo.dataReferencia} onChange={(e) => setHorasNovo((p) => ({ ...p, dataReferencia: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <div className="text-sm text-slate-600">Serviço (SER-0001)</div>
              <input className="input" value={horasNovo.codigoServico} onChange={(e) => setHorasNovo((p) => ({ ...p, codigoServico: e.target.value }))} />
            </div>
            <div>
              <div className="text-sm text-slate-600">Horas prod.</div>
              <input className="input" value={horasNovo.horasProdutivas} onChange={(e) => setHorasNovo((p) => ({ ...p, horasProdutivas: e.target.value }))} />
            </div>
            <div>
              <div className="text-sm text-slate-600">Horas improd.</div>
              <input className="input" value={horasNovo.horasImprodutivas} onChange={(e) => setHorasNovo((p) => ({ ...p, horasImprodutivas: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <div className="md:col-span-5">
              <div className="text-sm text-slate-600">Observação</div>
              <input className="input" value={horasNovo.observacao} onChange={(e) => setHorasNovo((p) => ({ ...p, observacao: e.target.value }))} />
            </div>
            <div className="flex items-end justify-end">
              <button className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white" type="button" onClick={registrarHoras}>
                Registrar
              </button>
            </div>
          </div>

          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Ativo</th>
                  <th className="px-3 py-2">Serviço</th>
                  <th className="px-3 py-2">Prod.</th>
                  <th className="px-3 py-2">Improd.</th>
                </tr>
              </thead>
              <tbody>
                {horasRows.map((h) => (
                  <tr key={h.idApontamento} className="border-t">
                    <td className="px-3 py-2">{h.dataReferencia}</td>
                    <td className="px-3 py-2">#{h.idAtivo}</td>
                    <td className="px-3 py-2">{h.codigoServico}</td>
                    <td className="px-3 py-2">{Number(h.horasProdutivas || 0).toFixed(2)}</td>
                    <td className="px-3 py-2">{Number(h.horasImprodutivas || 0).toFixed(2)}</td>
                  </tr>
                ))}
                {!horasRows.length ? (
                  <tr>
                    <td className="px-3 py-6 text-center text-slate-500" colSpan={5}>
                      Sem dados.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "COMBUSTIVEL" ? (
        <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
          <div className="text-lg font-semibold">Consumo de combustível</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <div>
              <div className="text-sm text-slate-600">Tipo local</div>
              <select className="input" value={combFiltro.tipoLocal} onChange={(e) => setCombFiltro((p) => ({ ...p, tipoLocal: e.target.value as any }))}>
                <option value="OBRA">Obra</option>
                <option value="UNIDADE">Unidade</option>
              </select>
            </div>
            <div>
              <div className="text-sm text-slate-600">ID Local</div>
              <input className="input" value={combFiltro.idLocal} onChange={(e) => setCombFiltro((p) => ({ ...p, idLocal: e.target.value }))} />
            </div>
            <div>
              <div className="text-sm text-slate-600">Competência</div>
              <input className="input" value={combFiltro.competencia} onChange={(e) => setCombFiltro((p) => ({ ...p, competencia: e.target.value }))} placeholder="YYYY-MM" />
            </div>
            <div className="flex items-end justify-end md:col-span-3">
              <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" type="button" onClick={carregarCombustivel} disabled={loading}>
                {loading ? "Carregando..." : "Carregar"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <div>
              <div className="text-sm text-slate-600">ID Ativo</div>
              <input className="input" value={combNovo.idAtivo} onChange={(e) => setCombNovo((p) => ({ ...p, idAtivo: e.target.value }))} />
            </div>
            <div>
              <div className="text-sm text-slate-600">Data</div>
              <input className="input" type="date" value={combNovo.dataReferencia} onChange={(e) => setCombNovo((p) => ({ ...p, dataReferencia: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <div className="text-sm text-slate-600">Serviço (SER-0001)</div>
              <input className="input" value={combNovo.codigoServico} onChange={(e) => setCombNovo((p) => ({ ...p, codigoServico: e.target.value }))} />
            </div>
            <div>
              <div className="text-sm text-slate-600">Litros</div>
              <input className="input" value={combNovo.litros} onChange={(e) => setCombNovo((p) => ({ ...p, litros: e.target.value }))} />
            </div>
            <div>
              <div className="text-sm text-slate-600">Valor total</div>
              <input className="input" value={combNovo.valorTotal} onChange={(e) => setCombNovo((p) => ({ ...p, valorTotal: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <div className="md:col-span-2">
              <div className="text-sm text-slate-600">Odômetro/Horímetro</div>
              <input className="input" value={combNovo.odometroHorimetro} onChange={(e) => setCombNovo((p) => ({ ...p, odometroHorimetro: e.target.value }))} />
            </div>
            <div className="md:col-span-3">
              <div className="text-sm text-slate-600">Observação</div>
              <input className="input" value={combNovo.observacao} onChange={(e) => setCombNovo((p) => ({ ...p, observacao: e.target.value }))} />
            </div>
            <div className="flex items-end justify-end">
              <button className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white" type="button" onClick={registrarCombustivel}>
                Registrar
              </button>
            </div>
          </div>

          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Ativo</th>
                  <th className="px-3 py-2">Serviço</th>
                  <th className="px-3 py-2">Litros</th>
                  <th className="px-3 py-2">Valor</th>
                </tr>
              </thead>
              <tbody>
                {combRows.map((c) => (
                  <tr key={c.idRegistro} className="border-t">
                    <td className="px-3 py-2">{c.dataReferencia}</td>
                    <td className="px-3 py-2">#{c.idAtivo}</td>
                    <td className="px-3 py-2">{c.codigoServico}</td>
                    <td className="px-3 py-2">{Number(c.litros || 0).toFixed(3)}</td>
                    <td className="px-3 py-2">{Number(c.valorTotal || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                  </tr>
                ))}
                {!combRows.length ? (
                  <tr>
                    <td className="px-3 py-6 text-center text-slate-500" colSpan={5}>
                      Sem dados.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "VIAGENS" ? (
        <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
          <div className="text-lg font-semibold">Viagens de caminhões</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <div>
              <div className="text-sm text-slate-600">Tipo local</div>
              <select className="input" value={viagemFiltro.tipoLocal} onChange={(e) => setViagemFiltro((p) => ({ ...p, tipoLocal: e.target.value as any }))}>
                <option value="OBRA">Obra</option>
                <option value="UNIDADE">Unidade</option>
              </select>
            </div>
            <div>
              <div className="text-sm text-slate-600">ID Local</div>
              <input className="input" value={viagemFiltro.idLocal} onChange={(e) => setViagemFiltro((p) => ({ ...p, idLocal: e.target.value }))} />
            </div>
            <div>
              <div className="text-sm text-slate-600">Competência</div>
              <input className="input" value={viagemFiltro.competencia} onChange={(e) => setViagemFiltro((p) => ({ ...p, competencia: e.target.value }))} placeholder="YYYY-MM" />
            </div>
            <div className="flex items-end justify-end md:col-span-3">
              <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" type="button" onClick={carregarViagens} disabled={loading}>
                {loading ? "Carregando..." : "Carregar"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <div>
              <div className="text-sm text-slate-600">ID Ativo</div>
              <input className="input" value={viagemNovo.idAtivo} onChange={(e) => setViagemNovo((p) => ({ ...p, idAtivo: e.target.value }))} />
            </div>
            <div>
              <div className="text-sm text-slate-600">Data</div>
              <input className="input" type="date" value={viagemNovo.dataReferencia} onChange={(e) => setViagemNovo((p) => ({ ...p, dataReferencia: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <div className="text-sm text-slate-600">Serviço (SER-0001)</div>
              <input className="input" value={viagemNovo.codigoServico} onChange={(e) => setViagemNovo((p) => ({ ...p, codigoServico: e.target.value }))} />
            </div>
            <div>
              <div className="text-sm text-slate-600">KM</div>
              <input className="input" value={viagemNovo.km} onChange={(e) => setViagemNovo((p) => ({ ...p, km: e.target.value }))} />
            </div>
            <div>
              <div className="text-sm text-slate-600">Tipo carga</div>
              <input className="input" value={viagemNovo.tipoCarga} onChange={(e) => setViagemNovo((p) => ({ ...p, tipoCarga: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <div className="md:col-span-2">
              <div className="text-sm text-slate-600">Origem</div>
              <input className="input" value={viagemNovo.origem} onChange={(e) => setViagemNovo((p) => ({ ...p, origem: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <div className="text-sm text-slate-600">Destino</div>
              <input className="input" value={viagemNovo.destino} onChange={(e) => setViagemNovo((p) => ({ ...p, destino: e.target.value }))} />
            </div>
            <div className="md:col-span-1">
              <div className="text-sm text-slate-600">Obs.</div>
              <input className="input" value={viagemNovo.observacao} onChange={(e) => setViagemNovo((p) => ({ ...p, observacao: e.target.value }))} />
            </div>
            <div className="flex items-end justify-end">
              <button className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white" type="button" onClick={registrarViagem}>
                Registrar
              </button>
            </div>
          </div>

          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Ativo</th>
                  <th className="px-3 py-2">Serviço</th>
                  <th className="px-3 py-2">Origem</th>
                  <th className="px-3 py-2">Destino</th>
                  <th className="px-3 py-2">KM</th>
                </tr>
              </thead>
              <tbody>
                {viagemRows.map((v) => (
                  <tr key={v.idViagem} className="border-t">
                    <td className="px-3 py-2">{v.dataReferencia}</td>
                    <td className="px-3 py-2">#{v.idAtivo}</td>
                    <td className="px-3 py-2">{v.codigoServico}</td>
                    <td className="px-3 py-2">{v.origem || "-"}</td>
                    <td className="px-3 py-2">{v.destino || "-"}</td>
                    <td className="px-3 py-2">{v.km == null ? "-" : Number(v.km).toFixed(1)}</td>
                  </tr>
                ))}
                {!viagemRows.length ? (
                  <tr>
                    <td className="px-3 py-6 text-center text-slate-500" colSpan={6}>
                      Sem dados.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "CALENDARIO" ? (
        <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
          <div className="text-lg font-semibold">Planejamento (calendário mensal)</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <div>
              <div className="text-sm text-slate-600">ID Ativo</div>
              <input className="input" value={calFiltro.idAtivo} onChange={(e) => setCalFiltro((p) => ({ ...p, idAtivo: e.target.value }))} />
            </div>
            <div>
              <div className="text-sm text-slate-600">Competência</div>
              <input className="input" value={calFiltro.competencia} onChange={(e) => setCalFiltro((p) => ({ ...p, competencia: e.target.value }))} placeholder="YYYY-MM" />
            </div>
            <div>
              <div className="text-sm text-slate-600">Tipo local</div>
              <select className="input" value={calFiltro.tipoLocal} onChange={(e) => setCalFiltro((p) => ({ ...p, tipoLocal: e.target.value as any }))}>
                <option value="OBRA">Obra</option>
                <option value="UNIDADE">Unidade</option>
              </select>
            </div>
            <div>
              <div className="text-sm text-slate-600">ID Local</div>
              <input className="input" value={calFiltro.idLocal} onChange={(e) => setCalFiltro((p) => ({ ...p, idLocal: e.target.value }))} />
            </div>
            <div className="flex items-end justify-end md:col-span-2">
              <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" type="button" onClick={carregarCalendario} disabled={loading}>
                {loading ? "Carregando..." : "Carregar"}
              </button>
            </div>
          </div>

          {calData ? (
            <>
              <div className="text-sm text-slate-600">Planejamento (JSON)</div>
              <textarea className="input" style={{ minHeight: 220 }} value={calText} onChange={(e) => setCalText(e.target.value)} />
              <div className="flex justify-end">
                <button className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white" type="button" onClick={salvarCalendario}>
                  Salvar
                </button>
              </div>
            </>
          ) : (
            <div className="text-sm text-slate-500">Carregue um ativo/local/competência para editar o planejamento.</div>
          )}
        </div>
      ) : null}

      {tab === "DESCARTES" ? (
        <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
          <div className="text-lg font-semibold">Laudos de descarte</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <div>
              <div className="text-sm text-slate-600">Status</div>
              <select className="input" value={descFiltro.status} onChange={(e) => setDescFiltro((p) => ({ ...p, status: e.target.value }))}>
                <option value="PENDENTE">Pendente</option>
                <option value="APROVADO">Aprovado</option>
                <option value="REJEITADO">Rejeitado</option>
              </select>
            </div>
            <div>
              <div className="text-sm text-slate-600">Tipo local</div>
              <select className="input" value={descFiltro.tipoLocal} onChange={(e) => setDescFiltro((p) => ({ ...p, tipoLocal: e.target.value as any }))}>
                <option value="">Todos</option>
                <option value="OBRA">Obra</option>
                <option value="UNIDADE">Unidade</option>
              </select>
            </div>
            <div>
              <div className="text-sm text-slate-600">ID Local</div>
              <input className="input" value={descFiltro.idLocal} onChange={(e) => setDescFiltro((p) => ({ ...p, idLocal: e.target.value }))} />
            </div>
            <div className="flex items-end justify-end md:col-span-3">
              <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" type="button" onClick={carregarDescartes} disabled={loading}>
                {loading ? "Carregando..." : "Carregar"}
              </button>
            </div>
          </div>

          <div className="rounded-lg border p-3 space-y-2">
            <div className="font-semibold">Solicitar descarte</div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
              <div>
                <div className="text-sm text-slate-600">ID Ativo</div>
                <input className="input" value={descNovo.idAtivo} onChange={(e) => setDescNovo((p) => ({ ...p, idAtivo: e.target.value }))} />
              </div>
              <div>
                <div className="text-sm text-slate-600">Data</div>
                <input className="input" type="date" value={descNovo.dataSolicitacao} onChange={(e) => setDescNovo((p) => ({ ...p, dataSolicitacao: e.target.value }))} />
              </div>
              <div className="md:col-span-2">
                <div className="text-sm text-slate-600">Motivo</div>
                <input className="input" value={descNovo.motivo} onChange={(e) => setDescNovo((p) => ({ ...p, motivo: e.target.value }))} />
              </div>
              <div className="md:col-span-2">
                <div className="text-sm text-slate-600">URL do laudo (opcional)</div>
                <input className="input" value={descNovo.laudoUrl} onChange={(e) => setDescNovo((p) => ({ ...p, laudoUrl: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end">
              <button className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white" type="button" onClick={solicitarDescarte}>
                Solicitar
              </button>
            </div>
          </div>

          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Ativo</th>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Motivo</th>
                  <th className="px-3 py-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {descRows.map((d) => (
                  <tr key={d.idDescarte} className="border-t">
                    <td className="px-3 py-2">{d.idDescarte}</td>
                    <td className="px-3 py-2">
                      #{d.idAtivo} - {d.ativoDescricao}
                    </td>
                    <td className="px-3 py-2">{d.dataSolicitacao}</td>
                    <td className="px-3 py-2">{d.status}</td>
                    <td className="px-3 py-2">{d.motivo}</td>
                    <td className="px-3 py-2">
                      {d.status === "PENDENTE" ? (
                        <div className="flex gap-2">
                          <button className="rounded-md bg-green-600 px-3 py-1 text-xs text-white" type="button" onClick={() => aprovarDescarte(d.idDescarte)}>
                            Aprovar
                          </button>
                          <button className="rounded-md bg-red-600 px-3 py-1 text-xs text-white" type="button" onClick={() => rejeitarDescarte(d.idDescarte)}>
                            Rejeitar
                          </button>
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
                {!descRows.length ? (
                  <tr>
                    <td className="px-3 py-6 text-center text-slate-500" colSpan={6}>
                      Sem dados.
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
