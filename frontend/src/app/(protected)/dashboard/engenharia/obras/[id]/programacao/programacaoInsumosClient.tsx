"use client";

import { useEffect, useMemo, useState } from "react";

type Resumo = { idProgramacao: number; semanaInicio: string; semanaFim: string; status: string };
type Detalhe = {
  cabecalho: { idProgramacao: number; idObra: number; semanaInicio: string; semanaFim: string; status: string };
  itens: Array<{
    idItem: number;
    dataReferencia: string;
    codigoServico: string;
    itemDescricao: string;
    unidadeMedida: string | null;
    quantidadePrevista: number | null;
    origem: "ESTOQUE" | "COMPRA" | "TERCEIRO";
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

export default function ProgramacaoInsumosClient({ idObra }: { idObra: number }) {
  const [semanaBase, setSemanaBase] = useState(() => startOfWeekMonday(new Date().toISOString().slice(0, 10)));
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lista, setLista] = useState<Resumo[]>([]);
  const [idSelecionado, setIdSelecionado] = useState<number | null>(null);
  const [det, setDet] = useState<Detalhe | null>(null);

  const [novo, setNovo] = useState({
    dataReferencia: new Date().toISOString().slice(0, 10),
    codigoServico: "",
    itemDescricao: "",
    unidadeMedida: "",
    quantidadePrevista: "",
    origem: "ESTOQUE" as "ESTOQUE" | "COMPRA" | "TERCEIRO",
    observacao: "",
  });

  const semanaInicio = useMemo(() => startOfWeekMonday(semanaBase), [semanaBase]);

  async function carregarLista() {
    try {
      setLoading(true);
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/obras/programacao-semanal-insumos?idObra=${idObra}`, { cache: "no-store" });
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
      const res = await fetch(`/api/v1/engenharia/obras/programacao-semanal-insumos`, {
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
      const res = await fetch(`/api/v1/engenharia/obras/programacao-semanal-insumos/${idProgramacao}`, { cache: "no-store" });
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
      const res = await fetch(`/api/v1/engenharia/obras/programacao-semanal-insumos/${idSelecionado}`, {
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
    const codigoServico = novo.codigoServico.trim().toUpperCase();
    const itemDescricao = novo.itemDescricao.trim();
    if (!novo.dataReferencia || !codigoServico || !itemDescricao) return;
    const qtd = novo.quantidadePrevista ? Number(String(novo.quantidadePrevista).replace(",", ".")) : null;
    setDet((p) => {
      if (!p) return p;
      return {
        ...p,
        itens: [
          ...p.itens,
          {
            idItem: 0,
            dataReferencia: novo.dataReferencia,
            codigoServico,
            itemDescricao,
            unidadeMedida: novo.unidadeMedida || null,
            quantidadePrevista: qtd == null || !Number.isFinite(qtd) ? null : qtd,
            origem: novo.origem,
            observacao: novo.observacao || null,
          },
        ],
      };
    });
    setNovo((p) => ({ ...p, codigoServico: "", itemDescricao: "", quantidadePrevista: "", observacao: "" }));
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
              <div className="text-sm text-slate-600">Planejamento de consumo/necessidade de insumos por dia e por serviço.</div>
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
                <div className="md:col-span-2">
                  <div className="text-sm text-slate-600">Serviço (SER-0001)</div>
                  <input className="input" value={novo.codigoServico} onChange={(e) => setNovo((p) => ({ ...p, codigoServico: e.target.value }))} placeholder="SER-0001" />
                </div>
                <div className="md:col-span-3">
                  <div className="text-sm text-slate-600">Insumo</div>
                  <input className="input" value={novo.itemDescricao} onChange={(e) => setNovo((p) => ({ ...p, itemDescricao: e.target.value }))} placeholder="Ex.: brita 1" />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
                <div>
                  <div className="text-sm text-slate-600">Un.</div>
                  <input className="input" value={novo.unidadeMedida} onChange={(e) => setNovo((p) => ({ ...p, unidadeMedida: e.target.value }))} placeholder="m³" />
                </div>
                <div>
                  <div className="text-sm text-slate-600">Qtd prevista</div>
                  <input className="input" value={novo.quantidadePrevista} onChange={(e) => setNovo((p) => ({ ...p, quantidadePrevista: e.target.value }))} />
                </div>
                <div>
                  <div className="text-sm text-slate-600">Origem</div>
                  <select className="input" value={novo.origem} onChange={(e) => setNovo((p) => ({ ...p, origem: e.target.value as any }))}>
                    <option value="ESTOQUE">Estoque</option>
                    <option value="COMPRA">Compra</option>
                    <option value="TERCEIRO">Terceiro</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <div className="text-sm text-slate-600">Observação</div>
                  <input className="input" value={novo.observacao} onChange={(e) => setNovo((p) => ({ ...p, observacao: e.target.value }))} />
                </div>
                <div className="flex items-end justify-end">
                  <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" type="button" onClick={adicionar}>
                    Adicionar
                  </button>
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
                    <th className="px-3 py-2">Serviço</th>
                    <th className="px-3 py-2">Insumo</th>
                    <th className="px-3 py-2">Qtd</th>
                    <th className="px-3 py-2">Origem</th>
                  </tr>
                </thead>
                <tbody>
                  {det.itens.map((i, idx) => (
                    <tr key={`${i.idItem}-${idx}`} className="border-t">
                      <td className="px-3 py-2">{i.dataReferencia}</td>
                      <td className="px-3 py-2">{i.codigoServico}</td>
                      <td className="px-3 py-2">{i.itemDescricao}</td>
                      <td className="px-3 py-2">
                        {i.quantidadePrevista == null ? "-" : Number(i.quantidadePrevista).toFixed(3)} {i.unidadeMedida || ""}
                      </td>
                      <td className="px-3 py-2">{i.origem}</td>
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

