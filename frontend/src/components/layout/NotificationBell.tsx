"use client";

import { useEffect, useState } from "react";
import { NotificationsApi } from "@/lib/notifications/api";
import { NotificationsDrawer } from "./NotificationsDrawer";
import { useRealtimeEvent } from "@/lib/realtime/hooks";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [total, setTotal] = useState<number>(0);

  useEffect(() => {
    let active = true;

    async function carregar() {
      try {
        const data = await NotificationsApi.naoLidas();
        if (active) setTotal(Number(data.total || 0));
      } catch {}
    }

    carregar();
    const id = window.setInterval(carregar, 60000);

    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, []);

  useRealtimeEvent("notifications", "notification.new", async () => {
    try {
      const data = await NotificationsApi.naoLidas();
      setTotal(Number(data.total || 0));
    } catch {}
  });
  useRealtimeEvent("notifications", "notification.read", async () => {
    try {
      const data = await NotificationsApi.naoLidas();
      setTotal(Number(data.total || 0));
    } catch {}
  });

  return (
    <>
      <button
        type="button"
        className="relative rounded-lg border px-3 py-2 text-sm hover:bg-slate-50"
        onClick={() => setOpen(true)}
        title="Notificações"
      >
        Notificações
        {total > 0 ? (
          <span className="absolute -right-2 -top-2 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white">
            {total > 99 ? "99+" : total}
          </span>
        ) : null}
      </button>

      <NotificationsDrawer
        open={open}
        onClose={() => {
          setOpen(false);
          NotificationsApi.naoLidas()
            .then((d) => setTotal(Number(d.total || 0)))
            .catch(() => {});
        }}
      />
    </>
  );
}
