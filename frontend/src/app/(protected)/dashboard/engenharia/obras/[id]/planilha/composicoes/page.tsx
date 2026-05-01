"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

type ValidacaoRow = {
  item: string;
  codigoServico: string;
  servico: string;
  totalPlanilha: number;
  totalComposicao: number;
  diff: number;
  status: "SEM_COMPOSICAO" | "DIVERGENTE" | "OK";
  qtdItens: number;
};

type RefRow = { codigo: string; tipo: string; definida: boolean };

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function Page() {
  const router = useRouter();
  const params = useParams();
  const search = useSearchParams();

  const idObra = useMemo(() => Number((params as any)?.id || 0), [params]);
  const returnTo = search.get("returnTo");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [planilhaId, setPlanilhaId] = useState<number | null>(null);
  const [rows, setRows] = useState<ValidacaoRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<{ OK: boolean; SEM_COMPOSICAO: boolean; DIVERGENTE: boolean }>({
    OK: true,
    SEM_COMPOSICAO: true,
    DIVERGENTE: true,
  });
  const [refs, setRefs] = useState<RefRow[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  async function carregarPlanilhaAtual() {
    if (!idObra) return;
    try {
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha?view=versoes`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar versões");
      const versoes = Array.isArray(json.data?.versoes) ? json.data.versoes : [];
      const atual = versoes.find((v: any) => Boolean(v.atual)) || versoes[0] || null;
      const pid = atual?.idPlanilha != null ? Number(atual.idPlanilha) : null;
      setPlanilhaId(pid);
      return pid;
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar versões");
      setPlanilhaId(null);
      return null;
    }
  }

  async function carregarValidacao(pid: number) {
    try {
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/composicoes/validacao?planilhaId=${pid}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao validar composições");
      const list = Array.isArray(json.data?.rows) ? (json.data.rows as any[]) : [];
      setRows(
        list.map((r) => ({
          item: String(r.item || "").trim(),
          codigoServico: String(r.codigoServico || "").trim().toUpperCase(),
          servico: String(r.servico || ""),
          totalPlanilha: Number(r.totalPlanilha || 0),
          totalComposicao: Number(r.totalComposicao || 0),
          diff: Number(r.diff || 0),
          status: String(r.status || "OK") as any,
          qtdItens: Number(r.qtdItens || 0),
        }))
      );
    } catch (e: any) {
      setErr(e?.message || "Erro ao validar composições");
      setRows([]);
    }
  }

  async function carregarReferencias() {
    try {
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/composicoes/referencias`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar referências");
      const list = Array.isArray(json.data?.referencias) ? (json.data.referencias as any[]) : [];
      setRefs(
        list.map((r) => ({
          codigo: String(r.codigo || "").trim().toUpperCase(),
          tipo: String(r.tipo || ""),
          definida: Boolean(r.definida),
        }))
      );
    } catch {
      setRefs([]);
    }
  }

  async function carregarTudo() {
    if (!idObra) return;
    try {
      setLoading(true);
      setErr(null);
      const pid = await carregarPlanilhaAtual();
      await carregarReferencias();
      if (pid) await carregarValidacao(pid);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarTudo();
  }, [idObra]);

  const filteredRows = useMemo(() => rows.filter((r) => Boolean(statusFilter[r.status])), [rows, statusFilter]);

  function baixarModeloComposicoesCsv() {
    const sep = "\t";
    const lines = [
      ["Serviço", "tipo", "codigo", "banco", "descricao", "und", "quantidade", "Valor Unit"].join(sep),
      ["SER-0001", "Insumo", "INS-0001", "SINAPI", "Cimento CP-II", "kg", "100", "10,50"].join(sep),
      ["SER-0001", "Composição Auxiliar", "AUX-0001", "SBC", "Argamassa (auxiliar)", "m³", "0,20", "350,00"].join(sep),
      ["SER-0001", "Composição", "COMP-0001", "Próprio", "Concreto usinado (composição)", "m³", "1", "0"].join(sep),
    ];
    const csv = `${lines.join("\n")}\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `composicoes_obra_${idObra}_modelo.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function importarComposicoesCsv(file: File) {
    try {
      setLoading(true);
      setErr(null);
      const form = new FormData();
      form.append("file", file);
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/composicoes/importar-csv`, { method: "POST", body: form });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao importar composições (CSV)");
      await carregarTudo();
    } catch (e: any) {
      setErr(e?.message || "Erro ao importar composições (CSV)");
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl text-slate-900">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs text-slate-500">Engenharia → Obras → Obra selecionada → Planilha orçamentária → Composições</div>
          <h1 className="text-2xl font-semibold">Composições da obra — Obra #{idObra}</h1>
          <div className="text-sm text-slate-600">As composições são da obra (valem para qualquer versão da planilha). Esta tela ajuda a ver faltantes e divergências.</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={() => router.push(`/dashboard/engenharia/obras/${idObra}/planilha?returnTo=${encodeURIComponent(returnTo || "")}`)}
            disabled={loading}
          >
            Planilha
          </button>
          <button
            className="rounded-lg border bg-blue-600 px-4 py-2 text-sm text-white border-blue-600 hover:bg-blue-500 disabled:opacity-60"
            type="button"
            onClick={() => router.push(`/dashboard/engenharia/obras/${idObra}/planilha/composicoes?returnTo=${encodeURIComponent(returnTo || "")}`)}
            disabled={loading}
          >
            Composições
          </button>
          <button
            className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={() => router.push(`/dashboard/engenharia/obras/${idObra}/planilha/insumos?returnTo=${encodeURIComponent(returnTo || "")}`)}
            disabled={loading}
          >
            Insumos
          </button>
          <button
            className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={() => router.push(returnTo || `/dashboard/engenharia/obras/${idObra}/planilha`)}
            disabled={loading}
          >
            Voltar
          </button>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 flex-wrap">
        <button className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60" type="button" onClick={carregarTudo} disabled={loading}>
          Atualizar
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = (e.target.files || [])[0] || null;
            if (f) importarComposicoesCsv(f);
          }}
        />
        <button className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60" type="button" onClick={() => fileInputRef.current?.click()} disabled={loading}>
          Importar CSV (composições)
        </button>
        <button className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60" type="button" onClick={baixarModeloComposicoesCsv} disabled={loading}>
          Modelo CSV (composições)
        </button>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-lg font-semibold">Serviços da planilha (verificação)</div>
            <div className="text-sm text-slate-600">Marca serviços sem composição e serviços com total divergente da planilha.</div>
          </div>
          <div className="text-sm text-slate-600">Planilha: {planilhaId ? `#${planilhaId}` : "—"}</div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={statusFilter.SEM_COMPOSICAO}
              onChange={(e) => setStatusFilter((p) => ({ ...p, SEM_COMPOSICAO: Boolean(e.target.checked) }))}
            />
            <span className="text-slate-700">Sem composição</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={statusFilter.DIVERGENTE} onChange={(e) => setStatusFilter((p) => ({ ...p, DIVERGENTE: Boolean(e.target.checked) }))} />
            <span className="text-slate-700">Divergente</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={statusFilter.OK} onChange={(e) => setStatusFilter((p) => ({ ...p, OK: Boolean(e.target.checked) }))} />
            <span className="text-slate-700">OK</span>
          </label>
          <div className="text-slate-500">Mostrando: {filteredRows.length} / {rows.length}</div>
        </div>

        <div className="overflow-auto">
          <table className="min-w-[1180px] w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-700">
              <tr>
                <th className="px-3 py-2">ITEM</th>
                <th className="px-3 py-2">CÓDIGO</th>
                <th className="px-3 py-2">SERVIÇO</th>
                <th className="px-3 py-2 text-right">PLANILHA</th>
                <th className="px-3 py-2 text-right">COMPOSIÇÃO</th>
                <th className="px-3 py-2 text-right">DIF.</th>
                <th className="px-3 py-2">STATUS</th>
                <th className="px-3 py-2">Ação</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.codigoServico} className="border-t">
                  <td className="px-3 py-2 font-medium">{r.item || "—"}</td>
                  <td className="px-3 py-2 font-medium">{r.codigoServico}</td>
                  <td className="px-3 py-2">{r.servico}</td>
                  <td className="px-3 py-2 text-right">{moeda(Number(r.totalPlanilha || 0))}</td>
                  <td className="px-3 py-2 text-right">{moeda(Number(r.totalComposicao || 0))}</td>
                  <td className="px-3 py-2 text-right">{moeda(Number(r.diff || 0))}</td>
                  <td className="px-3 py-2">
                    {r.status === "OK" ? (
                      <span className="rounded border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">OK</span>
                    ) : r.status === "SEM_COMPOSICAO" ? (
                      <span className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Sem composição</span>
                    ) : (
                      <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">Divergente</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      className="rounded border bg-white px-3 py-1.5 text-xs hover:bg-slate-50"
                      type="button"
                      onClick={() =>
                        router.push(
                          `/dashboard/engenharia/obras/${idObra}/planilha/servicos/${encodeURIComponent(r.codigoServico)}?returnTo=${encodeURIComponent(
                            `/dashboard/engenharia/obras/${idObra}/planilha/composicoes`
                          )}`
                        )
                      }
                    >
                      Abrir
                    </button>
                  </td>
                </tr>
              ))}
              {!filteredRows.length ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                    Sem dados.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div>
          <div className="text-lg font-semibold">Composições auxiliares / composições referenciadas</div>
          <div className="text-sm text-slate-600">Quando um item é “Composição Auxiliar” ou “Composição”, esta lista mostra se o código já foi definido na obra.</div>
        </div>

        <div className="overflow-auto">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-700">
              <tr>
                <th className="px-3 py-2">CÓDIGO</th>
                <th className="px-3 py-2">TIPO</th>
                <th className="px-3 py-2">DEFINIDA</th>
                <th className="px-3 py-2">Ação</th>
              </tr>
            </thead>
            <tbody>
              {refs.map((r) => (
                <tr key={`${r.tipo}-${r.codigo}`} className="border-t">
                  <td className="px-3 py-2 font-medium">{r.codigo}</td>
                  <td className="px-3 py-2">{r.tipo}</td>
                  <td className="px-3 py-2">
                    {r.definida ? (
                      <span className="rounded border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">Sim</span>
                    ) : (
                      <span className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Não</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      className="rounded border bg-white px-3 py-1.5 text-xs hover:bg-slate-50"
                      type="button"
                      onClick={() =>
                        router.push(
                          `/dashboard/engenharia/obras/${idObra}/planilha/servicos/${encodeURIComponent(r.codigo)}?returnTo=${encodeURIComponent(
                            `/dashboard/engenharia/obras/${idObra}/planilha/composicoes`
                          )}`
                        )
                      }
                    >
                      Abrir
                    </button>
                  </td>
                </tr>
              ))}
              {!refs.length ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                    Sem referências.
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
