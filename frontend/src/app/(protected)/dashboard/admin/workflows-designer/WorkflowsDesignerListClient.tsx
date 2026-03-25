"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { WorkflowsDesignerApi } from "@/lib/modules/workflows-designer/api";

function fmtDateTime(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("pt-BR");
}

export default function WorkflowsDesignerListClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [rows, setRows] = useState<any[]>([]);

  async function carregar() {
    setLoading(true);
    setErro(null);
    try {
      const r = await WorkflowsDesignerApi.listarRascunhos();
      setRows(Array.isArray(r) ? r : []);
    } catch (e: any) {
      setErro(e?.message || "Erro ao carregar rascunhos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function criar() {
    const codigo = (prompt("Código do workflow (ex: COMPRA_APROVACAO):") || "").trim();
    if (!codigo) return;
    const nomeModelo = (prompt("Nome do modelo:") || "").trim();
    if (!nomeModelo) return;
    const entidadeTipo = (prompt("Entidade tipo (ex: CONTRATO, MEDICAO, COMPRA):") || "").trim();
    if (!entidadeTipo) return;
    try {
      setLoading(true);
      const res = await WorkflowsDesignerApi.criarRascunho({ codigo, nomeModelo, entidadeTipo });
      router.push(`/dashboard/admin/workflows-designer/${res.id}`);
    } catch (e: any) {
      setErro(e?.message || "Erro ao criar rascunho.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-7xl space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Designer de Workflow</h1>
          <p className="text-sm text-slate-500">Rascunhos visuais (BPMN-lite), validação, simulação e publicação com versionamento.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button type="button" className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50" onClick={carregar} disabled={loading}>
            Atualizar
          </button>
          <button type="button" className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700" onClick={criar} disabled={loading}>
            Novo rascunho
          </button>
        </div>
      </div>

      {erro ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{erro}</div> : null}

      <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Código</th>
              <th className="px-3 py-2 text-left font-semibold">Nome</th>
              <th className="px-3 py-2 text-left font-semibold">Entidade</th>
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
                    <div className="font-medium text-slate-800">{r.codigo}</div>
                    <div className="text-xs text-slate-500">#{r.id}</div>
                  </td>
                  <td className="px-3 py-2">{r.nomeModelo}</td>
                  <td className="px-3 py-2 text-slate-600">{r.entidadeTipo}</td>
                  <td className="px-3 py-2">{r.statusRascunho}</td>
                  <td className="px-3 py-2">{fmtDateTime(r.atualizadoEm)}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className="rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50"
                      onClick={() => router.push(`/dashboard/admin/workflows-designer/${r.id}`)}
                    >
                      Abrir
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-3 py-4 text-slate-500" colSpan={6}>
                  Nenhum rascunho ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

