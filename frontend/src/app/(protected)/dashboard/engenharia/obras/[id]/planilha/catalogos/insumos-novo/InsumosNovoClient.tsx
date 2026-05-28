"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CircleDashed, RefreshCw, Save, Search } from "lucide-react";
import { PageLoadStatusBadge } from "@/components/PageLoadStatus";

type VersaoRow = {
  idPlanilha: number;
  numeroVersao: number;
  nome: string;
  atual: boolean;
  travado: boolean;
};

type InsumoRow = {
  codigoItem: string;
  descricao: string;
  und: string;
  valorUnitario: number;
  quantidadeTotal: number;
  travado: boolean;
  travadoPorCadeia: boolean;
  origemTipo: string;
  origemChave: string;
};

export default function InsumosNovoClient() {
  const router = useRouter();
  const params = useParams();
  const sp = useSearchParams();

  const idObra = useMemo(() => Number((params as any)?.id || 0), [params]);
  const planilhaIdParam = sp.get("planilhaId");
  const returnToParam = sp.get("returnTo");
  const backHref = useMemo(() => {
    const raw = String(returnToParam || "").trim();
    const isExternal = raw.startsWith("//") || /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(raw) || /^[a-z][a-z0-9+.-]*:/i.test(raw);
    return raw && !isExternal ? raw : `/dashboard/engenharia/obras/${idObra}/planilha`;
  }, [idObra, returnToParam]);

  const [bootLoading, setBootLoading] = useState(false);
  const [bootDone, setBootDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [planilhaId, setPlanilhaId] = useState<number | null>(null);
  const [versoes, setVersoes] = useState<VersaoRow[]>([]);
  const effectivePlanilhaId = useMemo(() => {
    const n = Number(planilhaIdParam || 0);
    if (Number.isFinite(n) && n > 0) return n;
    return planilhaId;
  }, [planilhaId, planilhaIdParam]);

  const [q, setQ] = useState("");
  const [rows, setRows] = useState<InsumoRow[]>([]);

  async function authFetch(input: RequestInfo | URL, init?: RequestInit) {
    let token: string | null = null;
    try {
      token = localStorage.getItem("token");
    } catch {}
    const apiOrigin = String(process.env.NEXT_PUBLIC_API_URL || "").trim().replace(/\/$/, "");
    const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : String(input);
    const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : apiOrigin ? `${apiOrigin}${rawUrl.startsWith("/") ? "" : "/"}${rawUrl}` : rawUrl;
    return fetch(url, {
      ...init,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers || {}),
      },
      cache: "no-store",
    });
  }

  async function carregarVersoes() {
    if (!idObra) return;
    try {
      setBootLoading(true);
      setErr(null);
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha?view=versoes-info`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar versões");
      const vers = Array.isArray(json.data?.versoes) ? json.data.versoes : [];
      const mapped: VersaoRow[] = vers.map((v: any) => ({
        idPlanilha: Number(v.idPlanilha || 0),
        numeroVersao: Number(v.numeroVersao || 0),
        nome: String(v.nome || ""),
        atual: Boolean(v.atual),
        travado: Boolean(v.travado),
      }));
      setVersoes(mapped);
      const byQuery = effectivePlanilhaId ? mapped.find((v) => Number(v.idPlanilha) === Number(effectivePlanilhaId)) : null;
      const atual = mapped.find((v) => v.atual) || mapped[0] || null;
      const pick = byQuery || atual;
      setPlanilhaId(pick?.idPlanilha ? Number(pick.idPlanilha) : null);
      setBootDone(true);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar versões");
      setVersoes([]);
      setPlanilhaId(null);
    } finally {
      setBootLoading(false);
    }
  }

  async function carregar(pid: number) {
    try {
      setLoading(true);
      setErr(null);
      setOkMsg(null);
      const qs = new URLSearchParams();
      qs.set("planilhaId", String(pid));
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/insumos/consolidado?${qs.toString()}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar insumos");
      const list = Array.isArray(json.data?.rows) ? json.data.rows : [];
      const mapped: InsumoRow[] = list.map((r: any) => ({
        codigoItem: String(r.codigoItem || "").trim().toUpperCase(),
        descricao: String(r.descricao || ""),
        und: String(r.und || "").trim().toUpperCase(),
        valorUnitario: r.valorUnitario == null ? 0 : Number(r.valorUnitario),
        quantidadeTotal: r.quantidadeTotal == null ? 0 : Number(r.quantidadeTotal),
        travado: Boolean(r.travado),
        travadoPorCadeia: Boolean(r.travadoPorCadeia),
        origemTipo: String(r.origemTipo || ""),
        origemChave: String(r.origemChave || ""),
      }));
      setRows(mapped);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar insumos");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => `${r.codigoItem} ${r.descricao} ${r.und}`.toLowerCase().includes(s));
  }, [q, rows]);

  async function salvarPreco(codigoItem: string, valorUnitario: number) {
    const pid = effectivePlanilhaId;
    if (!pid) {
      setErr("Selecione uma versão da planilha.");
      return;
    }
    try {
      setSaving(true);
      setErr(null);
      setOkMsg(null);
      const qs = new URLSearchParams();
      qs.set("planilhaId", String(pid));
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/insumos/precos?${qs.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigoItem, valorUnitario }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao salvar preço");
      setOkMsg(`Preço salvo: ${codigoItem}`);
      await carregar(pid);
    } catch (e: any) {
      setErr(e?.message || "Erro ao salvar preço");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    carregarVersoes();
  }, [idObra]);

  useEffect(() => {
    if (!effectivePlanilhaId) return;
    carregar(effectivePlanilhaId);
  }, [effectivePlanilhaId]);

  return (
    <div className="p-6 space-y-6 text-slate-900">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <button
            type="button"
            className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            onClick={() => router.push(backHref)}
            title="Voltar"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <PageLoadStatusBadge loading={bootLoading || loading || saving} done={bootDone && !bootLoading && !loading && !saving} />
            <h1 className="text-2xl font-semibold text-slate-900">Insumos e preços (Novo)</h1>
            <p className="text-sm text-slate-600">Engenharia → Obras → Obra #{idObra} → Planilha → Catálogos → Insumos</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60 inline-flex items-center gap-2"
            disabled={!effectivePlanilhaId || loading || saving}
            onClick={() => effectivePlanilhaId && carregar(effectivePlanilhaId)}
            title="Recarregar"
          >
            <RefreshCw size={16} />
            Recarregar
          </button>
        </div>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}
      {okMsg ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{okMsg}</div> : null}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-12">
            <div className="text-xs text-slate-600 mb-1">Buscar insumo (código/descrição/UND)</div>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Digite para filtrar..." />
            </div>
          </div>
        </div>
        <div className="text-xs text-slate-600">
          Regra: preço do insumo é o preço da planilha atual; se não houver preço cadastrado, o valor considerado no cálculo é 0.
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b flex-wrap">
          <div className="text-sm text-slate-700">
            Mostrando: <span className="font-semibold">{filtered.length}</span> (total: <span className="font-semibold">{rows.length}</span>)
          </div>
          {saving ? (
            <div className="text-sm text-slate-600 inline-flex items-center gap-2">
              <CircleDashed size={16} className="animate-spin" /> Salvando...
            </div>
          ) : null}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-700">
              <tr>
                <th className="px-3 py-2">Código</th>
                <th className="px-3 py-2">Descrição</th>
                <th className="px-3 py-2">UND</th>
                <th className="px-3 py-2 text-right">Qtd total</th>
                <th className="px-3 py-2 text-right">Preço (planilha)</th>
                <th className="px-3 py-2 text-right">Salvar</th>
              </tr>
            </thead>
            <tbody>
              {!effectivePlanilhaId ? (
                <tr>
                  <td className="px-3 py-6 text-slate-600" colSpan={6}>
                    Selecione uma versão da planilha.
                  </td>
                </tr>
              ) : loading && !rows.length ? (
                <tr>
                  <td className="px-3 py-6 text-slate-600" colSpan={6}>
                    Carregando...
                  </td>
                </tr>
              ) : filtered.length ? (
                filtered.map((r) => (
                  <tr key={r.codigoItem} className="border-t hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium text-slate-900">{r.codigoItem}</td>
                    <td className="px-3 py-2">{r.descricao || "-"}</td>
                    <td className="px-3 py-2">{r.und || "-"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{Number(r.quantidadeTotal || 0).toLocaleString("pt-BR")}</td>
                    <td className="px-3 py-2 text-right">
                      <input
                        className="input h-9 w-32 text-right tabular-nums"
                        value={String(r.valorUnitario ?? 0)}
                        onChange={(e) => {
                          const v = Number(String(e.target.value || "").replace(",", "."));
                          setRows((cur) => cur.map((x) => (x.codigoItem === r.codigoItem ? { ...x, valorUnitario: Number.isFinite(v) ? v : x.valorUnitario } : x)));
                        }}
                        disabled={saving || r.travado || r.travadoPorCadeia}
                        title={r.travado || r.travadoPorCadeia ? "Preço travado: não é permitido alterar" : "Editar preço do insumo nesta planilha"}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-60 inline-flex items-center gap-2"
                        disabled={saving || r.travado || r.travadoPorCadeia}
                        onClick={() => salvarPreco(r.codigoItem, Number(r.valorUnitario || 0))}
                        title="Salvar preço"
                      >
                        <Save size={16} />
                        Salvar
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-3 py-6 text-center text-slate-500" colSpan={6}>
                    Nenhum insumo encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

