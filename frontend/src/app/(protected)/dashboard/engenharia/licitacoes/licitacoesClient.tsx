"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";

type SaudeResumo = { criticos: number; alertas: number; infos: number };
type Licitacao = { idLicitacao: number; titulo: string; orgao: string | null; status: string; dataAbertura: string | null; saude?: SaudeResumo };

export default function LicitacoesClient() {
  const [rows, setRows] = useState<Licitacao[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [novo, setNovo] = useState({ titulo: "", orgao: "", dataAbertura: "" });
  const [diasAlerta, setDiasAlerta] = useState("30");

  function badgeSaude(s?: SaudeResumo) {
    const criticos = Number(s?.criticos || 0);
    const alertas = Number(s?.alertas || 0);
    const infos = Number(s?.infos || 0);
    if (criticos > 0) return { cls: "bg-red-50 border-red-200 text-red-700", txt: `Críticos: ${criticos} • Alertas: ${alertas}` };
    if (alertas > 0) return { cls: "bg-yellow-50 border-yellow-200 text-yellow-800", txt: `Alertas: ${alertas}${infos ? ` • Info: ${infos}` : ""}` };
    return { cls: "bg-green-50 border-green-200 text-green-700", txt: "OK" };
  }

  async function carregar() {
    try {
      setLoading(true);
      setErr(null);
      const dias = Number(String(diasAlerta || "30").trim());
      const params = { incluirSaude: 1, ...(Number.isFinite(dias) ? { diasAlerta: Math.max(0, dias) } : {}) };
      const { data: json } = await api.get("/api/v1/engenharia/licitacoes", { params });
      if (!json?.success) throw new Error(json?.message || "Erro ao carregar licitações");
      setRows(Array.isArray(json.data) ? json.data : []);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar licitações");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function criar() {
    try {
      setErr(null);
      const payload: any = { titulo: novo.titulo.trim(), orgao: novo.orgao.trim() || null, dataAbertura: novo.dataAbertura || null };
      const { data: json } = await api.post("/api/v1/engenharia/licitacoes", payload);
      if (!json?.success) throw new Error(json?.message || "Erro ao criar licitação");
      setNovo({ titulo: "", orgao: "", dataAbertura: "" });
      await carregar();
    } catch (e: any) {
      setErr(e?.message || "Erro ao criar licitação");
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-6xl text-slate-900">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Licitações</h1>
          <div className="text-sm text-slate-600">Cadastro e controle básico. Documentos e acervo serão vinculados por licitação.</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-sm text-slate-600">Alerta (dias)</div>
          <input className="input w-24" value={diasAlerta} onChange={(e) => setDiasAlerta(e.target.value)} />
          <button className="rounded-lg border bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50" type="button" onClick={carregar} disabled={loading}>
            {loading ? "Carregando..." : "Atualizar"}
          </button>
        </div>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="text-lg font-semibold">Nova licitação</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <div className="md:col-span-3">
            <div className="text-sm text-slate-600">Título</div>
            <input className="input" value={novo.titulo} onChange={(e) => setNovo((p) => ({ ...p, titulo: e.target.value }))} placeholder="Licitação - Obra X" />
          </div>
          <div className="md:col-span-2">
            <div className="text-sm text-slate-600">Órgão/Contratante</div>
            <input className="input" value={novo.orgao} onChange={(e) => setNovo((p) => ({ ...p, orgao: e.target.value }))} />
          </div>
          <div>
            <div className="text-sm text-slate-600">Data abertura</div>
            <input className="input" type="date" value={novo.dataAbertura} onChange={(e) => setNovo((p) => ({ ...p, dataAbertura: e.target.value }))} />
          </div>
          <div className="flex items-end justify-end md:col-span-6">
            <button className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white" type="button" onClick={criar}>
              Criar
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="text-lg font-semibold text-slate-900">Lista</div>
        <div className="flex gap-2 flex-wrap">
          <a className="rounded-lg border bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" href="/dashboard/engenharia/licitacoes/documentos-empresa">
            Documentos da Empresa
          </a>
          <a className="rounded-lg border bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" href="/dashboard/engenharia/licitacoes/acervo-empresa">
            Acervo da Empresa
          </a>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Título</th>
                <th className="px-3 py-2">Órgão</th>
                <th className="px-3 py-2">Abertura</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Saúde</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.idLicitacao} className="border-t">
                  <td className="px-3 py-2">{r.idLicitacao}</td>
                  <td className="px-3 py-2 font-medium">
                    <a className="underline" href={`/dashboard/engenharia/licitacoes/${r.idLicitacao}`}>
                      {r.titulo}
                    </a>
                  </td>
                  <td className="px-3 py-2">{r.orgao || "-"}</td>
                  <td className="px-3 py-2">{r.dataAbertura || "-"}</td>
                  <td className="px-3 py-2">{r.status}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center rounded-md border px-2 py-1 text-xs ${badgeSaude(r.saude).cls}`}>{badgeSaude(r.saude).txt}</span>
                  </td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                    Sem dados.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
