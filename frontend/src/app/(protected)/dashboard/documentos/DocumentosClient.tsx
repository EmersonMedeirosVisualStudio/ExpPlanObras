"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DocumentosApi } from "@/lib/modules/documentos/api";
import type { DocumentoRegistroDTO } from "@/lib/modules/documentos/types";

function fmtDateTime(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("pt-BR");
}

export default function DocumentosClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [rows, setRows] = useState<DocumentoRegistroDTO[]>([]);

  async function carregar() {
    setLoading(true);
    setErro(null);
    try {
      const d = await DocumentosApi.listar({ limit: 100 });
      setRows(Array.isArray(d) ? d : []);
    } catch (e: any) {
      setErro(e?.message || "Erro ao carregar documentos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function criar() {
    const categoria = (prompt("Categoria (ex: CONTRATO, MEDICAO, SST):") || "").trim();
    if (!categoria) return;
    const titulo = (prompt("Título:") || "").trim();
    if (!titulo) return;
    const entidadeTipo = (prompt("Entidade tipo (opcional, ex: CONTRATO, MEDICAO):") || "").trim();
    const entidadeIdRaw = (prompt("Entidade id (opcional):") || "").trim();
    const entidadeId = entidadeIdRaw ? Number(entidadeIdRaw) : null;
    if (entidadeIdRaw && !Number.isFinite(entidadeId as any)) {
      alert("Entidade id inválido");
      return;
    }
    try {
      setLoading(true);
      const res = await DocumentosApi.criar({
        categoriaDocumento: categoria,
        tituloDocumento: titulo,
        entidadeTipo: entidadeTipo || null,
        entidadeId: entidadeIdRaw ? (Number(entidadeIdRaw) as any) : null,
      });
      router.push(`/dashboard/documentos/${res.id}`);
    } catch (e: any) {
      setErro(e?.message || "Erro ao criar documento.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-7xl space-y-6 text-[#111827]">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Processos → Documentos</h1>
          <p className="text-sm text-[#6B7280]">Versionamento, assinatura eletrônica, carimbo e verificação.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button type="button" className="rounded-lg border border-[#D1D5DB] bg-white px-4 py-2 text-sm text-[#111827] hover:bg-[#F9FAFB]" onClick={carregar} disabled={loading}>
            Atualizar
          </button>
          <button type="button" className="rounded-lg bg-[#2563EB] px-4 py-2 text-sm text-white hover:bg-[#1D4ED8]" onClick={criar} disabled={loading}>
            Novo documento
          </button>
        </div>
      </div>

      {erro ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{erro}</div> : null}

      <div className="rounded-xl border border-[#E5E7EB] bg-white shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-[#F9FAFB] text-[#6B7280]">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Título</th>
              <th className="px-3 py-2 text-left font-semibold">Categoria</th>
              <th className="px-3 py-2 text-left font-semibold">Vínculo</th>
              <th className="px-3 py-2 text-left font-semibold">Status</th>
              <th className="px-3 py-2 text-left font-semibold">Atualizado</th>
              <th className="px-3 py-2 text-right font-semibold">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-3 text-[#6B7280]" colSpan={6}>
                  Carregando...
                </td>
              </tr>
            ) : rows.length ? (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-[#E5E7EB]">
                  <td className="px-3 py-2">
                    <div className="font-medium text-[#111827]">{r.tituloDocumento}</div>
                    <div className="text-xs text-[#6B7280]">#{r.id}</div>
                  </td>
                  <td className="px-3 py-2">{r.categoriaDocumento}</td>
                  <td className="px-3 py-2 text-[#6B7280]">
                    {r.entidadeTipo && r.entidadeId ? `${r.entidadeTipo}:${r.entidadeId}` : "-"}
                  </td>
                  <td className="px-3 py-2">{r.statusDocumento}</td>
                  <td className="px-3 py-2">{fmtDateTime(r.atualizadoEm)}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-1.5 text-sm text-[#111827] hover:bg-[#F9FAFB]"
                      onClick={() => router.push(`/dashboard/documentos/${r.id}`)}
                    >
                      Abrir
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-3 py-4 text-[#6B7280]" colSpan={6}>
                  Nenhum documento ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

