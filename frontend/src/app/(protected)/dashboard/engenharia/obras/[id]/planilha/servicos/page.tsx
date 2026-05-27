"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { PageLoadStatusBadge } from "@/components/PageLoadStatus";
import { Lock, Copy, Pencil, X, Check, XCircle } from "lucide-react";

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
  idParametros?: number | null;
  parametrosNome?: string;
};

type ColKey = "codigo" | "fonte" | "servico" | "composicao" | "acao";

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

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

export default function Page() {
  const router = useRouter();
  const params = useParams();
  const search = useSearchParams();

  const idObra = useMemo(() => Number((params as any)?.id || 0), [params]);
  const returnTo = search.get("returnTo");
  const planilhaIdParam = search.get("planilhaId");
  const codigoServicoParam = search.get("codigoServico");
  const planilhaIdFromQuery = useMemo(() => {
    const n = Number(planilhaIdParam || 0);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [planilhaIdParam]);
  const focusCodigo = useMemo(() => {
    const c = String(codigoServicoParam || "").trim().toUpperCase();
    return c ? c : null;
  }, [codigoServicoParam]);
  const safeReturnTo = useMemo(() => {
    const raw = String(returnTo || "").trim();
    const isExternal = raw.startsWith("//") || /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(raw) || /^[a-z][a-z0-9+.-]*:/i.test(raw);
    return raw && !isExternal ? raw : null;
  }, [returnTo]);
  const backHref = useMemo(() => safeReturnTo || `/dashboard/engenharia/obras/${idObra}/planilha`, [idObra, safeReturnTo]);
  const selfHref = useMemo(() => {
    const qs = new URLSearchParams();
    if (planilhaIdFromQuery) qs.set("planilhaId", String(planilhaIdFromQuery));
    qs.set("returnTo", backHref);
    return `/dashboard/engenharia/obras/${idObra}/planilha/servicos?${qs.toString()}`;
  }, [backHref, idObra, planilhaIdFromQuery]);

  const [loading, setLoading] = useState(false);
  const [bootLoading, setBootLoading] = useState(false);
  const [bootDone, setBootDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [planilhaId, setPlanilhaId] = useState<number | null>(null);
  const [versoes, setVersoes] = useState<VersaoRow[]>([]);
  const [rows, setRows] = useState<ValidacaoRow[]>([]);
  const [rowsTotal, setRowsTotal] = useState(0);
  const [rowsOffset, setRowsOffset] = useState(0);
  const [rowsHasMore, setRowsHasMore] = useState(false);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [obraNome, setObraNome] = useState<string>("");
  const [textFilter, setTextFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [fonteFilter, setFonteFilter] = useState<string>("");
  const [showColsCard, setShowColsCard] = useState(false);
  const [colWidths, setColWidths] = useState<Record<ColKey, number>>({
    codigo: 100,
    fonte: 90,
    servico: 520,
    composicao: 130,
    acao: 90,
  });
  const [colFixed, setColFixed] = useState<Record<ColKey, boolean>>({
    codigo: false,
    fonte: false,
    servico: false,
    composicao: false,
    acao: false,
  });
  const [composicoesSemServico, setComposicoesSemServico] = useState<{ total: number; codes: string[]; blankCount: number } | null>(null);
  const [copyForm, setCopyForm] = useState<{
    sourcePlanilhaId: number | null;
    targetPlanilhaId: number | null;
    codigoServico: string;
    replaceServico: boolean;
    replaceComposicao: boolean;
    insumosPrecoMode: "MANTER" | "SUBSTITUIR";
  }>({
    sourcePlanilhaId: null,
    targetPlanilhaId: null,
    codigoServico: "",
    replaceServico: false,
    replaceComposicao: false,
    insumosPrecoMode: "MANTER",
  });
  const [copyPreview, setCopyPreview] = useState<{
    existsServicoTarget: boolean;
    existsComposicaoTarget: boolean;
    diffs: Array<{ codigo: string; valorOrig: number; valorDest: number }>;
  } | null>(null);
  const [showCopyCard, setShowCopyCard] = useState(false);
  const [showNovoServicoCard, setShowNovoServicoCard] = useState(false);
  const [novoServicoForm, setNovoServicoForm] = useState<{ codigoServico: string; descricao: string; und: string }>({ codigoServico: "", descricao: "", und: "" });
  const [novoServicoLoading, setNovoServicoLoading] = useState(false);
  const planilhaTravada = useMemo(() => {
    const pid = planilhaIdFromQuery ?? planilhaId ?? null;
    if (!pid) return false;
    const v = versoes.find((x) => Number(x.idPlanilha) === Number(pid)) || null;
    return Boolean(v?.travado);
  }, [planilhaIdFromQuery, planilhaId, versoes]);

  async function authFetch(input: RequestInfo | URL, init?: RequestInit) {
    let token: string | null = null;
    try {
      token = localStorage.getItem("token");
    } catch {}
    const apiOrigin = String(process.env.NEXT_PUBLIC_API_URL || "")
      .trim()
      .replace(/\/$/, "");
    const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : String(input);
    const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : apiOrigin ? `${apiOrigin}${rawUrl.startsWith("/") ? "" : "/"}${rawUrl}` : rawUrl;

    const doFetch = async () =>
      fetch(url, {
        ...init,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(init?.headers || {}),
        },
        cache: "no-store",
      });

    let lastRes: Response | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await doFetch();
        lastRes = res;
        if (res.status !== 502 && res.status !== 503 && res.status !== 504) return res;
        if (attempt < 3) await new Promise((r) => window.setTimeout(r, attempt * 800));
      } catch (e: any) {
        const msg = String(e?.message || e || "");
        if (msg.toLowerCase().includes("failed to fetch")) {
          throw new Error(
            apiOrigin
              ? `Falha ao conectar no backend (${apiOrigin}). Verifique se NEXT_PUBLIC_API_URL está correto e se o backend (Render) está online.`
              : "Falha ao conectar. NEXT_PUBLIC_API_URL não configurada e a rota /api/v1/... não respondeu."
          );
        }
        throw e;
      }
    }
    return lastRes!;
  }

  const colWidthsKey = useMemo(() => {
    try {
      const raw = localStorage.getItem("user");
      const u = raw ? JSON.parse(raw) : null;
      const id = Number(u?.id);
      if (Number.isFinite(id) && id > 0) return `exp:servicos:col-widths:${id}`;
    } catch {}
    return "exp:servicos:col-widths";
  }, []);
  const colFixedKey = useMemo(() => {
    try {
      const raw = localStorage.getItem("user");
      const u = raw ? JSON.parse(raw) : null;
      const id = Number(u?.id);
      if (Number.isFinite(id) && id > 0) return `exp:servicos:col-fixed:${id}`;
    } catch {}
    return "exp:servicos:col-fixed";
  }, []);

  useEffect(() => {
    try {
      let raw = localStorage.getItem(colWidthsKey);
      if (!raw && colWidthsKey !== "exp:servicos:col-widths") {
        const legacy = localStorage.getItem("exp:servicos:col-widths");
        if (legacy) {
          localStorage.setItem(colWidthsKey, legacy);
          raw = legacy;
        }
      }
      if (!raw) return;
      const p = JSON.parse(raw) as any;
      const n = (v: any, fallback: number) => {
        const x = Number(v);
        return Number.isFinite(x) ? Math.max(10, Math.min(1200, Math.round(x))) : fallback;
      };
      setColWidths((cur) => ({
        codigo: n(p?.codigo, cur.codigo),
        fonte: n(p?.fonte, cur.fonte),
        servico: n(p?.servico, cur.servico),
        composicao: n(p?.composicao, cur.composicao),
        acao: n(p?.acao, cur.acao),
      }));
    } catch {}
  }, [colWidthsKey]);

  useEffect(() => {
    try {
      localStorage.setItem(colWidthsKey, JSON.stringify(colWidths));
    } catch {}
  }, [colWidths, colWidthsKey]);

  useEffect(() => {
    try {
      let raw = localStorage.getItem(colFixedKey);
      if (!raw && colFixedKey !== "exp:servicos:col-fixed") {
        const legacy = localStorage.getItem("exp:servicos:col-fixed");
        if (legacy) {
          localStorage.setItem(colFixedKey, legacy);
          raw = legacy;
        }
      }
      if (!raw) return;
      const p = JSON.parse(raw) as any;
      const b = (v: any) => Boolean(v);
      setColFixed((cur) => ({
        codigo: b(p?.codigo ?? cur.codigo),
        fonte: b(p?.fonte ?? cur.fonte),
        servico: b(p?.servico ?? cur.servico),
        composicao: b(p?.composicao ?? cur.composicao),
        acao: b(p?.acao ?? cur.acao),
      }));
    } catch {}
  }, [colFixedKey]);

  useEffect(() => {
    try {
      localStorage.setItem(colFixedKey, JSON.stringify(colFixed));
    } catch {}
  }, [colFixed, colFixedKey]);

  const colKeys = useMemo<ColKey[]>(() => ["codigo", "fonte", "servico", "composicao", "acao"], []);

  function setColWidthWithRedistribution(key: ColKey, nextWidth: number) {
    const min = 10;
    const next = Math.max(min, Math.min(1200, Math.round(Number(nextWidth || 0) || min)));
    setColWidths((prev) => {
      const before = prev[key];
      if (before === next) return prev;
      const out: Record<ColKey, number> = { ...prev, [key]: next };
      const delta = next - before;
      const adjustable = colKeys.filter((k) => k !== key && !colFixed[k]);
      if (!adjustable.length) return out;
      let remaining = -delta;
      let pool = adjustable.slice();
      let guard = 0;
      while (pool.length && guard < 12 && Math.abs(remaining) >= 1) {
        guard++;
        const sum = pool.reduce((s, k) => s + (out[k] || 0), 0);
        if (!(sum > 0)) break;
        let applied = 0;
        for (let i = 0; i < pool.length; i++) {
          const k = pool[i];
          const share = i === pool.length - 1 ? remaining - applied : Math.round((remaining * (out[k] || 0)) / sum);
          const candidate = out[k] + share;
          const clamped = Math.max(min, candidate);
          const actual = clamped - out[k];
          out[k] = clamped;
          applied += actual;
        }
        remaining -= applied;
        if (remaining < 0) pool = pool.filter((k) => out[k] > min);
        else break;
      }
      return out;
    });
  }

  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ codigoServico: string; fonte: string; servico: string; undHidden: string }>({
    codigoServico: "",
    fonte: "",
    servico: "",
    undHidden: "",
  });
  const fonteOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const f = String(r.fonte || "").trim().toUpperCase();
      if (f) set.add(f);
    }
    for (const extra of ["PRÓPRIO", "SINAPI", "SBC"]) set.add(extra);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  async function abrirEditarServico(codigo: string) {
    const code = String(codigo || "").trim().toUpperCase();
    if (!code) return;
    if (planilhaTravada) {
      setErr("Esta planilha está travada. Não é permitido editar serviços.");
      return;
    }
    const existing = rows.find((r) => String(r.codigoServico || "").trim().toUpperCase() === code) || null;
    if (existing?.und) {
      setEditErr(null);
      setEditForm({
        codigoServico: code,
        fonte: String(existing.fonte || "").trim().toUpperCase(),
        servico: String(existing.servico || "").trim(),
        undHidden: String(existing.und || "").trim().toUpperCase(),
      });
      setEditOpen(true);
      return;
    }
    try {
      setEditLoading(true);
      setEditErr(null);
      const qs = new URLSearchParams();
      const pid = planilhaIdFromQuery ?? planilhaId ?? null;
      if (pid) qs.set("planilhaId", String(pid));
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/servicos/${encodeURIComponent(code)}/meta?${qs.toString()}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar dados do serviço");
      const d = json.data || {};
      setEditForm({
        codigoServico: code,
        fonte: String(d?.fonte || "").trim().toUpperCase(),
        servico: String(d?.descricao || "").trim(),
        undHidden: String(d?.und || "").trim().toUpperCase(),
      });
      setEditOpen(true);
    } catch (e: any) {
      setEditErr(e?.message || "Erro ao carregar dados do serviço");
      setEditOpen(true);
    } finally {
      setEditLoading(false);
    }
  }

  async function salvarEdicaoServico() {
    const codigoServico = String(editForm.codigoServico || "").trim().toUpperCase();
    const descricao = String(editForm.servico || "").trim();
    const banco = String(editForm.fonte || "").trim().toUpperCase();
    const und = String(editForm.undHidden || "").trim().toUpperCase();
    if (!codigoServico) {
      setEditErr("Código inválido.");
      return;
    }
    if (!descricao) {
      setEditErr("Serviço (descrição) é obrigatório.");
      return;
    }
    if (!und) {
      setEditErr("UND do serviço não encontrada. Recarregue e tente novamente.");
      return;
    }
    try {
      setEditLoading(true);
      setEditErr(null);
      const qs = new URLSearchParams();
      const pid = planilhaIdFromQuery ?? planilhaId ?? null;
      if (pid) qs.set("planilhaId", String(pid));
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/servicos/novo?${qs.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigoServico, descricao, und, banco }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao salvar serviço");
      setOkMsg("Serviço atualizado.");
      setEditOpen(false);
      await carregarTudo();
    } catch (e: any) {
      setEditErr(e?.message || "Erro ao salvar serviço");
    } finally {
      setEditLoading(false);
    }
  }

  async function carregarPlanilhaAtual() {
    if (!idObra) return;
    try {
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha?view=versoes-info`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar versões");
      const obra = json?.data?.obra || null;
      setObraNome(String(obra?.nome || obra?.name || "").trim());
      const versoes = Array.isArray(json.data?.versoes) ? json.data.versoes : [];
      const mapped: VersaoRow[] = versoes
        .map((v: any) => ({
          idPlanilha: Number(v?.idPlanilha || 0),
          numeroVersao: Number(v?.numeroVersao || 0),
          nome: String(v?.nome || ""),
          atual: Boolean(v?.atual),
          travado: Boolean(v?.travado),
          idParametros: v?.idParametros == null ? null : Number(v.idParametros),
          parametrosNome: String(v?.parametrosNome || ""),
        }))
        .filter((v: VersaoRow) => Number.isFinite(v.idPlanilha) && v.idPlanilha > 0);
      setVersoes(mapped);
      const byQuery = planilhaIdFromQuery != null ? versoes.find((v: any) => Number(v?.idPlanilha || 0) === Number(planilhaIdFromQuery)) : null;
      const atual = versoes.find((v: any) => Boolean(v.atual)) || versoes[0] || null;
      const pick = byQuery || atual || null;
      const pid = pick?.idPlanilha != null ? Number(pick.idPlanilha) : null;
      setPlanilhaId(pid);
      setCopyForm((p) => {
        const targetPlanilhaId = pid != null && pid > 0 ? pid : null;
        const sourcePlanilhaId =
          p.sourcePlanilhaId != null
            ? p.sourcePlanilhaId
            : mapped.find((x) => x.idPlanilha !== targetPlanilhaId)?.idPlanilha ?? mapped[0]?.idPlanilha ?? null;
        return { ...p, targetPlanilhaId, sourcePlanilhaId };
      });
      return pid;
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar versões");
      setPlanilhaId(null);
      setVersoes([]);
      setObraNome("");
      return null;
    }
  }

  async function carregarValidacao(pid: number, opts?: { offset?: number; append?: boolean }) {
    const offset = opts?.offset != null ? Number(opts.offset) : 0;
    const append = Boolean(opts?.append);
    try {
      setRowsLoading(true);
      const qText = String(textFilter || "").trim();
      const fonteChoice = normalizeFilterChoice(fonteFilter);
      const statusChoice = normalizeFilterChoice(statusFilter);
      if (fonteChoice === "__NONE__" || statusChoice === "__NONE__") {
        setRowsTotal(0);
        setRowsOffset(0);
        setRowsHasMore(false);
        setRows([]);
        return;
      }
      const fonteParam = fonteChoice === "__SEM_FONTE__" ? "__SEM_FONTE__" : fonteChoice ? String(fonteChoice).trim().toUpperCase() : "";
      const statusNorm = normalizeHeader(statusChoice);
      const statusParam =
        !statusChoice ? "" : statusNorm.includes("com") && statusNorm.includes("compos") ? "COM" : statusNorm.includes("sem") && statusNorm.includes("compos") ? "SEM" : "";

      const qs = new URLSearchParams();
      qs.set("mode", "CATALOGO");
      qs.set("planilhaId", String(pid));
      qs.set("limit", "50");
      qs.set("offset", String(offset || 0));
      if (qText) qs.set("q", qText);
      if (fonteParam) qs.set("fonte", fonteParam);
      if (statusParam) qs.set("status", statusParam);
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/composicoes/validacao?${qs.toString()}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao validar serviços");
      const list = Array.isArray(json.data?.rows) ? (json.data.rows as any[]) : [];
      const mapped = list.map((r) => ({
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
      const total = Number(json.data?.total || 0);
      const nextOffset = json.data?.nextOffset != null ? Number(json.data.nextOffset) : offset + mapped.length;
      const hasMore = Boolean(json.data?.hasMore) || nextOffset < total;
      setRowsTotal(total);
      setRowsOffset(nextOffset);
      setRowsHasMore(hasMore);
      setRows((prev) => (append ? [...prev, ...mapped] : mapped));
    } catch (e: any) {
      setErr(e?.message || "Erro ao validar serviços");
      setRows([]);
      setRowsTotal(0);
      setRowsOffset(0);
      setRowsHasMore(false);
    } finally {
      setRowsLoading(false);
    }
  }

  async function carregarComposicoesSemServico(pid: number) {
    try {
      const qs = new URLSearchParams();
      qs.set("planilhaId", String(pid));
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/composicoes/sem-servico?${qs.toString()}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setComposicoesSemServico(null);
        return;
      }
      const codes = Array.isArray(json.data?.codes) ? json.data.codes : [];
      setComposicoesSemServico({
        total: Number(json.data?.total || 0),
        blankCount: Number(json.data?.blankCount || 0),
        codes: codes.map((c: any) => String(c || "").trim().toUpperCase()).filter(Boolean),
      });
    } catch {
      setComposicoesSemServico(null);
    }
  }

  async function carregarTudo() {
    if (!idObra) return;
    try {
      setLoading(true);
      setErr(null);
      setOkMsg(null);
      const pid = await carregarPlanilhaAtual();
      setRowsTotal(0);
      setRowsOffset(0);
      setRowsHasMore(false);
      await Promise.all([pid ? Promise.all([carregarValidacao(pid, { offset: 0, append: false }), carregarComposicoesSemServico(pid)]) : Promise.resolve()]);
    } finally {
      setLoading(false);
    }
  }

  const selectedVersao = useMemo(() => {
    const pid = planilhaId != null ? Number(planilhaId) : null;
    if (!pid) return null;
    return versoes.find((v) => Number(v.idPlanilha) === pid) || null;
  }, [planilhaId, versoes]);

  useEffect(() => {
    if (copyForm.insumosPrecoMode !== "MANTER") setCopyForm((p) => ({ ...p, insumosPrecoMode: "MANTER" }));
  }, [copyForm.insumosPrecoMode, copyForm.replaceComposicao]);

  useEffect(() => {
    if (!idObra) return;
    let cancelled = false;
    setBootLoading(true);
    setBootDone(false);
    void (async () => {
      try {
        await carregarTudo();
      } finally {
        if (!cancelled) {
          setBootLoading(false);
          setBootDone(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [idObra]);

  const filteredRows = useMemo(() => {
    let out = rows;
    if (focusCodigo) out = out.filter((r) => String(r.codigoServico || "").trim().toUpperCase() === focusCodigo);
    return out;
  }, [rows, focusCodigo]);

  const statusOptions = useMemo(() => ["todas", "nenhuma", "Com composição", "Sem composição"], []);

  const fonteOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const f = String(r.fonte || "").trim().toUpperCase();
      if (f) set.add(f);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  useEffect(() => {
    if (!focusCodigo) return;
    if (String(textFilter || "").trim()) return;
    setTextFilter(focusCodigo);
  }, [focusCodigo, textFilter]);

  useEffect(() => {
    if (!bootDone) return;
    const pid = planilhaIdFromQuery ?? planilhaId ?? null;
    if (!pid) return;
    const t = window.setTimeout(() => {
      void carregarValidacao(pid, { offset: 0, append: false });
    }, 250);
    return () => window.clearTimeout(t);
  }, [bootDone, planilhaIdFromQuery, planilhaId, textFilter, statusFilter, fonteFilter]);

  async function toggleTravaServico(codigoServico: string) {
    if (!idObra) return;
    if (planilhaTravada) {
      setErr("Esta planilha está travada. Não é permitido alterar travas.");
      return;
    }
    const code = String(codigoServico || "").trim().toUpperCase();
    if (!code) return;
    const row = rows.find((r) => String(r.codigoServico || "").trim().toUpperCase() === code) || null;
    if (row?.travadoPorCadeia) {
      setErr("Serviço travado em cadeia: destrave o elemento pai (planilha/item) antes.");
      return;
    }
    const locked = Boolean(row?.travado);
    const action = locked ? "DESTRAVAR_SERVICO" : "TRAVAR_SERVICO";
    if (!locked) {
      const ok = window.confirm(
        "Deseja travar este serviço?\n\nAo confirmar:\n- sua composição será travada\n- subcomposições serão travadas\n- insumos serão travados\n\nOs preços dos insumos da planilha continuarão editáveis caso a planilha não esteja travada."
      );
      if (!ok) return;
    }
    try {
      setLoading(true);
      setErr(null);
      setOkMsg(null);
      const pid = planilhaIdFromQuery ?? planilhaId ?? null;
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, idPlanilha: pid, codigoServico: code }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao alterar trava do serviço");
      setOkMsg(locked ? `Serviço destravado: ${code}` : `Serviço travado: ${code}`);
      await carregarTudo();
    } catch (e: any) {
      setErr(e?.message || "Erro ao alterar trava do serviço");
    } finally {
      setLoading(false);
    }
  }

  function tooltipTravaServico(r: ValidacaoRow) {
    if (planilhaTravada) return "Planilha travada: não é permitido alterar travas.";
    if (!r.travado) return "Duplo-clique para travar/destravar o serviço (com travas em cadeia).";
    if (r.travadoPorCadeia) {
      if (String(r.origemTipo || "").toUpperCase() === "PLANILHA") return `Travado em cadeia pela planilha #${String(r.origemChave || "").trim() || "?"}`;
      if (String(r.origemTipo || "").toUpperCase() === "ITEM") return "Travado em cadeia por um item da planilha";
      if (String(r.origemTipo || "").toUpperCase() === "SERVICO") return "Travado em cadeia pelo serviço";
      return "Travado em cadeia";
    }
    return "Travado manualmente";
  }

  async function duplicarServico(codigoServicoOrig: string) {
    if (!idObra) return;
    if (planilhaTravada) {
      setErr("Esta planilha está travada. Não é permitido duplicar serviços.");
      return;
    }
    const orig = String(codigoServicoOrig || "").trim().toUpperCase();
    if (!orig) return;
    const sugestao = `${orig}-DUP`;
    const entrada = window.prompt("Informe o novo código para o serviço duplicado:", sugestao);
    const codigoServicoNovo = String(entrada || "").trim().toUpperCase();
    if (!codigoServicoNovo) return;
    if (codigoServicoNovo === orig) {
      setErr("O código novo deve ser diferente do código de origem.");
      return;
    }
    const duplicarInsumos = window.confirm(
      "Duplicar insumos também?\n\n" +
        "- SIM: cria novos códigos de insumo (apenas os não-SINAPI/SBC) e ajusta a composição do novo serviço.\n" +
        "- NÃO: mantém os mesmos códigos de insumo na composição."
    );
    try {
      setLoading(true);
      setErr(null);
      setOkMsg(null);
      const qs = new URLSearchParams();
      const pid = planilhaIdFromQuery ?? planilhaId ?? null;
      if (pid) qs.set("planilhaId", String(pid));
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/servicos/duplicar?${qs.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigoServicoOrig: orig, codigoServicoNovo, duplicarInsumos }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao duplicar serviço");
      setOkMsg(`Serviço duplicado: ${orig} → ${codigoServicoNovo}`);
      await carregarTudo();
    } catch (e: any) {
      setErr(e?.message || "Erro ao duplicar serviço");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!bootDone || !focusCodigo) return;
    const id = `row-${focusCodigo}`;
    const t = setTimeout(() => {
      try {
        const el = document.getElementById(id);
        if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "center" });
      } catch {}
    }, 0);
    return () => clearTimeout(t);
  }, [bootDone, focusCodigo, filteredRows.length]);

  async function criarNovoServico() {
    if (planilhaTravada) {
      setErr("Esta planilha está travada. Não é permitido criar/editar serviços.");
      return;
    }
    const codigoServico = String(novoServicoForm.codigoServico || "").trim().toUpperCase();
    const descricao = String(novoServicoForm.descricao || "").trim();
    const und = String(novoServicoForm.und || "").trim();
    if (!codigoServico) {
      setErr("Código do serviço é obrigatório.");
      return;
    }
    if (!descricao) {
      setErr("Descrição do serviço é obrigatória.");
      return;
    }
    if (!und) {
      setErr("UND do serviço é obrigatória.");
      return;
    }
    try {
      setNovoServicoLoading(true);
      setErr(null);
      setOkMsg(null);
      const qs = new URLSearchParams();
      const effectivePid = planilhaIdFromQuery ?? planilhaId ?? null;
      if (effectivePid) qs.set("planilhaId", String(effectivePid));
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/servicos/novo?${qs.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigoServico, descricao, und }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao criar serviço no catálogo da planilha");
      setOkMsg("Serviço criado/atualizado no catálogo da planilha.");
      setNovoServicoForm({ codigoServico: "", descricao: "", und: "" });
      setShowNovoServicoCard(false);
      await carregarTudo();
    } catch (e: any) {
      setErr(e?.message || "Erro ao criar serviço no catálogo da planilha");
    } finally {
      setNovoServicoLoading(false);
    }
  }

  async function previewCopiar() {
    if (planilhaTravada) {
      setErr("Esta planilha está travada. Não é permitido copiar serviços para ela.");
      return;
    }
    if (!copyForm.sourcePlanilhaId || !copyForm.targetPlanilhaId || !copyForm.codigoServico.trim()) {
      setErr("Preencha origem, destino e código do serviço.");
      return;
    }
    try {
      setLoading(true);
      setErr(null);
      setOkMsg(null);
      setCopyPreview(null);
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/servicos/copiar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourcePlanilhaId: copyForm.sourcePlanilhaId,
          targetPlanilhaId: copyForm.targetPlanilhaId,
          codigoServico: copyForm.codigoServico,
          replaceServico: copyForm.replaceServico,
          replaceComposicao: copyForm.replaceComposicao,
          insumosPrecoMode: copyForm.insumosPrecoMode,
          dryRun: true,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro na prévia da cópia");
      const d = json.data || {};
      setCopyPreview({
        existsServicoTarget: Boolean(d.existsServicoTarget),
        existsComposicaoTarget: Boolean(d.existsComposicaoTarget),
        diffs: Array.isArray(d.diffs)
          ? d.diffs.map((x: any) => ({ codigo: String(x.codigo || ""), valorOrig: Number(x.valorOrig || 0), valorDest: Number(x.valorDest || 0) }))
          : [],
      });
    } catch (e: any) {
      setErr(e?.message || "Erro na prévia da cópia");
      setCopyPreview(null);
    } finally {
      setLoading(false);
    }
  }

  async function executarCopiar() {
    if (!copyForm.sourcePlanilhaId || !copyForm.targetPlanilhaId || !copyForm.codigoServico.trim()) {
      setErr("Preencha origem, destino e código do serviço.");
      return;
    }
    try {
      const warnings: string[] = [];
      warnings.push("Se a Fonte do destino for diferente, a cópia cria/atualiza o serviço na Fonte destino (impacta todas as planilhas que usam essa Fonte).");
      if (copyForm.replaceComposicao) warnings.push('Substituir composição pode sobrescrever a composição do serviço na Fonte destino (impacta todas as planilhas que usam essa Fonte).');
      if (copyForm.replaceServico) warnings.push("Substituir serviço no destino irá sobrescrever a linha do serviço na versão destino (quando já existir).");
      if (warnings.length) {
        const ok = window.confirm(`${warnings.join("\n\n")}\n\nDeseja continuar?`);
        if (!ok) return;
      }
      setLoading(true);
      setErr(null);
      setOkMsg(null);
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/servicos/copiar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourcePlanilhaId: copyForm.sourcePlanilhaId,
          targetPlanilhaId: copyForm.targetPlanilhaId,
          codigoServico: copyForm.codigoServico,
          replaceServico: copyForm.replaceServico,
          replaceComposicao: copyForm.replaceComposicao,
          insumosPrecoMode: copyForm.insumosPrecoMode,
          dryRun: false,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao copiar serviço");
      setOkMsg("Serviço copiado com sucesso.");
      setCopyPreview(null);
      await carregarTudo();
    } catch (e: any) {
      setErr(e?.message || "Erro ao copiar serviço");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl text-slate-900">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <PageLoadStatusBadge loading={bootLoading || loading} done={bootDone && !bootLoading && !loading} />
          <div className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
            <button className="hover:underline" type="button" onClick={() => router.push("/dashboard/engenharia")} title="Ir para Engenharia">
              Engenharia
            </button>
            <span aria-hidden="true">→</span>
            <button className="hover:underline" type="button" onClick={() => router.push("/dashboard/engenharia/obras")} title="Ir para Obras">
              Obras
            </button>
            <span aria-hidden="true">→</span>
            <button
              className="hover:underline text-blue-600"
              type="button"
              onClick={() => router.push(`/dashboard/engenharia/obras/${idObra}`)}
              title="Ir para a Obra"
            >
              {`Obra #${idObra}${String(obraNome || "").trim() ? ` - ${obraNome}` : ""}`}
            </button>
            <span aria-hidden="true">→</span>
            <button
              className="hover:underline"
              type="button"
              onClick={() => {
                const qs = new URLSearchParams();
                if (planilhaIdFromQuery) qs.set("planilhaId", String(planilhaIdFromQuery));
                qs.set("returnTo", selfHref);
                router.push(`/dashboard/engenharia/obras/${idObra}/planilha?${qs.toString()}`);
              }}
              title="Ir para Planilha orçamentária"
            >
              Planilha orçamentária
            </button>
            {selectedVersao?.idPlanilha ? (
              <>
                <span aria-hidden="true">→</span>
                <span className="text-blue-600">{`planilha #${selectedVersao.idPlanilha} - ${selectedVersao.nome || "—"}`}</span>
              </>
            ) : null}
            <span aria-hidden="true">→</span>
            <span>Serviços</span>
          </div>
          <h1 className="text-2xl font-semibold">Serviços cadastrados</h1>
          <div className="text-sm text-slate-600">Catálogo técnico de serviços da obra (por Fonte).</div>
          <div className="mt-1 text-sm text-slate-700">
            {selectedVersao?.idPlanilha ? <div className="font-semibold">{`Planilha: #${selectedVersao.idPlanilha} - ${selectedVersao.nome || "—"}`}</div> : null}
            {selectedVersao?.idParametros ? <div>{`Parâmetros: #${selectedVersao.idParametros} - ${selectedVersao.parametrosNome || "—"}`}</div> : null}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={() => {
              const qs = new URLSearchParams();
              if (planilhaIdFromQuery) qs.set("planilhaId", String(planilhaIdFromQuery));
              qs.set("returnTo", selfHref);
              router.push(`/dashboard/engenharia/obras/${idObra}/planilha?${qs.toString()}`);
            }}
            disabled={loading}
            title="Voltar para a tela Planilha orçamentária"
          >
            Planilha
          </button>
          <button
            className="rounded-lg border bg-blue-600 px-4 py-2 text-sm text-white border-blue-600 hover:bg-blue-500 disabled:opacity-60"
            type="button"
            onClick={() => router.push(selfHref)}
            disabled={loading}
            title="Abrir a tela de serviços da planilha selecionada"
          >
            Serviços
          </button>
          <button
            className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={() => {
              const qs = new URLSearchParams();
              if (planilhaIdFromQuery) qs.set("planilhaId", String(planilhaIdFromQuery));
              qs.set("returnTo", selfHref);
              router.push(`/dashboard/engenharia/obras/${idObra}/planilha/sinapi?${qs.toString()}`);
            }}
            disabled={loading}
            title="Abrir a tela SINAPI para importar/aplicar serviços e composições"
          >
            SINAPI
          </button>
          <button
            className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={() => {
              const qs = new URLSearchParams();
              if (planilhaIdFromQuery) qs.set("planilhaId", String(planilhaIdFromQuery));
              qs.set("returnTo", selfHref);
              router.push(`/dashboard/engenharia/obras/${idObra}/planilha/insumos?${qs.toString()}`);
            }}
            disabled={loading}
            title="Abrir a tela de Insumos consolidados da planilha selecionada"
          >
            Insumos
          </button>
          <button
            className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={() => router.push(backHref)}
            disabled={loading}
            title="Voltar para a tela anterior"
          >
            Voltar
          </button>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 flex-wrap">
        <button className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60" type="button" onClick={carregarTudo} disabled={loading} title="Recarregar dados da tela">
          Atualizar
        </button>
        <button
          className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
          type="button"
          onClick={() => setShowNovoServicoCard((v) => !v)}
          disabled={loading}
          title={showNovoServicoCard ? "Ocultar card de cadastro de serviço" : "Novo serviço (cria/atualiza no catálogo). Você pode digitar uma Fonte nova."}
        >
          Novo Serviço
        </button>
        <button
          className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
          type="button"
          onClick={() => setShowCopyCard((v) => !v)}
          disabled={loading}
          title={showCopyCard ? "Ocultar card de cópia entre planilhas (versões)" : "Exibir card de cópia entre planilhas (versões)"}
        >
          Copiar
        </button>
      </div>

      {okMsg ? <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{okMsg}</div> : null}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        Atenção: alterações aqui são compartilhadas. Se você alterar Serviço/Insumo/Composição da Fonte, muda em TODAS as planilhas que usam essa Fonte. Se você alterar um
        Parâmetro, muda em TODAS as planilhas que usam esse Parâmetro.
        <div className="mt-2">
          <div className="font-semibold">Para criar um serviço novo no catálogo da obra (Fonte):</div>
          <div className="mt-1">1 - Crie o serviço na Planilha (Adicionar linha);</div>
          <div>2 - Ou através do botão Novo Serviço.</div>
          <div>3 - Crie o serviço direto na composição.</div>
          <div className="mt-1">Informando o CÓDIGO/Fonte/descrição/UND.</div>
        </div>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}
      {focusCodigo ? (
        <div className="rounded-lg border-2 border-red-300 bg-red-50 p-3 text-sm text-red-900 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="font-semibold">{`ATENÇÃO: você está filtrado (FOCO) no serviço ${focusCodigo}`}</div>
            <div className="mt-1">A lista abaixo mostra somente este serviço.</div>
          </div>
          <button
            className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm hover:bg-red-100 disabled:opacity-60"
            type="button"
            disabled={loading}
            onClick={() => {
              const qs = new URLSearchParams();
              const effectivePid = planilhaIdFromQuery ?? planilhaId ?? null;
              if (effectivePid) qs.set("planilhaId", String(effectivePid));
              qs.set("returnTo", backHref);
              router.push(`/dashboard/engenharia/obras/${idObra}/planilha/servicos?${qs.toString()}`);
            }}
          >
            Limpar foco
          </button>
        </div>
      ) : null}
      {composicoesSemServico && (composicoesSemServico.total > 0 || composicoesSemServico.blankCount > 0) ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="font-semibold">Composições sem serviço no catálogo</div>
          <div className="mt-1">{composicoesSemServico.total} código(s) de composição existem em Composições, mas não existem em Serviços (catálogo da fonte).</div>
          {composicoesSemServico.total > 0 ? (
            <div className="mt-2 break-words">
              Códigos: {composicoesSemServico.codes.slice(0, 60).join(", ")}
              {composicoesSemServico.codes.length > 60 ? ` (+${composicoesSemServico.codes.length - 60})` : ""}
            </div>
          ) : null}
        </div>
      ) : null}

      {showNovoServicoCard ? (
        <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
          <div>
            <div className="text-lg font-semibold">Novo serviço (catálogo da obra)</div>
            <div className="text-sm text-slate-600">Cria/atualiza um serviço no catálogo da obra (por Fonte).</div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
            <div className="md:col-span-3 space-y-1">
              <div className="text-sm text-slate-600">Código</div>
              <input
                className="input bg-white"
                value={novoServicoForm.codigoServico}
                onChange={(e) => setNovoServicoForm((p) => ({ ...p, codigoServico: e.target.value.toUpperCase() }))}
                placeholder="Ex: COMP.UPA.155"
                disabled={loading || novoServicoLoading}
              />
            </div>
            <div className="md:col-span-7 space-y-1">
              <div className="text-sm text-slate-600">Descrição</div>
              <input
                className="input bg-white"
                value={novoServicoForm.descricao}
                onChange={(e) => setNovoServicoForm((p) => ({ ...p, descricao: e.target.value }))}
                placeholder="Ex: Execução de alvenaria..."
                disabled={loading || novoServicoLoading}
              />
            </div>
            <div className="md:col-span-2 space-y-1">
              <div className="text-sm text-slate-600">UND</div>
              <input
                className="input bg-white"
                value={novoServicoForm.und}
                onChange={(e) => setNovoServicoForm((p) => ({ ...p, und: e.target.value.toUpperCase() }))}
                placeholder="Ex: m²"
                disabled={loading || novoServicoLoading}
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
              type="button"
              onClick={() => {
                setNovoServicoForm({ codigoServico: "", descricao: "", und: "" });
                setShowNovoServicoCard(false);
              }}
              disabled={loading || novoServicoLoading}
            >
              Cancelar
            </button>
            <button
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-60"
              type="button"
              onClick={criarNovoServico}
              disabled={loading || novoServicoLoading}
            >
              Salvar
            </button>
          </div>
        </section>
      ) : null}

      {showCopyCard ? (
        <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div>
          <div className="text-lg font-semibold">Copiar serviço/composição entre planilhas (versões)</div>
          <div className="text-sm text-slate-600">Copia o serviço entre versões. Se a Fonte do destino for diferente, o sistema também pode copiar o serviço e a composição para a Fonte destino.</div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-4 space-y-1">
            <div className="text-sm text-slate-600">Origem (versão)</div>
            <select
              className="input bg-white"
              value={copyForm.sourcePlanilhaId ?? ""}
              onChange={(e) => setCopyForm((p) => ({ ...p, sourcePlanilhaId: e.target.value ? Number(e.target.value) : null }))}
              disabled={loading}
              title="Versão de origem: de onde o serviço/composição será copiado"
            >
              <option value="">(selecione)</option>
              {versoes.map((v) => (
                <option key={v.idPlanilha} value={v.idPlanilha}>
                  #{v.idPlanilha} — Versão {v.numeroVersao} {v.atual ? "(atual)" : ""} {v.nome ? `— ${v.nome}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-4 space-y-1">
            <div className="text-sm font-semibold text-slate-800">Destino (versão)</div>
            <select
              className="input bg-white text-base font-semibold"
              value={copyForm.targetPlanilhaId ?? ""}
              onChange={(e) => setCopyForm((p) => ({ ...p, targetPlanilhaId: e.target.value ? Number(e.target.value) : null }))}
              disabled={loading}
              title="Versão de destino: para onde o serviço/composição será copiado"
            >
              <option value="">(selecione)</option>
              {versoes.map((v) => (
                <option key={v.idPlanilha} value={v.idPlanilha}>
                  #{v.idPlanilha} — Versão {v.numeroVersao} {v.atual ? "(atual)" : ""} {v.nome ? `— ${v.nome}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-4 space-y-1">
            <div className="text-sm text-slate-600">Código do serviço</div>
            <input
              className="input bg-white"
              value={copyForm.codigoServico}
              onChange={(e) => setCopyForm((p) => ({ ...p, codigoServico: e.target.value.toUpperCase() }))}
              placeholder="Ex: 100309"
              disabled={loading}
              title="Código do serviço no catálogo (ex.: SINAPI/SBC/Próprio)"
            />
          </div>

          <div className="md:col-span-12 flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={copyForm.replaceServico}
                onChange={(e) => setCopyForm((p) => ({ ...p, replaceServico: Boolean(e.target.checked) }))}
                disabled={loading}
                title="Se marcado, sobrescreve a linha do serviço na versão destino quando já existir."
              />
              <span>Substituir serviço no destino</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={copyForm.replaceComposicao}
                onChange={(e) => setCopyForm((p) => ({ ...p, replaceComposicao: Boolean(e.target.checked) }))}
                disabled={loading}
                title="Quando marcado e a Fonte do destino for diferente, a composição é copiada mesmo que já exista na Fonte destino (sobrescreve)."
              />
              <span>Substituir composição no destino</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="insumosPrecoMode"
                checked
                onChange={() => null}
                disabled
                title="Preços/itens de composição são geridos na Fonte."
              />
              <span className="text-slate-500">Manter preço de insumos do destino (padrão)</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="insumosPrecoMode"
                checked={false}
                onChange={() => null}
                disabled
                title="Preços/itens de composição são geridos na Fonte."
              />
              <span className="text-slate-500">Substituir preço de insumos pelo da origem</span>
            </label>
          </div>

          <div className="md:col-span-12 flex items-center justify-end gap-2 flex-wrap">
            <button
              className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
              type="button"
              onClick={previewCopiar}
              disabled={loading}
              title="Verificar o que será copiado e se já existe no destino"
            >
              Prévia
            </button>
            <button
              className="rounded-lg border bg-blue-600 px-4 py-2 text-sm text-white border-blue-600 hover:bg-blue-500 disabled:opacity-60"
              type="button"
              onClick={executarCopiar}
              disabled={loading}
              title="Executar a cópia do serviço/composição"
            >
              Copiar
            </button>
          </div>
        </div>

        {copyPreview ? (
          <div className="rounded-lg border bg-slate-50 p-3 text-sm text-slate-800 space-y-2">
            <div>
              Destino já tem serviço: {copyPreview.existsServicoTarget ? "Sim" : "Não"} • Destino já tem composição: {copyPreview.existsComposicaoTarget ? "Sim" : "Não"}
            </div>
            <div>Observação: a composição é compartilhada pela Fonte. Copiar composição só é relevante quando a Fonte do destino é diferente.</div>
            {copyPreview.diffs.length ? (
              <div className="overflow-auto">
                <table className="min-w-[600px] w-full text-xs">
                  <thead className="text-left text-slate-600">
                    <tr>
                      <th className="py-1 pr-3">INSUMO</th>
                      <th className="py-1 pr-3 text-right">ORIGEM</th>
                      <th className="py-1 pr-3 text-right">DESTINO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {copyPreview.diffs.map((d) => (
                      <tr key={d.codigo} className="border-t">
                        <td className="py-1 pr-3">{d.codigo}</td>
                        <td className="py-1 pr-3 text-right">{moeda(d.valorOrig)}</td>
                        <td className="py-1 pr-3 text-right">{moeda(d.valorDest)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
      ) : null}

      <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-lg font-semibold">Serviços cadastrados</div>
            <div className="text-sm text-slate-600">
              Lista os serviços cadastrados e permite abrir a composição no duplo clique. O carregamento é feito em páginas (50 de cada vez).
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
              type="button"
              onClick={() => setShowColsCard((v) => !v)}
              disabled={loading}
              title={showColsCard ? "Ocultar configurações de colunas" : "Exibir configurações de colunas"}
            >
              Colunas
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <div className="text-slate-500">
            Mostrando: {filteredRows.length} (total: {rowsTotal})
          </div>
          {focusCodigo ? (
            <button
              className="rounded border-2 border-red-300 bg-red-50 px-2 py-1 text-xs font-semibold text-red-900 hover:bg-red-100 disabled:opacity-60"
              type="button"
              onClick={() => router.push(selfHref)}
              disabled={loading}
              title="Você está filtrado (foco) em um serviço específico. Clique para limpar."
            >
              {`FOCO ATIVO: ${focusCodigo} (clique para limpar)`}
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap lg:flex-nowrap items-end gap-2">
          <label className="space-y-1" style={{ width: "360px" }} title="Filtra a lista por código, fonte ou serviço (texto livre)">
            <div className="text-xs text-slate-500">Filtrar por código, fonte ou serviço</div>
            <input
              className="input bg-white w-full"
              value={textFilter}
              onChange={(e) => setTextFilter(e.target.value)}
              placeholder="Digite para filtrar…"
              disabled={loading}
            />
          </label>
          <label className="space-y-1" style={{ width: "170px" }} title="Filtra por status de composição (selecione ou digite)">
            <div className="text-xs text-slate-500">Status</div>
            <input
              className="input bg-white w-full"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              placeholder="todas"
              list="exp-servicos-status-options"
              disabled={loading}
            />
            <datalist id="exp-servicos-status-options">
              {statusOptions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>
          <label className="space-y-1" style={{ width: "170px" }} title="Filtra a lista pela fonte (selecione ou digite)">
            <div className="text-xs text-slate-500">Fonte</div>
            <input
              className="input bg-white w-full"
              value={fonteFilter}
              onChange={(e) => setFonteFilter(e.target.value)}
              placeholder="todas"
              list="exp-servicos-fonte-options"
              disabled={loading}
            />
            <datalist id="exp-servicos-fonte-options">
              <option value="todas" />
              <option value="nenhuma" />
              <option value="sem fonte" />
              {fonteOptions.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </label>
        </div>

        {showColsCard ? (
          <div className="rounded-lg border bg-slate-50 p-3 text-xs">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-sm font-semibold text-slate-800">Largura das colunas (px)</div>
              <button className="rounded-lg border bg-white px-3 py-1.5 text-sm hover:bg-slate-50" type="button" onClick={() => setShowColsCard(false)} title="Ocultar">
                Ocultar
              </button>
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
              {[
                { key: "codigo", label: "CÓDIGO" },
                { key: "fonte", label: "FONTE" },
                { key: "servico", label: "SERVIÇO" },
                { key: "composicao", label: "STATUS" },
                { key: "acao", label: "AÇÃO" },
              ].map((c) => (
                <div key={c.key} className="flex items-center justify-between gap-2 rounded border bg-white px-2 py-1.5">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={Boolean(colFixed[c.key as ColKey])}
                      onChange={(e) => setColFixed((p) => ({ ...p, [c.key]: Boolean(e.target.checked) } as any))}
                      title="Fixar largura desta coluna"
                      disabled={loading}
                    />
                    <div className="font-medium text-slate-700">{c.label}</div>
                  </div>
                  <input
                    className="input bg-white w-[92px]"
                    type="number"
                    min={10}
                    max={1200}
                    value={(colWidths as any)[c.key]}
                    onChange={(e) => {
                      const v = Number(e.target.value || 0);
                      const next = Number.isFinite(v) ? Math.max(10, Math.min(1200, Math.round(v))) : 120;
                      setColWidthWithRedistribution(c.key as ColKey, next);
                    }}
                    title="Largura (px)"
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="overflow-auto">
          <table className="min-w-[1180px] w-full text-xs" style={{ tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: `${colWidths.codigo}px` }} />
              <col style={{ width: `${colWidths.fonte}px` }} />
              <col style={{ width: `${colWidths.servico}px` }} />
              <col style={{ width: `${colWidths.composicao}px` }} />
              <col style={{ width: `${colWidths.acao}px` }} />
            </colgroup>
            <thead className="bg-slate-50 text-left text-slate-700">
              <tr>
                <th className="px-2 py-1.5" style={{ width: `${colWidths.codigo}px` }}>
                  CÓDIGO
                </th>
                <th className="px-2 py-1.5" style={{ width: `${colWidths.fonte}px` }}>
                  FONTE
                </th>
                <th className="px-2 py-1.5" style={{ width: `${colWidths.servico}px` }}>
                  SERVIÇO
                </th>
                <th className="px-2 py-1.5 text-right" style={{ width: `${colWidths.composicao}px` }}>
                  STATUS
                </th>
                <th className="px-2 py-1.5" style={{ width: `${colWidths.acao}px` }}>
                  Ação
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr
                  key={r.codigoServico}
                  id={`row-${String(r.codigoServico || "").trim().toUpperCase()}`}
                  className={`border-t ${focusCodigo && String(r.codigoServico || "").trim().toUpperCase() === focusCodigo ? "bg-red-50" : ""}`}
                  onDoubleClick={() => {
                    const code = String(r.codigoServico || "").trim();
                    if (!code) return;
                    const qs = new URLSearchParams();
                    if (planilhaIdFromQuery) qs.set("planilhaId", String(planilhaIdFromQuery));
                    qs.set("returnTo", selfHref);
                    router.push(`/dashboard/engenharia/obras/${idObra}/planilha/servicos/${encodeURIComponent(code)}?${qs.toString()}`);
                  }}
                >
                  <td className="px-2 py-1.5 font-medium" style={{ width: `${colWidths.codigo}px` }}>
                    {r.codigoServico || "—"}
                  </td>
                  <td className="px-2 py-1.5" style={{ width: `${colWidths.fonte}px` }}>
                    {r.fonte || "—"}
                  </td>
                  <td className="px-2 py-1.5" style={{ width: `${colWidths.servico}px` }}>
                    {r.servico || "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right" style={{ width: `${colWidths.composicao}px` }}>
                    {(() => {
                      const has = Number(r.qtdItens || 0) > 0;
                      const total = Number(r.totalComposicao || 0);
                      const title = has ? `Composição cadastrada (${Number(r.qtdItens || 0)} itens) | Total base: ${moeda(total)}` : "Sem composição cadastrada";
                      return (
                        <span title={title} className="inline-flex items-center justify-end w-full">
                          {has ? <Check className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-2 py-1.5" style={{ width: `${colWidths.acao}px` }}>
                    <div className="flex items-center gap-1">
                      <button
                        className={`inline-flex items-center justify-center rounded border px-2 py-1.5 text-xs ${
                          r.travado ? "bg-slate-100 text-slate-700" : "bg-white text-slate-700 hover:bg-slate-50"
                        } disabled:opacity-60`}
                        type="button"
                        onDoubleClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleTravaServico(r.codigoServico);
                        }}
                        disabled={loading || planilhaTravada || Boolean(r.travadoPorCadeia)}
                        title={tooltipTravaServico(r)}
                      >
                        <Lock className={`h-4 w-4 ${r.travado ? "" : "opacity-30"} ${r.travadoPorCadeia ? "opacity-40" : ""}`} />
                      </button>
                      <button
                        className="inline-flex items-center justify-center rounded border bg-white px-2 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-60"
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          duplicarServico(r.codigoServico);
                        }}
                        disabled={loading || planilhaTravada}
                        title={
                          planilhaTravada ? "Planilha travada: não é permitido duplicar serviços." : "Duplicar serviço (copia serviço e composição; opcionalmente duplica insumos manuais)."
                        }
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      <button
                        className="inline-flex items-center justify-center rounded border bg-white px-2 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-60"
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          abrirEditarServico(r.codigoServico);
                        }}
                        disabled={loading || planilhaTravada || Boolean(r.travado) || Boolean(r.travadoPorCadeia)}
                        title={
                          planilhaTravada
                            ? "Planilha travada: não é permitido editar serviços."
                            : r.travadoPorCadeia
                              ? "Serviço travado em cadeia: não é permitido editar."
                              : r.travado
                                ? "Serviço travado: não é permitido editar."
                                : "Editar serviço (abre um card nesta tela)."
                        }
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filteredRows.length ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                    Sem dados.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
          <div>
            {rowsTotal > 0 ? `Carregado: ${rows.length} / ${rowsTotal}` : rows.length ? `Carregado: ${rows.length}` : ""}
          </div>
          {rowsHasMore ? (
            <button
              className="rounded border bg-white px-3 py-1.5 hover:bg-slate-50 disabled:opacity-60"
              type="button"
              onClick={() => {
                const pid = planilhaIdFromQuery ?? planilhaId ?? null;
                if (!pid) return;
                void carregarValidacao(pid, { offset: rowsOffset, append: true });
              }}
              disabled={loading || rowsLoading}
              title="Carregar mais 50 itens"
            >
              {rowsLoading ? "Carregando..." : "Carregar mais (50)"}
            </button>
          ) : null}
        </div>
      </section>

      {editOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl overflow-hidden rounded-xl border bg-white shadow-sm">
            <div className="flex items-start justify-between gap-3 border-b bg-slate-50 p-4">
              <div>
                <div className="text-lg font-semibold">Editar serviço</div>
              </div>
              <button
                className="rounded border bg-white p-2 hover:bg-slate-50 disabled:opacity-60"
                type="button"
                onClick={() => setEditOpen(false)}
                disabled={editLoading}
                title="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 p-4">
              {editErr ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{editErr}</div> : null}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="space-y-1">
                  <div className="text-xs text-slate-500">CÓDIGO</div>
                  <input className="input bg-white w-full" value={editForm.codigoServico} disabled title="Código não é alterável aqui. Use Duplicar para gerar um novo código." />
                </label>
                <label className="space-y-1">
                  <div className="text-xs text-slate-500">FONTE</div>
                  <input
                    className="input bg-white w-full"
                    list="servicos-fonte-options"
                    value={editForm.fonte}
                    onChange={(e) => setEditForm((p) => ({ ...p, fonte: e.target.value }))}
                    disabled={editLoading}
                    placeholder="Ex.: SBC, SINAPI"
                  />
                </label>
                <label className="space-y-1 sm:col-span-2">
                  <div className="text-xs text-slate-500">SERVIÇO</div>
                  <input
                    className="input bg-white w-full"
                    value={editForm.servico}
                    onChange={(e) => setEditForm((p) => ({ ...p, servico: e.target.value }))}
                    disabled={editLoading}
                    placeholder="Descrição do serviço"
                  />
                </label>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60" type="button" onClick={() => setEditOpen(false)} disabled={editLoading}>
                  Cancelar
                </button>
                <button
                  className="rounded-lg border border-blue-600 bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-60"
                  type="button"
                  onClick={() => salvarEdicaoServico()}
                  disabled={editLoading}
                  title="Salvar alterações"
                >
                  Salvar
                </button>
              </div>
            </div>
            <datalist id="servicos-fonte-options">
              {fonteOptions.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </div>
        </div>
      ) : null}
    </div>
  );
}
