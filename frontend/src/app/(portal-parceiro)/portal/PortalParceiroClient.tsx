"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) throw new Error(json?.message || "Erro na requisição");
  return json.data as T;
}

type Resumo = {
  empresaId: number;
  empresaNome: string;
  trabalhadoresAtivos: number;
  trabalhadoresBloqueados: number;
  documentosPendentes: number;
  documentosRejeitados: number;
  treinamentosVencidos: number;
  integracoesAgendadas: number;
  episPendentes: number;
};

export default function PortalParceiroClient() {
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() {
    setErro(null);
    try {
      const r = await api<Resumo>(`/api/v1/portal-parceiro/resumo`);
      setResumo(r);
    } catch (e: any) {
      setErro(e?.message || "Erro ao carregar resumo.");
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Início</h1>
          <p className="text-sm text-slate-500">Visão geral de conformidade e pendências.</p>
        </div>
        <button type="button" className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50" onClick={carregar}>
          Atualizar
        </button>
      </div>

      {erro ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{erro}</div> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Empresa</div>
          <div className="mt-1 text-lg font-semibold text-slate-800">{resumo?.empresaNome || "-"}</div>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Trabalhadores ativos</div>
          <div className="mt-1 text-2xl font-semibold text-slate-800">{resumo?.trabalhadoresAtivos ?? "-"}</div>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Bloqueados</div>
          <div className="mt-1 text-2xl font-semibold text-slate-800">{resumo?.trabalhadoresBloqueados ?? "-"}</div>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Docs pendentes</div>
          <div className="mt-1 text-2xl font-semibold text-slate-800">{resumo?.documentosPendentes ?? "-"}</div>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Docs rejeitados</div>
          <div className="mt-1 text-2xl font-semibold text-slate-800">{resumo?.documentosRejeitados ?? "-"}</div>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Treinamentos vencidos</div>
          <div className="mt-1 text-2xl font-semibold text-slate-800">{resumo?.treinamentosVencidos ?? "-"}</div>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Integrações agendadas</div>
          <div className="mt-1 text-2xl font-semibold text-slate-800">{resumo?.integracoesAgendadas ?? "-"}</div>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">EPI pendentes</div>
          <div className="mt-1 text-2xl font-semibold text-slate-800">{resumo?.episPendentes ?? "-"}</div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold text-slate-800">Acessos rápidos</div>
        <div className="mt-3 flex gap-2 flex-wrap">
          <Link href="/portal/trabalhadores" className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50">
            Trabalhadores
          </Link>
          <Link href="/portal/documentos" className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50">
            Documentos
          </Link>
          <Link href="/portal/treinamentos" className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50">
            Treinamentos
          </Link>
          <Link href="/portal/epi" className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50">
            EPI
          </Link>
          <Link href="/portal/notificacoes" className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50">
            Notificações
          </Link>
        </div>
      </div>
    </div>
  );
}

