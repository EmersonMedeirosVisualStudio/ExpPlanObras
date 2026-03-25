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
    <div className="max-w-7xl space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Documentos</h1>
          <p className="text-sm text-slate-500">Versionamento, assinatura eletrônica, carimbo e verificação.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button type="button" className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50" onClick={carregar} disabled={loading}>
            Atualizar
          </button>
          <button type="button" className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700" onClick={criar} disabled={loading}>
            Novo documento
          </button>
        </div>
      </div>

      {erro ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{erro}</div> : null}

      <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
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
                <td className="px-3 py-3 text-slate-500" colSpan={6}>
                  Carregando...
                </td>
              </tr>
            ) : rows.length ? (
              rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-800">{r.tituloDocumento}</div>
                    <div className="text-xs text-slate-500">#{r.id}</div>
                  </td>
                  <td className="px-3 py-2">{r.categoriaDocumento}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {r.entidadeTipo && r.entidadeId ? `${r.entidadeTipo}:${r.entidadeId}` : "-"}
                  </td>
                  <td className="px-3 py-2">{r.statusDocumento}</td>
                  <td className="px-3 py-2">{fmtDateTime(r.atualizadoEm)}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className="rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50"
                      onClick={() => router.push(`/dashboard/documentos/${r.id}`)}
                    >
                      Abrir
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-3 py-4 text-slate-500" colSpan={6}>
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

