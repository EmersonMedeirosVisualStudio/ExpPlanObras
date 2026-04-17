"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

type Saude = { criticos: number; alertas: number; infos: number };
type LicitacaoRow = {
  idLicitacao: number;
  titulo: string;
  orgao: string | null;
  status: string;
  saude?: Saude;
};

const STATUSES = [
  "PREVISTA",
  "EM_ANALISE",
  "EM_PREPARACAO",
  "PARTICIPANDO",
  "AGUARDANDO_RESULTADO",
  "ENCERRADA",
  "VENCIDA",
  "DESISTIDA",
] as const;

const STATUS_LABEL: Record<string, string> = {
  PREVISTA: "Previstas",
  EM_ANALISE: "Em análise",
  EM_PREPARACAO: "Em preparação",
  PARTICIPANDO: "Participando",
  AGUARDANDO_RESULTADO: "Resultado",
  ENCERRADA: "Encerradas",
  VENCIDA: "Vencidas",
  DESISTIDA: "Desistidas",
};

function headerTone(status: string) {
  const s = String(status || "").toUpperCase();
  if (s === "PREVISTA") return "bg-slate-50";
  if (s === "EM_ANALISE") return "bg-amber-50";
  if (s === "EM_PREPARACAO") return "bg-blue-50";
  if (s === "PARTICIPANDO") return "bg-green-50";
  if (s === "AGUARDANDO_RESULTADO") return "bg-violet-50";
  if (s === "ENCERRADA") return "bg-slate-50";
  if (s === "VENCIDA") return "bg-emerald-50";
  if (s === "DESISTIDA") return "bg-red-50";
  return "bg-slate-50";
}

function cardBorder(saude?: Saude) {
  if ((saude?.criticos || 0) > 0) return "border-red-200";
  if ((saude?.alertas || 0) > 0) return "border-amber-200";
  return "border-slate-200";
}

