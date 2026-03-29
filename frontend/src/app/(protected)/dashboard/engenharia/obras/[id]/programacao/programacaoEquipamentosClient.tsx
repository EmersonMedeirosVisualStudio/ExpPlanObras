"use client";

import { useEffect, useMemo, useState } from "react";

type Resumo = { idProgramacao: number; semanaInicio: string; semanaFim: string; status: string };
type Detalhe = {
  cabecalho: { idProgramacao: number; idObra: number; semanaInicio: string; semanaFim: string; status: string };
  itens: Array<{
    idItem: number;
    dataReferencia: string;
    idAtivo: number;
    codigoServico: string;
    horasPrevistas: number | null;
    frenteTrabalho: string | null;
    observacao: string | null;
  }>;
};

function startOfWeekMonday(dateIso: string) {
  const d = new Date(`${dateIso}T00:00:00`);
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}

export default function ProgramacaoEquipamentosClient({ idObra }: { idObra: number }) {
  const [semanaBase, setSemanaBase] = useState(() => startOfWeekMonday(new Date().toISOString().slice(0, 10)));
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lista, setLista] = useState<Resumo[]>([]);
  const [idSelecionado, setIdSelecionado] = useState<number | null>(null);
  const [det, setDet] = useState<Detalhe | null>(null);

  const [novo, setNovo] = useState({ dataReferencia: new Date().toISOString().slice(0, 10), idAtivo: "", codigoServico: "", horasPrevistas: "8", frenteTrabalho: "", observacao: "" });

  const semanaInicio = useMemo(() => startOfWeekMonday(semanaBase), [semanaBase]);

  async function carregarLista() {
    try {
      setLoading(true);
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/obras/programacao-semanal-equipamentos?idObra=${idObra}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar");
      setLista(Array.isArray(json.data) ? json.data : []);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar");
      setLista([]);
    } finally {
      setLoading(false);
    }
  }

  async function abrirOuCriar() {
    try {
      setLoading(true);
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/obras/programacao-semanal-equipamentos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idObra, semanaInicio }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao abrir/criar");
      const idProgramacao = Number(json.data?.idProgramacao || 0);
      if (!idProgramacao) throw new Error("Programação inválida");
      setIdSelecionado(idProgramacao);
      await carregarLista();
      await carregarDetalhe(idProgramacao);
    } catch (e: any) {
      setErr(e?.message || "Erro ao abrir/criar");
    } finally {
      setLoading(false);
    }
  }

  async function carregarDetalhe(idProgramacao: number) {
    try {
      setLoading(true);
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/obras/programacao-semanal-equipamentos/${idProgramacao}`, { cache: "no-store" });
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

  async function salvar() {
    if (!idSelecionado || !det) return;
    try {
      setLoading(true);
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/obras/programacao-semanal-equipamentos/${idSelecionado}`, {
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

  function adicionar() {
    if (!det) return;
    const idAtivo = Number(novo.idAtivo || 0);
    const codigoServico = novo.codigoServico.trim().toUpperCase();
    if (!novo.dataReferencia || !idAtivo || !codigoServico) return;
    const horas = novo.horasPrevistas ? Number(String(novo.horasPrevistas).replace(",", ".")) : null;
    setDet((p) => {
      if (!p) return p;
      return {
        ...p,
        itens: [
          ...p.itens,
          {
            idItem: 0,
            dataReferencia: novo.dataReferencia,
            idAtivo,
            codigoServico,
            horasPrevistas: horas == null || !Number.isFinite(horas) ? null : horas,
            frenteTrabalho: novo.frenteTrabalho || null,
            observacao: novo.observacao || null,
          },
        ],
      };
    });
    setNovo((p) => ({ ...p, idAtivo: "", codigoServico: "", observacao: "" }));
  }

  useEffect(() => {
    carregarLista();
  }, [idObra]);

  useEffect(() => {
    if (!idSelecionado) return;
    carregarDetalhe(idSelecionado);
  }, [idSelecionado]);

  return (
    <div className="space-y-6">
      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <div>
            <div className="text-sm text-slate-600">Semana (segunda)</div>
            <input className="input" type="date" value={semanaBase} onChange={(e) => setSemanaBase(e.target.value)} />
          </div>
          <div className="flex items-end justify-end md:col-span-5">
            <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" type="button" onClick={abrirOuCriar} disabled={loading}>
              Abrir/criar semana
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-xl border bg-white p-4 shadow-sm lg:col-span-1">
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold">Semanas</div>
            <button className="rounded-lg border px-3 py-1.5 text-sm" type="button" onClick={carregarLista} disabled={loading}>
              Atualizar
            </button>
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
                    <td className="px-3 py-2">{p.semanaInicio}</td>
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
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <div className="text-lg font-semibold">Itens</div>
              <div className="text-sm text-slate-600">Planejamento de uso por equipamento (por dia) vinculado ao serviço.</div>
            </div>
            <button className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white" type="button" onClick={salvar} disabled={loading || !det}>
              Salvar
            </button>
          </div>

          {det ? (
            <div className="rounded-lg border p-3 space-y-3">
              <div className="font-semibold">Adicionar item</div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
                <div>
                  <div className="text-sm text-slate-600">Data</div>
                  <input className="input" type="date" value={novo.dataReferencia} onChange={(e) => setNovo((p) => ({ ...p, dataReferencia: e.target.value }))} />
                </div>
                <div>
                  <div className="text-sm text-slate-600">ID Ativo</div>
                  <input className="input" value={novo.idAtivo} onChange={(e) => setNovo((p) => ({ ...p, idAtivo: e.target.value }))} placeholder="Ex.: 10" />
                </div>
                <div className="md:col-span-2">
                  <div className="text-sm text-slate-600">Serviço (SER-0001)</div>
                  <input className="input" value={novo.codigoServico} onChange={(e) => setNovo((p) => ({ ...p, codigoServico: e.target.value }))} placeholder="SER-0001" />
                </div>
                <div>
                  <div className="text-sm text-slate-600">Horas previstas</div>
                  <input className="input" value={novo.horasPrevistas} onChange={(e) => setNovo((p) => ({ ...p, horasPrevistas: e.target.value }))} />
                </div>
                <div className="flex items-end justify-end">
                  <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" type="button" onClick={adicionar}>
                    Adicionar
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
                <div className="md:col-span-3">
                  <div className="text-sm text-slate-600">Frente de trabalho</div>
                  <input className="input" value={novo.frenteTrabalho} onChange={(e) => setNovo((p) => ({ ...p, frenteTrabalho: e.target.value }))} placeholder="Opcional" />
                </div>
                <div className="md:col-span-3">
                  <div className="text-sm text-slate-600">Observação</div>
                  <input className="input" value={novo.observacao} onChange={(e) => setNovo((p) => ({ ...p, observacao: e.target.value }))} />
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-500">Selecione uma semana.</div>
          )}

          {det ? (
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-3 py-2">Data</th>
                    <th className="px-3 py-2">Ativo</th>
                    <th className="px-3 py-2">Serviço</th>
                    <th className="px-3 py-2">Horas</th>
                    <th className="px-3 py-2">Frente</th>
                  </tr>
                </thead>
                <tbody>
                  {det.itens.map((i, idx) => (
                    <tr key={`${i.idItem}-${idx}`} className="border-t">
                      <td className="px-3 py-2">{i.dataReferencia}</td>
                      <td className="px-3 py-2">#{i.idAtivo}</td>
                      <td className="px-3 py-2">{i.codigoServico}</td>
                      <td className="px-3 py-2">{i.horasPrevistas == null ? "-" : Number(i.horasPrevistas).toFixed(2)}</td>
                      <td className="px-3 py-2">{i.frenteTrabalho || "-"}</td>
                    </tr>
                  ))}
                  {!det.itens.length ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                        Sem itens.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

