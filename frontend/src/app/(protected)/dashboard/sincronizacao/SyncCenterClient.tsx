"use client";

import { useEffect, useMemo, useState } from "react";
import { countPendingOutbox, listOutbox, removeOutboxItem } from "@/lib/offline/outbox";
import { syncNow } from "@/lib/offline/sync";
import { getBrowserPushSubscription, subscribeBrowserPush, unsubscribeBrowserPush } from "@/lib/pwa/push";

function fmtDateTime(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("pt-BR");
}

export default function SyncCenterClient() {
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [outbox, setOutbox] = useState<any[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [pushEnabled, setPushEnabled] = useState<boolean>(false);

  const online = useMemo(() => (typeof navigator !== "undefined" ? navigator.onLine : true), []);

  async function refresh() {
    setErro(null);
    const [items, count] = await Promise.all([listOutbox(), countPendingOutbox()]);
    setOutbox(items);
    setPendingCount(count);

    const sub = await getBrowserPushSubscription();
    setPushEnabled(!!sub);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function doSync() {
    setLoading(true);
    setErro(null);
    try {
      const res = await syncNow();
      await refresh();
      alert(`Sync concluído. Total: ${res.total} | Aplicado: ${res.applied} | Duplicado: ${res.duplicated} | Conflitos: ${res.conflicts} | Rejeitado: ${res.rejected}`);
    } catch (e: any) {
      setErro(e?.message || "Erro ao sincronizar.");
    } finally {
      setLoading(false);
    }
  }

  async function remover(id: string) {
    if (!confirm("Remover item da fila?")) return;
    await removeOutboxItem(id);
    await refresh();
  }

  async function ativarPush() {
    setLoading(true);
    setErro(null);
    try {
      const sub = await subscribeBrowserPush();
      await fetch("/api/v1/me/push-subscriptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub) });
      await refresh();
      alert("Push ativado.");
    } catch (e: any) {
      setErro(e?.message || "Erro ao ativar push.");
    } finally {
      setLoading(false);
    }
  }

  async function desativarPush() {
    setLoading(true);
    setErro(null);
    try {
      const sub = await getBrowserPushSubscription();
      if (sub?.endpoint) {
        await fetch("/api/v1/me/push-subscriptions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
      }
      await unsubscribeBrowserPush();
      await refresh();
      alert("Push desativado.");
    } catch (e: any) {
      setErro(e?.message || "Erro ao desativar push.");
    } finally {
      setLoading(false);
    }
  }

  async function testarPush() {
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch("/api/v1/me/push-subscriptions/teste", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || "Erro ao testar push");
      alert("Push de teste enfileirado/enviado.");
    } catch (e: any) {
      setErro(e?.message || "Erro ao testar push.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-7xl space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Processos → Sincronização</h1>
          <p className="text-sm text-slate-500">Fila offline, push notifications e status de rede.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button type="button" className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50" onClick={refresh} disabled={loading}>
            Atualizar
          </button>
          <button
            type="button"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
            onClick={doSync}
            disabled={loading || !online}
          >
            Sincronizar agora ({pendingCount})
          </button>
        </div>
      </div>

      {erro ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{erro}</div> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold text-slate-700">Status</div>
          <div className="mt-3 space-y-2 text-sm">
            <div>
              <span className="text-slate-500">Rede:</span> <span className="font-medium">{online ? "Online" : "Offline"}</span>
            </div>
            <div>
              <span className="text-slate-500">Itens pendentes:</span> <span className="font-medium">{pendingCount}</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-700">Push</div>
            <div className="text-xs text-slate-500">{pushEnabled ? "Ativo" : "Inativo"}</div>
          </div>
          <div className="mt-3 flex gap-2 flex-wrap">
            {!pushEnabled ? (
              <button type="button" className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800" onClick={ativarPush} disabled={loading}>
                Ativar push
              </button>
            ) : (
              <button type="button" className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50" onClick={desativarPush} disabled={loading}>
                Desativar push
              </button>
            )}
            <button type="button" className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50" onClick={testarPush} disabled={loading || !pushEnabled}>
              Testar push
            </button>
          </div>
          <div className="mt-3 text-xs text-slate-500">
            Para push funcionar em produção, configure VAPID e o job interno de envio.
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold text-slate-700">Dicas</div>
          <div className="mt-2 text-sm text-slate-600 space-y-2">
            <div>Offline: salvar local → fila → sincronizar quando voltar.</div>
            <div>Conflitos: serão marcados e ficam pendentes de revisão.</div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm font-semibold text-slate-700">Fila offline (outbox)</div>
          <div className="text-xs text-slate-500">Itens: {outbox.length}</div>
        </div>
        <div className="mt-3 overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">Módulo</th>
                <th className="px-3 py-2">Operação</th>
                <th className="px-3 py-2">Entidade</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Criado</th>
                <th className="px-3 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {outbox.length ? (
                outbox.map((i) => (
                  <tr key={i.id} className="border-t">
                    <td className="px-3 py-2">{i.modulo}</td>
                    <td className="px-3 py-2">{i.tipoOperacao}</td>
                    <td className="px-3 py-2">
                      {i.entidadeTipo}
                      {i.entidadeServidorId ? ` #${i.entidadeServidorId}` : ""}
                    </td>
                    <td className="px-3 py-2">{i.status}</td>
                    <td className="px-3 py-2">{fmtDateTime(i.criadoEm)}</td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" className="text-red-700 hover:underline" onClick={() => remover(String(i.id))}>
                        Remover
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-3 py-6 text-center text-slate-500" colSpan={6}>
                    Sem itens.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

