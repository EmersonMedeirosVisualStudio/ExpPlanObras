"use client";

import { useEffect, useState } from "react";

type Item = { templateKey: string; assuntoTemplate: string; ativo: boolean; versao: number; atualizadoEm: string };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) }, cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) throw new Error(json?.message || "Erro");
  return json.data as T;
}

export default function TemplatesClient() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [edit, setEdit] = useState<{ templateKey: string; assuntoTemplate: string; ativo: boolean } | null>(null);

  async function carregar() {
    setLoading(true);
    try {
      const data = await api<Item[]>("/api/v1/admin/notificacoes/templates");
      setItems(data);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Templates de Notificação (tenant)</h1>
          <p className="text-sm text-slate-600">Override simples de assunto/html/text por tenant (sem editor visual nesta etapa).</p>
        </div>
        <button className="rounded-lg border px-4 py-2 text-sm" onClick={carregar} type="button">
          Atualizar
        </button>
      </div>

      {loading ? <div className="text-sm text-slate-500">Carregando...</div> : null}

      <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="p-3">Template</th>
              <th className="p-3">Assunto</th>
              <th className="p-3">Ativo</th>
              <th className="p-3">Versão</th>
              <th className="p-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.length ? (
              items.map((t) => (
                <tr key={t.templateKey} className="border-t">
                  <td className="p-3">{t.templateKey}</td>
                  <td className="p-3">{t.assuntoTemplate}</td>
                  <td className="p-3">{t.ativo ? "Sim" : "Não"}</td>
                  <td className="p-3">{t.versao}</td>
                  <td className="p-3">
                    <button
                      className="rounded border px-3 py-1 text-xs"
                      onClick={() => setEdit({ templateKey: t.templateKey, assuntoTemplate: t.assuntoTemplate, ativo: t.ativo })}
                      type="button"
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="p-3 text-slate-500" colSpan={5}>
                  Sem overrides.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {edit ? (
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="mb-3 font-medium">Editar: {edit.templateKey}</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="text-sm">
              <div className="mb-1 text-xs text-slate-500">Assunto template</div>
              <input
                className="w-full rounded-lg border px-3 py-2 text-sm"
                value={edit.assuntoTemplate}
                onChange={(e) => setEdit({ ...edit, assuntoTemplate: e.target.value })}
              />
            </label>
            <label className="flex items-center gap-2 text-sm mt-6">
              <input type="checkbox" checked={edit.ativo} onChange={(e) => setEdit({ ...edit, ativo: e.target.checked })} />
              Ativo
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              className="rounded-lg border px-4 py-2 text-sm"
              onClick={async () => {
                await api("/api/v1/admin/notificacoes/templates", { method: "POST", body: JSON.stringify(edit) });
                setEdit(null);
                carregar();
              }}
              type="button"
            >
              Salvar
            </button>
            <button className="rounded-lg border px-4 py-2 text-sm" onClick={() => setEdit(null)} type="button">
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

