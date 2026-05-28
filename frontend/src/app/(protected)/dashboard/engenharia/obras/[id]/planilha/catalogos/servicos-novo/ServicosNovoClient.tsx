"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, CircleDashed, ExternalLink, Layers, Pencil, Plus, RefreshCw, Search, TriangleAlert, XCircle } from "lucide-react";
import { PageLoadStatusBadge } from "@/components/PageLoadStatus";

type ValidacaoRow = {
  codigoServico: string;
  fonte: string;
  servico: string;
  und: string;
  travado: boolean;
  travadoPorCadeia: boolean;
  origemTipo: string;
  origemChave: string;
  totalComposicao: number;
  qtdItens: number;
};

type VersaoRow = {
  idPlanilha: number;
  numeroVersao: number;
  nome: string;
  atual: boolean;
  travado: boolean;
};

type AuditoriaDTO = {
  totalServicos: number;
  totalCodigosComposicao: number;
  servicosComComposicao: number;
  servicosSemComposicao: number;
  composicoesSemServico: number;
  amostraServicosSemComposicao: Array<{ codigo: string; fonte: string; servico: string; und: string }>;
  amostraComposicoesSemServico: string[];
  limiteAmostra: number;
};

function normalizeHeader(h: string) {
  return String(h || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeFilterChoice(v: string) {
  const raw = String(v || "").trim();
  if (!raw) return "";
  const n = normalizeHeader(raw);
  if (n === "todas") return "";
  if (n === "nenhuma") return "__NONE__";
  if (n === "sem_fonte" || n === "semfonte") return "__SEM_FONTE__";
  return raw;
}

function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white text-slate-900 shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="text-slate-700" type="button">
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export default function ServicosNovoClient() {
  const router = useRouter();
  const params = useParams();
  const sp = useSearchParams();

  const idObra = useMemo(() => Number((params as any)?.id || 0), [params]);
  const planilhaIdParam = sp.get("planilhaId");
  const returnToParam = sp.get("returnTo");
  const backHref = useMemo(() => {
    const raw = String(returnToParam || "").trim();
    const isExternal = raw.startsWith("//") || /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(raw) || /^[a-z][a-z0-9+.-]*:/i.test(raw);
    return raw && !isExternal ? raw : `/dashboard/engenharia/obras/${idObra}/planilha`;
  }, [idObra, returnToParam]);

  const [bootLoading, setBootLoading] = useState(false);
  const [bootDone, setBootDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [planilhaId, setPlanilhaId] = useState<number | null>(null);
  const [versoes, setVersoes] = useState<VersaoRow[]>([]);

  const effectivePlanilhaId = useMemo(() => {
    const n = Number(planilhaIdParam || 0);
    if (Number.isFinite(n) && n > 0) return n;
    return planilhaId;
  }, [planilhaId, planilhaIdParam]);

  const [textFilter, setTextFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [fonteFilter, setFonteFilter] = useState("");
  const [rows, setRows] = useState<ValidacaoRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const [audit, setAudit] = useState<AuditoriaDTO | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);

  const [modalServico, setModalServico] = useState(false);
  const [servicoEdit, setServicoEdit] = useState<{ codigo: string; fonte: string; descricao: string; und: string } | null>(null);
  const [servicoSaving, setServicoSaving] = useState(false);

  const focusRef = useRef<HTMLInputElement | null>(null);

  async function authFetch(input: RequestInfo | URL, init?: RequestInit) {
    let token: string | null = null;
    try {
      token = localStorage.getItem("token");
    } catch {}
    const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : String(input);
    const isRelativeApi = rawUrl.startsWith("/api/v1/") || rawUrl === "/api/v1";
    const url = isRelativeApi ? rawUrl : rawUrl;
    const res = await fetch(url, {
      ...init,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers || {}),
      },
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 402) {
      if (typeof window !== "undefined") {
        const onLoginPage = window.location?.pathname === "/login";
        if (!onLoginPage) {
          try {
            const msg = await res
              .clone()
              .json()
              .then((j: any) => String(j?.message || "").trim())
              .catch(() => "");
            localStorage.setItem("auth_error", msg || "Sua sessão expirou. Faça login novamente.");
          } catch {}
          try {
            localStorage.removeItem("token");
            localStorage.removeItem("user");
          } catch {}
          window.location.href = "/login";
        }
      }
    }
    return res;
  }

  async function carregarVersoes() {
    if (!idObra) return;
    try {
      setBootLoading(true);
      setErr(null);
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha?view=versoes-info`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar versões");
      const vers = Array.isArray(json.data?.versoes) ? json.data.versoes : [];
      const mapped: VersaoRow[] = vers.map((v: any) => ({
        idPlanilha: Number(v.idPlanilha || 0),
        numeroVersao: Number(v.numeroVersao || 0),
        nome: String(v.nome || ""),
        atual: Boolean(v.atual),
        travado: Boolean(v.travado),
      }));
      setVersoes(mapped);
      const byQuery = effectivePlanilhaId ? mapped.find((v) => Number(v.idPlanilha) === Number(effectivePlanilhaId)) : null;
      const atual = mapped.find((v) => v.atual) || mapped[0] || null;
      const pick = byQuery || atual;
      setPlanilhaId(pick?.idPlanilha ? Number(pick.idPlanilha) : null);
      setBootDone(true);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar versões");
      setVersoes([]);
      setPlanilhaId(null);
    } finally {
      setBootLoading(false);
    }
  }

  async function carregarAudit() {
    try {
      setAuditLoading(true);
      const res = await authFetch(`/api/v1/engenharia/catalogo/servicos/auditoria-composicoes?limit=50`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar auditoria");
      setAudit(json.data as AuditoriaDTO);
    } catch {
      setAudit(null);
    } finally {
      setAuditLoading(false);
    }
  }

  async function carregarCatalogo(pid: number, opts?: { offset?: number; append?: boolean }) {
    const nextOffset = opts?.offset != null ? Number(opts.offset) : 0;
    const append = Boolean(opts?.append);
    try {
      setLoading(true);
      setErr(null);
      setOkMsg(null);
      const qText = String(textFilter || "").trim();
      const fonteChoice = normalizeFilterChoice(fonteFilter);
      const statusChoice = normalizeFilterChoice(statusFilter);
      if (fonteChoice === "__NONE__" || statusChoice === "__NONE__") {
        setRows([]);
        setTotal(0);
        setOffset(0);
        setHasMore(false);
        return;
      }
      const fonteParam = fonteChoice === "__SEM_FONTE__" ? "__SEM_FONTE__" : fonteChoice ? String(fonteChoice).trim().toUpperCase() : "";
      const statusNorm = normalizeHeader(statusChoice);
      const statusParam = !statusChoice ? "" : statusNorm.includes("com") && statusNorm.includes("compos") ? "COM" : statusNorm.includes("sem") && statusNorm.includes("compos") ? "SEM" : "";

      const qs = new URLSearchParams();
      qs.set("mode", "CATALOGO");
      qs.set("planilhaId", String(pid));
      qs.set("limit", "50");
      qs.set("offset", String(nextOffset));
      if (qText) qs.set("q", qText);
      if (fonteParam) qs.set("fonte", fonteParam);
      if (statusParam) qs.set("status", statusParam);

      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/composicoes/validacao?${qs.toString()}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar catálogo");
      const list = Array.isArray(json.data?.rows) ? (json.data.rows as any[]) : [];
      const mapped: ValidacaoRow[] = list.map((r) => ({
        codigoServico: String(r.codigoServico || "").trim().toUpperCase(),
        fonte: String(r.fonte || "").trim().toUpperCase(),
        servico: String(r.servico || ""),
        und: String(r.und || "").trim().toUpperCase(),
        travado: Boolean(r.travado),
        travadoPorCadeia: Boolean(r.travadoPorCadeia),
        origemTipo: String(r.origemTipo || ""),
        origemChave: String(r.origemChave || ""),
        totalComposicao: Number(r.totalComposicao || 0),
        qtdItens: Number(r.qtdItens || 0),
      }));
      const t = Number(json.data?.total || 0);
      const o = json.data?.nextOffset != null ? Number(json.data.nextOffset) : nextOffset + mapped.length;
      const more = Boolean(json.data?.hasMore) || o < t;
      setTotal(t);
      setOffset(o);
      setHasMore(more);
      setRows((prev) => (append ? [...prev, ...mapped] : mapped));
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar catálogo");
      setRows([]);
      setTotal(0);
      setOffset(0);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }

  function abrirCriar() {
    setServicoEdit({ codigo: "", fonte: "", descricao: "", und: "" });
    setModalServico(true);
    window.setTimeout(() => focusRef.current?.focus(), 50);
  }

  function abrirEditar(r: ValidacaoRow) {
    setServicoEdit({ codigo: r.codigoServico, fonte: r.fonte, descricao: r.servico, und: r.und });
    setModalServico(true);
    window.setTimeout(() => focusRef.current?.focus(), 50);
  }

  async function salvarServico() {
    if (!servicoEdit) return;
    const pid = effectivePlanilhaId;
    if (!pid) {
      setErr("Selecione uma planilha para salvar.");
      return;
    }
    const codigoServico = String(servicoEdit.codigo || "").trim().toUpperCase();
    const descricao = String(servicoEdit.descricao || "").trim();
    const und = String(servicoEdit.und || "").trim().toUpperCase();
    const banco = String(servicoEdit.fonte || "").trim().toUpperCase();
    if (!codigoServico) {
      setErr("Código obrigatório.");
      return;
    }
    if (!descricao) {
      setErr("Descrição obrigatória.");
      return;
    }
    if (!und) {
      setErr("UND obrigatória.");
      return;
    }
    try {
      setServicoSaving(true);
      setErr(null);
      setOkMsg(null);
      const qs = new URLSearchParams();
      qs.set("planilhaId", String(pid));
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/servicos/novo?${qs.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planilhaId: pid, codigoServico, descricao, und, banco }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao salvar serviço");
      setModalServico(false);
      setServicoEdit(null);
      setOkMsg("Serviço salvo.");
      await carregarCatalogo(pid, { offset: 0, append: false });
      await carregarAudit();
    } catch (e: any) {
      setErr(e?.message || "Erro ao salvar serviço");
    } finally {
      setServicoSaving(false);
    }
  }

  useEffect(() => {
    carregarVersoes();
  }, [idObra]);

  useEffect(() => {
    if (!effectivePlanilhaId) return;
    carregarCatalogo(effectivePlanilhaId, { offset: 0, append: false });
    carregarAudit();
  }, [effectivePlanilhaId]);

  return (
    <div className="p-6 space-y-6 text-slate-900">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <button
            type="button"
            className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            onClick={() => router.push(backHref)}
            title="Voltar"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <PageLoadStatusBadge loading={bootLoading || loading} done={bootDone && !bootLoading && !loading} />
            <h1 className="text-2xl font-semibold text-slate-900">Serviços cadastrados (Novo)</h1>
            <p className="text-sm text-slate-600">Engenharia → Obras → Obra #{idObra} → Planilha → Catálogos → Serviços</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60 inline-flex items-center gap-2"
            disabled={loading || bootLoading}
            onClick={() => {
              if (effectivePlanilhaId) carregarCatalogo(effectivePlanilhaId, { offset: 0, append: false });
              carregarAudit();
            }}
            title="Recarregar"
          >
            <RefreshCw size={16} />
            Recarregar
          </button>
          <button
            type="button"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-60 inline-flex items-center gap-2"
            disabled={loading || bootLoading}
            onClick={abrirCriar}
            title="Cadastrar serviço no catálogo"
          >
            <Plus size={16} />
            Novo serviço
          </button>
        </div>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}
      {okMsg ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{okMsg}</div> : null}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-6">
            <div className="text-xs text-slate-600 mb-1">Buscar (código, fonte, serviço)</div>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="input pl-9" value={textFilter} onChange={(e) => setTextFilter(e.target.value)} placeholder="Digite para filtrar..." />
            </div>
          </div>
          <div className="md:col-span-3">
            <div className="text-xs text-slate-600 mb-1">Status de composição</div>
            <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Todas</option>
              <option value="COM">Com composição</option>
              <option value="SEM">Sem composição</option>
            </select>
          </div>
          <div className="md:col-span-3">
            <div className="text-xs text-slate-600 mb-1">Fonte</div>
            <input className="input" value={fonteFilter} onChange={(e) => setFonteFilter(e.target.value)} placeholder="Ex.: SINAPI" />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60 inline-flex items-center gap-2"
            disabled={!effectivePlanilhaId || loading}
            onClick={() => effectivePlanilhaId && carregarCatalogo(effectivePlanilhaId, { offset: 0, append: false })}
            title="Aplicar filtros"
          >
            <Search size={16} />
            Aplicar
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm font-semibold">Auditoria (Serviços x Composições)</div>
          <button
            type="button"
            className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60 inline-flex items-center gap-2"
            disabled={auditLoading}
            onClick={carregarAudit}
          >
            <RefreshCw size={16} />
            Atualizar
          </button>
        </div>
        {audit ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
            <div className="md:col-span-3 rounded-lg border bg-slate-50 p-3">
              <div className="text-xs text-slate-600">Serviços no catálogo</div>
              <div className="text-lg font-semibold">{audit.totalServicos}</div>
            </div>
            <div className="md:col-span-3 rounded-lg border bg-slate-50 p-3">
              <div className="text-xs text-slate-600">Códigos com composição</div>
              <div className="text-lg font-semibold">{audit.totalCodigosComposicao}</div>
            </div>
            <div className="md:col-span-3 rounded-lg border bg-emerald-50 p-3 border-emerald-200">
              <div className="text-xs text-emerald-800">Serviços com composição</div>
              <div className="text-lg font-semibold text-emerald-900">{audit.servicosComComposicao}</div>
            </div>
            <div className="md:col-span-3 rounded-lg border bg-amber-50 p-3 border-amber-200">
              <div className="text-xs text-amber-800">Serviços sem composição</div>
              <div className="text-lg font-semibold text-amber-900">{audit.servicosSemComposicao}</div>
            </div>

            <div className="md:col-span-12 text-xs text-slate-600">
              {audit.composicoesSemServico > 0 ? (
                <span className="inline-flex items-center gap-2">
                  <TriangleAlert size={14} className="text-amber-700" />
                  Existem {audit.composicoesSemServico} composições sem serviço correspondente no catálogo.
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-700" />
                  Não há composições órfãs (sem serviço).
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-600">{auditLoading ? "Carregando auditoria..." : "Auditoria indisponível."}</div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b flex-wrap">
          <div className="text-sm text-slate-700">
            Mostrando: <span className="font-semibold">{rows.length}</span> (total: <span className="font-semibold">{total}</span>)
          </div>
          {hasMore ? (
            <button
              type="button"
              className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60 inline-flex items-center gap-2"
              disabled={loading || !effectivePlanilhaId}
              onClick={() => effectivePlanilhaId && carregarCatalogo(effectivePlanilhaId, { offset, append: true })}
            >
              <CircleDashed size={16} />
              Carregar mais
            </button>
          ) : null}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-700">
              <tr>
                <th className="px-3 py-2">Código</th>
                <th className="px-3 py-2">Fonte</th>
                <th className="px-3 py-2">Serviço</th>
                <th className="px-3 py-2">UND</th>
                <th className="px-3 py-2 text-right">Itens</th>
                <th className="px-3 py-2 text-right">Status</th>
                <th className="px-3 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {!effectivePlanilhaId ? (
                <tr>
                  <td className="px-3 py-6 text-slate-600" colSpan={7}>
                    Selecione uma versão da planilha para abrir o catálogo.
                  </td>
                </tr>
              ) : loading && !rows.length ? (
                <tr>
                  <td className="px-3 py-6 text-slate-600" colSpan={7}>
                    Carregando...
                  </td>
                </tr>
              ) : rows.length ? (
                rows.map((r) => {
                  const hasComp = Number(r.qtdItens || 0) > 0;
                  return (
                    <tr key={r.codigoServico} className="border-t hover:bg-slate-50">
                      <td className="px-3 py-2 font-medium text-slate-900">{r.codigoServico}</td>
                      <td className="px-3 py-2">{r.fonte || "-"}</td>
                      <td className="px-3 py-2">{r.servico || "-"}</td>
                      <td className="px-3 py-2">{r.und || "-"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{Number(r.qtdItens || 0)}</td>
                      <td className="px-3 py-2 text-right">
                        {hasComp ? <CheckCircle2 size={16} className="inline text-emerald-700" /> : <XCircle size={16} className="inline text-red-700" />}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            className="h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 inline-flex items-center justify-center"
                            onClick={() => abrirEditar(r)}
                            title="Editar serviço"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            className="h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 inline-flex items-center justify-center"
                            onClick={() => {
                              const qs = new URLSearchParams();
                              if (effectivePlanilhaId) qs.set("planilhaId", String(effectivePlanilhaId));
                              qs.set("returnTo", `/dashboard/engenharia/obras/${idObra}/planilha/catalogos/servicos-novo?${new URLSearchParams({ planilhaId: String(effectivePlanilhaId || ""), returnTo: backHref }).toString()}`);
                              qs.set("codigo", r.codigoServico);
                              router.push(`/dashboard/engenharia/obras/${idObra}/planilha/catalogos/composicoes-novo?${qs.toString()}`);
                            }}
                            title="Abrir composição"
                          >
                            <Layers size={16} />
                          </button>
                          <button
                            type="button"
                            className="h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 inline-flex items-center justify-center"
                            onClick={() => {
                              const qs = new URLSearchParams();
                              if (effectivePlanilhaId) qs.set("planilhaId", String(effectivePlanilhaId));
                              qs.set("returnTo", backHref);
                              router.push(`/dashboard/engenharia/obras/${idObra}/planilha/servicos/${encodeURIComponent(r.codigoServico)}?${qs.toString()}`);
                            }}
                            title="Abrir análise (tela antiga)"
                          >
                            <ExternalLink size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td className="px-3 py-6 text-center text-slate-500" colSpan={7}>
                    Nenhum serviço encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={modalServico}
        title={servicoEdit?.codigo ? `Editar serviço ${servicoEdit.codigo}` : "Novo serviço"}
        onClose={() => {
          if (servicoSaving) return;
          setModalServico(false);
          setServicoEdit(null);
        }}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
            <div className="md:col-span-4">
              <div className="text-xs text-slate-600 mb-1">Código</div>
              <input
                ref={focusRef}
                className="input"
                value={servicoEdit?.codigo || ""}
                onChange={(e) => setServicoEdit((cur) => (cur ? { ...cur, codigo: e.target.value } : cur))}
                placeholder="Ex.: 100299"
                disabled={servicoSaving}
              />
            </div>
            <div className="md:col-span-4">
              <div className="text-xs text-slate-600 mb-1">Fonte</div>
              <input
                className="input"
                value={servicoEdit?.fonte || ""}
                onChange={(e) => setServicoEdit((cur) => (cur ? { ...cur, fonte: e.target.value } : cur))}
                placeholder="Ex.: SINAPI"
                disabled={servicoSaving}
              />
            </div>
            <div className="md:col-span-4">
              <div className="text-xs text-slate-600 mb-1">UND</div>
              <input
                className="input"
                value={servicoEdit?.und || ""}
                onChange={(e) => setServicoEdit((cur) => (cur ? { ...cur, und: e.target.value } : cur))}
                placeholder="Ex.: H"
                disabled={servicoSaving}
              />
            </div>
            <div className="md:col-span-12">
              <div className="text-xs text-slate-600 mb-1">Descrição</div>
              <input
                className="input"
                value={servicoEdit?.descricao || ""}
                onChange={(e) => setServicoEdit((cur) => (cur ? { ...cur, descricao: e.target.value } : cur))}
                placeholder="Descrição do serviço"
                disabled={servicoSaving}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded-lg border bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:text-slate-400"
              disabled={servicoSaving}
              onClick={() => {
                setModalServico(false);
                setServicoEdit(null);
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-60 inline-flex items-center gap-2"
              disabled={servicoSaving}
              onClick={salvarServico}
            >
              {servicoSaving ? <CircleDashed size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              Salvar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
