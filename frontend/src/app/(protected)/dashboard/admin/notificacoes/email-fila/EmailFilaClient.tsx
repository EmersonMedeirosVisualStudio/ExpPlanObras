"use client";

import { useEffect, useState } from "react";

type Item = {
  id: number;
  templateKey: string;
  assunto: string;
  emailDestino: string;
  statusEnvio: string;
  tentativas: number;
  proximaTentativaEm: string;
  enviadoEm: string | null;
  ultimoErro: string | null;
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) }, cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) throw new Error(json?.message || "Erro");
  return json.data as T;
}

export default function EmailFilaClient() {
  const [status, setStatus] = useState<string>("");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);

  async function carregar() {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (status) q.set("status", status);
      const data = await api<Item[]>(`/api/v1/admin/notificacoes/email-fila?${q.toString()}`);
      setItems(data);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, [status]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Fila de E-mails</h1>
          <p className="text-sm text-slate-600">Outbox de notificações por e-mail (processamento assíncrono).</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="rounded-lg border bg-white px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos</option>
            <option value="PENDENTE">Pendente</option>
            <option value="PROCESSANDO">Processando</option>
            <option value="ENVIADO">Enviado</option>
            <option value="ERRO">Erro</option>
            <option value="CANCELADO">Cancelado</option>
          </select>
          <button className="rounded-lg border px-4 py-2 text-sm" onClick={carregar} type="button">
            Atualizar
          </button>
        </div>
      </div>

      {loading ? <div className="text-sm text-slate-500">Carregando...</div> : null}

      <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="p-3">ID</th>
              <th className="p-3">Status</th>
              <th className="p-3">Destino</th>
              <th className="p-3">Assunto</th>
              <th className="p-3">Tentativas</th>
              <th className="p-3">Próxima</th>
              <th className="p-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.length ? (
              items.map((it) => (
                <tr key={it.id} className="border-t">
                  <td className="p-3">{it.id}</td>
                  <td className="p-3">{it.statusEnvio}</td>
                  <td className="p-3">{it.emailDestino}</td>
                  <td className="p-3">{it.assunto}</td>
                  <td className="p-3">{it.tentativas}</td>
                  <td className="p-3">{it.proximaTentativaEm ? new Date(it.proximaTentativaEm).toLocaleString("pt-BR") : "-"}</td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <button
                        className="rounded border px-3 py-1 text-xs"
                        onClick={async () => {
                          await api(`/api/v1/admin/notificacoes/email-fila/${it.id}/reprocessar`, { method: "POST" });
                          carregar();
                        }}
                        type="button"
                      >
                        Reprocessar
                      </button>
                      <button
                        className="rounded border px-3 py-1 text-xs"
                        onClick={async () => {
                          await api(`/api/v1/admin/notificacoes/email-fila/${it.id}/cancelar`, { method: "POST" });
                          carregar();
                        }}
                        type="button"
                      >
                        Cancelar
                      </button>
                    </div>
                    {it.ultimoErro ? <div className="mt-2 text-xs text-red-600">{it.ultimoErro}</div> : null}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="p-3 text-slate-500" colSpan={7}>
                  Sem itens.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

