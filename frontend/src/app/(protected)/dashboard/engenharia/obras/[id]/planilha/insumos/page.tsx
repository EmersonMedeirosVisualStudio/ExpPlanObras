"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { PageLoadStatusBadge } from "@/components/PageLoadStatus";
import { Lock } from "lucide-react";

type Row = {
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
type VersaoInfo = {
  idPlanilha: number;
  numeroVersao: number;
  nome: string;
  atual: boolean;
  travado: boolean;
  idParametros: number | null;
  parametrosNome: string;
};

export default function Page() {
  const router = useRouter();
  const params = useParams();
  const search = useSearchParams();

  const idObra = useMemo(() => Number((params as any)?.id || 0), [params]);
  const returnTo = search.get("returnTo");
  const planilhaIdParam = search.get("planilhaId");
  const planilhaId = useMemo(() => {
    const n = Number(planilhaIdParam || 0);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [planilhaIdParam]);
  const safeReturnTo = useMemo(() => {
    const raw = String(returnTo || "").trim();
    const isExternal = raw.startsWith("//") || /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(raw) || /^[a-z][a-z0-9+.-]*:/i.test(raw);
    return raw && !isExternal ? raw : null;
  }, [returnTo]);
  const backHref = useMemo(() => safeReturnTo || `/dashboard/engenharia/obras/${idObra}/planilha`, [idObra, safeReturnTo]);
  const selfHref = useMemo(() => {
    const qs = new URLSearchParams();
    if (planilhaId) qs.set("planilhaId", String(planilhaId));
    qs.set("returnTo", backHref);
    return `/dashboard/engenharia/obras/${idObra}/planilha/insumos?${qs.toString()}`;
  }, [backHref, idObra, planilhaId]);

  const [loading, setLoading] = useState(false);
  const [bootLoading, setBootLoading] = useState(false);
  const [bootDone, setBootDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [obraNome, setObraNome] = useState<string>("");
  const [versoes, setVersoes] = useState<VersaoInfo[]>([]);
  const [selectedVersao, setSelectedVersao] = useState<VersaoInfo | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const valueBeforeFocusRef = useRef<Record<string, string>>({});
  const planilhaTravada = Boolean(selectedVersao?.travado);

  async function authFetch(input: RequestInfo | URL, init?: RequestInit) {
    let token: string | null = null;
    try {
      token = localStorage.getItem("token");
    } catch {}
    return fetch(input, {
      ...init,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers || {}),
      },
      cache: "no-store",
    });
  }

  async function carregarContextoPlanilha() {
    if (!idObra) return;
    try {
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha?view=versoes-info`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar contexto da planilha");
      const obra = json?.data?.obra || null;
      setObraNome(String(obra?.nome || obra?.name || "").trim());

      const list = Array.isArray(json?.data?.versoes) ? json.data.versoes : [];
      const mapped: VersaoInfo[] = list
        .map((v: any) => ({
          idPlanilha: Number(v?.idPlanilha || 0),
          numeroVersao: Number(v?.numeroVersao || 0),
          nome: String(v?.nome || ""),
          atual: Boolean(v?.atual),
          travado: Boolean(v?.travado),
          idParametros: v?.idParametros == null ? null : Number(v.idParametros),
          parametrosNome: String(v?.parametrosNome || ""),
        }))
        .filter((v: VersaoInfo) => Number.isFinite(v.idPlanilha) && v.idPlanilha > 0);
      setVersoes(mapped);

      const pickByQuery = planilhaId != null ? mapped.find((v) => Number(v.idPlanilha) === Number(planilhaId)) ?? null : null;
      const pickAtual = mapped.find((v) => Boolean(v.atual)) ?? mapped[0] ?? null;
      setSelectedVersao(pickByQuery || pickAtual || null);
    } catch (e: any) {
      setObraNome("");
      setVersoes([]);
      setSelectedVersao(null);
    }
  }

  async function carregar() {
    if (!idObra) return;
    try {
      setLoading(true);
      setErr(null);
      setOkMsg(null);
      const qs = new URLSearchParams();
      if (planilhaId) qs.set("planilhaId", String(planilhaId));
      const tail = qs.toString();
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/insumos/consolidado${tail ? `?${tail}` : ""}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar insumos consolidados");
      const list = Array.isArray(json.data?.rows) ? json.data.rows : [];
      const nextRows = list.map((r: any) => ({
        codigoItem: String(r.codigoItem || ""),
        descricao: String(r.descricao || ""),
        und: String(r.und || ""),
        valorUnitario: r.valorUnitario == null ? 0 : Number(r.valorUnitario || 0),
        quantidadeTotal: Number(r.quantidadeTotal || 0),
        travado: Boolean(r.travado),
        travadoPorCadeia: Boolean(r.travadoPorCadeia),
        origemTipo: String(r.origemTipo || ""),
        origemChave: String(r.origemChave || ""),
      }));
      setRows(nextRows);
      setEdits((prev) => {
        const copy = { ...prev };
        for (const r of nextRows) {
          if (copy[r.codigoItem] == null) copy[r.codigoItem] = String(r.valorUnitario ?? 0);
        }
        return copy;
      });
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar insumos consolidados");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function salvarValorUnitario(codigoItem: string) {
    if (!idObra) return;
    if (planilhaTravada) {
      setErr("Esta planilha está travada. Não é permitido alterar preços.");
      return;
    }
    const code = String(codigoItem || "").trim().toUpperCase();
    if (!code) return;
    const row = rows.find((r) => String(r.codigoItem || "").trim().toUpperCase() === code) || null;
    if (row?.travadoPorCadeia) {
      setErr("Este preço de insumo está travado em cadeia. Destrave o elemento pai (planilha/item) antes.");
      return;
    }
    if (row?.travado) {
      setErr("Este preço de insumo está travado. Dê duplo-clique no cadeado para destravar.");
      return;
    }
    const raw = String(edits[code] ?? edits[codigoItem] ?? "").trim().replace(/\./g, "").replace(",", ".");
    const vu = Number(raw);
    if (!Number.isFinite(vu) || vu < 0) {
      setErr("Valor unitário inválido.");
      return;
    }
    try {
      setLoading(true);
      setErr(null);
      setOkMsg(null);
      const qs = new URLSearchParams();
      if (planilhaId) qs.set("planilhaId", String(planilhaId));
      const tail = qs.toString();
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/insumos/precos${tail ? `?${tail}` : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigoItem: code, valorUnitario: vu }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao salvar preço do insumo");
      setOkMsg(`Preço atualizado e propagado: ${code}`);
      await carregar();
    } catch (e: any) {
      setErr(e?.message || "Erro ao salvar preço do insumo");
    } finally {
      setLoading(false);
    }
  }

  async function toggleTravaPrecoInsumo(codigoItem: string) {
    if (!idObra) return;
    if (planilhaTravada) {
      setErr("Esta planilha está travada. Não é permitido alterar travas de preços.");
      return;
    }
    const code = String(codigoItem || "").trim().toUpperCase();
    if (!code) return;
    const row = rows.find((r) => String(r.codigoItem || "").trim().toUpperCase() === code) || null;
    if (row?.travadoPorCadeia) {
      setErr("Preço travado em cadeia: destrave o elemento pai (planilha/item) antes.");
      return;
    }
    const next = !Boolean(row?.travado);
    try {
      setLoading(true);
      setErr(null);
      setOkMsg(null);
      const qs = new URLSearchParams();
      if (planilhaId) qs.set("planilhaId", String(planilhaId));
      const tail = qs.toString();
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/insumos/precos/trava${tail ? `?${tail}` : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigoItem: code, travado: next }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao atualizar trava do preço do insumo");
      setOkMsg(next ? `Preço travado: ${code}` : `Preço destravado: ${code}`);
      await carregar();
    } catch (e: any) {
      setErr(e?.message || "Erro ao atualizar trava do preço do insumo");
    } finally {
      setLoading(false);
    }
  }

  async function duplicarInsumo(codigoItemOrig: string) {
    if (!idObra) return;
    if (planilhaTravada) {
      setErr("Esta planilha está travada. Não é permitido duplicar insumos.");
      return;
    }
    const orig = String(codigoItemOrig || "").trim().toUpperCase();
    if (!orig) return;
    const sugestao = `${orig}-DUP`;
    const entrada = window.prompt("Informe o novo código para o insumo duplicado:", sugestao);
    const codigoItemNovo = String(entrada || "").trim().toUpperCase();
    if (!codigoItemNovo) return;
    try {
      setLoading(true);
      setErr(null);
      setOkMsg(null);
      const qs = new URLSearchParams();
      if (planilhaId) qs.set("planilhaId", String(planilhaId));
      const tail = qs.toString();
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/insumos/duplicar${tail ? `?${tail}` : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigoItemOrig: orig, codigoItemNovo }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao duplicar insumo");
      setOkMsg(`Insumo duplicado: ${orig} → ${codigoItemNovo}`);
      await carregar();
    } catch (e: any) {
      setErr(e?.message || "Erro ao duplicar insumo");
    } finally {
      setLoading(false);
    }
  }

  function moeda(v: number) {
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function tooltipTravaPreco(r: Row) {
    if (planilhaTravada) return "Planilha travada: não é permitido alterar preços nem travas.";
    if (!r.travado && !r.travadoPorCadeia) return "Duplo-clique para travar/destravar o preço deste insumo nesta planilha.";
    if (r.travadoPorCadeia) {
      if (String(r.origemTipo || "").toUpperCase() === "PLANILHA") return `Travado em cadeia pela planilha #${String(r.origemChave || "").trim() || "?"}`;
      if (String(r.origemTipo || "").toUpperCase() === "ITEM") return "Travado em cadeia por um item da planilha";
      return "Travado em cadeia";
    }
    return "Travado manualmente";
  }

  useEffect(() => {
    if (!idObra) return;
    let cancelled = false;
    setBootLoading(true);
    setBootDone(false);
    void (async () => {
      try {
        await carregarContextoPlanilha();
        await carregar();
      } finally {
        if (!cancelled) {
          setBootLoading(false);
          setBootDone(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [idObra, planilhaId]);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl text-slate-900">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <PageLoadStatusBadge loading={bootLoading || loading} done={bootDone && !bootLoading && !loading} />
          <div className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
            <button className="hover:underline" type="button" onClick={() => router.push("/dashboard/engenharia")} title="Ir para Engenharia">
              Engenharia
            </button>
            <span aria-hidden="true">→</span>
            <button className="hover:underline" type="button" onClick={() => router.push("/dashboard/engenharia/obras")} title="Ir para Obras">
              Obras
            </button>
            <span aria-hidden="true">→</span>
            <button
              className="hover:underline text-blue-600"
              type="button"
              onClick={() => router.push(`/dashboard/engenharia/obras/${idObra}`)}
              title="Ir para a Obra"
            >
              {`Obra #${idObra}${String(obraNome || "").trim() ? ` - ${obraNome}` : ""}`}
            </button>
            <span aria-hidden="true">→</span>
            <button
              className="hover:underline"
              type="button"
              onClick={() => {
                const qs = new URLSearchParams();
                const pid = selectedVersao?.idPlanilha || planilhaId;
                if (pid) qs.set("planilhaId", String(pid));
                qs.set("returnTo", selfHref);
                router.push(`/dashboard/engenharia/obras/${idObra}/planilha?${qs.toString()}`);
              }}
              title="Ir para Planilha orçamentária"
            >
              Planilha orçamentária
            </button>
            {selectedVersao?.idPlanilha ? (
              <>
                <span aria-hidden="true">→</span>
                <span className="text-blue-600">{`planilha #${selectedVersao.idPlanilha} - ${selectedVersao.nome || "—"}`}</span>
              </>
            ) : null}
            <span aria-hidden="true">→</span>
            <span>Insumos</span>
          </div>
          <h1 className="text-2xl font-semibold">Insumos</h1>
          <div className="mt-1 text-sm text-slate-700">
            {selectedVersao?.idPlanilha ? <div className="font-semibold">{`Planilha: #${selectedVersao.idPlanilha} - ${selectedVersao.nome || "—"}`}</div> : null}
            {selectedVersao?.idParametros ? <div>{`Parâmetros: #${selectedVersao.idParametros} - ${selectedVersao.parametrosNome || "—"}`}</div> : null}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={() => {
              const qs = new URLSearchParams();
              if (planilhaId) qs.set("planilhaId", String(planilhaId));
              qs.set("returnTo", selfHref);
              router.push(`/dashboard/engenharia/obras/${idObra}/planilha?${qs.toString()}`);
            }}
            disabled={loading}
          >
            Planilha
          </button>
          <button
            className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={() => {
              const qs = new URLSearchParams();
              if (planilhaId) qs.set("planilhaId", String(planilhaId));
              qs.set("returnTo", selfHref);
              router.push(`/dashboard/engenharia/obras/${idObra}/planilha/servicos?${qs.toString()}`);
            }}
            disabled={loading}
          >
            Serviços
          </button>
          <button
            className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={() => router.push(`/dashboard/engenharia/obras/${idObra}/planilha/sinapi?returnTo=${encodeURIComponent(selfHref)}`)}
            disabled={loading}
          >
            SINAPI
          </button>
          <button
            className="rounded-lg border bg-blue-600 px-4 py-2 text-sm text-white border-blue-600 hover:bg-blue-500 disabled:opacity-60"
            type="button"
            onClick={() => router.push(selfHref)}
            disabled={loading}
          >
            Insumos
          </button>
          <button
            className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={() => router.push(backHref)}
            disabled={loading}
          >
            Voltar
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        Atenção: o preço do insumo é por planilha. Ao salvar aqui, o sistema propaga esse preço para todas as composições/serviços desta planilha que usam o mesmo código de
        insumo.
      </div>

      <div className="flex items-center justify-end gap-2 flex-wrap">
        <button
          className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
          type="button"
          onClick={carregar}
          disabled={loading}
        >
          Atualizar
        </button>
      </div>

      {okMsg ? <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{okMsg}</div> : null}
      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="overflow-auto">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-700">
              <tr>
                <th className="px-3 py-2 w-[44px]" title="Duplo-clique no cadeado para travar/destravar">
                  <Lock className="h-4 w-4 text-slate-600" />
                </th>
                <th className="px-3 py-2">INSUMO</th>
                <th className="px-3 py-2">DESCRIÇÃO</th>
                <th className="px-3 py-2">UND</th>
                <th className="px-3 py-2 text-right">VALOR UNIT</th>
                <th className="px-3 py-2 text-right">QUANTIDADE TOTAL</th>
                <th className="px-3 py-2 text-right">TOTAL (QTD × VALOR)</th>
                <th className="px-3 py-2 text-right">AÇÕES</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const editKey = r.codigoItem;
                const valorInput = edits[editKey] ?? String(r.valorUnitario ?? 0);
                const total = Number(r.quantidadeTotal || 0) * Number(r.valorUnitario || 0);
                const bloqueado = loading || planilhaTravada || Boolean(r.travado) || Boolean(r.travadoPorCadeia);
                return (
                  <tr key={`${r.codigoItem}__${r.und}__${r.valorUnitario}`} className="border-t">
                    <td className="px-3 py-2">
                      <button
                        className={`inline-flex items-center justify-center rounded border px-2 py-1.5 text-xs ${
                          r.travado ? "bg-slate-100 text-slate-700" : "bg-white text-slate-700 hover:bg-slate-50"
                        } disabled:opacity-60`}
                        type="button"
                        onDoubleClick={() => toggleTravaPrecoInsumo(r.codigoItem)}
                        disabled={loading || planilhaTravada || r.travadoPorCadeia}
                        title={
                          tooltipTravaPreco(r)
                        }
                      >
                        <Lock className={`h-4 w-4 ${r.travado || r.travadoPorCadeia ? "" : "opacity-30"} ${r.travadoPorCadeia ? "opacity-40" : ""}`} />
                      </button>
                    </td>
                    <td className="px-3 py-2">{r.codigoItem}</td>
                    <td className="px-3 py-2">{r.descricao}</td>
                    <td className="px-3 py-2">{r.und}</td>
                    <td className="px-3 py-2 text-right">
                      <input
                        className="input bg-white text-right w-[140px] inline-block"
                        value={valorInput}
                        onChange={(e) => setEdits((p) => ({ ...p, [editKey]: e.target.value }))}
                        onFocus={() => {
                          valueBeforeFocusRef.current[editKey] = String(valorInput ?? "");
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            e.preventDefault();
                            const before = valueBeforeFocusRef.current[editKey];
                            setEdits((p) => ({ ...p, [editKey]: before != null ? before : String(r.valorUnitario ?? 0) }));
                            (e.target as HTMLInputElement).blur();
                          }
                          if (e.key === "Enter") {
                            e.preventDefault();
                            if (!bloqueado) salvarValorUnitario(r.codigoItem);
                          }
                        }}
                        disabled={bloqueado}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">{Number(r.quantidadeTotal || 0).toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</td>
                    <td className="px-3 py-2 text-right">{moeda(Number(total || 0))}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        className="rounded border bg-white px-3 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-60"
                        type="button"
                        onClick={() => salvarValorUnitario(r.codigoItem)}
                        disabled={bloqueado}
                      >
                        Salvar
                      </button>
                      <button
                        className="ml-2 rounded border bg-white px-3 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-60"
                        type="button"
                        onClick={() => duplicarInsumo(r.codigoItem)}
                        disabled={loading || planilhaTravada}
                        title="Cria um novo código de insumo nesta planilha, copiando o preço atual"
                      >
                        Duplicar
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!rows.length ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                    Sem dados. Importe/cadastre composições e clique em Atualizar.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
