"use client";

import { useEffect, useMemo, useState } from "react";

type Item = {
  idItem: number;
  codigoServico: string;
  codigoComposicao: string | null;
  descricaoServico: string | null;
  unidadeMedida: string | null;
  quantidadeContratada: number | null;
  precoUnitario: number | null;
  valorTotal: number | null;
};

type ComposicaoItem = {
  idItemBase: number;
  etapa: string | null;
  tipoItem: string;
  codigoItem: string;
  quantidade: number | null;
  perdaPercentual: number;
  codigoCentroCusto: string | null;
  codigoCentroCustoBase: string | null;
};

type CentroCustoOption = { codigo: string; descricao: string };

export default function PlanilhaObraClient({ idObra }: { idObra: number }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [selecionado, setSelecionado] = useState<string>("");
  const [composicao, setComposicao] = useState<{ codigoComposicao: string | null; itens: ComposicaoItem[] }>({ codigoComposicao: null, itens: [] });
  const [centrosCusto, setCentrosCusto] = useState<CentroCustoOption[]>([]);

  const [novo, setNovo] = useState({
    codigoServico: "",
    descricaoServico: "",
    unidadeMedida: "",
    quantidadeContratada: "",
    precoUnitario: "",
  });

  async function carregarPlanilha() {
    try {
      setLoading(true);
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/obras/${idObra}/planilha`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar planilha");
      setItems(Array.isArray(json.data) ? json.data : []);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar planilha");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function criarOuAtualizarItem() {
    try {
      setLoading(true);
      setErr(null);
      const payload: any = {
        codigoServico: novo.codigoServico.trim().toUpperCase(),
        descricaoServico: novo.descricaoServico.trim() || null,
        unidadeMedida: novo.unidadeMedida.trim() || null,
        quantidadeContratada: novo.quantidadeContratada ? Number(String(novo.quantidadeContratada).replace(",", ".")) : null,
        precoUnitario: novo.precoUnitario ? Number(String(novo.precoUnitario).replace(",", ".")) : null,
      };
      const res = await fetch(`/api/v1/engenharia/obras/${idObra}/planilha`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao salvar item");
      setNovo({ codigoServico: "", descricaoServico: "", unidadeMedida: "", quantidadeContratada: "", precoUnitario: "" });
      await carregarPlanilha();
    } catch (e: any) {
      setErr(e?.message || "Erro ao salvar item");
    } finally {
      setLoading(false);
    }
  }

  async function carregarCentrosCusto() {
    try {
      const res = await fetch(`/api/v1/engenharia/centros-custo?ativo=1`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setCentrosCusto([]);
        return;
      }
      const lista = Array.isArray(json.data) ? json.data : [];
      setCentrosCusto(lista.map((c: any) => ({ codigo: String(c.codigo), descricao: String(c.descricao || "") })));
    } catch {
      setCentrosCusto([]);
    }
  }

  async function carregarComposicaoItens(codigoServico: string) {
    if (!codigoServico) {
      setComposicao({ codigoComposicao: null, itens: [] });
      return;
    }
    try {
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/obras/${idObra}/planilha/servicos/${encodeURIComponent(codigoServico)}/composicao-itens`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar composição do serviço");
      setComposicao({ codigoComposicao: json.data?.codigoComposicao || null, itens: Array.isArray(json.data?.itens) ? json.data.itens : [] });
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar composição do serviço");
      setComposicao({ codigoComposicao: null, itens: [] });
    }
  }

  async function salvarComposicaoItens() {
    if (!selecionado) return;
    try {
      setLoading(true);
      setErr(null);
      const updates = composicao.itens.map((i) => ({ idItemBase: i.idItemBase, codigoCentroCusto: i.codigoCentroCusto }));
      const res = await fetch(`/api/v1/engenharia/obras/${idObra}/planilha/servicos/${encodeURIComponent(selecionado)}/composicao-itens`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao salvar composição do serviço");
      await carregarComposicaoItens(selecionado);
    } catch (e: any) {
      setErr(e?.message || "Erro ao salvar composição do serviço");
    } finally {
      setLoading(false);
    }
  }

  const itensOrdenados = useMemo(() => [...items].sort((a, b) => a.codigoServico.localeCompare(b.codigoServico)), [items]);

  useEffect(() => {
    if (!idObra) return;
    carregarPlanilha();
    carregarCentrosCusto();
  }, [idObra]);

  useEffect(() => {
    if (!selecionado) return;
    carregarComposicaoItens(selecionado);
  }, [selecionado]);

  if (!idObra) return <div className="p-6 rounded-xl border bg-white">Obra inválida.</div>;

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Planilha contratada — Obra #{idObra}</h1>
          <div className="text-sm text-slate-600">Base oficial de serviços da obra. Programação semanal e apropriação usam apenas serviços cadastrados aqui.</div>
        </div>
        <button className="rounded-lg border px-4 py-2 text-sm" type="button" onClick={carregarPlanilha} disabled={loading}>
          Atualizar
        </button>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="text-lg font-semibold">Adicionar/atualizar serviço na planilha</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <div>
            <div className="text-sm text-slate-600">Serviço</div>
            <input className="input" value={novo.codigoServico} onChange={(e) => setNovo((p) => ({ ...p, codigoServico: e.target.value }))} placeholder="SER-0001" />
          </div>
          <div className="md:col-span-2">
            <div className="text-sm text-slate-600">Descrição</div>
            <input className="input" value={novo.descricaoServico} onChange={(e) => setNovo((p) => ({ ...p, descricaoServico: e.target.value }))} />
          </div>
          <div>
            <div className="text-sm text-slate-600">Un.</div>
            <input className="input" value={novo.unidadeMedida} onChange={(e) => setNovo((p) => ({ ...p, unidadeMedida: e.target.value }))} placeholder="m²" />
          </div>
          <div>
            <div className="text-sm text-slate-600">Qtd</div>
            <input className="input" value={novo.quantidadeContratada} onChange={(e) => setNovo((p) => ({ ...p, quantidadeContratada: e.target.value }))} />
          </div>
          <div>
            <div className="text-sm text-slate-600">Preço unit.</div>
            <input className="input" value={novo.precoUnitario} onChange={(e) => setNovo((p) => ({ ...p, precoUnitario: e.target.value }))} />
          </div>
          <div className="flex items-end justify-end">
            <button className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white" type="button" onClick={criarOuAtualizarItem} disabled={loading}>
              Salvar
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-xl border bg-white p-4 shadow-sm lg:col-span-1">
          <div className="text-lg font-semibold">Serviços da obra</div>
          <div className="mt-3 overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2">Serviço</th>
                  <th className="px-3 py-2">Un.</th>
                </tr>
              </thead>
              <tbody>
                {itensOrdenados.map((i) => (
                  <tr
                    key={i.codigoServico}
                    className={`border-t cursor-pointer ${selecionado === i.codigoServico ? "bg-blue-50" : "hover:bg-slate-50"}`}
                    onClick={() => setSelecionado(i.codigoServico)}
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium">{i.codigoServico}</div>
                      <div className="text-xs text-slate-500">{i.descricaoServico || "-"}</div>
                    </td>
                    <td className="px-3 py-2">{i.unidadeMedida || "-"}</td>
                  </tr>
                ))}
                {!itensOrdenados.length ? (
                  <tr>
                    <td colSpan={2} className="px-3 py-6 text-center text-slate-500">
                      Nenhum serviço cadastrado na planilha.
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
              <div className="text-lg font-semibold">Composição do serviço (CC por insumo)</div>
              <div className="text-sm text-slate-600">Centro de custo nasce em cada insumo da composição. A obra pode ajustar sem alterar a base corporativa.</div>
            </div>
            <div className="flex gap-2">
              <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" type="button" onClick={salvarComposicaoItens} disabled={!selecionado || loading}>
                Salvar composição
              </button>
            </div>
          </div>

          {!selecionado ? <div className="text-sm text-slate-500">Selecione um serviço.</div> : null}

          {selecionado ? (
            <div className="space-y-3">
              {composicao.codigoComposicao ? (
                <div className="text-sm text-slate-600">
                  Composição: <span className="font-medium">{composicao.codigoComposicao}</span>
                </div>
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">⚠️ Serviço sem composição vinculada na base corporativa.</div>
              )}

              {composicao.itens.some((i) => !i.codigoCentroCusto) ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">⚠️ Existem insumos sem centro de custo definido.</div>
              ) : null}

              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left">
                    <tr>
                      <th className="px-3 py-2">Etapa</th>
                      <th className="px-3 py-2">Tipo</th>
                      <th className="px-3 py-2">Insumo</th>
                      <th className="px-3 py-2">Qtd</th>
                      <th className="px-3 py-2">Perda%</th>
                      <th className="px-3 py-2">Centro de custo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {composicao.itens.map((i) => (
                      <tr key={i.idItemBase} className="border-t">
                        <td className="px-3 py-2">{i.etapa || "-"}</td>
                        <td className="px-3 py-2">{i.tipoItem}</td>
                        <td className="px-3 py-2">{i.codigoItem}</td>
                        <td className="px-3 py-2">{i.quantidade == null ? "-" : Number(i.quantidade).toFixed(4)}</td>
                        <td className="px-3 py-2">{Number(i.perdaPercentual || 0).toFixed(2)}</td>
                        <td className="px-3 py-2">
                          <select
                            className="input"
                            value={i.codigoCentroCusto || ""}
                            onChange={(e) => {
                              const v = e.target.value || null;
                              setComposicao((p) => ({
                                ...p,
                                itens: p.itens.map((x) => (x.idItemBase === i.idItemBase ? { ...x, codigoCentroCusto: v } : x)),
                              }));
                            }}
                          >
                            <option value="">(sem CC)</option>
                            {centrosCusto.map((c) => (
                              <option key={c.codigo} value={c.codigo}>
                                {c.codigo} — {c.descricao}
                              </option>
                            ))}
                          </select>
                          {i.codigoCentroCustoBase && i.codigoCentroCusto !== i.codigoCentroCustoBase ? (
                            <div className="mt-1 text-xs text-slate-500">Base: {i.codigoCentroCustoBase}</div>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                    {!composicao.itens.length ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                          Sem itens de composição.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
