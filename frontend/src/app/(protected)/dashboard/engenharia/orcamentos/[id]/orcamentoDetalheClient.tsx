"use client";

import { useEffect, useMemo, useState } from "react";

type Versao = { idVersao: number; numeroVersao: number; tituloVersao: string | null; status: string };
type OrcamentoDet = { idOrcamento: number; nome: string; tipo: string; dataBaseLabel: string | null; referenciaBase: string | null };
type Insumo = {
  codigo: string;
  descricao: string;
  unidade: string;
  custoBase: number;
  precoCompraMin: number | null;
  precoCompraMax: number | null;
  precoVendaMin: number | null;
  precoVendaMax: number | null;
  precoAtual: number;
};

export default function OrcamentoDetalheClient({ idOrcamento }: { idOrcamento: number }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [orc, setOrc] = useState<OrcamentoDet | null>(null);
  const [versoes, setVersoes] = useState<Versao[]>([]);
  const [idVersao, setIdVersao] = useState<number | null>(null);

  const [tab, setTab] = useState<"INSUMOS" | "IMPORTACAO">("INSUMOS");
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [q, setQ] = useState("");

  const [edit, setEdit] = useState<{ codigo: string; precoCompraMin: string; precoCompraMax: string; precoVendaMin: string; precoVendaMax: string; precoAtual: string } | null>(null);

  const [csvTipo, setCsvTipo] = useState<"INSUMOS" | "COMPOSICOES" | "SERVICOS">("INSUMOS");
  const [csvText, setCsvText] = useState("");

  const insumosFiltrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return insumos;
    return insumos.filter((i) => i.codigo.toLowerCase().includes(t) || i.descricao.toLowerCase().includes(t));
  }, [q, insumos]);

  async function carregar() {
    try {
      setLoading(true);
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/orcamentos/${idOrcamento}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar orçamento");
      setOrc(json.data.orcamento);
      setVersoes(Array.isArray(json.data.versoes) ? json.data.versoes : []);
      const v0 = Array.isArray(json.data.versoes) && json.data.versoes.length ? json.data.versoes[0] : null;
      setIdVersao(v0 ? Number(v0.idVersao) : null);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar orçamento");
    } finally {
      setLoading(false);
    }
  }

  async function carregarInsumos() {
    if (!idVersao) return;
    try {
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/orcamentos/${idOrcamento}/insumos?idVersao=${idVersao}&q=${encodeURIComponent(q.trim())}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar insumos");
      setInsumos(Array.isArray(json.data) ? json.data : []);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar insumos");
      setInsumos([]);
    }
  }

  async function copiarBase() {
    try {
      setBusy(true);
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/orcamentos/${idOrcamento}/copy-base`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao copiar base");
      await carregar();
      await carregarInsumos();
    } catch (e: any) {
      setErr(e?.message || "Erro ao copiar base");
    } finally {
      setBusy(false);
    }
  }

  async function salvarEdicao() {
    if (!edit || !idVersao) return;
    try {
      setBusy(true);
      setErr(null);
      const payload: any = {
        idVersao,
        codigo: edit.codigo,
        precoCompraMin: edit.precoCompraMin ? Number(String(edit.precoCompraMin).replace(",", ".")) : null,
        precoCompraMax: edit.precoCompraMax ? Number(String(edit.precoCompraMax).replace(",", ".")) : null,
        precoVendaMin: edit.precoVendaMin ? Number(String(edit.precoVendaMin).replace(",", ".")) : null,
        precoVendaMax: edit.precoVendaMax ? Number(String(edit.precoVendaMax).replace(",", ".")) : null,
        precoAtual: edit.precoAtual ? Number(String(edit.precoAtual).replace(",", ".")) : null,
      };
      const res = await fetch(`/api/v1/engenharia/orcamentos/${idOrcamento}/insumos`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao salvar");
      setEdit(null);
      await carregarInsumos();
    } catch (e: any) {
      setErr(e?.message || "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  }

  async function importar() {
    if (!idVersao) return;
    try {
      setBusy(true);
      setErr(null);
      const payload: any = { idVersao, tipo: csvTipo, csv: csvText };
      const res = await fetch(`/api/v1/engenharia/orcamentos/${idOrcamento}/import`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao importar");
      await carregarInsumos();
      setCsvText("");
    } catch (e: any) {
      setErr(e?.message || "Erro ao importar");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!idOrcamento) return;
    carregar();
  }, [idOrcamento]);

  useEffect(() => {
    if (!idVersao) return;
    carregarInsumos();
  }, [idVersao]);

  if (!idOrcamento) return <div className="p-6 rounded-xl border bg-white">Orçamento inválido.</div>;
  if (loading) return <div className="p-6 rounded-xl border bg-white">Carregando...</div>;

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Orçamento #{idOrcamento}</h1>
          <div className="text-sm text-slate-600">{orc ? `${orc.nome} • ${orc.tipo}` : ""}</div>
        </div>
        <div className="flex gap-2 items-center">
          <select className="input" value={idVersao || ""} onChange={(e) => setIdVersao(e.target.value ? Number(e.target.value) : null)}>
            {versoes.map((v) => (
              <option key={v.idVersao} value={v.idVersao}>
                v{v.numeroVersao} {v.status} {v.tituloVersao ? `— ${v.tituloVersao}` : ""}
              </option>
            ))}
          </select>
          <button className="rounded-lg border px-4 py-2 text-sm" type="button" onClick={copiarBase} disabled={busy}>
            Copiar base corporativa
          </button>
        </div>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      <div className="flex flex-wrap gap-2">
        <button className={`rounded-lg border px-4 py-2 text-sm ${tab === "INSUMOS" ? "bg-blue-50 border-blue-200" : ""}`} type="button" onClick={() => setTab("INSUMOS")}>
          Insumos
        </button>
        <button className={`rounded-lg border px-4 py-2 text-sm ${tab === "IMPORTACAO" ? "bg-blue-50 border-blue-200" : ""}`} type="button" onClick={() => setTab("IMPORTACAO")}>
          Importação CSV
        </button>
      </div>

      {tab === "IMPORTACAO" ? (
        <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
          <div className="text-lg font-semibold">Importar CSV (ordem obrigatória)</div>
          <div className="text-sm text-slate-600">1) INSUMOS → 2) COMPOSICOES → 3) SERVICOS</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <div className="md:col-span-2">
              <div className="text-sm text-slate-600">Tipo</div>
              <select className="input" value={csvTipo} onChange={(e) => setCsvTipo(e.target.value as any)}>
                <option value="INSUMOS">Insumos</option>
                <option value="COMPOSICOES">Composições (+ itens opcionais na mesma linha)</option>
                <option value="SERVICOS">Serviços</option>
              </select>
            </div>
            <div className="md:col-span-6">
              <div className="text-sm text-slate-600">CSV (cole aqui)</div>
              <textarea className="input" style={{ minHeight: 200 }} value={csvText} onChange={(e) => setCsvText(e.target.value)} />
            </div>
            <div className="md:col-span-6 flex justify-end">
              <button className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white" type="button" onClick={importar} disabled={busy || !csvText.trim()}>
                Importar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "INSUMOS" ? (
        <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-lg font-semibold">Insumos do orçamento</div>
            <div className="w-full md:w-96">
              <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por código ou descrição" />
            </div>
          </div>

          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2">Código</th>
                  <th className="px-3 py-2">Descrição</th>
                  <th className="px-3 py-2">Un.</th>
                  <th className="px-3 py-2">Base</th>
                  <th className="px-3 py-2">Atual</th>
                  <th className="px-3 py-2">Compra (min/max)</th>
                  <th className="px-3 py-2">Venda (min/max)</th>
                  <th className="px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {insumosFiltrados.map((r) => {
                  const abaixoMin = r.precoCompraMin != null && r.precoAtual < r.precoCompraMin;
                  return (
                    <tr key={r.codigo} className={`border-t ${abaixoMin ? "bg-amber-50" : ""}`}>
                      <td className="px-3 py-2 font-medium">{r.codigo}</td>
                      <td className="px-3 py-2">{r.descricao}</td>
                      <td className="px-3 py-2">{r.unidade}</td>
                      <td className="px-3 py-2">{Number(r.custoBase || 0).toFixed(2)}</td>
                      <td className="px-3 py-2">{Number(r.precoAtual || 0).toFixed(2)}</td>
                      <td className="px-3 py-2">
                        {r.precoCompraMin == null ? "-" : Number(r.precoCompraMin).toFixed(2)} / {r.precoCompraMax == null ? "-" : Number(r.precoCompraMax).toFixed(2)}
                      </td>
                      <td className="px-3 py-2">
                        {r.precoVendaMin == null ? "-" : Number(r.precoVendaMin).toFixed(2)} / {r.precoVendaMax == null ? "-" : Number(r.precoVendaMax).toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          className="rounded-lg border px-3 py-1 text-xs"
                          type="button"
                          onClick={() =>
                            setEdit({
                              codigo: r.codigo,
                              precoCompraMin: r.precoCompraMin == null ? "" : String(r.precoCompraMin),
                              precoCompraMax: r.precoCompraMax == null ? "" : String(r.precoCompraMax),
                              precoVendaMin: r.precoVendaMin == null ? "" : String(r.precoVendaMin),
                              precoVendaMax: r.precoVendaMax == null ? "" : String(r.precoVendaMax),
                              precoAtual: r.precoAtual == null ? "" : String(r.precoAtual),
                            })
                          }
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!insumosFiltrados.length ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                      Sem dados.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {edit ? (
        <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="text-lg font-semibold">Editar insumo {edit.codigo}</div>
            <div className="flex gap-2">
              <button className="rounded-lg border px-4 py-2 text-sm" type="button" onClick={() => setEdit(null)} disabled={busy}>
                Cancelar
              </button>
              <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" type="button" onClick={salvarEdicao} disabled={busy}>
                Salvar
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <div>
              <div className="text-sm text-slate-600">Preço atual</div>
              <input className="input" value={edit.precoAtual} onChange={(e) => setEdit((p) => (p ? { ...p, precoAtual: e.target.value } : p))} />
            </div>
            <div>
              <div className="text-sm text-slate-600">Compra min</div>
              <input className="input" value={edit.precoCompraMin} onChange={(e) => setEdit((p) => (p ? { ...p, precoCompraMin: e.target.value } : p))} />
            </div>
            <div>
              <div className="text-sm text-slate-600">Compra max</div>
              <input className="input" value={edit.precoCompraMax} onChange={(e) => setEdit((p) => (p ? { ...p, precoCompraMax: e.target.value } : p))} />
            </div>
            <div>
              <div className="text-sm text-slate-600">Venda min</div>
              <input className="input" value={edit.precoVendaMin} onChange={(e) => setEdit((p) => (p ? { ...p, precoVendaMin: e.target.value } : p))} />
            </div>
            <div>
              <div className="text-sm text-slate-600">Venda max</div>
              <input className="input" value={edit.precoVendaMax} onChange={(e) => setEdit((p) => (p ? { ...p, precoVendaMax: e.target.value } : p))} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

