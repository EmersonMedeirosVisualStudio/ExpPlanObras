"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type PolicyListItem = {
  id: number;
  nomePolitica: string;
  recurso: string;
  acao: string;
  ativo: boolean;
  prioridadeBase: number;
  criadoEm: string;
  atualizadoEm: string;
};

type PolicyDetail = {
  id: number;
  tenantId: number;
  nomePolitica: string;
  recurso: string;
  acao: string;
  descricaoPolitica: string | null;
  ativo: boolean;
  prioridadeBase: number;
  regras: any[];
  alvos: any[];
};

type AuditRow = {
  id: number;
  userId: number;
  recurso: string;
  acao: string;
  entityId: number | null;
  resultado: string;
  motivoCodigo: string | null;
  policyId: number | null;
  ruleId: number | null;
  latenciaMs: number | null;
  criadoEm: string;
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) throw new Error(json?.message || "Erro na requisição");
  return json.data as T;
}

function fmtDateTime(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("pt-BR");
}

const TABS = ["POLITICAS", "AUDITORIA", "INDICE"] as const;
type TabKey = (typeof TABS)[number];

export default function SecurityPoliciesClient() {
  const [tab, setTab] = useState<TabKey>("POLITICAS");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [policies, setPolicies] = useState<PolicyListItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<PolicyDetail | null>(null);

  const [nomePolitica, setNomePolitica] = useState("");
  const [descricaoPolitica, setDescricaoPolitica] = useState<string>("");
  const [prioridadeBase, setPrioridadeBase] = useState<number>(0);
  const [regrasJson, setRegrasJson] = useState<string>("[]");
  const [alvosJson, setAlvosJson] = useState<string>("[]");

  const [auditoria, setAuditoria] = useState<AuditRow[]>([]);
  const [indiceRecursos, setIndiceRecursos] = useState<Record<string, boolean>>({
    DOCUMENTO: true,
    SST_NC: true,
    SUP_SOLICITACAO: true,
    ENG_MEDICAO: true,
  });
  const [indiceResultado, setIndiceResultado] = useState<any | null>(null);

  const selected = useMemo(() => policies.find((p) => p.id === selectedId) || null, [policies, selectedId]);

  async function carregarPoliticas() {
    setLoading(true);
    setErro(null);
    try {
      const data = await api<PolicyListItem[]>(`/api/v1/security/politicas`);
      setPolicies(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setErro(e?.message || "Erro ao carregar políticas.");
    } finally {
      setLoading(false);
    }
  }

  async function carregarDetalhe(id: number) {
    setLoading(true);
    setErro(null);
    try {
      const p = await api<PolicyDetail>(`/api/v1/security/politicas/${id}`);
      setDetail(p);
      setNomePolitica(p.nomePolitica || "");
      setDescricaoPolitica(p.descricaoPolitica || "");
      setPrioridadeBase(Number(p.prioridadeBase || 0));
      setRegrasJson(JSON.stringify(Array.isArray(p.regras) ? p.regras : [], null, 2));
      setAlvosJson(JSON.stringify(Array.isArray(p.alvos) ? p.alvos : [], null, 2));
    } catch (e: any) {
      setErro(e?.message || "Erro ao carregar política.");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }

  async function criarPolicy() {
    const nome = (prompt("Nome da política:") || "").trim();
    if (!nome) return;
    const recurso = (prompt("Recurso (ex: DOCUMENTO, SST_NC, SUP_SOLICITACAO, ENG_MEDICAO):") || "").trim().toUpperCase();
    if (!recurso) return;
    const acao = (prompt("Ação (ex: VIEW, CREATE, UPDATE, DELETE, APPROVE, SIGN, EXPORT, EXECUTE, MANAGE):") || "").trim().toUpperCase();
    if (!acao) return;

    setLoading(true);
    setErro(null);
    try {
      const res = await api<{ id: number }>(`/api/v1/security/politicas`, {
        method: "POST",
        body: JSON.stringify({
          nomePolitica: nome,
          recurso,
          acao,
          prioridadeBase: 0,
          regras: [{ nomeRegra: "ALLOW padrão", efeito: "ALLOW", prioridade: 0, condicao: { all: [] }, ativo: true }],
          alvos: [{ tipoAlvo: "TODOS", ativo: true }],
        }),
      });
      await carregarPoliticas();
      const id = res?.id ? Number(res.id) : null;
      if (id && Number.isFinite(id)) {
        setSelectedId(id);
        await carregarDetalhe(id);
      }
    } catch (e: any) {
      setErro(e?.message || "Erro ao criar política.");
    } finally {
      setLoading(false);
    }
  }

  async function salvarPolicy() {
    if (!detail) return;
    setLoading(true);
    setErro(null);
    try {
      const regras = JSON.parse(regrasJson || "[]");
      const alvos = JSON.parse(alvosJson || "[]");
      if (!Array.isArray(regras)) throw new Error("regrasJson deve ser um array JSON.");
      if (!Array.isArray(alvos)) throw new Error("alvosJson deve ser um array JSON.");

      await api<null>(`/api/v1/security/politicas/${detail.id}`, {
        method: "PUT",
        body: JSON.stringify({
          nomePolitica,
          descricaoPolitica: descricaoPolitica || null,
          prioridadeBase: Number(prioridadeBase || 0),
          regras,
          alvos,
        }),
      });
      await carregarPoliticas();
      await carregarDetalhe(detail.id);
      alert("Política salva.");
    } catch (e: any) {
      setErro(e?.message || "Erro ao salvar política.");
    } finally {
      setLoading(false);
    }
  }

  async function toggleStatus(p: PolicyListItem) {
    setLoading(true);
    setErro(null);
    try {
      await api(`/api/v1/security/politicas/${p.id}/status`, { method: "POST", body: JSON.stringify({ ativo: !p.ativo }) });
      await carregarPoliticas();
      if (detail?.id === p.id) await carregarDetalhe(p.id);
    } catch (e: any) {
      setErro(e?.message || "Erro ao alterar status.");
    } finally {
      setLoading(false);
    }
  }

  async function carregarAuditoria() {
    setLoading(true);
    setErro(null);
    try {
      const rows = await api<AuditRow[]>(`/api/v1/security/decisoes?limit=200`);
      setAuditoria(Array.isArray(rows) ? rows : []);
    } catch (e: any) {
      setErro(e?.message || "Erro ao carregar auditoria.");
      setAuditoria([]);
    } finally {
      setLoading(false);
    }
  }

  const recursosSelecionados = useMemo(() => Object.entries(indiceRecursos).filter(([, v]) => v).map(([k]) => k), [indiceRecursos]);

  async function reindexar() {
    if (!recursosSelecionados.length) {
      setErro("Selecione pelo menos 1 recurso.");
      return;
    }
    if (!confirm(`Reindexar segurança para: ${recursosSelecionados.join(", ")}?`)) return;
    setLoading(true);
    setErro(null);
    try {
      const res = await api<any>(`/api/v1/security/reindexar`, { method: "POST", body: JSON.stringify({ recursos: recursosSelecionados }) });
      setIndiceResultado(res);
      alert("Reindex solicitado.");
    } catch (e: any) {
      setErro(e?.message || "Erro ao reindexar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarPoliticas();
  }, []);

  useEffect(() => {
    if (selectedId) carregarDetalhe(selectedId);
  }, [selectedId]);

  useEffect(() => {
    if (tab === "AUDITORIA") carregarAuditoria();
  }, [tab]);

  return (
    <div className="max-w-7xl space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Políticas de Segurança (RBAC + ABAC)</h1>
          <p className="text-sm text-slate-500">Permissão base (RBAC) + política por atributo/escopo (ABAC) + tenant.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button type="button" className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50" onClick={carregarPoliticas} disabled={loading}>
            Atualizar
          </button>
          <button type="button" className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50" onClick={criarPolicy} disabled={loading}>
            Nova política
          </button>
          <Link href="/dashboard/admin/seguranca/simulador" className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50">
            Simulador
          </Link>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            className={`rounded-full border px-4 py-2 text-sm ${tab === t ? "bg-slate-900 text-white border-slate-900" : "bg-white hover:bg-slate-50"}`}
            onClick={() => setTab(t)}
          >
            {t === "POLITICAS" ? "Políticas" : t === "AUDITORIA" ? "Auditoria" : "Índice"}
          </button>
        ))}
      </div>

      {erro ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{erro}</div> : null}

      {tab === "POLITICAS" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
            <div className="border-b bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">Políticas</div>
            <div className="p-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-slate-600">
                  <tr>
                    <th className="px-2 py-2 text-left font-semibold">Nome</th>
                    <th className="px-2 py-2 text-left font-semibold">Recurso</th>
                    <th className="px-2 py-2 text-left font-semibold">Ação</th>
                    <th className="px-2 py-2 text-left font-semibold">Prioridade</th>
                    <th className="px-2 py-2 text-left font-semibold">Ativa</th>
                    <th className="px-2 py-2 text-right font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {policies.length ? (
                    policies.map((p) => (
                      <tr key={p.id} className={`border-t ${selectedId === p.id ? "bg-slate-50" : ""}`}>
                        <td className="px-2 py-2">
                          <button type="button" className="text-left hover:underline" onClick={() => setSelectedId(p.id)}>
                            <div className="font-medium text-slate-800">{p.nomePolitica}</div>
                            <div className="text-xs text-slate-500">#{p.id}</div>
                          </button>
                        </td>
                        <td className="px-2 py-2">{p.recurso}</td>
                        <td className="px-2 py-2">{p.acao}</td>
                        <td className="px-2 py-2">{p.prioridadeBase ?? 0}</td>
                        <td className="px-2 py-2">{p.ativo ? "Sim" : "Não"}</td>
                        <td className="px-2 py-2 text-right">
                          <button type="button" className="rounded-lg border px-3 py-1 text-xs hover:bg-slate-50" onClick={() => toggleStatus(p)} disabled={loading}>
                            {p.ativo ? "Inativar" : "Ativar"}
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-2 py-3 text-slate-500" colSpan={6}>
                        {loading ? "Carregando..." : "Sem políticas."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
            <div className="border-b bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">Editor</div>
            <div className="p-4 space-y-3">
              {selected ? (
                <div className="text-xs text-slate-500">
                  {selected.recurso}.{selected.acao} • atualizada em {fmtDateTime(selected.atualizadoEm)}
                </div>
              ) : (
                <div className="text-sm text-slate-500">Selecione uma política para editar.</div>
              )}

              {detail ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <div className="text-xs font-medium text-slate-700">Nome</div>
                      <input className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={nomePolitica} onChange={(e) => setNomePolitica(e.target.value)} />
                    </div>
                    <div>
                      <div className="text-xs font-medium text-slate-700">Prioridade base</div>
                      <input
                        type="number"
                        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                        value={prioridadeBase}
                        onChange={(e) => setPrioridadeBase(Number(e.target.value))}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-slate-700">Descrição</div>
                    <textarea className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" rows={2} value={descricaoPolitica} onChange={(e) => setDescricaoPolitica(e.target.value)} />
                  </div>
                  <div className="grid gap-3">
                    <div>
                      <div className="text-xs font-medium text-slate-700">Regras (JSON)</div>
                      <textarea className="mt-1 w-full rounded-lg border px-3 py-2 font-mono text-xs" rows={10} value={regrasJson} onChange={(e) => setRegrasJson(e.target.value)} />
                    </div>
                    <div>
                      <div className="text-xs font-medium text-slate-700">Alvos (JSON)</div>
                      <textarea className="mt-1 w-full rounded-lg border px-3 py-2 font-mono text-xs" rows={6} value={alvosJson} onChange={(e) => setAlvosJson(e.target.value)} />
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button type="button" className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50" onClick={salvarPolicy} disabled={loading}>
                      Salvar
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50"
                      onClick={() => {
                        if (!detail) return;
                        setSelectedId(detail.id);
                        carregarDetalhe(detail.id);
                      }}
                      disabled={loading}
                    >
                      Recarregar
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {tab === "AUDITORIA" ? (
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <div className="border-b bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">Auditoria de decisões</div>
          <div className="p-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-slate-600">
                <tr>
                  <th className="px-2 py-2 text-left font-semibold">Quando</th>
                  <th className="px-2 py-2 text-left font-semibold">Usuário</th>
                  <th className="px-2 py-2 text-left font-semibold">Recurso</th>
                  <th className="px-2 py-2 text-left font-semibold">Ação</th>
                  <th className="px-2 py-2 text-left font-semibold">Entidade</th>
                  <th className="px-2 py-2 text-left font-semibold">Resultado</th>
                  <th className="px-2 py-2 text-left font-semibold">Motivo</th>
                  <th className="px-2 py-2 text-left font-semibold">Política/Regra</th>
                  <th className="px-2 py-2 text-left font-semibold">Latência</th>
                </tr>
              </thead>
              <tbody>
                {auditoria.length ? (
                  auditoria.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-2 py-2">{fmtDateTime(r.criadoEm)}</td>
                      <td className="px-2 py-2">{r.userId}</td>
                      <td className="px-2 py-2">{r.recurso}</td>
                      <td className="px-2 py-2">{r.acao}</td>
                      <td className="px-2 py-2">{r.entityId ?? "-"}</td>
                      <td className="px-2 py-2">{r.resultado}</td>
                      <td className="px-2 py-2">{r.motivoCodigo ?? "-"}</td>
                      <td className="px-2 py-2">
                        {r.policyId ? `P${r.policyId}` : "-"}
                        {r.ruleId ? ` / R${r.ruleId}` : ""}
                      </td>
                      <td className="px-2 py-2">{r.latenciaMs !== null && r.latenciaMs !== undefined ? `${r.latenciaMs}ms` : "-"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-2 py-3 text-slate-500" colSpan={9}>
                      {loading ? "Carregando..." : "Sem registros."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "INDICE" ? (
        <div className="space-y-4">
          <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
            <div className="text-sm font-semibold text-slate-800">Reindexar índice de segurança</div>
            <div className="text-sm text-slate-600">
              O índice alimenta filtro SQL por escopo/atributo. Se o banco ainda não tiver as tabelas desta etapa, a API retorna 501.
            </div>
            <div className="flex gap-3 flex-wrap">
              {Object.keys(indiceRecursos).map((k) => (
                <label key={k} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(indiceRecursos[k])}
                    onChange={(e) => setIndiceRecursos((prev) => ({ ...prev, [k]: e.target.checked }))}
                  />
                  {k}
                </label>
              ))}
            </div>
            <div className="flex gap-2 flex-wrap">
              <button type="button" className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50" onClick={reindexar} disabled={loading}>
                Reindexar agora
              </button>
            </div>
          </div>

          {indiceResultado ? (
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-sm font-semibold text-slate-800">Resultado</div>
              <pre className="mt-2 overflow-x-auto rounded-lg border bg-slate-50 p-3 text-xs">{JSON.stringify(indiceResultado, null, 2)}</pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

