"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

type ValidacaoRow = {
  item: string;
  codigoServico: string;
  servico: string;
  totalPlanilha: number;
  totalComposicao: number;
  diff: number;
  status: "SEM_COMPOSICAO" | "DIVERGENTE" | "OK";
  qtdItens: number;
};

type RefRow = { codigo: string; tipo: string; definida: boolean };
type VersaoRow = { idPlanilha: number; numeroVersao: number; nome: string; atual: boolean };

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function Page() {
  const router = useRouter();
  const params = useParams();
  const search = useSearchParams();

  const idObra = useMemo(() => Number((params as any)?.id || 0), [params]);
  const returnTo = search.get("returnTo");
  const planilhaIdParam = search.get("planilhaId");
  const planilhaIdFromQuery = useMemo(() => {
    const n = Number(planilhaIdParam || 0);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [planilhaIdParam]);
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
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [planilhaId, setPlanilhaId] = useState<number | null>(null);
  const [versoes, setVersoes] = useState<VersaoRow[]>([]);
  const [rows, setRows] = useState<ValidacaoRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<{ OK: boolean; SEM_COMPOSICAO: boolean; DIVERGENTE: boolean }>({
    OK: true,
    SEM_COMPOSICAO: true,
    DIVERGENTE: true,
  });
  const [refs, setRefs] = useState<RefRow[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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

  async function authFetch(input: RequestInfo | URL, init?: RequestInit) {
    let token: string | null = null;
    try {
      token = localStorage.getItem("token");
    } catch {}
    return fetch(input, {
      ...init,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers || {}),
      },
      cache: "no-store",
    });
  }

  async function carregarPlanilhaAtual() {
    if (!idObra) return;
    try {
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha?view=versoes`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar versões");
      const versoes = Array.isArray(json.data?.versoes) ? json.data.versoes : [];
      const mapped: VersaoRow[] = versoes
        .map((v: any) => ({
          idPlanilha: Number(v?.idPlanilha || 0),
          numeroVersao: Number(v?.numeroVersao || 0),
          nome: String(v?.nome || ""),
          atual: Boolean(v?.atual),
        }))
        .filter((v) => Number.isFinite(v.idPlanilha) && v.idPlanilha > 0);
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
      return null;
    }
  }

  async function carregarValidacao(pid: number) {
    try {
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/composicoes/validacao?planilhaId=${pid}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao validar serviços");
      const list = Array.isArray(json.data?.rows) ? (json.data.rows as any[]) : [];
      setRows(
        list.map((r) => ({
          item: String(r.item || "").trim(),
          codigoServico: String(r.codigoServico || "").trim().toUpperCase(),
          servico: String(r.servico || ""),
          totalPlanilha: Number(r.totalPlanilha || 0),
          totalComposicao: Number(r.totalComposicao || 0),
          diff: Number(r.diff || 0),
          status: String(r.status || "OK") as any,
          qtdItens: Number(r.qtdItens || 0),
        }))
      );
    } catch (e: any) {
      setErr(e?.message || "Erro ao validar serviços");
      setRows([]);
    }
  }

  async function carregarReferencias() {
    try {
      const qs = new URLSearchParams();
      if (planilhaIdFromQuery) qs.set("planilhaId", String(planilhaIdFromQuery));
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/composicoes/referencias?${qs.toString()}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar referências");
      const list = Array.isArray(json.data?.referencias) ? (json.data.referencias as any[]) : [];
      setRefs(
        list.map((r) => ({
          codigo: String(r.codigo || "").trim().toUpperCase(),
          tipo: String(r.tipo || ""),
          definida: Boolean(r.definida),
        }))
      );
    } catch {
      setRefs([]);
    }
  }

  async function carregarTudo() {
    if (!idObra) return;
    try {
      setLoading(true);
      setErr(null);
      setOkMsg(null);
      const pid = await carregarPlanilhaAtual();
      await carregarReferencias();
      if (pid) await carregarValidacao(pid);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarTudo();
  }, [idObra]);

  const filteredRows = useMemo(() => rows.filter((r) => Boolean(statusFilter[r.status])), [rows, statusFilter]);

  function baixarModeloComposicoesCsv() {
    const sep = "\t";
    const lines = [
      ["Serviço", "tipo", "codigo", "banco", "descricao", "und", "quantidade", "Valor Unit"].join(sep),
      ["SER-0001", "Insumo", "INS-0001", "SINAPI", "Cimento CP-II", "kg", "100", "10,50"].join(sep),
      ["SER-0001", "Composição Auxiliar", "AUX-0001", "SBC", "Argamassa (auxiliar)", "m³", "0,20", "350,00"].join(sep),
      ["SER-0001", "Composição", "COMP-0001", "Próprio", "Concreto usinado (composição)", "m³", "1", "0"].join(sep),
    ];
    const csv = `${lines.join("\n")}\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `composicoes_obra_${idObra}_modelo.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function importarComposicoesCsv(file: File) {
    try {
      setLoading(true);
      setErr(null);
      setOkMsg(null);
      const form = new FormData();
      form.append("file", file);
      const qs = new URLSearchParams();
      if (planilhaIdFromQuery) qs.set("planilhaId", String(planilhaIdFromQuery));
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/composicoes/importar-csv?${qs.toString()}`, { method: "POST", body: form });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao importar composições (CSV)");
      await carregarTudo();
    } catch (e: any) {
      setErr(e?.message || "Erro ao importar composições (CSV)");
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function previewCopiar() {
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
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao copiar serviço/composição");
      setOkMsg("Serviço/composição copiados com sucesso.");
      setCopyPreview(null);
      await carregarTudo();
    } catch (e: any) {
      setErr(e?.message || "Erro ao copiar serviço/composição");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl text-slate-900">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs text-slate-500">Engenharia → Obras → Obra selecionada → Planilha orçamentária → Serviços</div>
          <h1 className="text-2xl font-semibold">Serviços — Obra #{idObra}</h1>
          <div className="text-sm text-slate-600">Lista e verificação dos serviços da planilha selecionada (versão).</div>
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
          >
            Planilha
          </button>
          <button
            className="rounded-lg border bg-blue-600 px-4 py-2 text-sm text-white border-blue-600 hover:bg-blue-500 disabled:opacity-60"
            type="button"
            onClick={() => router.push(selfHref)}
            disabled={loading}
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
          >
            Insumos
          </button>
          <button
            className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={() => router.push(backHref)}
            disabled={loading}
          >
            Voltar
          </button>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 flex-wrap">
        <button className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60" type="button" onClick={carregarTudo} disabled={loading}>
          Atualizar
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = (e.target.files || [])[0] || null;
            if (f) importarComposicoesCsv(f);
          }}
        />
        <button className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60" type="button" onClick={() => fileInputRef.current?.click()} disabled={loading}>
          Importar CSV (composições)
        </button>
        <button className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60" type="button" onClick={baixarModeloComposicoesCsv} disabled={loading}>
          Modelo CSV (composições)
        </button>
      </div>

      {okMsg ? <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{okMsg}</div> : null}
      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div>
          <div className="text-lg font-semibold">Copiar serviço/composição entre planilhas (versões)</div>
          <div className="text-sm text-slate-600">Copia a linha do serviço (quando necessário) e os itens da composição. Bloqueia se houver insumo com descrição/unidade diferente no destino.</div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-4 space-y-1">
            <div className="text-sm text-slate-600">Origem (versão)</div>
            <select
              className="input bg-white"
              value={copyForm.sourcePlanilhaId ?? ""}
              onChange={(e) => setCopyForm((p) => ({ ...p, sourcePlanilhaId: e.target.value ? Number(e.target.value) : null }))}
              disabled={loading}
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
            <div className="text-sm text-slate-600">Destino (versão)</div>
            <select
              className="input bg-white"
              value={copyForm.targetPlanilhaId ?? ""}
              onChange={(e) => setCopyForm((p) => ({ ...p, targetPlanilhaId: e.target.value ? Number(e.target.value) : null }))}
              disabled={loading}
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
            />
          </div>

          <div className="md:col-span-12 flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={copyForm.replaceServico} onChange={(e) => setCopyForm((p) => ({ ...p, replaceServico: Boolean(e.target.checked) }))} disabled={loading} />
              <span>Substituir serviço no destino</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={copyForm.replaceComposicao} onChange={(e) => setCopyForm((p) => ({ ...p, replaceComposicao: Boolean(e.target.checked) }))} disabled={loading} />
              <span>Substituir composição no destino</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="insumosPrecoMode"
                checked={copyForm.insumosPrecoMode === "MANTER"}
                onChange={() => setCopyForm((p) => ({ ...p, insumosPrecoMode: "MANTER" }))}
                disabled={loading}
              />
              <span>Manter preço de insumos do destino (padrão)</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="insumosPrecoMode"
                checked={copyForm.insumosPrecoMode === "SUBSTITUIR"}
                onChange={() => setCopyForm((p) => ({ ...p, insumosPrecoMode: "SUBSTITUIR" }))}
                disabled={loading}
              />
              <span>Substituir preço de insumos pelo da origem</span>
            </label>
          </div>

          <div className="md:col-span-12 flex items-center justify-end gap-2 flex-wrap">
            <button className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60" type="button" onClick={previewCopiar} disabled={loading}>
              Prévia
            </button>
            <button
              className="rounded-lg border bg-blue-600 px-4 py-2 text-sm text-white border-blue-600 hover:bg-blue-500 disabled:opacity-60"
              type="button"
              onClick={executarCopiar}
              disabled={loading}
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
            <div>Conflitos de preço (amostra): {copyPreview.diffs.length ? `${copyPreview.diffs.length} item(ns)` : "nenhum"}</div>
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

      <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-lg font-semibold">Serviços da planilha (verificação)</div>
            <div className="text-sm text-slate-600">Marca serviços sem composição e serviços com total divergente da planilha.</div>
          </div>
          <div className="text-sm text-slate-600">Planilha: {planilhaId ? `#${planilhaId}` : "—"}</div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={statusFilter.SEM_COMPOSICAO}
              onChange={(e) => setStatusFilter((p) => ({ ...p, SEM_COMPOSICAO: Boolean(e.target.checked) }))}
            />
            <span className="text-slate-700">Sem composição</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={statusFilter.DIVERGENTE} onChange={(e) => setStatusFilter((p) => ({ ...p, DIVERGENTE: Boolean(e.target.checked) }))} />
            <span className="text-slate-700">Divergente</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={statusFilter.OK} onChange={(e) => setStatusFilter((p) => ({ ...p, OK: Boolean(e.target.checked) }))} />
            <span className="text-slate-700">OK</span>
          </label>
          <div className="text-slate-500">
            Mostrando: {filteredRows.length} / {rows.length}
          </div>
        </div>

        <div className="overflow-auto">
          <table className="min-w-[1180px] w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-700">
              <tr>
                <th className="px-3 py-2">ITEM</th>
                <th className="px-3 py-2">CÓDIGO</th>
                <th className="px-3 py-2">SERVIÇO</th>
                <th className="px-3 py-2 text-right">PLANILHA</th>
                <th className="px-3 py-2 text-right">COMPOSIÇÃO</th>
                <th className="px-3 py-2 text-right">DIF.</th>
                <th className="px-3 py-2">STATUS</th>
                <th className="px-3 py-2">Ação</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.codigoServico} className="border-t">
                  <td className="px-3 py-2 font-medium">{r.item || "—"}</td>
                  <td className="px-3 py-2 font-medium">{r.codigoServico}</td>
                  <td className="px-3 py-2">{r.servico}</td>
                  <td className="px-3 py-2 text-right">{moeda(Number(r.totalPlanilha || 0))}</td>
                  <td className="px-3 py-2 text-right">{moeda(Number(r.totalComposicao || 0))}</td>
                  <td className="px-3 py-2 text-right">{moeda(Number(r.diff || 0))}</td>
                  <td className="px-3 py-2">
                    {r.status === "OK" ? (
                      <span className="rounded border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">OK</span>
                    ) : r.status === "SEM_COMPOSICAO" ? (
                      <span className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Sem composição</span>
                    ) : (
                      <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">Divergente</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      className="rounded border bg-white px-3 py-1.5 text-xs hover:bg-slate-50"
                      type="button"
                      onClick={() => {
                        const qs = new URLSearchParams();
                        if (planilhaIdFromQuery) qs.set("planilhaId", String(planilhaIdFromQuery));
                        qs.set("returnTo", selfHref);
                        router.push(`/dashboard/engenharia/obras/${idObra}/planilha/servicos/${encodeURIComponent(r.codigoServico)}?${qs.toString()}`);
                      }}
                    >
                      Abrir
                    </button>
                  </td>
                </tr>
              ))}
              {!filteredRows.length ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                    Sem dados.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div>
          <div className="text-lg font-semibold">Composições auxiliares / composições referenciadas</div>
          <div className="text-sm text-slate-600">Quando um item é “Composição Auxiliar” ou “Composição”, esta lista mostra se o código já foi definido na obra.</div>
        </div>

        <div className="overflow-auto">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-700">
              <tr>
                <th className="px-3 py-2">CÓDIGO</th>
                <th className="px-3 py-2">TIPO</th>
                <th className="px-3 py-2">DEFINIDA</th>
                <th className="px-3 py-2">Ação</th>
              </tr>
            </thead>
            <tbody>
              {refs.map((r) => (
                <tr key={`${r.tipo}-${r.codigo}`} className="border-t">
                  <td className="px-3 py-2 font-medium">{r.codigo}</td>
                  <td className="px-3 py-2">{r.tipo}</td>
                  <td className="px-3 py-2">
                    {r.definida ? (
                      <span className="rounded border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">Sim</span>
                    ) : (
                      <span className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Não</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      className="rounded border bg-white px-3 py-1.5 text-xs hover:bg-slate-50"
                      type="button"
                      onClick={() => {
                        const qs = new URLSearchParams();
                        if (planilhaIdFromQuery) qs.set("planilhaId", String(planilhaIdFromQuery));
                        qs.set("returnTo", selfHref);
                        router.push(`/dashboard/engenharia/obras/${idObra}/planilha/servicos/${encodeURIComponent(r.codigo)}?${qs.toString()}`);
                      }}
                    >
                      Abrir
                    </button>
                  </td>
                </tr>
              ))}
              {!refs.length ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                    Sem referências.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
