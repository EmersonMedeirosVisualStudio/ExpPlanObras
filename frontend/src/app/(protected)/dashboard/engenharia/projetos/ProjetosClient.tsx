"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/api";
import { ExternalLink, Plus, Trash2 } from "lucide-react";

type ApiEnvelope<T> = { success: boolean; message?: string; data: T };
function unwrapApiData<T>(json: any): T {
  if (json && typeof json === "object" && "data" in json) return (json as ApiEnvelope<T>).data;
  return json as T;
}

type ProjetoRow = {
  idProjeto: number;
  titulo: string;
  endereco: string | null;
  tipo: string | null;
  numeroProjeto: string | null;
  revisao: string | null;
  status: string | null;
  dataProjeto: string | null;
  dataAprovacao: string | null;
  atualizadoEm?: string;
};

function safeInternalPath(v: string | null) {
  const s = String(v || "").trim();
  if (!s) return null;
  if (!s.startsWith("/")) return null;
  if (s.startsWith("//")) return null;
  return s;
}

function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

export default function ProjetosClient() {
  const router = useRouter();
  const sp = useSearchParams();

  const returnTo = useMemo(() => safeInternalPath(sp.get("returnTo") || null), [sp]);
  const backHref = returnTo || "/dashboard/engenharia/obras";

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<ProjetoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function carregar() {
    try {
      setLoading(true);
      setErr(null);
      const qp = new URLSearchParams();
      if (q.trim()) qp.set("q", q.trim());
      if (status.trim()) qp.set("status", status.trim().toUpperCase());
      const res = await api.get(`/api/v1/engenharia/projetos?${qp.toString()}`);
      const list = unwrapApiData<any[]>(res?.data || []);
      const mapped: ProjetoRow[] = Array.isArray(list)
        ? list
            .map((r) => ({
              ...r,
              idProjeto: Number(r.idProjeto),
              titulo: String(r.titulo || ""),
              endereco: r.endereco == null ? null : String(r.endereco),
              tipo: r.tipo == null ? null : String(r.tipo),
              numeroProjeto: r.numeroProjeto == null ? null : String(r.numeroProjeto),
              revisao: r.revisao == null ? null : String(r.revisao),
              status: r.status == null ? null : String(r.status),
              dataProjeto: r.dataProjeto == null ? null : String(r.dataProjeto),
              dataAprovacao: r.dataAprovacao == null ? null : String(r.dataAprovacao),
              atualizadoEm: r.atualizadoEm == null ? undefined : String(r.atualizadoEm),
            }))
            .filter((x) => Number.isFinite(x.idProjeto) && x.idProjeto > 0)
        : [];
      setRows(mapped);
    } catch (e: any) {
      setRows([]);
      setErr(e?.response?.data?.message || e?.message || "Erro ao carregar projetos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function remover(idProjeto: number) {
    if (!confirm("Excluir este projeto? Isso remove também os vínculos com obras.")) return;
    try {
      setLoading(true);
      setErr(null);
      await api.delete(`/api/v1/engenharia/projetos/${idProjeto}`);
      await carregar();
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao excluir projeto.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl text-[#111827]">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs text-[#6B7280]">Engenharia → Projetos</div>
          <h1 className="text-2xl font-semibold">Projetos</h1>
          <div className="mt-1 text-sm text-[#6B7280]">Cadastro único de projetos (independente da obra) e reutilização por vínculo.</div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="rounded-lg border border-[#D1D5DB] bg-white px-4 py-2 text-sm hover:bg-[#F9FAFB]" type="button" onClick={() => router.push(backHref)}>
            Voltar
          </button>
          <button className="rounded-lg border border-[#D1D5DB] bg-white px-4 py-2 text-sm hover:bg-[#F9FAFB]" type="button" onClick={carregar} disabled={loading}>
            Atualizar
          </button>
          <button
            className="rounded-lg bg-[#2563EB] px-4 py-2 text-sm text-white hover:bg-[#1D4ED8] inline-flex items-center gap-2"
            type="button"
            onClick={() => router.push(`/dashboard/engenharia/projetos/novo?returnTo=${encodeURIComponent("/dashboard/engenharia/projetos")}`)}
            disabled={loading}
          >
            <Plus className="h-4 w-4" />
            Novo projeto
          </button>
        </div>
      </div>

      {err ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div> : null}

      <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <div className="md:col-span-3">
            <div className="text-sm text-[#6B7280]">Busca</div>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="título, nº, endereço..." />
          </div>
          <div className="md:col-span-2">
            <div className="text-sm text-[#6B7280]">Status</div>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todos</option>
              <option value="APROVADO">Aprovado</option>
              <option value="EM_REVISAO">Em revisão</option>
              <option value="EM_ELABORACAO">Em elaboração</option>
              <option value="CANCELADO">Cancelado</option>
            </select>
          </div>
          <div className="md:col-span-1 flex items-end">
            <button className="rounded-lg border border-[#D1D5DB] bg-white px-4 py-2 text-sm hover:bg-[#F9FAFB] w-full" type="button" onClick={carregar} disabled={loading}>
              Filtrar
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
        {loading ? <div className="text-sm text-[#6B7280]">Carregando…</div> : null}
        {!loading && !rows.length ? <div className="text-sm text-[#6B7280]">Nenhum projeto encontrado.</div> : null}

        {!loading && rows.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-[#6B7280] border-b">
                  <th className="py-2 pr-4">Título</th>
                  <th className="py-2 pr-4">Tipo</th>
                  <th className="py-2 pr-4">Nº</th>
                  <th className="py-2 pr-4">Revisão</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Data</th>
                  <th className="py-2 pr-4">Aprovação</th>
                  <th className="py-2 pr-0 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.idProjeto} className="border-b last:border-b-0">
                    <td className="py-2 pr-4">
                      <div className="font-medium">{r.titulo || "—"}</div>
                      {r.endereco ? <div className="text-xs text-[#6B7280]">{r.endereco}</div> : null}
                    </td>
                    <td className="py-2 pr-4">{r.tipo || "—"}</td>
                    <td className="py-2 pr-4">{r.numeroProjeto || "—"}</td>
                    <td className="py-2 pr-4">{r.revisao || "—"}</td>
                    <td className="py-2 pr-4">{r.status || "—"}</td>
                    <td className="py-2 pr-4">{fmtDate(r.dataProjeto)}</td>
                    <td className="py-2 pr-4">{fmtDate(r.dataAprovacao)}</td>
                    <td className="py-2 pl-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-1.5 text-xs hover:bg-[#F9FAFB] inline-flex items-center gap-2"
                          type="button"
                          onClick={() =>
                            router.push(`/dashboard/engenharia/projetos/${r.idProjeto}?returnTo=${encodeURIComponent("/dashboard/engenharia/projetos")}`)
                          }
                        >
                          Abrir
                          <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                        <button
                          className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs text-red-700 hover:bg-red-50 inline-flex items-center gap-2"
                          type="button"
                          onClick={() => remover(r.idProjeto)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
