"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/api";
import { getActiveObra } from "@/lib/obra/active";
import { DocumentosApi } from "@/lib/modules/documentos/api";
import { ExternalLink, Link2, Plus, Trash2 } from "lucide-react";

type ApiEnvelope<T> = { success: boolean; message?: string; data: T };
function unwrapApiData<T>(json: any): T {
  if (json && typeof json === "object" && "data" in json) return (json as ApiEnvelope<T>).data;
  return json as T;
}

type ProjetoRow = {
  idProjeto: number;
  titulo: string;
  endereco: string | null;
  descricao: string | null;
  tipo: string | null;
  numeroProjeto: string | null;
  revisao: string | null;
  status: string | null;
  dataProjeto: string | null;
  dataAprovacao: string | null;
  qtdAnexos?: number;
  vinculadoEm?: string;
};

function safeInternalPath(v: string | null) {
  const s = String(v || "").trim();
  if (!s) return null;
  if (!s.startsWith("/")) return null;
  if (s.startsWith("//")) return null;
  return s;
}

function errorToMessage(e: any, fallback: string) {
  const msg = e?.response?.data?.message;
  if (typeof msg === "string" && msg.trim()) return msg;
  const data = e?.response?.data;
  if (typeof data === "string" && data.trim()) return data.slice(0, 400);
  return e?.message || fallback;
}

function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

