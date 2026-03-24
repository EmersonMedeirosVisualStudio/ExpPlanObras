"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { NotificationsApi } from "@/lib/notifications/api";
import type { NotificacaoDTO } from "@/lib/notifications/types";
import { useRealtimeEvent } from "@/lib/realtime/hooks";

export function NotificationsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<"NAO_LIDAS" | "TODAS">("NAO_LIDAS");
  const [modulo, setModulo] = useState<string>("");
  const [items, setItems] = useState<NotificacaoDTO[]>([]);
  const [loading, setLoading] = useState(false);

  const params = useMemo(() => {
    const status = tab === "NAO_LIDAS" ? "NAO_LIDA" : undefined;
    return { status, modulo: modulo || undefined, limit: 50 };
  }, [tab, modulo]);

  async function carregar() {
    setLoading(true);
    try {
      const data = await NotificationsApi.listar(params);
      setItems(data);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    carregar();
  }, [open, tab, modulo]);

  useRealtimeEvent("notifications", "notification.new", () => {
    if (open) carregar();
  });
  useRealtimeEvent("notifications", "notification.read", () => {
    if (open) carregar();
  });

  async function marcarLida(id: number) {
    try {
      await NotificationsApi.marcarLida(id);
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, lida: true } : n)));
    } catch {}
  }

  async function marcarTodas() {
    try {
      await NotificationsApi.marcarTodasLidas(modulo || undefined);
      carregar();
    } catch {}
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-xl">
        <div className="flex items-center justify-between border-b p-4">
          <div className="text-lg font-semibold">Notificações</div>
          <button className="rounded-lg border px-3 py-1 text-sm" onClick={onClose} type="button">
            Fechar
          </button>
        </div>

        <div className="flex items-center gap-2 border-b p-3">
          <button
            type="button"
            className={`rounded-lg border px-3 py-1 text-sm ${tab === "NAO_LIDAS" ? "bg-blue-600 text-white border-blue-600" : "bg-white"}`}
            onClick={() => setTab("NAO_LIDAS")}
          >
            Não lidas
          </button>
          <button
            type="button"
            className={`rounded-lg border px-3 py-1 text-sm ${tab === "TODAS" ? "bg-blue-600 text-white border-blue-600" : "bg-white"}`}
            onClick={() => setTab("TODAS")}
          >
            Todas
          </button>

          <select className="ml-auto rounded-lg border px-3 py-1 text-sm" value={modulo} onChange={(e) => setModulo(e.target.value)}>
            <option value="">Todos módulos</option>
            <option value="RH">RH</option>
            <option value="SST">SST</option>
            <option value="SUPRIMENTOS">Suprimentos</option>
            <option value="ENGENHARIA">Engenharia</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>

        <div className="flex items-center justify-between border-b p-3">
          <Link className="text-sm text-blue-700 hover:underline" href="/dashboard/notificacoes" onClick={onClose}>
            Abrir página completa
          </Link>
          <button className="rounded-lg border px-3 py-1 text-sm" onClick={marcarTodas} type="button">
            Marcar todas como lidas
          </button>
        </div>

        <div className="max-h-[calc(100vh-160px)] overflow-auto p-3">
          {loading ? (
            <div className="text-sm text-slate-500">Carregando...</div>
          ) : items.length ? (
            <div className="space-y-2">
              {items.map((n) => (
                <div key={n.id} className={`rounded-lg border p-3 ${n.lida ? "bg-white" : "bg-blue-50"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs text-slate-500">
                        {n.modulo} • {n.severidade}
                      </div>
                      <div className="font-medium">{n.titulo}</div>
                      <div className="text-sm text-slate-600">{n.mensagem}</div>
                    </div>
                    {!n.lida ? (
                      <button className="rounded-lg border px-2 py-1 text-xs" onClick={() => marcarLida(n.id)} type="button">
                        Marcar lida
                      </button>
                    ) : null}
                  </div>
                  {n.rota ? (
                    <Link className="mt-2 inline-block text-sm text-blue-700 hover:underline" href={n.rota} onClick={onClose}>
                      Ir para
                    </Link>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-slate-500">Sem notificações.</div>
          )}
        </div>
      </aside>
    </div>
  );
}
