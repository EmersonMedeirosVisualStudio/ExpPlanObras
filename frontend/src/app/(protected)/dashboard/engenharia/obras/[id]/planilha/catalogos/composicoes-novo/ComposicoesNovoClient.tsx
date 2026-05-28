"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CircleDashed, Layers, Plus, RefreshCw, Save, Search, Trash2 } from "lucide-react";
import { PageLoadStatusBadge } from "@/components/PageLoadStatus";

type VersaoRow = {
  idPlanilha: number;
  numeroVersao: number;
  nome: string;
  atual: boolean;
  travado: boolean;
};

type CatalogoRow = {
  codigoServico: string;
  fonte: string;
  servico: string;
  und: string;
  qtdItens: number;
};

type ComposicaoItemRow = {
  etapa: string;
  tipoItem: string;
  codigoItem: string;
  banco: string;
  descricao: string;
  und: string;
  quantidade: string;
  perdaPercentual: string;
  valorUnitario: string;
  codigoCentroCusto: string;
};

function parseNumberLoose(v: unknown) {
  const raw = String(v ?? "").trim();
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d,.\-]/g, "");
  if (!cleaned) return null;
  if (cleaned.includes(",") && cleaned.includes(".")) {
    if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
      const n = Number(cleaned.replace(/\./g, "").replace(",", "."));
      return Number.isFinite(n) ? n : null;
    }
    const n = Number(cleaned.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  if (cleaned.includes(",")) {
    const n = Number(cleaned.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export default function ComposicoesNovoClient() {
  const router = useRouter();
  const params = useParams();
  const sp = useSearchParams();

  const idObra = useMemo(() => Number((params as any)?.id || 0), [params]);
  const planilhaIdParam = sp.get("planilhaId");
  const codigoParam = sp.get("codigo");
  const returnToParam = sp.get("returnTo");
  const backHref = useMemo(() => {
    const raw = String(returnToParam || "").trim();
    const isExternal = raw.startsWith("//") || /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(raw) || /^[a-z][a-z0-9+.-]*:/i.test(raw);
    return raw && !isExternal ? raw : `/dashboard/engenharia/obras/${idObra}/planilha`;
  }, [idObra, returnToParam]);

  const [bootLoading, setBootLoading] = useState(false);
  const [bootDone, setBootDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [planilhaId, setPlanilhaId] = useState<number | null>(null);
  const [versoes, setVersoes] = useState<VersaoRow[]>([]);
  const effectivePlanilhaId = useMemo(() => {
    const n = Number(planilhaIdParam || 0);
    if (Number.isFinite(n) && n > 0) return n;
    return planilhaId;
  }, [planilhaId, planilhaIdParam]);

  const [catalogoLoading, setCatalogoLoading] = useState(false);
  const [catalogoQ, setCatalogoQ] = useState("");
  const [catalogoRows, setCatalogoRows] = useState<CatalogoRow[]>([]);
  const [catalogoOffset, setCatalogoOffset] = useState(0);
  const [catalogoTotal, setCatalogoTotal] = useState(0);
  const [catalogoHasMore, setCatalogoHasMore] = useState(false);

  const selectedCodigo = useMemo(() => String(codigoParam || "").trim().toUpperCase() || null, [codigoParam]);
  const [editorLoading, setEditorLoading] = useState(false);
  const [editorSaving, setEditorSaving] = useState(false);
  const [servicoMeta, setServicoMeta] = useState<{ fonte: string; descricao: string; und: string; travado: boolean; travadoPorCadeia: boolean } | null>(null);
  const [itens, setItens] = useState<ComposicaoItemRow[]>([]);
  const itensSavedRef = useRef<ComposicaoItemRow[]>([]);

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

  async function carregarCatalogo(pid: number, opts?: { offset?: number; append?: boolean }) {
    const offset = opts?.offset != null ? Number(opts.offset) : 0;
    const append = Boolean(opts?.append);
    try {
      setCatalogoLoading(true);
      setErr(null);
      const qs = new URLSearchParams();
      qs.set("mode", "CATALOGO");
      qs.set("planilhaId", String(pid));
      qs.set("limit", "50");
      qs.set("offset", String(offset));
      if (catalogoQ.trim()) qs.set("q", catalogoQ.trim());
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/composicoes/validacao?${qs.toString()}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar catálogo");
      const list = Array.isArray(json.data?.rows) ? (json.data.rows as any[]) : [];
      const mapped: CatalogoRow[] = list.map((r) => ({
        codigoServico: String(r.codigoServico || "").trim().toUpperCase(),
        fonte: String(r.fonte || "").trim().toUpperCase(),
        servico: String(r.servico || ""),
        und: String(r.und || "").trim().toUpperCase(),
        qtdItens: Number(r.qtdItens || 0),
      }));
      const total = Number(json.data?.total || 0);
      const nextOffset = json.data?.nextOffset != null ? Number(json.data.nextOffset) : offset + mapped.length;
      const hasMore = Boolean(json.data?.hasMore) || nextOffset < total;
      setCatalogoTotal(total);
      setCatalogoOffset(nextOffset);
      setCatalogoHasMore(hasMore);
      setCatalogoRows((prev) => (append ? [...prev, ...mapped] : mapped));
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar catálogo");
      setCatalogoRows([]);
      setCatalogoTotal(0);
      setCatalogoOffset(0);
      setCatalogoHasMore(false);
    } finally {
      setCatalogoLoading(false);
    }
  }

  function openEditor(codigoServico: string) {
    const pid = effectivePlanilhaId;
    if (!pid) {
      setErr("Selecione uma versão da planilha para editar composições.");
      return;
    }
    const qs = new URLSearchParams();
    qs.set("planilhaId", String(pid));
    qs.set("codigo", codigoServico);
    qs.set("returnTo", backHref);
    router.push(`/dashboard/engenharia/obras/${idObra}/planilha/catalogos/composicoes-novo?${qs.toString()}`);
  }

  async function carregarEditor(codigoServico: string, pid: number) {
    try {
      setEditorLoading(true);
      setErr(null);
      setOkMsg(null);
      const qs = new URLSearchParams();
      qs.set("planilhaId", String(pid));

      const [resMeta, resItens] = await Promise.all([
        authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/servicos/${encodeURIComponent(codigoServico)}/meta?${qs.toString()}`),
        authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/servicos/${encodeURIComponent(codigoServico)}/composicao-itens?${qs.toString()}`),
      ]);
      const jsonMeta = await resMeta.json().catch(() => null);
      const jsonItens = await resItens.json().catch(() => null);
      if (!resMeta.ok || !jsonMeta?.success) throw new Error(jsonMeta?.message || "Erro ao carregar serviço");
      if (!resItens.ok || !jsonItens?.success) throw new Error(jsonItens?.message || "Erro ao carregar composição");

      setServicoMeta({
        fonte: String(jsonMeta.data?.fonte || "").trim().toUpperCase(),
        descricao: String(jsonMeta.data?.descricao || "").trim(),
        und: String(jsonMeta.data?.und || "").trim().toUpperCase(),
        travado: Boolean(jsonMeta.data?.travado),
        travadoPorCadeia: Boolean(jsonMeta.data?.travadoPorCadeia),
      });

      const list = Array.isArray(jsonItens.data?.itens) ? jsonItens.data.itens : [];
      const mapped: ComposicaoItemRow[] = list.map((i: any) => ({
        etapa: String(i.etapa || ""),
        tipoItem: String(i.tipoItem || "INSUMO"),
        codigoItem: String(i.codigoItem || ""),
        banco: String(i.banco || ""),
        descricao: String(i.descricao || ""),
        und: String(i.und || ""),
        quantidade: i.quantidade == null ? "" : String(i.quantidade),
        perdaPercentual: i.perdaPercentual == null ? "" : String(i.perdaPercentual),
        valorUnitario: i.valorUnitario == null ? "" : String(i.valorUnitario),
        codigoCentroCusto: String(i.codigoCentroCusto || ""),
      }));
      setItens(mapped);
      itensSavedRef.current = mapped.map((r) => ({ ...r }));
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar editor");
      setServicoMeta(null);
      setItens([]);
      itensSavedRef.current = [];
    } finally {
      setEditorLoading(false);
    }
  }

  function addItem() {
    setItens((cur) => [
      ...cur,
      {
        etapa: "",
        tipoItem: "INSUMO",
        codigoItem: "",
        banco: "",
        descricao: "",
        und: "",
        quantidade: "",
        perdaPercentual: "0",
        valorUnitario: "",
        codigoCentroCusto: "",
      },
    ]);
  }

  function removeItem(idx: number) {
    setItens((cur) => cur.filter((_, i) => i !== idx));
  }

  async function salvarComposicao(codigoServico: string, pid: number) {
    if (!servicoMeta) {
      setErr("Serviço não carregado.");
      return;
    }
    const desc = String(servicoMeta.descricao || "").trim();
    const und = String(servicoMeta.und || "").trim().toUpperCase();
    if (!desc || !und) {
      setErr("Preencha Descrição e UND do serviço.");
      return;
    }
    if (servicoMeta.travado || servicoMeta.travadoPorCadeia) {
      setErr("Serviço travado: não é permitido salvar composição.");
      return;
    }
    try {
      setEditorSaving(true);
      setErr(null);
      setOkMsg(null);
      const servicoPayload = { descricao: desc, und, banco: String(servicoMeta.fonte || "").trim().toUpperCase() };
      const payload = itens
        .map((i) => ({
          etapa: i.etapa,
          tipoItem: i.tipoItem,
          codigoItem: i.codigoItem,
          banco: i.banco,
          descricao: i.descricao,
          und: i.und,
          quantidade: i.quantidade,
          valorUnitario: i.valorUnitario,
          perdaPercentual: i.perdaPercentual,
          codigoCentroCusto: i.codigoCentroCusto,
        }))
        .filter((i) => String(i.codigoItem || "").trim() && parseNumberLoose(i.quantidade) != null);

      const qs = new URLSearchParams();
      qs.set("planilhaId", String(pid));
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/servicos/${encodeURIComponent(codigoServico)}/composicao-itens?${qs.toString()}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens: payload, servico: servicoPayload }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao salvar composição");
      itensSavedRef.current = itens.map((r) => ({ ...r }));
      setOkMsg("Composição salva.");
      await carregarCatalogo(pid, { offset: 0, append: false });
    } catch (e: any) {
      setErr(e?.message || "Erro ao salvar composição");
    } finally {
      setEditorSaving(false);
    }
  }

  useEffect(() => {
    carregarVersoes();
  }, [idObra]);

  useEffect(() => {
    if (!effectivePlanilhaId) return;
    carregarCatalogo(effectivePlanilhaId, { offset: 0, append: false });
  }, [effectivePlanilhaId]);

  useEffect(() => {
    const pid = effectivePlanilhaId;
    if (!pid) return;
    if (!selectedCodigo) return;
    carregarEditor(selectedCodigo, pid);
  }, [selectedCodigo, effectivePlanilhaId]);

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
            <PageLoadStatusBadge loading={bootLoading || catalogoLoading || editorLoading || editorSaving} done={bootDone && !bootLoading && !catalogoLoading && !editorLoading && !editorSaving} />
            <h1 className="text-2xl font-semibold text-slate-900">Composições (Novo)</h1>
            <p className="text-sm text-slate-600">Engenharia → Obras → Obra #{idObra} → Planilha → Catálogos → Composições</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60 inline-flex items-center gap-2"
            disabled={!effectivePlanilhaId || catalogoLoading}
            onClick={() => effectivePlanilhaId && carregarCatalogo(effectivePlanilhaId, { offset: 0, append: false })}
            title="Recarregar lista"
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
          <div className="md:col-span-10">
            <div className="text-xs text-slate-600 mb-1">Buscar serviço (código ou descrição)</div>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="input pl-9" value={catalogoQ} onChange={(e) => setCatalogoQ(e.target.value)} placeholder="Digite para filtrar..." />
            </div>
          </div>
          <div className="md:col-span-2 flex items-end">
            <button
              type="button"
              className="w-full rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60 inline-flex items-center justify-center gap-2"
              disabled={!effectivePlanilhaId || catalogoLoading}
              onClick={() => effectivePlanilhaId && carregarCatalogo(effectivePlanilhaId, { offset: 0, append: false })}
              title="Aplicar filtros"
            >
              <Search size={16} />
              Aplicar
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b flex-wrap">
            <div className="text-sm text-slate-700">
              Total: <span className="font-semibold">{catalogoTotal}</span>
            </div>
            {catalogoHasMore ? (
              <button
                type="button"
                className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60 inline-flex items-center gap-2"
                disabled={!effectivePlanilhaId || catalogoLoading}
                onClick={() => effectivePlanilhaId && carregarCatalogo(effectivePlanilhaId, { offset: catalogoOffset, append: true })}
              >
                <CircleDashed size={16} />
                Mais
              </button>
            ) : null}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-700">
                <tr>
                  <th className="px-3 py-2">Código</th>
                  <th className="px-3 py-2">Serviço</th>
                  <th className="px-3 py-2 text-right">Itens</th>
                  <th className="px-3 py-2 text-right">Abrir</th>
                </tr>
              </thead>
              <tbody>
                {!effectivePlanilhaId ? (
                  <tr>
                    <td className="px-3 py-6 text-slate-600" colSpan={4}>
                      Selecione uma versão da planilha.
                    </td>
                  </tr>
                ) : catalogoLoading && !catalogoRows.length ? (
                  <tr>
                    <td className="px-3 py-6 text-slate-600" colSpan={4}>
                      Carregando...
                    </td>
                  </tr>
                ) : catalogoRows.length ? (
                  catalogoRows.map((r) => (
                    <tr key={r.codigoServico} className="border-t hover:bg-slate-50">
                      <td className="px-3 py-2 font-medium text-slate-900">{r.codigoServico}</td>
                      <td className="px-3 py-2">
                        <div className="text-slate-900">{r.servico || "-"}</div>
                        <div className="text-xs text-slate-500">
                          {r.fonte || "-"} • {r.und || "-"}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{Number(r.qtdItens || 0)}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          className="h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 inline-flex items-center justify-center"
                          onClick={() => openEditor(r.codigoServico)}
                          title="Editar composição"
                        >
                          <Layers size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-3 py-6 text-center text-slate-500" colSpan={4}>
                      Nenhum registro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm font-semibold">Editor</div>
            {selectedCodigo ? <div className="text-sm text-slate-700">{selectedCodigo}</div> : <div className="text-sm text-slate-500">Selecione um serviço</div>}
          </div>

          {selectedCodigo && servicoMeta ? (
            <div className="rounded-lg border bg-slate-50 p-3 space-y-2">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
                <div className="md:col-span-3">
                  <div className="text-xs text-slate-600 mb-1">Fonte</div>
                  <input className="input" value={servicoMeta.fonte} onChange={(e) => setServicoMeta((cur) => (cur ? { ...cur, fonte: e.target.value } : cur))} />
                </div>
                <div className="md:col-span-7">
                  <div className="text-xs text-slate-600 mb-1">Descrição</div>
                  <input className="input" value={servicoMeta.descricao} onChange={(e) => setServicoMeta((cur) => (cur ? { ...cur, descricao: e.target.value } : cur))} />
                </div>
                <div className="md:col-span-2">
                  <div className="text-xs text-slate-600 mb-1">UND</div>
                  <input className="input" value={servicoMeta.und} onChange={(e) => setServicoMeta((cur) => (cur ? { ...cur, und: e.target.value } : cur))} />
                </div>
              </div>
              <div className="text-xs text-slate-600">
                {servicoMeta.travado || servicoMeta.travadoPorCadeia ? (
                  <span className="text-amber-800">Serviço travado: edição de composição bloqueada.</span>
                ) : (
                  <span className="text-emerald-800">Serviço liberado para edição.</span>
                )}
              </div>
            </div>
          ) : selectedCodigo ? (
            <div className="text-sm text-slate-600">{editorLoading ? "Carregando editor..." : "Não foi possível carregar o serviço."}</div>
          ) : (
            <div className="text-sm text-slate-600">Abra um serviço na lista para editar a composição.</div>
          )}

          {selectedCodigo ? (
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <button type="button" className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 inline-flex items-center gap-2" onClick={addItem} disabled={editorSaving || editorLoading}>
                <Plus size={16} />
                Adicionar item
              </button>
              <button
                type="button"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-60 inline-flex items-center gap-2"
                disabled={editorSaving || editorLoading || !effectivePlanilhaId || !selectedCodigo}
                onClick={() => selectedCodigo && effectivePlanilhaId && salvarComposicao(selectedCodigo, effectivePlanilhaId)}
              >
                {editorSaving ? <CircleDashed size={16} className="animate-spin" /> : <Save size={16} />}
                Salvar composição
              </button>
            </div>
          ) : null}

          {selectedCodigo ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-700">
                  <tr>
                    <th className="px-2 py-2">Etapa</th>
                    <th className="px-2 py-2">Tipo</th>
                    <th className="px-2 py-2">Código</th>
                    <th className="px-2 py-2">Banco</th>
                    <th className="px-2 py-2">Descrição</th>
                    <th className="px-2 py-2">UND</th>
                    <th className="px-2 py-2 text-right">Qtd</th>
                    <th className="px-2 py-2 text-right">Perda%</th>
                    <th className="px-2 py-2 text-right">Vlr unit</th>
                    <th className="px-2 py-2">Centro custo</th>
                    <th className="px-2 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.length ? (
                    itens.map((r, idx) => (
                      <tr key={`${idx}-${r.codigoItem}`} className="border-t align-top">
                        <td className="px-2 py-2">
                          <input className="input h-9" value={r.etapa} onChange={(e) => setItens((cur) => cur.map((x, i) => (i === idx ? { ...x, etapa: e.target.value } : x)))} />
                        </td>
                        <td className="px-2 py-2">
                          <select className="input h-9" value={r.tipoItem} onChange={(e) => setItens((cur) => cur.map((x, i) => (i === idx ? { ...x, tipoItem: e.target.value } : x)))}>
                            <option value="INSUMO">Insumo</option>
                            <option value="MAO_DE_OBRA">Mão de obra</option>
                            <option value="MATERIAL">Material</option>
                            <option value="EQUIPAMENTO">Equipamento</option>
                            <option value="SERVICO">Serviço</option>
                            <option value="ESPECIAL">Especial</option>
                            <option value="COMPOSICAO">Composição</option>
                            <option value="COMPOSICAO_AUXILIAR">Composição auxiliar</option>
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <input className="input h-9" value={r.codigoItem} onChange={(e) => setItens((cur) => cur.map((x, i) => (i === idx ? { ...x, codigoItem: e.target.value } : x)))} />
                        </td>
                        <td className="px-2 py-2">
                          <input className="input h-9" value={r.banco} onChange={(e) => setItens((cur) => cur.map((x, i) => (i === idx ? { ...x, banco: e.target.value } : x)))} />
                        </td>
                        <td className="px-2 py-2">
                          <input className="input h-9 min-w-[280px]" value={r.descricao} onChange={(e) => setItens((cur) => cur.map((x, i) => (i === idx ? { ...x, descricao: e.target.value } : x)))} />
                        </td>
                        <td className="px-2 py-2">
                          <input className="input h-9 w-20" value={r.und} onChange={(e) => setItens((cur) => cur.map((x, i) => (i === idx ? { ...x, und: e.target.value } : x)))} />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <input className="input h-9 w-24 text-right tabular-nums" value={r.quantidade} onChange={(e) => setItens((cur) => cur.map((x, i) => (i === idx ? { ...x, quantidade: e.target.value } : x)))} />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <input className="input h-9 w-20 text-right tabular-nums" value={r.perdaPercentual} onChange={(e) => setItens((cur) => cur.map((x, i) => (i === idx ? { ...x, perdaPercentual: e.target.value } : x)))} />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <input className="input h-9 w-28 text-right tabular-nums" value={r.valorUnitario} onChange={(e) => setItens((cur) => cur.map((x, i) => (i === idx ? { ...x, valorUnitario: e.target.value } : x)))} />
                        </td>
                        <td className="px-2 py-2">
                          <input className="input h-9 w-32" value={r.codigoCentroCusto} onChange={(e) => setItens((cur) => cur.map((x, i) => (i === idx ? { ...x, codigoCentroCusto: e.target.value } : x)))} />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <button
                            type="button"
                            className="h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 inline-flex items-center justify-center"
                            onClick={() => removeItem(idx)}
                            title="Remover"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-3 py-6 text-center text-slate-500" colSpan={11}>
                        Sem itens. Adicione itens para compor o serviço.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
