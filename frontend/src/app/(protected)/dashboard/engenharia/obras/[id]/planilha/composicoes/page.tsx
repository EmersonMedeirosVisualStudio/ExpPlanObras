"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

type ValidacaoRow = {
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
  const [refs, setRefs] = useState<RefRow[]>([]);

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
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar versões");
      setPlanilhaId(null);
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
      await carregarPlanilhaAtual();
      await carregarReferencias();
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarTudo();
  }, [idObra]);

  useEffect(() => {
    if (!planilhaId) return;
    carregarValidacao(planilhaId);
  }, [planilhaId]);

  return (
    <div className="p-6 space-y-4 max-w-7xl text-slate-900">
      <div>
        <div className="text-xs text-slate-500">Engenharia → Obras → Obra selecionada → Planilha orçamentária → Composições</div>
        <h1 className="text-2xl font-semibold">Composições da obra — Obra #{idObra}</h1>
        <div className="text-sm text-slate-600">As composições são da obra (valem para qualquer versão da planilha). Esta tela ajuda a ver faltantes e divergências.</div>
      </div>

      <div className="rounded-xl border bg-white p-3 shadow-sm">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <button
            className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50"
            type="button"
            onClick={() => router.push(`/dashboard/engenharia/obras/${idObra}/planilha?returnTo=${encodeURIComponent(returnTo || "")}`)}
            disabled={loading}
          >
            Planilha
          </button>
          <button
            className="rounded-lg border px-3 py-2 text-sm bg-blue-600 text-white border-blue-600"
            type="button"
            onClick={() => router.push(`/dashboard/engenharia/obras/${idObra}/planilha/composicoes?returnTo=${encodeURIComponent(returnTo || "")}`)}
            disabled={loading}
          >
            Composições
          </button>
          <button
            className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50"
            type="button"
            onClick={() => router.push(`/dashboard/engenharia/obras/${idObra}/planilha/insumos?returnTo=${encodeURIComponent(returnTo || "")}`)}
            disabled={loading}
          >
            Insumos
          </button>
          <button className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50" type="button" onClick={() => router.push(returnTo || `/dashboard/engenharia/obras/${idObra}/planilha`)} disabled={loading}>
            Voltar
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60" type="button" onClick={carregarTudo} disabled={loading}>
          Atualizar
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

        <div className="overflow-auto">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-700">
              <tr>
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
              {rows.map((r) => (
                <tr key={r.codigoServico} className="border-t">
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
              {!rows.length ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
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
