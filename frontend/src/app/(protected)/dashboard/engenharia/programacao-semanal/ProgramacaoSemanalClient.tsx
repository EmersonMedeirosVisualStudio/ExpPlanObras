"use client";

import { useEffect, useMemo, useState } from "react";

type ProgramacaoResumo = {
  idProgramacao: number;
  idObra: number;
  semanaInicio: string;
  semanaFim: string;
  status: string;
  motivoRejeicao: string | null;
};

type ProgramacaoDetalhe = {
  cabecalho: {
    idProgramacao: number;
    idObra: number;
    semanaInicio: string;
    semanaFim: string;
    status: string;
    motivoRejeicao: string | null;
    aprovadoEm: string | null;
    idFuncionarioPlanejamento?: number | null;
    idFuncionarioApropriacao?: number | null;
  };
  itens: Array<{
    idItem: number;
    dataReferencia: string;
    idFuncionario: number;
    funcaoExercida: string | null;
    codigoServico: string;
    codigoCentroCusto?: string | null;
    horaInicioPrevista: string | null;
    horaFimPrevista: string | null;
    tipoDia: "UTIL" | "FIM_SEMANA" | "FERIADO";
    hePrevistaMinutos: number;
    bancoHorasComAnuencia: boolean;
    producaoMinPorHora: number | null;
    producaoPrevista: number | null;
    produtividadePrevistaPorHora?: number | null;
    produtividadeExecutadaPorHora?: number | null;
    proporcaoProdutividade?: number | null;
    notaProdutividadeAuto?: number | null;
    avaliacao?: null | {
      notaProdutividade: number | null;
      notaQualidade: number | null;
      notaEmpenho: number | null;
      notaFinal: number | null;
      observacao: string | null;
      produtividadePrevistaPorHora: number | null;
      produtividadeExecutadaPorHora: number | null;
      proporcaoProdutividade: number | null;
      atualizadoEm: string | null;
    };
    treinamentoApto?: boolean;
    observacao: string | null;
    execucao: null | { quantidade: number; unidadeMedida: string | null; horas: number; semApropriacao: boolean };
  }>;
  lotados: Array<{ idFuncionario: number; nome: string; funcao: string | null }>;
  faltandoProgramacao: Array<{ idFuncionario: number; nome: string; funcao: string | null }>;
  warnings: string[];
};

function startOfWeekMonday(dateIso: string) {
  const d = new Date(`${dateIso}T00:00:00`);
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}

