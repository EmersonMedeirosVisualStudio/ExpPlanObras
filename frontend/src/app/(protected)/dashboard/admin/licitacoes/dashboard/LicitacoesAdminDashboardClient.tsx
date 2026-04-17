"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Saude = { criticos: number; alertas: number; infos: number };
type LicitacaoRow = {
  idLicitacao: number;
  titulo: string;
  orgao: string | null;
  status: string;
  dataAbertura: string | null;
  idOrcamento: number | null;
  saude?: Saude;
};

const STATUS_LABEL: Record<string, string> = {
  PREVISTA: "Prevista",
  EM_ANALISE: "Em análise",
  EM_PREPARACAO: "Em preparação",
  PARTICIPANDO: "Participando",
  AGUARDANDO_RESULTADO: "Aguardando resultado",
  ENCERRADA: "Encerrada",
  VENCIDA: "Vencida",
  DESISTIDA: "Desistida",
};

function toneForStatus(status: string) {
  const s = String(status || "").toUpperCase();
  if (s === "EM_ANALISE") return "bg-amber-100 text-amber-800";
  if (s === "EM_PREPARACAO") return "bg-blue-100 text-blue-800";
  if (s === "PARTICIPANDO") return "bg-green-100 text-green-800";
  if (s === "AGUARDANDO_RESULTADO") return "bg-violet-100 text-violet-800";
  if (s === "ENCERRADA") return "bg-slate-100 text-slate-800";
  if (s === "VENCIDA") return "bg-emerald-100 text-emerald-800";
  if (s === "DESISTIDA") return "bg-red-100 text-red-800";
  return "bg-slate-100 text-slate-800";
}

export default function LicitacoesAdminDashboardClient() {
  const router = useRouter();
  const [rows, setRows] = useState<LicitacaoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function carregar() {
    try {
      setErr(null);
      setLoading(true);
      const res = await fetch("/api/v1/engenharia/licitacoes?incluirSaude=1&diasAlerta=30", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar licitações.");
      const data = Array.isArray(json.data) ? (json.data as LicitacaoRow[]) : [];
      setRows(data);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar licitações.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  const byStatus = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const r of rows) {
      const s = String(r.status || "").toUpperCase();
      acc[s] = (acc[s] || 0) + 1;
    }
    return acc;
  }, [rows]);

  const alertas = useMemo(() => rows.filter((r) => (r.saude?.alertas || 0) > 0 || (r.saude?.infos || 0) > 0), [rows]);
  const criticos = useMemo(() => rows.filter((r) => (r.saude?.criticos || 0) > 0), [rows]);

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Administração → Licitações → Dashboard</h1>
          <div className="text-sm text-slate-600">Visão geral por status e alertas operacionais.</div>
        </div>
        <div className="flex gap-2">
          <button className="rounded-lg border px-4 py-2 text-sm" type="button" onClick={() => router.push("/dashboard/admin/licitacoes/kanban")}>
            Abrir Kanban
          </button>
          <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" type="button" onClick={() => router.push("/dashboard/admin/licitacoes/gestao")}>
            Gestão de Licitações
          </button>
        </div>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Object.keys(STATUS_LABEL).map((k) => (
          <div key={k} className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase text-slate-500">{STATUS_LABEL[k]}</div>
            <div className="mt-1 text-2xl font-semibold">{byStatus[k] || 0}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-700">Alertas (prazos próximos / pendências)</div>
            <span className="text-xs text-slate-500">{alertas.length}</span>
          </div>
          {loading ? <div className="text-sm text-slate-500">Carregando…</div> : null}
          {!loading && !alertas.length ? <div className="text-sm text-slate-500">Sem alertas no momento.</div> : null}
          <div className="space-y-2">
            {alertas.slice(0, 10).map((r) => (
              <button
                key={r.idLicitacao}
                type="button"
                className="w-full rounded-lg border bg-white p-3 text-left hover:bg-slate-50"
                onClick={() => router.push(`/dashboard/engenharia/licitacoes/${r.idLicitacao}?tab=VALIDACAO`)}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{r.titulo}</div>
                    <div className="text-xs text-slate-500 truncate">{r.orgao || "—"}</div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${toneForStatus(r.status)}`}>{STATUS_LABEL[String(r.status || "").toUpperCase()] || r.status}</span>
                </div>
                <div className="mt-2 text-xs text-slate-600">
                  Alertas: {r.saude?.alertas || 0} • Infos: {r.saude?.infos || 0}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-700">Pendências críticas</div>
            <span className="text-xs text-slate-500">{criticos.length}</span>
          </div>
          {loading ? <div className="text-sm text-slate-500">Carregando…</div> : null}
          {!loading && !criticos.length ? <div className="text-sm text-slate-500">Sem pendências críticas.</div> : null}
          <div className="space-y-2">
            {criticos.slice(0, 10).map((r) => (
              <button
                key={r.idLicitacao}
                type="button"
                className="w-full rounded-lg border border-red-200 bg-red-50 p-3 text-left hover:bg-red-100"
                onClick={() => router.push(`/dashboard/engenharia/licitacoes/${r.idLicitacao}?tab=VALIDACAO`)}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-red-800">{r.titulo}</div>
                    <div className="text-xs text-red-700 truncate">{r.orgao || "—"}</div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${toneForStatus(r.status)}`}>{STATUS_LABEL[String(r.status || "").toUpperCase()] || r.status}</span>
                </div>
                <div className="mt-2 text-xs text-red-800">Críticos: {r.saude?.criticos || 0}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button className="rounded-lg border px-4 py-2 text-sm" type="button" onClick={carregar} disabled={loading}>
          Atualizar
        </button>
      </div>
    </div>
  );
}

