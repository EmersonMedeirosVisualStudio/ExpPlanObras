"use client";

import { useEffect, useState } from "react";

type Cfg = { permitirSemCentroCusto: boolean; exibirAlerta: boolean; bloquearSalvamento: boolean };

export default function ApropriacaoConfigClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cfg, setCfg] = useState<Cfg>({ permitirSemCentroCusto: false, exibirAlerta: true, bloquearSalvamento: false });

  async function carregar() {
    try {
      setLoading(true);
      setErr(null);
      const res = await fetch("/api/v1/engenharia/apropriacao/config", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar configuração");
      setCfg(json.data);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar configuração");
    } finally {
      setLoading(false);
    }
  }

  async function salvar() {
    try {
      setSaving(true);
      setErr(null);
      const res = await fetch("/api/v1/engenharia/apropriacao/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cfg) });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao salvar configuração");
      setCfg(json.data);
    } catch (e: any) {
      setErr(e?.message || "Erro ao salvar configuração");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  if (loading) return <div className="p-6 rounded-xl border bg-white">Carregando...</div>;

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Configuração — Apropriação</h1>
          <div className="text-sm text-slate-600">Regras para centro de custo no lançamento da apropriação/produção.</div>
        </div>
        <div className="flex gap-2">
          <button className="rounded-lg border px-4 py-2 text-sm" type="button" onClick={carregar} disabled={saving}>
            Atualizar
          </button>
          <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" type="button" onClick={salvar} disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-4">
        <div className="text-lg font-semibold">Centro de custo</div>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={cfg.permitirSemCentroCusto}
            onChange={(e) => setCfg((p) => ({ ...p, permitirSemCentroCusto: e.target.checked, bloquearSalvamento: e.target.checked ? false : p.bloquearSalvamento }))}
          />
          <div>
            <div className="font-medium">Permitir apropriação sem centro de custo</div>
            <div className="text-sm text-slate-600">Quando marcado, o custo fica alocado no serviço (sem detalhar por centro de custo).</div>
          </div>
        </label>

        <label className="flex items-start gap-3">
          <input type="checkbox" checked={cfg.exibirAlerta} onChange={(e) => setCfg((p) => ({ ...p, exibirAlerta: e.target.checked }))} />
          <div>
            <div className="font-medium">Exibir alerta</div>
            <div className="text-sm text-slate-600">Exibe avisos quando serviço/centro de custo estiver inconsistente ou ausente.</div>
          </div>
        </label>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={cfg.bloquearSalvamento}
            onChange={(e) => setCfg((p) => ({ ...p, bloquearSalvamento: e.target.checked, permitirSemCentroCusto: e.target.checked ? false : p.permitirSemCentroCusto }))}
          />
          <div>
            <div className="font-medium">Bloquear salvamento sem centro de custo</div>
            <div className="text-sm text-slate-600">Quando marcado, o centro de custo passa a ser obrigatório para apropriação.</div>
          </div>
        </label>
      </div>
    </div>
  );
}