function addDays(dateIso: string, days: number) {
  const d = new Date(`${dateIso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function minutesBetween(h1: string, h2: string) {
  const [aH, aM] = h1.split(":").map((x) => Number(x));
  const [bH, bM] = h2.split(":").map((x) => Number(x));
  if (!Number.isFinite(aH) || !Number.isFinite(aM) || !Number.isFinite(bH) || !Number.isFinite(bM)) return 0;
  return (bH * 60 + bM) - (aH * 60 + aM);
}

function formatFuncionarioRef(id: number | string, nome?: string | null) {
  if (nome && String(nome).trim()) return `#${id} - ${nome}`;
  return `#${id}`;
}

export default function ProgramacaoSemanalClient({ idObraFixed }: { idObraFixed?: number }) {
  const [idObra, setIdObra] = useState(() => (idObraFixed ? String(idObraFixed) : ""));
  const [gestorObra, setGestorObra] = useState({ idFuncionarioGestor: "", definidoEm: "" });
  const [semanaBase, setSemanaBase] = useState(() => startOfWeekMonday(new Date().toISOString().slice(0, 10)));
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [policy, setPolicy] = useState<{ permitirSemCentroCusto: boolean; exibirAlerta: boolean; bloquearSalvamento: boolean }>({
    permitirSemCentroCusto: false,
    exibirAlerta: true,
    bloquearSalvamento: false,
  });
  const [servicosPlanilha, setServicosPlanilha] = useState<Array<{ codigoServico: string; descricaoServico: string | null }>>([]);
  const [ccOptions, setCcOptions] = useState<string[]>([]);

  const [lista, setLista] = useState<ProgramacaoResumo[]>([]);
  const [idSelecionado, setIdSelecionado] = useState<number | null>(null);
  const [det, setDet] = useState<ProgramacaoDetalhe | null>(null);
  const [filtroItens, setFiltroItens] = useState({ data: "", idFuncionario: "", codigoServico: "", hora: "" });

  const [novoItem, setNovoItem] = useState({
    dataReferencia: new Date().toISOString().slice(0, 10),
    idFuncionario: "",
    funcaoExercida: "",
    codigoServico: "",
    codigoCentroCusto: "",
    horaInicioPrevista: "07:00",
    horaFimPrevista: "17:00",
    tipoDia: "UTIL" as "UTIL" | "FIM_SEMANA" | "FERIADO",
    hePrevistaMinutos: "0",
    bancoHorasComAnuencia: false,
    producaoMinPorHora: "",
    producaoPrevista: "",
    observacao: "",
  });

  const semanaInicio = useMemo(() => startOfWeekMonday(semanaBase), [semanaBase]);
  const semanaFim = useMemo(() => addDays(semanaInicio, 6), [semanaInicio]);

  useEffect(() => {
    if (!idObraFixed) return;
    setIdObra(String(idObraFixed));
  }, [idObraFixed]);

  const idObraNum = useMemo(() => Number(idObra || 0), [idObra]);
  const codigoServicoNorm = useMemo(() => novoItem.codigoServico.trim().toUpperCase(), [novoItem.codigoServico]);

  async function carregarPolicy() {
    try {
      const res = await fetch("/api/v1/engenharia/apropriacao/config", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) setPolicy(json.data);
    } catch {}
  }

  async function carregarServicosPlanilha() {
    if (!idObraNum) return;
    try {
      const res = await fetch(`/api/v1/engenharia/obras/${idObraNum}/planilha/servicos`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setServicosPlanilha([]);
        return;
      }
      setServicosPlanilha(Array.isArray(json.data) ? json.data : []);
    } catch {
      setServicosPlanilha([]);
    }
  }

  async function carregarCcsDoServico() {
    if (!idObraNum || !codigoServicoNorm) {
      setCcOptions([]);
      return;
    }
    try {
      const res = await fetch(`/api/v1/engenharia/obras/${idObraNum}/planilha/servicos/${encodeURIComponent(codigoServicoNorm)}/centros-custo`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setCcOptions([]);
        return;
      }
      const selecionados = Array.isArray(json.data?.selecionados) ? json.data.selecionados : [];
      setCcOptions(selecionados.map((r: any) => String(r.codigoCentroCusto)));
    } catch {
      setCcOptions([]);
    }
  }

  async function carregarGestor() {
    const obra = Number(idObra || 0);
    if (!obra) return;
    try {
      const res = await fetch(`/api/v1/engenharia/obras/gestor?idObra=${obra}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar gestor");
      if (!json.data) {
        setGestorObra({ idFuncionarioGestor: "", definidoEm: "" });
        return;
      }
      setGestorObra({ idFuncionarioGestor: String(json.data.idFuncionarioGestor || ""), definidoEm: String(json.data.definidoEm || "") });
    } catch {}
  }

  async function salvarGestor() {
    const obra = Number(idObra || 0);
    const idFuncionarioGestor = Number(gestorObra.idFuncionarioGestor || 0);
    if (!obra || !idFuncionarioGestor) return;
    try {
      setLoading(true);
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/obras/gestor`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idObra: obra, idFuncionarioGestor }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao salvar gestor");
      await carregarGestor();
    } catch (e: any) {
      setErr(e?.message || "Erro ao salvar gestor");
    } finally {
      setLoading(false);
    }
  }

  async function carregarLista() {
    const obra = Number(idObra || 0);
    if (!obra) return;
    try {
      setLoading(true);
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/obras/programacao-semanal?idObra=${obra}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar programações");
      setLista(Array.isArray(json.data) ? json.data : []);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar programações");
      setLista([]);
    } finally {
      setLoading(false);
    }
  }

  async function abrirOuCriar() {
    const obra = Number(idObra || 0);
    if (!obra) return;
    try {
      setLoading(true);
      setErr(null);
      const res = await fetch("/api/v1/engenharia/obras/programacao-semanal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idObra: obra, semanaInicio }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao criar/abrir programação");
      const idProgramacao = Number(json.data?.idProgramacao || 0);
      if (!idProgramacao) throw new Error("Programação inválida");
      setIdSelecionado(idProgramacao);
      await carregarLista();
      await carregarDetalhe(idProgramacao);
      setNovoItem((p) => ({ ...p, dataReferencia: semanaInicio }));
    } catch (e: any) {
      setErr(e?.message || "Erro ao criar/abrir programação");
    } finally {
      setLoading(false);
    }
  }

  async function carregarDetalhe(idProgramacao: number) {
    try {
      setLoading(true);
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/obras/programacao-semanal/${idProgramacao}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar detalhe");
      setDet(json.data);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar detalhe");
      setDet(null);
    } finally {
      setLoading(false);
    }
  }

  async function salvarItens() {
    if (!idSelecionado || !det) return;
    try {
      setLoading(true);
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/obras/programacao-semanal/${idSelecionado}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens: det.itens }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao salvar");
      await carregarDetalhe(idSelecionado);
    } catch (e: any) {
      setErr(e?.message || "Erro ao salvar");
    } finally {
      setLoading(false);
    }
  }

  async function acao(acao: "ENVIAR" | "APROVAR" | "REJEITAR" | "CANCELAR") {
    if (!idSelecionado) return;
    try {
      setLoading(true);
      setErr(null);
      const payload: any = { acao };
      if (acao === "REJEITAR") {
        const motivo = (prompt("Motivo da rejeição:") || "").trim();
        if (!motivo) return;
        payload.motivo = motivo;
      }
      const res = await fetch(`/api/v1/engenharia/obras/programacao-semanal/${idSelecionado}/acao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao executar ação");
      await carregarLista();
      await carregarDetalhe(idSelecionado);
    } catch (e: any) {
      setErr(e?.message || "Erro ao executar ação");
    } finally {
      setLoading(false);
    }
  }

  async function buscarMinPorHora() {
    const obra = Number(idObra || 0);
    if (!obra || !novoItem.codigoServico.trim()) return;
    try {
      setErr(null);
      const res = await fetch(
        `/api/v1/engenharia/obras/programacao-semanal/indicadores?idObra=${obra}&codigoServico=${encodeURIComponent(novoItem.codigoServico.trim())}&dias=90`,
        { cache: "no-store" }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao calcular indicador");
      const min = json.data?.producaoMinimaPorHora;
      if (min == null) {
        setNovoItem((p) => ({ ...p, producaoMinPorHora: "" }));
        return;
      }
      setNovoItem((p) => ({ ...p, producaoMinPorHora: String(min) }));
    } catch (e: any) {
      setErr(e?.message || "Erro ao calcular indicador");
    }
  }

  async function avaliarItem(i: ProgramacaoDetalhe["itens"][number]) {
    const obra = Number(idObra || 0);
    if (!obra) return;
    const notaQualidadeRaw = prompt("Nota qualidade (0–10):", i.avaliacao?.notaQualidade?.toString() || "");
    if (notaQualidadeRaw == null) return;
    const notaEmpenhoRaw = prompt("Nota empenho (0–10):", i.avaliacao?.notaEmpenho?.toString() || "");
    if (notaEmpenhoRaw == null) return;
    const obs = prompt("Observação/justificativa (obrigatório se nota < 6 ou produtividade muito baixa):", i.avaliacao?.observacao || "") || "";

    try {
      setLoading(true);
      setErr(null);
      const payload: any = {
        tipoLocal: "OBRA",
        idObra: obra,
        dataReferencia: i.dataReferencia,
        idFuncionario: i.idFuncionario,
        codigoServico: i.codigoServico,
        notaQualidade: Number(String(notaQualidadeRaw).trim().replace(",", ".")),
        notaEmpenho: Number(String(notaEmpenhoRaw).trim().replace(",", ".")),
        observacao: obs.trim() ? obs.trim() : null,
      };
      const res = await fetch("/api/v1/rh/apropriacao/avaliacoes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao salvar avaliação");
      if (idSelecionado) await carregarDetalhe(idSelecionado);
    } catch (e: any) {
      setErr(e?.message || "Erro ao salvar avaliação");
    } finally {
      setLoading(false);
    }
  }

  function calcularPrevista() {
    const min = Number(String(novoItem.producaoMinPorHora || "").replace(",", "."));
    if (!Number.isFinite(min) || min <= 0) return "";
    const ini = novoItem.horaInicioPrevista;
    const fim = novoItem.horaFimPrevista;
    if (!ini || !fim) return "";
    const mins = minutesBetween(ini, fim);
    if (mins <= 0) return "";
    const horas = mins / 60;
    return String(Number((horas * min).toFixed(4)));
  }

  function adicionarItem() {
    if (!det) return;
    const idFunc = Number(novoItem.idFuncionario || 0);
    const codigoCentroCusto = novoItem.codigoCentroCusto ? String(novoItem.codigoCentroCusto).trim().toUpperCase() : null;
    if (!idFunc || !novoItem.codigoServico.trim() || !novoItem.dataReferencia) return;

    const producaoPrevista = novoItem.producaoPrevista ? Number(String(novoItem.producaoPrevista).replace(",", ".")) : null;
    const producaoMinPorHora = novoItem.producaoMinPorHora ? Number(String(novoItem.producaoMinPorHora).replace(",", ".")) : null;

    setDet((p) => {
      if (!p) return p;
      return {
        ...p,
        itens: [
          ...p.itens,
          {
            idItem: 0,
            dataReferencia: novoItem.dataReferencia,
            idFuncionario: idFunc,
            funcaoExercida: novoItem.funcaoExercida || null,
            codigoServico: novoItem.codigoServico.trim().toUpperCase(),
            codigoCentroCusto: codigoCentroCusto || null,
            horaInicioPrevista: novoItem.horaInicioPrevista || null,
            horaFimPrevista: novoItem.horaFimPrevista || null,
            tipoDia: novoItem.tipoDia,
            hePrevistaMinutos: Number(novoItem.hePrevistaMinutos || 0) || 0,
            bancoHorasComAnuencia: !!novoItem.bancoHorasComAnuencia,
            producaoMinPorHora: producaoMinPorHora == null || !Number.isFinite(producaoMinPorHora) ? null : producaoMinPorHora,
            producaoPrevista: producaoPrevista == null || !Number.isFinite(producaoPrevista) ? null : producaoPrevista,
            observacao: novoItem.observacao || null,
            execucao: null,
          },
        ],
      };
    });

    setNovoItem((p) => ({ ...p, codigoServico: "", producaoPrevista: "", observacao: "" }));
  }

  useEffect(() => {
    if (!idObra) return;
    carregarLista();
    carregarGestor();
    carregarPolicy();
    carregarServicosPlanilha();
  }, [idObra]);

  useEffect(() => {
    carregarCcsDoServico();
    setNovoItem((p) => ({ ...p, codigoCentroCusto: "" }));
  }, [codigoServicoNorm, idObraNum]);

  useEffect(() => {
    if (!idSelecionado) return;
    carregarDetalhe(idSelecionado);
  }, [idSelecionado]);

  useEffect(() => {
    const v = calcularPrevista();
    if (v && !novoItem.producaoPrevista) setNovoItem((p) => ({ ...p, producaoPrevista: v }));
  }, [novoItem.producaoMinPorHora, novoItem.horaInicioPrevista, novoItem.horaFimPrevista]);

  const itensFiltrados = useMemo(() => {
    if (!det) return [];
    const data = filtroItens.data.trim();
    const idFunc = Number(filtroItens.idFuncionario || 0);
    const cod = filtroItens.codigoServico.trim().toUpperCase();
    const hora = filtroItens.hora.trim();
    return det.itens.filter((i) => {
      if (data && i.dataReferencia !== data) return false;
      if (idFunc && i.idFuncionario !== idFunc) return false;
      if (cod && i.codigoServico.toUpperCase() !== cod) return false;
      if (hora) {
        if (!i.horaInicioPrevista || !i.horaFimPrevista) return false;
        if (hora < i.horaInicioPrevista || hora > i.horaFimPrevista) return false;
      }
      return true;
    });
  }, [det, filtroItens]);

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Programação semanal da obra</h1>
          <div className="text-sm text-slate-600">Planejamento operacional integrado com serviço e apropriação (produção).</div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="rounded-lg border px-4 py-2 text-sm" type="button" onClick={carregarLista} disabled={loading}>
            Atualizar
          </button>
        </div>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <div>
            <div className="text-sm text-slate-600">Obra (id)</div>
            <input className="input" value={idObra} onChange={(e) => setIdObra(e.target.value)} placeholder="Ex.: 12" disabled={!!idObraFixed} />
          </div>
          <div>
            <div className="text-sm text-slate-600">Gestor da obra (id funcionário)</div>
            <input className="input" value={gestorObra.idFuncionarioGestor} onChange={(e) => setGestorObra((p) => ({ ...p, idFuncionarioGestor: e.target.value }))} placeholder="Ex.: 45" />
          </div>
          <div className="flex items-end">
            <button className="rounded-lg border px-4 py-2 text-sm" type="button" onClick={salvarGestor} disabled={loading || !Number(idObra) || !Number(gestorObra.idFuncionarioGestor)}>
              Definir gestor
            </button>
          </div>
          <div>
            <div className="text-sm text-slate-600">Semana (segunda)</div>
            <input className="input" type="date" value={semanaBase} onChange={(e) => setSemanaBase(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <div className="text-sm text-slate-600">Período</div>
            <div className="rounded-lg border bg-slate-50 px-3 py-2 text-sm">
              {semanaInicio} → {semanaFim}
            </div>
          </div>
          <div className="flex items-end justify-end md:col-span-1">
            <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" type="button" onClick={abrirOuCriar} disabled={loading || !Number(idObra)}>
              Abrir/criar semana
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-xl border bg-white p-4 shadow-sm lg:col-span-1">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Semanas</h2>
          </div>
          <div className="mt-3 overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2">Semana</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((p) => (
                  <tr
                    key={p.idProgramacao}
                    className={`border-t cursor-pointer ${idSelecionado === p.idProgramacao ? "bg-blue-50" : "hover:bg-slate-50"}`}
                    onClick={() => setIdSelecionado(p.idProgramacao)}
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium">{p.semanaInicio}</div>
                      <div className="text-xs text-slate-500">#{p.idProgramacao}</div>
                    </td>
                    <td className="px-3 py-2">{p.status}</td>
                  </tr>
                ))}
                {!lista.length ? (
                  <tr>
                    <td colSpan={2} className="px-3 py-6 text-center text-slate-500">
                      Sem programações.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border bg-white p-4 shadow-sm lg:col-span-2 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold">Detalhe</h2>
              {det ? (
                <div className="text-sm text-slate-600">
                  Semana {det.cabecalho.semanaInicio} → {det.cabecalho.semanaFim} • Status: <span className="font-medium">{det.cabecalho.status}</span>
                </div>
              ) : (
                <div className="text-sm text-slate-500">Selecione uma programação.</div>
              )}
              {det ? (
                <div className="mt-1 text-xs text-slate-500">
                  Definiu: {det.cabecalho.idFuncionarioPlanejamento ?? "-"} • Apropriou: {det.cabecalho.idFuncionarioApropriacao ?? "-"}
                </div>
              ) : null}
              {det?.cabecalho.motivoRejeicao ? <div className="mt-2 text-sm text-red-700">Rejeição: {det.cabecalho.motivoRejeicao}</div> : null}
            </div>
            {det ? (
              <div className="flex gap-2 flex-wrap">
                <button className="rounded-lg border px-3 py-2 text-sm" type="button" onClick={() => acao("ENVIAR")} disabled={loading}>
                  Enviar
                </button>
                <button className="rounded-lg border px-3 py-2 text-sm" type="button" onClick={() => acao("APROVAR")} disabled={loading}>
                  Aprovar
                </button>
                <button className="rounded-lg border px-3 py-2 text-sm" type="button" onClick={() => acao("REJEITAR")} disabled={loading}>
                  Rejeitar
                </button>
                <button className="rounded-lg border px-3 py-2 text-sm" type="button" onClick={() => acao("CANCELAR")} disabled={loading}>
                  Cancelar
                </button>
                <button className="rounded-lg bg-green-600 px-3 py-2 text-sm text-white" type="button" onClick={salvarItens} disabled={loading}>
                  Salvar
                </button>
              </div>
            ) : null}
          </div>

          {det?.warnings?.length ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{det.warnings.join(" ")}</div>
          ) : null}

          {det ? (
            <div className="rounded-lg border p-3 space-y-3">
              <div className="font-semibold">Adicionar item</div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
                <div>
                  <div className="text-sm text-slate-600">Data</div>
                  <input className="input" type="date" value={novoItem.dataReferencia} onChange={(e) => setNovoItem((p) => ({ ...p, dataReferencia: e.target.value }))} />
                </div>
                <div>
                  <div className="text-sm text-slate-600">Funcionário (id)</div>
                  <input className="input" value={novoItem.idFuncionario} onChange={(e) => setNovoItem((p) => ({ ...p, idFuncionario: e.target.value }))} placeholder="Ex.: 123" />
                </div>
                <div className="md:col-span-2">
                  <div className="text-sm text-slate-600">Função exercida</div>
                  <input className="input" value={novoItem.funcaoExercida} onChange={(e) => setNovoItem((p) => ({ ...p, funcaoExercida: e.target.value }))} placeholder="Ex.: Encarregado" />
                </div>
                <div className="md:col-span-2">
                  <div className="text-sm text-slate-600">Serviço (SER-0001)</div>
                  <div className="flex gap-2">
                    <select className="input" value={novoItem.codigoServico} onChange={(e) => setNovoItem((p) => ({ ...p, codigoServico: e.target.value }))}>
                      <option value="">Selecione</option>
                      {servicosPlanilha.map((s) => (
                        <option key={s.codigoServico} value={s.codigoServico}>
                          {s.codigoServico} {s.descricaoServico ? `— ${s.descricaoServico}` : ""}
                        </option>
                      ))}
                    </select>
                    <button className="rounded-lg border px-3 py-2 text-sm" type="button" onClick={buscarMinPorHora}>
                      Sugestão
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
                <div>
                  <div className="text-sm text-slate-600">Início previsto</div>
                  <input className="input" type="time" value={novoItem.horaInicioPrevista} onChange={(e) => setNovoItem((p) => ({ ...p, horaInicioPrevista: e.target.value }))} />
                </div>
                <div>
                  <div className="text-sm text-slate-600">Término previsto</div>
                  <input className="input" type="time" value={novoItem.horaFimPrevista} onChange={(e) => setNovoItem((p) => ({ ...p, horaFimPrevista: e.target.value }))} />
                </div>
                <div>
                  <div className="text-sm text-slate-600">Tipo dia</div>
                  <select className="input" value={novoItem.tipoDia} onChange={(e) => setNovoItem((p) => ({ ...p, tipoDia: e.target.value as any }))}>
                    <option value="UTIL">Útil</option>
                    <option value="FIM_SEMANA">Fim de semana</option>
                    <option value="FERIADO">Feriado</option>
                  </select>
                </div>
                <div>
                  <div className="text-sm text-slate-600">Centro de custo (código)</div>
                  <select
                    className="input"
                    value={novoItem.codigoCentroCusto}
                    onChange={(e) => setNovoItem((p) => ({ ...p, codigoCentroCusto: e.target.value }))}
                    disabled={!novoItem.codigoServico}
                  >
                    <option value="">{policy.permitirSemCentroCusto ? "(sem centro de custo)" : "Selecione"}</option>
                    {ccOptions.map((cc) => (
                      <option key={cc} value={cc}>
                        {cc}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="text-sm text-slate-600">HE prevista (min)</div>
                  <input className="input" value={novoItem.hePrevistaMinutos} onChange={(e) => setNovoItem((p) => ({ ...p, hePrevistaMinutos: e.target.value }))} />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={novoItem.bancoHorasComAnuencia} onChange={(e) => setNovoItem((p) => ({ ...p, bancoHorasComAnuencia: e.target.checked }))} />
                    Banco c/ anuência
                  </label>
                </div>
                <div className="flex items-end justify-end">
                  <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" type="button" onClick={adicionarItem}>
                    Adicionar
                  </button>
                </div>
              </div>

              {policy.exibirAlerta && novoItem.codigoServico && !ccOptions.length ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  ⚠️ Serviço sem centros de custo vinculados na planilha. Ajuste em “Planilha contratada” antes de iniciar a execução.
                </div>
              ) : null}
              {policy.exibirAlerta && novoItem.codigoServico && ccOptions.length && !novoItem.codigoCentroCusto ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">⚠️ Centro de custo não informado.</div>
              ) : null}

              <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
                <div className="md:col-span-2">
                  <div className="text-sm text-slate-600">Produção mínima/hora (auto)</div>
                  <input className="input" value={novoItem.producaoMinPorHora} onChange={(e) => setNovoItem((p) => ({ ...p, producaoMinPorHora: e.target.value }))} />
                </div>
                <div className="md:col-span-2">
                  <div className="text-sm text-slate-600">Produção prevista</div>
                  <input className="input" value={novoItem.producaoPrevista} onChange={(e) => setNovoItem((p) => ({ ...p, producaoPrevista: e.target.value }))} />
                </div>
                <div className="md:col-span-2">
                  <div className="text-sm text-slate-600">Observação</div>
                  <input className="input" value={novoItem.observacao} onChange={(e) => setNovoItem((p) => ({ ...p, observacao: e.target.value }))} />
                </div>
              </div>
            </div>
          ) : null}

          {det ? (
            <div className="overflow-auto">
              <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-6">
                <div>
                  <div className="text-sm text-slate-600">Filtro data</div>
                  <input className="input" type="date" value={filtroItens.data} onChange={(e) => setFiltroItens((p) => ({ ...p, data: e.target.value }))} />
                </div>
                <div>
                  <div className="text-sm text-slate-600">Filtro funcionário (id)</div>
                  <input className="input" value={filtroItens.idFuncionario} onChange={(e) => setFiltroItens((p) => ({ ...p, idFuncionario: e.target.value }))} />
                </div>
                <div>
                  <div className="text-sm text-slate-600">Filtro serviço</div>
                  <input className="input" value={filtroItens.codigoServico} onChange={(e) => setFiltroItens((p) => ({ ...p, codigoServico: e.target.value }))} placeholder="SER-0001" />
                </div>
                <div>
                  <div className="text-sm text-slate-600">Filtro hora</div>
                  <input className="input" type="time" value={filtroItens.hora} onChange={(e) => setFiltroItens((p) => ({ ...p, hora: e.target.value }))} />
                </div>
                <div className="flex items-end justify-end md:col-span-3">
                  <button className="rounded-lg border px-4 py-2 text-sm" type="button" onClick={() => setFiltroItens({ data: "", idFuncionario: "", codigoServico: "", hora: "" })}>
                    Limpar filtros
                  </button>
                </div>
              </div>

              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-3 py-2">Data</th>
                    <th className="px-3 py-2">Func</th>
                    <th className="px-3 py-2">Serviço</th>
                    <th className="px-3 py-2">CC</th>
                    <th className="px-3 py-2">Previsto</th>
                    <th className="px-3 py-2">Prev (prod)</th>
                    <th className="px-3 py-2">Executado</th>
                    <th className="px-3 py-2">Prod%</th>
                    <th className="px-3 py-2">Nota (auto)</th>
                    <th className="px-3 py-2">Qual</th>
                    <th className="px-3 py-2">Emp</th>
                    <th className="px-3 py-2">Final</th>
                    <th className="px-3 py-2">Trein.</th>
                    <th className="px-3 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {itensFiltrados.map((i, idx) => (
                    <tr key={`${i.idItem}-${idx}`} className="border-t">
                      <td className="px-3 py-2">{i.dataReferencia}</td>
                      <td className="px-3 py-2">{formatFuncionarioRef(i.idFuncionario)}</td>
                      <td className="px-3 py-2">{i.codigoServico}</td>
                      <td className="px-3 py-2">{i.codigoCentroCusto ?? "-"}</td>
                      <td className="px-3 py-2">{i.horaInicioPrevista && i.horaFimPrevista ? `${i.horaInicioPrevista}–${i.horaFimPrevista}` : "-"}</td>
                      <td className="px-3 py-2">{i.producaoPrevista == null ? "-" : Number(i.producaoPrevista).toFixed(2)}</td>
                      <td className="px-3 py-2">
                        {i.execucao ? (
                          <div className={i.execucao.semApropriacao ? "text-amber-700" : ""}>
                            {Number(i.execucao.quantidade || 0).toFixed(2)} {i.execucao.unidadeMedida || ""} ({i.execucao.horas}h)
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-3 py-2">{i.proporcaoProdutividade == null ? "-" : `${Math.round(Number(i.proporcaoProdutividade) * 100)}%`}</td>
                      <td className="px-3 py-2">{i.notaProdutividadeAuto == null ? "-" : Number(i.notaProdutividadeAuto).toFixed(0)}</td>
                      <td className="px-3 py-2">{i.avaliacao?.notaQualidade == null ? "-" : Number(i.avaliacao.notaQualidade).toFixed(1)}</td>
                      <td className="px-3 py-2">{i.avaliacao?.notaEmpenho == null ? "-" : Number(i.avaliacao.notaEmpenho).toFixed(1)}</td>
                      <td className="px-3 py-2">{i.avaliacao?.notaFinal == null ? "-" : Number(i.avaliacao.notaFinal).toFixed(2)}</td>
                      <td className="px-3 py-2">{i.treinamentoApto === false ? <span className="text-amber-700">PENDENTE</span> : "OK"}</td>
                      <td className="px-3 py-2 text-right">
                        <button className="rounded-lg border px-3 py-1.5 text-sm" type="button" onClick={() => avaliarItem(i)} disabled={loading}>
                          Avaliar
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!itensFiltrados.length ? (
                    <tr>
                      <td colSpan={14} className="px-3 py-6 text-center text-slate-500">
                        Sem itens.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}

          {det?.faltandoProgramacao?.length ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Trabalhadores lotados sem programação:{" "}
              {det.faltandoProgramacao.map((f) => formatFuncionarioRef(f.idFuncionario, f.nome)).slice(0, 10).join(", ")}
              {det.faltandoProgramacao.length > 10 ? "..." : ""}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
