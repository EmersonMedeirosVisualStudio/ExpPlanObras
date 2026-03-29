"use client";

import { useEffect, useMemo, useState } from "react";

type CentroCustoOption = { codigo: string; descricao: string };
type Composicao = { codigo: string; codigoServico: string | null; descricao: string; unidade: string; bdi: number };
type ComposicaoItem = {
  idItem: number;
  etapa: string;
  tipoItem: string;
  codigoItem: string;
  quantidade: number | null;
  perdaPercentual: number;
  codigoCentroCusto: string | null;
};

export default function ComposicoesClient() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Composicao[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [selecionado, setSelecionado] = useState<string>("");
  const [det, setDet] = useState<{ composicao: Composicao | null; itens: ComposicaoItem[] }>({ composicao: null, itens: [] });
  const [centrosCusto, setCentrosCusto] = useState<CentroCustoOption[]>([]);

  const [novo, setNovo] = useState({ codigo: "", codigoServico: "", descricao: "", unidade: "", bdi: "" });
  const [novoItem, setNovoItem] = useState({ etapa: "", tipoItem: "MATERIAL", codigoItem: "", quantidade: "", perdaPercentual: "0", codigoCentroCusto: "" });

  const queryString = useMemo(() => {
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    const s = sp.toString();
    return s ? `?${s}` : "";
  }, [q]);

  async function carregar() {
    try {
      setLoading(true);
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/composicoes${queryString}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar composições");
      setRows(Array.isArray(json.data) ? json.data : []);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar composições");
      setRows([]);
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

  async function salvarComposicao() {
    try {
      setErr(null);
      const payload: any = {
        codigo: novo.codigo.trim().toUpperCase(),
        codigoServico: novo.codigoServico.trim().toUpperCase() || null,
        descricao: novo.descricao.trim(),
        unidade: novo.unidade.trim(),
        bdi: novo.bdi ? Number(String(novo.bdi).replace(",", ".")) : 0,
      };
      const res = await fetch(`/api/v1/engenharia/composicoes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao salvar composição");
      setNovo({ codigo: "", codigoServico: "", descricao: "", unidade: "", bdi: "" });
      await carregar();
    } catch (e: any) {
      setErr(e?.message || "Erro ao salvar composição");
    }
  }

  async function carregarItens(codigo: string) {
    try {
      setLoading(true);
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/composicoes/${encodeURIComponent(codigo)}/itens`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar itens da composição");
      setDet({ composicao: json.data?.composicao || null, itens: Array.isArray(json.data?.itens) ? json.data.itens : [] });
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar itens da composição");
      setDet({ composicao: null, itens: [] });
    } finally {
      setLoading(false);
    }
  }

  async function salvarItens() {
    if (!selecionado) return;
    try {
      setLoading(true);
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/composicoes/${encodeURIComponent(selecionado)}/itens`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens: det.itens }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao salvar itens");
      await carregarItens(selecionado);
    } catch (e: any) {
      setErr(e?.message || "Erro ao salvar itens");
    } finally {
      setLoading(false);
    }
  }

  function adicionarItem() {
    if (!selecionado) return;
    const etapa = novoItem.etapa.trim();
    const tipoItem = novoItem.tipoItem.trim().toUpperCase();
    const codigoItem = novoItem.codigoItem.trim().toUpperCase();
    const quantidade = novoItem.quantidade ? Number(String(novoItem.quantidade).replace(",", ".")) : NaN;
    const perda = novoItem.perdaPercentual ? Number(String(novoItem.perdaPercentual).replace(",", ".")) : 0;
    const cc = novoItem.codigoCentroCusto.trim().toUpperCase() || null;
    if (!tipoItem || !codigoItem || !Number.isFinite(quantidade)) return;
    setDet((p) => ({
      ...p,
      itens: [
        ...p.itens,
        { idItem: 0, etapa, tipoItem, codigoItem, quantidade, perdaPercentual: Number.isFinite(perda) ? perda : 0, codigoCentroCusto: cc },
      ],
    }));
    setNovoItem({ etapa: "", tipoItem: "MATERIAL", codigoItem: "", quantidade: "", perdaPercentual: "0", codigoCentroCusto: "" });
  }

  useEffect(() => {
    carregar();
    carregarCentrosCusto();
  }, []);

  useEffect(() => {
    if (!selecionado) return;
    carregarItens(selecionado);
  }, [selecionado]);

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Composições (base corporativa)</h1>
          <div className="text-sm text-slate-600">Centro de custo nasce no nível do insumo (etapa + insumo + CC). Obras podem ajustar sem alterar esta base.</div>
        </div>
        <button className="rounded-lg border px-4 py-2 text-sm" type="button" onClick={carregar} disabled={loading}>
          Atualizar
        </button>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="text-lg font-semibold">Nova composição</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <div>
            <div className="text-sm text-slate-600">Código</div>
            <input className="input" value={novo.codigo} onChange={(e) => setNovo((p) => ({ ...p, codigo: e.target.value }))} placeholder="COMP-0001" />
          </div>
          <div>
            <div className="text-sm text-slate-600">Serviço</div>
            <input className="input" value={novo.codigoServico} onChange={(e) => setNovo((p) => ({ ...p, codigoServico: e.target.value }))} placeholder="SER-0001" />
          </div>
          <div className="md:col-span-2">
            <div className="text-sm text-slate-600">Descrição</div>
            <input className="input" value={novo.descricao} onChange={(e) => setNovo((p) => ({ ...p, descricao: e.target.value }))} />
          </div>
          <div>
            <div className="text-sm text-slate-600">Un.</div>
            <input className="input" value={novo.unidade} onChange={(e) => setNovo((p) => ({ ...p, unidade: e.target.value }))} placeholder="m²" />
          </div>
          <div>
            <div className="text-sm text-slate-600">BDI</div>
            <input className="input" value={novo.bdi} onChange={(e) => setNovo((p) => ({ ...p, bdi: e.target.value }))} placeholder="0,00" />
          </div>
          <div className="flex items-end justify-end md:col-span-6">
            <button className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white" type="button" onClick={salvarComposicao}>
              Salvar
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-xl border bg-white p-4 shadow-sm lg:col-span-1 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-lg font-semibold">Lista</div>
            <input className="input w-full" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" />
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2">Código</th>
                  <th className="px-3 py-2">Serviço</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.codigo}
                    className={`border-t cursor-pointer ${selecionado === r.codigo ? "bg-blue-50" : "hover:bg-slate-50"}`}
                    onClick={() => setSelecionado(r.codigo)}
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.codigo}</div>
                      <div className="text-xs text-slate-500">{r.descricao}</div>
                    </td>
                    <td className="px-3 py-2">{r.codigoServico || "-"}</td>
                  </tr>
                ))}
                {!rows.length ? (
                  <tr>
                    <td colSpan={2} className="px-3 py-6 text-center text-slate-500">
                      Sem dados.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border bg-white p-4 shadow-sm lg:col-span-2 space-y-4">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <div className="text-lg font-semibold">Itens</div>
              <div className="text-sm text-slate-600">Defina centro de custo por insumo (pode repetir o mesmo insumo em etapas diferentes).</div>
            </div>
            <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" type="button" onClick={salvarItens} disabled={!selecionado || loading}>
              Salvar itens
            </button>
          </div>

          {!selecionado ? <div className="text-sm text-slate-500">Selecione uma composição.</div> : null}

          {selecionado ? (
            <div className="rounded-lg border p-3 space-y-3">
              <div className="font-semibold">Adicionar item</div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
                <div className="md:col-span-2">
                  <div className="text-sm text-slate-600">Etapa</div>
                  <input className="input" value={novoItem.etapa} onChange={(e) => setNovoItem((p) => ({ ...p, etapa: e.target.value }))} placeholder="Fabricação" />
                </div>
                <div>
                  <div className="text-sm text-slate-600">Tipo</div>
                  <select className="input" value={novoItem.tipoItem} onChange={(e) => setNovoItem((p) => ({ ...p, tipoItem: e.target.value }))}>
                    <option value="MATERIAL">Material</option>
                    <option value="MAO_OBRA">Mão de obra</option>
                    <option value="EQUIPAMENTO">Equipamento</option>
                    <option value="TERCEIRO">Terceiro</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <div className="text-sm text-slate-600">Código do insumo</div>
                  <input className="input" value={novoItem.codigoItem} onChange={(e) => setNovoItem((p) => ({ ...p, codigoItem: e.target.value }))} placeholder="INS-0001" />
                </div>
                <div>
                  <div className="text-sm text-slate-600">Qtd</div>
                  <input className="input" value={novoItem.quantidade} onChange={(e) => setNovoItem((p) => ({ ...p, quantidade: e.target.value }))} />
                </div>
                <div>
                  <div className="text-sm text-slate-600">Perda%</div>
                  <input className="input" value={novoItem.perdaPercentual} onChange={(e) => setNovoItem((p) => ({ ...p, perdaPercentual: e.target.value }))} />
                </div>
                <div className="md:col-span-3">
                  <div className="text-sm text-slate-600">Centro de custo</div>
                  <select className="input" value={novoItem.codigoCentroCusto} onChange={(e) => setNovoItem((p) => ({ ...p, codigoCentroCusto: e.target.value }))}>
                    <option value="">(sem CC)</option>
                    {centrosCusto.map((c) => (
                      <option key={c.codigo} value={c.codigo}>
                        {c.codigo} — {c.descricao}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end justify-end md:col-span-3">
                  <button className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white" type="button" onClick={adicionarItem}>
                    Adicionar
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {selecionado ? (
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-3 py-2">Etapa</th>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2">Insumo</th>
                    <th className="px-3 py-2">Qtd</th>
                    <th className="px-3 py-2">CC</th>
                  </tr>
                </thead>
                <tbody>
                  {det.itens.map((i, idx) => (
                    <tr key={`${i.idItem}-${idx}`} className="border-t">
                      <td className="px-3 py-2">{i.etapa || "-"}</td>
                      <td className="px-3 py-2">{i.tipoItem}</td>
                      <td className="px-3 py-2">{i.codigoItem}</td>
                      <td className="px-3 py-2">{i.quantidade == null ? "-" : Number(i.quantidade).toFixed(4)}</td>
                      <td className="px-3 py-2">{i.codigoCentroCusto || "-"}</td>
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

