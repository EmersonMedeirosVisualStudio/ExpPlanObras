"use client";

import { useEffect, useMemo, useState } from "react";

type LicitacaoRow = {
  idLicitacao: number;
  titulo: string;
  orgao: string | null;
  status: string;
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

export default function LicitacoesPicker({
  title,
  subtitle,
  actionLabel,
  onOpen,
}: {
  title: string;
  subtitle: string;
  actionLabel: string;
  onOpen: (idLicitacao: number) => void;
}) {
  const [rows, setRows] = useState<LicitacaoRow[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function carregar() {
    try {
      setErr(null);
      setLoading(true);
      const res = await fetch("/api/v1/engenharia/licitacoes", { cache: "no-store" });
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

  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) => r.titulo.toLowerCase().includes(t) || (r.orgao || "").toLowerCase().includes(t) || String(r.idLicitacao).includes(t));
  }, [rows, q]);

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <div className="text-sm text-slate-600">{subtitle}</div>
        </div>
        <button className="rounded-lg border px-4 py-2 text-sm" type="button" onClick={carregar} disabled={loading}>
          Atualizar
        </button>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="text-sm text-slate-600">Buscar</div>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Título, órgão ou ID" />
          </div>
        </div>

        {loading ? <div className="text-sm text-slate-500">Carregando…</div> : null}

        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Título</th>
                <th className="px-3 py-2">Órgão</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Ação</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.slice(0, 200).map((r) => (
                <tr key={r.idLicitacao} className="border-t">
                  <td className="px-3 py-2">{r.idLicitacao}</td>
                  <td className="px-3 py-2">{r.titulo}</td>
                  <td className="px-3 py-2">{r.orgao || "—"}</td>
                  <td className="px-3 py-2">{STATUS_LABEL[String(r.status || "").toUpperCase()] || r.status}</td>
                  <td className="px-3 py-2">
                    <button className="rounded border px-2 py-1 text-xs" type="button" onClick={() => onOpen(r.idLicitacao)}>
                      {actionLabel}
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && !filtradas.length ? (
                <tr>
                  <td className="px-3 py-6 text-center text-slate-500" colSpan={5}>
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

