"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) throw new Error(json?.message || "Erro na requisição");
  return json.data as T;
}

const ACTIONS = ["VIEW", "CREATE", "UPDATE", "DELETE", "APPROVE", "SIGN", "EXPORT", "EXECUTE", "MANAGE"] as const;

const RESOURCES = [
  "FUNCIONARIO",
  "PRESENCA",
  "HORA_EXTRA",
  "SST_NC",
  "SST_ACIDENTE",
  "SST_TREINAMENTO",
  "SST_CHECKLIST",
  "SUP_SOLICITACAO",
  "SUP_PEDIDO",
  "ENG_MEDICAO",
  "ENG_CONTRATO",
  "DOCUMENTO",
  "WORKFLOW",
  "APROVACAO",
  "BACKUP_RESTAURACAO",
  "ANALYTICS_DATASET",
] as const;

export default function SecuritySimulatorClient() {
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<any | null>(null);

  const [userId, setUserId] = useState<string>("");
  const [resource, setResource] = useState<string>("DOCUMENTO");
  const [action, setAction] = useState<string>("VIEW");
  const [entityId, setEntityId] = useState<string>("");
  const [skipRbac, setSkipRbac] = useState<boolean>(false);
  const [resourceAttributesJson, setResourceAttributesJson] = useState<string>("{}");

  const payload = useMemo(() => {
    const u = userId.trim() ? Number(userId) : null;
    const e = entityId.trim() ? Number(entityId) : null;
    return {
      userId: u && Number.isFinite(u) ? u : null,
      resource,
      action,
      entityId: e && Number.isFinite(e) ? e : null,
      skipRbac,
      resourceAttributes: resourceAttributesJson?.trim() ? JSON.parse(resourceAttributesJson) : undefined,
    };
  }, [userId, resource, action, entityId, skipRbac, resourceAttributesJson]);

  async function simular() {
    setLoading(true);
    setErro(null);
    setResultado(null);
    try {
      const res = await api<any>(`/api/v1/security/politicas/simular`, { method: "POST", body: JSON.stringify(payload) });
      setResultado(res);
    } catch (e: any) {
      setErro(e?.message || "Erro ao simular.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Simulador de Acesso (RBAC + ABAC)</h1>
          <p className="text-sm text-slate-500">Testa decisão para usuário/recurso/ação, com escopo e atributos.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href="/dashboard/admin/seguranca/politicas" className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50">
            Voltar às políticas
          </Link>
          <button type="button" className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50" onClick={simular} disabled={loading}>
            Simular
          </button>
        </div>
      </div>

      {erro ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{erro}</div> : null}

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="text-xs font-medium text-slate-700">Usuário (opcional)</div>
            <input
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="ID do usuário (ex: 14)"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            />
            <div className="mt-1 text-xs text-slate-500">Se vazio, usa o usuário logado.</div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-700">Entidade (opcional)</div>
            <input
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="entityId (ex: 88)"
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="text-xs font-medium text-slate-700">Recurso</div>
            <select className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={resource} onChange={(e) => setResource(e.target.value)}>
              {RESOURCES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-700">Ação</div>
            <select className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={action} onChange={(e) => setAction(e.target.value)}>
              {ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={skipRbac} onChange={(e) => setSkipRbac(e.target.checked)} />
          Ignorar RBAC (avaliar apenas ABAC/SCOPE)
        </div>

        <div>
          <div className="text-xs font-medium text-slate-700">Atributos do recurso (JSON opcional)</div>
          <textarea
            className="mt-1 w-full rounded-lg border px-3 py-2 font-mono text-xs"
            rows={6}
            value={resourceAttributesJson}
            onChange={(e) => setResourceAttributesJson(e.target.value)}
          />
        </div>
      </div>

      {resultado ? (
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold text-slate-800">Decisão</div>
          <pre className="mt-2 overflow-x-auto rounded-lg border bg-slate-50 p-3 text-xs">{JSON.stringify(resultado, null, 2)}</pre>
        </div>
      ) : null}
    </div>
  );
}

