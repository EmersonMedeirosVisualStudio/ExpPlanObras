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

type ProfissionalRow = {
  idTecnico: number;
  nome: string;
  conselho: string | null;
  numeroRegistro: string | null;
  email: string | null;
  telefone: string | null;
};

function safeInternalPath(v: string | null) {
  const s = String(v || "").trim();
  if (!s) return null;
  if (!s.startsWith("/")) return null;
  if (s.startsWith("//")) return null;
  return s;
}

export default function ProfissionaisClient() {
  const router = useRouter();
  const sp = useSearchParams();

  const returnTo = useMemo(() => safeInternalPath(sp.get("returnTo") || null), [sp]);
  const backHref = returnTo || "/dashboard/engenharia/obras";
  const listHref = useMemo(() => (returnTo ? `/dashboard/engenharia/profissionais?returnTo=${encodeURIComponent(returnTo)}` : "/dashboard/engenharia/profissionais"), [returnTo]);
  const breadcrumb = useMemo(() => {
    if (!returnTo) return "Engenharia → Profissionais (Técnicos)";
    const rt = returnTo.toLowerCase();
    if (rt.includes("/dashboard/engenharia/projetos/novo") || /\/dashboard\/engenharia\/projetos\/\d+/.test(rt)) {
      return "Engenharia → Projetos → Cadastro de projeto → Profissionais (Técnicos)";
    }
    if (/\/dashboard\/engenharia\/obras\/\d+/.test(rt)) return "Engenharia → Obras → Obra selecionada → Profissionais (Técnicos)";
    if (rt.includes("/dashboard/engenharia/obras")) return "Engenharia → Obras → Profissionais (Técnicos)";
    return "Engenharia → Profissionais (Técnicos)";
  }, [returnTo]);

  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ProfissionalRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function carregar() {
    try {
      setLoading(true);
      setErr(null);
      const qp = new URLSearchParams();
      if (q.trim()) qp.set("q", q.trim());
      const res = await api.get(`/api/v1/engenharia/tecnicos?${qp.toString()}`);
      const list = unwrapApiData<any[]>(res?.data || []);
      const mapped: ProfissionalRow[] = Array.isArray(list)
        ? list
            .map((r) => ({
              idTecnico: Number(r.idTecnico),
              nome: String(r.nome || ""),
              conselho: r.conselho == null ? null : String(r.conselho),
              numeroRegistro: r.numeroRegistro == null ? null : String(r.numeroRegistro),
              email: r.email == null ? null : String(r.email),
              telefone: r.telefone == null ? null : String(r.telefone),
            }))
            .filter((x) => Number.isFinite(x.idTecnico) && x.idTecnico > 0)
        : [];
      setRows(mapped);
    } catch (e: any) {
      setRows([]);
      setErr(e?.response?.data?.message || e?.message || "Erro ao carregar profissionais.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function remover(idTecnico: number) {
    if (!confirm("Excluir este profissional?")) return;
    try {
      setLoading(true);
      setErr(null);
      await api.delete(`/api/v1/engenharia/tecnicos/${idTecnico}`);
      await carregar();
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao excluir profissional.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl text-[#111827]">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs text-[#6B7280]">{breadcrumb}</div>
          <h1 className="text-2xl font-semibold">Profissionais (Técnicos)</h1>
          <div className="mt-1 text-sm text-[#6B7280]">Cadastro único de profissionais (CREA/CAU) para reutilização em projetos e obras.</div>
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
            onClick={() => router.push(`/dashboard/engenharia/profissionais/novo?returnTo=${encodeURIComponent(listHref)}`)}
            disabled={loading}
          >
            <Plus className="h-4 w-4" />
            Novo profissional
          </button>
        </div>
      </div>

      {err ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div> : null}

      <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <div className="md:col-span-4">
            <div className="text-sm text-[#6B7280]">Busca</div>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="nome, conselho, registro..." />
          </div>
          <div className="md:col-span-2 flex items-end">
            <button className="rounded-lg border border-[#D1D5DB] bg-white px-4 py-2 text-sm hover:bg-[#F9FAFB] w-full" type="button" onClick={carregar} disabled={loading}>
              Filtrar
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
        {loading ? <div className="text-sm text-[#6B7280]">Carregando…</div> : null}
        {!loading && !rows.length ? <div className="text-sm text-[#6B7280]">Nenhum profissional encontrado.</div> : null}

        {!loading && rows.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-[#6B7280] border-b">
                  <th className="py-2 pr-4">Nome</th>
                  <th className="py-2 pr-4">Conselho</th>
                  <th className="py-2 pr-4">Registro</th>
                  <th className="py-2 pr-4">E-mail</th>
                  <th className="py-2 pr-4">Telefone</th>
                  <th className="py-2 pr-0 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.idTecnico} className="border-b last:border-b-0">
                    <td className="py-2 pr-4">
                      <div className="font-medium">{r.nome || "—"}</div>
                      <div className="text-xs text-[#6B7280]">ID: {r.idTecnico}</div>
                    </td>
                    <td className="py-2 pr-4">{r.conselho || "—"}</td>
                    <td className="py-2 pr-4">{r.numeroRegistro || "—"}</td>
                    <td className="py-2 pr-4">{r.email || "—"}</td>
                    <td className="py-2 pr-4">{r.telefone || "—"}</td>
                    <td className="py-2 pl-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-1.5 text-xs hover:bg-[#F9FAFB] inline-flex items-center gap-2"
                          type="button"
                          onClick={() => router.push(`/dashboard/engenharia/profissionais/${r.idTecnico}?returnTo=${encodeURIComponent(listHref)}`)}
                        >
                          Abrir
                          <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                        <button
                          className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs text-red-700 hover:bg-red-50 inline-flex items-center gap-2"
                          type="button"
                          onClick={() => remover(r.idTecnico)}
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