export default function ObraProjetosClient() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const sp = useSearchParams();
  const idObra = Number(params?.id || 0);

  const returnTo = useMemo(() => safeInternalPath(sp.get("returnTo") || null), [sp]);
  const backHref = returnTo || (idObra ? `/dashboard/engenharia/obras/${idObra}` : "/dashboard/engenharia/obras");
  const selfHref = idObra ? `/dashboard/engenharia/obras/${idObra}/projetos?returnTo=${encodeURIComponent(backHref)}` : "/dashboard/engenharia/obras";
  const obraAtualLabel = useMemo(() => {
    if (!idObra) return null;
    const active = getActiveObra();
    if (active?.id !== idObra) return `Obra selecionada: #${idObra}`;
    const nome = String(active?.nome || "").trim();
    return `Obra atual: #${idObra}${nome ? ` — ${nome}` : ""}`;
  }, [idObra]);
  const breadcrumb = useMemo(() => {
    if (!returnTo) return "Engenharia → Obras → Obra selecionada → Projetos da Obra";
    const rt = returnTo.toLowerCase();
    if (rt.includes("/dashboard/engenharia/obras/ativa")) return "Engenharia → Obras → Obra ativa → Obra selecionada → Projetos da Obra";
    if (rt.includes("/dashboard/engenharia/obras")) return "Engenharia → Obras → Obra selecionada → Projetos da Obra";
    return "Engenharia → Obras → Projetos da Obra";
  }, [returnTo]);

  const [rows, setRows] = useState<ProjetoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function carregar() {
    if (!idObra) return;
    try {
      setLoading(true);
      setErr(null);
      const res = await api.get(`/api/v1/engenharia/obras/projetos?idObra=${idObra}`);
      const list = unwrapApiData<any[]>(res?.data || []);
      const mapped: ProjetoRow[] = Array.isArray(list)
        ? list
            .map((r) => ({
              ...r,
              idProjeto: Number(r.idProjeto),
              titulo: String(r.titulo || ""),
              endereco: r.endereco == null ? null : String(r.endereco),
              descricao: r.descricao == null ? null : String(r.descricao),
              tipo: r.tipo == null ? null : String(r.tipo),
              numeroProjeto: r.numeroProjeto == null ? null : String(r.numeroProjeto),
              revisao: r.revisao == null ? null : String(r.revisao),
              status: r.status == null ? null : String(r.status),
              dataProjeto: r.dataProjeto == null ? null : String(r.dataProjeto),
              dataAprovacao: r.dataAprovacao == null ? null : String(r.dataAprovacao),
              qtdAnexos: Number(r.qtdAnexos || 0),
              vinculadoEm: r.vinculadoEm == null ? undefined : String(r.vinculadoEm),
            }))
            .filter((x) => Number.isFinite(x.idProjeto) && x.idProjeto > 0)
        : [];
      setRows(mapped);
    } catch (e: any) {
      setRows([]);
      setErr(errorToMessage(e, "Erro ao carregar projetos da obra."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, [idObra]);

  async function registrarDocumentoProjetoVinculado(input: { idProjeto: number; titulo?: string | null; numeroProjeto?: string | null; revisao?: string | null }) {
    const idProjeto = Number(input.idProjeto || 0);
    if (!Number.isInteger(idProjeto) || idProjeto <= 0) return;

    const tituloBase = String(input.titulo || "").trim();
    const titulo = tituloBase ? `Projeto vinculado — ${tituloBase}` : `Projeto vinculado — #${idProjeto}`;

    const parts: string[] = [];
    if (input.numeroProjeto) parts.push(`Nº ${String(input.numeroProjeto).trim()}`);
    if (input.revisao) parts.push(`Rev. ${String(input.revisao).trim()}`);
    parts.push(`ID ${idProjeto}`);
    const descricao = parts.filter(Boolean).join(" • ");

    await DocumentosApi.criar({
      entidadeTipo: "OBRA",
      entidadeId: idObra,
      categoriaDocumento: "OBRA:PROJETO",
      tituloDocumento: titulo,
      descricaoDocumento: descricao || null,
    });
  }

  async function vincularExistente() {
    const raw = (prompt("Informe o ID do projeto que deseja vincular à obra:") || "").trim();
    const idProjeto = Number(raw || 0);
    if (!Number.isInteger(idProjeto) || idProjeto <= 0) return;
    try {
      setLoading(true);
      setErr(null);
      await api.post("/api/v1/engenharia/obras/projetos", { idObra, idProjeto });
      try {
        const pRes = await api.get(`/api/v1/engenharia/projetos/${idProjeto}`);
        const p = unwrapApiData<any>(pRes?.data || null) as any;
        await registrarDocumentoProjetoVinculado({
          idProjeto,
          titulo: p?.titulo ?? null,
          numeroProjeto: p?.numeroProjeto ?? null,
          revisao: p?.revisao ?? null,
        });
      } catch {
        await registrarDocumentoProjetoVinculado({ idProjeto });
      }
      const importar = confirm("Deseja importar responsáveis do projeto para a obra?");
      if (importar) {
        await api.post("/api/v1/engenharia/obras/responsabilidades/importar", { idObra, idProjeto });
      }
      await carregar();
    } catch (e: any) {
      setErr(errorToMessage(e, "Erro ao vincular projeto."));
    } finally {
      setLoading(false);
    }
  }

  async function importarResponsaveis(idProjeto: number) {
    if (!confirm("Importar responsáveis do projeto para a obra? (atualiza vínculos existentes)")) return;
    try {
      setLoading(true);
      setErr(null);
      await api.post("/api/v1/engenharia/obras/responsabilidades/importar", { idObra, idProjeto });
      await carregar();
      alert("Importação concluída.");
    } catch (e: any) {
      setErr(errorToMessage(e, "Erro ao importar responsáveis."));
    } finally {
      setLoading(false);
    }
  }

  async function desvincular(idProjeto: number) {
    if (!confirm("Desvincular este projeto da obra?")) return;
    try {
      setLoading(true);
      setErr(null);
      await api.delete(`/api/v1/engenharia/obras/projetos?idObra=${idObra}&idProjeto=${idProjeto}`);
      await carregar();
    } catch (e: any) {
      setErr(errorToMessage(e, "Erro ao desvincular."));
    } finally {
      setLoading(false);
    }
  }

  if (!idObra) {
    return (
      <div className="p-6 max-w-4xl">
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">Obra inválida.</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl text-[#111827]">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs text-[#6B7280]">{breadcrumb}</div>
          <h1 className="text-2xl font-semibold">Projetos da Obra</h1>
          <div className="mt-1 text-sm text-[#6B7280]">
            {obraAtualLabel ? <span className="font-medium text-[#374151]">{obraAtualLabel}</span> : null}
            <span className={obraAtualLabel ? "ml-2" : ""}>Cadastro e vínculo de projetos relacionados à obra selecionada.</span>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="rounded-lg border border-[#D1D5DB] bg-white px-4 py-2 text-sm hover:bg-[#F9FAFB]" type="button" onClick={() => router.push(backHref)}>
            Voltar
          </button>
          <button className="rounded-lg border border-[#D1D5DB] bg-white px-4 py-2 text-sm hover:bg-[#F9FAFB]" type="button" onClick={carregar} disabled={loading}>
            Atualizar
          </button>
          <button
            className="rounded-lg border border-[#D1D5DB] bg-white px-4 py-2 text-sm hover:bg-[#F9FAFB] inline-flex items-center gap-2"
            type="button"
            onClick={vincularExistente}
            disabled={loading}
          >
            <Link2 className="h-4 w-4" />
            Vincular existente
          </button>
          <button
            className="rounded-lg bg-[#2563EB] px-4 py-2 text-sm text-white hover:bg-[#1D4ED8] inline-flex items-center gap-2"
            type="button"
            onClick={() => router.push(`/dashboard/engenharia/projetos/novo?returnTo=${encodeURIComponent(selfHref)}&obraId=${idObra}&autoLink=1`)}
            disabled={loading}
          >
            <Plus className="h-4 w-4" />
            Criar projeto
          </button>
        </div>
      </div>

      {err ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div> : null}

      <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
        {loading ? <div className="text-sm text-[#6B7280]">Carregando…</div> : null}

        {!loading && !rows.length ? <div className="text-sm text-[#6B7280]">Nenhum projeto vinculado a esta obra.</div> : null}

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
                  <th className="py-2 pr-4">Arquivos</th>
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
                    <td className="py-2 pr-4">{r.qtdAnexos ? `${r.qtdAnexos} arquivo(s)` : "Nenhum"}</td>
                    <td className="py-2 pl-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-1.5 text-xs hover:bg-[#F9FAFB] inline-flex items-center gap-2"
                          type="button"
                          onClick={() =>
                            router.push(`/dashboard/engenharia/projetos/${r.idProjeto}?returnTo=${encodeURIComponent(selfHref)}`)
                          }
                        >
                          Abrir
                          <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                        <button
                          className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-1.5 text-xs hover:bg-[#F9FAFB]"
                          type="button"
                          onClick={() => importarResponsaveis(r.idProjeto)}
                          disabled={loading}
                        >
                          Importar responsáveis
                        </button>
                        <button
                          className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs text-red-700 hover:bg-red-50 inline-flex items-center gap-2"
                          type="button"
                          onClick={() => desvincular(r.idProjeto)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Desvincular
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