function Badge({ tone, children }: { tone: "DANGER" | "WARNING" | "INFO" | "OK"; children: string }) {
  const color =
    tone === "DANGER"
      ? "bg-red-100 text-red-800"
      : tone === "WARNING"
        ? "bg-amber-100 text-amber-800"
        : tone === "INFO"
          ? "bg-slate-100 text-slate-700"
          : "bg-emerald-100 text-emerald-800";
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${color}`}>{children}</span>;
}

function SaudeBadges({ saude }: { saude?: Saude }) {
  const crit = Number(saude?.criticos || 0);
  const al = Number(saude?.alertas || 0);
  const info = Number(saude?.infos || 0);
  if (crit <= 0 && al <= 0 && info <= 0) return <Badge tone="OK">OK</Badge>;
  return (
    <span className="flex flex-wrap gap-1 justify-end">
      {crit > 0 ? <Badge tone="DANGER">{`${crit} críticos`}</Badge> : null}
      {al > 0 ? <Badge tone="WARNING">{`${al} alertas`}</Badge> : null}
      {info > 0 ? <Badge tone="INFO">{`${info} pendências`}</Badge> : null}
    </span>
  );
}

export default function LicitacoesKanbanClient() {
  const router = useRouter();
  const [rows, setRows] = useState<LicitacaoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);

  async function carregar() {
    try {
      setErr(null);
      setLoading(true);
      const { data: json } = await api.get("/api/v1/engenharia/licitacoes", { params: { incluirSaude: 1, diasAlerta: 30 } });
      if (!json?.success) throw new Error(json?.message || "Erro ao carregar licitações.");
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

  const grouped = useMemo(() => {
    const m: Record<string, LicitacaoRow[]> = {};
    for (const s of STATUSES) m[s] = [];
    for (const r of rows) {
      const s = String(r.status || "").toUpperCase();
      if (!m[s]) m[s] = [];
      m[s].push(r);
    }
    return m;
  }, [rows]);

  async function mover(idLicitacao: number, novoStatus: string) {
    const prev = rows;
    const next = rows.map((r) => (r.idLicitacao === idLicitacao ? { ...r, status: novoStatus } : r));
    setRows(next);
    try {
      const { data: json } = await api.put(`/api/v1/engenharia/licitacoes/${idLicitacao}`, { status: novoStatus });
      if (!json?.success) throw new Error(json?.message || "Erro ao atualizar status.");
    } catch (e: any) {
      setRows(prev);
      setErr(e?.message || "Erro ao atualizar status.");
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px] text-slate-900">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Licitações → Quadro (Kanban)</h1>
          <div className="text-sm text-slate-600">Arraste uma licitação entre as fases para atualizar o status.</div>
        </div>
        <div className="flex gap-2">
          <button className="rounded-lg border bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50" type="button" onClick={() => router.push("/dashboard/admin/licitacoes/dashboard")}>
            Voltar ao Dashboard
          </button>
          <button className="rounded-lg border bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50" type="button" onClick={carregar} disabled={loading}>
            Atualizar
          </button>
        </div>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}
      {loading ? <div className="text-sm text-slate-500">Carregando…</div> : null}

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(6, minmax(240px, 1fr))" }}>
        {STATUSES.slice(0, 6).map((status) => (
          <div
            key={status}
            className="rounded-xl border bg-white shadow-sm overflow-hidden"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const raw = e.dataTransfer.getData("text/plain");
              const id = Number(raw || 0);
              if (!Number.isInteger(id) || id <= 0) return;
              mover(id, status);
              setDraggingId(null);
            }}
          >
            <div className={`px-3 py-2 text-sm font-semibold text-slate-800 ${headerTone(status)}`}>
              {STATUS_LABEL[status]} <span className="ml-1 text-xs text-slate-500">({grouped[status]?.length || 0})</span>
            </div>
            <div className="p-3 space-y-2 min-h-[240px]">
              {(grouped[status] || []).map((r) => (
                <div
                  key={r.idLicitacao}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", String(r.idLicitacao));
                    setDraggingId(r.idLicitacao);
                  }}
                  onDragEnd={() => setDraggingId(null)}
                  className={`rounded-lg border bg-white p-3 cursor-move ${cardBorder(r.saude)} ${draggingId === r.idLicitacao ? "opacity-60" : ""}`}
                  onDoubleClick={() => router.push(`/dashboard/engenharia/licitacoes/${r.idLicitacao}`)}
                >
                  <div className="text-sm font-semibold text-slate-900 line-clamp-2">{r.titulo}</div>
                  <div className="mt-1 text-xs text-slate-500 line-clamp-2">{r.orgao || "—"}</div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-600">#{r.idLicitacao}</span>
                    <SaudeBadges saude={r.saude} />
                  </div>
                </div>
              ))}
              {!loading && !(grouped[status] || []).length ? <div className="text-xs text-slate-500">Sem itens.</div> : null}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold text-slate-700">Outras situações</div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          {STATUSES.slice(6).map((status) => (
            <div
              key={status}
              className="rounded-lg border bg-white p-3"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const raw = e.dataTransfer.getData("text/plain");
                const id = Number(raw || 0);
                if (!Number.isInteger(id) || id <= 0) return;
                mover(id, status);
                setDraggingId(null);
              }}
            >
              <div className="text-sm font-semibold text-slate-800">
                {STATUS_LABEL[status]} <span className="ml-1 text-xs text-slate-500">({grouped[status]?.length || 0})</span>
              </div>
              <div className="mt-2 space-y-2">
                {(grouped[status] || []).slice(0, 5).map((r) => (
                  <button key={r.idLicitacao} type="button" className="w-full rounded-md border px-3 py-2 text-left text-xs text-slate-800 hover:bg-slate-50" onClick={() => router.push(`/dashboard/engenharia/licitacoes/${r.idLicitacao}`)}>
                    #{r.idLicitacao} • {r.titulo}
                  </button>
                ))}
                {!loading && !(grouped[status] || []).length ? <div className="text-xs text-slate-500">Sem itens.</div> : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="text-xs text-slate-500">Dica: dê duplo clique em um card para abrir a licitação.</div>
    </div>
  );
}
