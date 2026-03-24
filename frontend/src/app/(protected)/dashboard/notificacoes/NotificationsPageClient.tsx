"use client";

import { useEffect, useState } from "react";
import { NotificationsApi } from "@/lib/notifications/api";
import type { NotificacaoDTO, NotificacaoPreferenciaDTO } from "@/lib/notifications/types";

export default function NotificationsPageClient() {
  const [status, setStatus] = useState<string>("");
  const [modulo, setModulo] = useState<string>("");
  const [items, setItems] = useState<NotificacaoDTO[]>([]);
  const [prefs, setPrefs] = useState<NotificacaoPreferenciaDTO[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);

  async function carregar() {
    setLoading(true);
    try {
      const data = await NotificationsApi.listar({ status: status || undefined, modulo: modulo || undefined, limit: 100 });
      setItems(data);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, [status, modulo]);

  useEffect(() => {
    NotificationsApi.preferencias()
      .then((p) => setPrefs(p))
      .catch(() => setPrefs([]));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Notificações</h1>
          <p className="text-sm text-slate-600">Centro de notificações do usuário.</p>
        </div>

        <div className="flex items-center gap-2">
          <select className="rounded-lg border bg-white px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todas</option>
            <option value="NAO_LIDA">Não lidas</option>
            <option value="LIDA">Lidas</option>
          </select>
          <select className="rounded-lg border bg-white px-3 py-2 text-sm" value={modulo} onChange={(e) => setModulo(e.target.value)}>
            <option value="">Todos módulos</option>
            <option value="RH">RH</option>
            <option value="SST">SST</option>
            <option value="SUPRIMENTOS">Suprimentos</option>
            <option value="ENGENHARIA">Engenharia</option>
            <option value="ADMIN">Admin</option>
          </select>
          <button className="rounded-lg border px-4 py-2 text-sm" onClick={carregar} type="button">
            Atualizar
          </button>
          <button
            className="rounded-lg border px-4 py-2 text-sm"
            onClick={async () => {
              await NotificationsApi.marcarTodasLidas(modulo || undefined);
              carregar();
            }}
            type="button"
          >
            Marcar todas lidas
          </button>
        </div>
      </div>

      {loading ? <div className="text-sm text-slate-500">Carregando...</div> : null}

      <div className="space-y-2">
        {items.length ? (
          items.map((n) => (
            <div key={n.id} className={`rounded-lg border p-4 ${n.lida ? "bg-white" : "bg-blue-50"}`}>
              <div className="text-xs text-slate-500">
                {n.modulo} • {n.severidade} • {new Date(n.criadaEm).toLocaleString("pt-BR")}
              </div>
              <div className="mt-1 font-medium">{n.titulo}</div>
              <div className="text-sm text-slate-600">{n.mensagem}</div>
              <div className="mt-2 flex items-center gap-2">
                {n.rota ? (
                  <a className="text-sm text-blue-700 hover:underline" href={n.rota}>
                    Ir para
                  </a>
                ) : null}
                {!n.lida ? (
                  <button
                    className="rounded-lg border px-3 py-1 text-sm"
                    onClick={async () => {
                      await NotificationsApi.marcarLida(n.id);
                      carregar();
                    }}
                    type="button"
                  >
                    Marcar lida
                  </button>
                ) : null}
              </div>
            </div>
          ))
        ) : (
          <div className="text-sm text-slate-500">Sem notificações.</div>
        )}
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">Preferências (e-mail)</h2>
        {prefs === null ? (
          <div className="text-sm text-slate-500">Carregando...</div>
        ) : prefs.length ? (
          <div className="space-y-3">
            {prefs.map((p, idx) => (
              <div key={p.modulo} className="rounded-lg border p-3">
                <div className="mb-2 font-medium">{p.modulo}</div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!!p.recebeEmail}
                      onChange={(e) =>
                        setPrefs((prev) =>
                          (prev || []).map((x, i) => (i === idx ? { ...x, recebeEmail: e.target.checked } : x))
                        )
                      }
                    />
                    Receber por e-mail
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!!p.somenteCriticasEmail}
                      onChange={(e) =>
                        setPrefs((prev) =>
                          (prev || []).map((x, i) => (i === idx ? { ...x, somenteCriticasEmail: e.target.checked } : x))
                        )
                      }
                    />
                    Somente críticas
                  </label>
                  <label className="text-sm">
                    <div className="mb-1 text-xs text-slate-500">Modo</div>
                    <select
                      className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
                      value={p.modoEmail || "IMEDIATO"}
                      onChange={(e) =>
                        setPrefs((prev) =>
                          (prev || []).map((x, i) => (i === idx ? { ...x, modoEmail: e.target.value as any } : x))
                        )
                      }
                    >
                      <option value="NUNCA">Nunca</option>
                      <option value="IMEDIATO">Imediato</option>
                      <option value="DIGESTO_DIARIO">Digesto diário</option>
                      <option value="DIGESTO_SEMANAL">Digesto semanal</option>
                    </select>
                  </label>
                  <label className="text-sm">
                    <div className="mb-1 text-xs text-slate-500">Horário digesto</div>
                    <input
                      className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
                      value={p.horarioDigesto || ""}
                      onChange={(e) =>
                        setPrefs((prev) =>
                          (prev || []).map((x, i) => (i === idx ? { ...x, horarioDigesto: e.target.value || null } : x))
                        )
                      }
                      placeholder="08:00:00"
                    />
                  </label>
                  <label className="text-sm">
                    <div className="mb-1 text-xs text-slate-500">Timezone</div>
                    <input
                      className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
                      value={p.timezone || ""}
                      onChange={(e) =>
                        setPrefs((prev) =>
                          (prev || []).map((x, i) => (i === idx ? { ...x, timezone: e.target.value || null } : x))
                        )
                      }
                      placeholder="America/Sao_Paulo"
                    />
                  </label>
                </div>
              </div>
            ))}

            <div className="flex justify-end">
              <button
                className="rounded-lg border px-4 py-2 text-sm"
                disabled={savingPrefs}
                onClick={async () => {
                  try {
                    setSavingPrefs(true);
                    await NotificationsApi.salvarPreferencias(prefs as any);
                  } finally {
                    setSavingPrefs(false);
                  }
                }}
                type="button"
              >
                {savingPrefs ? "Salvando..." : "Salvar preferências"}
              </button>
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-500">Sem preferências disponíveis.</div>
        )}
      </div>
    </div>
  );
}
