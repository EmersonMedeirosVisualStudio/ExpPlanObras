"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type ParametroDTO = {
  idParametros: number;
  nome: string;
  ufSinapi: string;
  dataBaseSbc: string;
  dataBaseSinapi: string;
  bdiServicosSbc: number | null;
  bdiServicosSinapi: number | null;
  bdiDiferenciadoSbc: number | null;
  bdiDiferenciadoSinapi: number | null;
  encSociaisSemDesSbc: number | null;
  encSociaisSemDesSinapi: number | null;
  descontoSbc: number | null;
  descontoSinapi: number | null;
};

export default function ParametrosPage() {
  const router = useRouter();
  const search = useSearchParams();
  const returnTo = search.get("returnTo");

  const safeReturnTo = useMemo(() => {
    const raw = String(returnTo || "").trim();
    const isExternal = raw.startsWith("//") || /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(raw) || /^[a-z][a-z0-9+.-]*:/i.test(raw);
    return raw && !isExternal ? raw : null;
  }, [returnTo]);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [parametros, setParametros] = useState<ParametroDTO[]>([]);
  const [form, setForm] = useState<{
    idParametros: number | null;
    nome: string;
    ufSinapi: string;
    dataBaseSbc: string;
    dataBaseSinapi: string;
    bdiServicosSbc: string;
    bdiServicosSinapi: string;
    bdiDiferenciadoSbc: string;
    bdiDiferenciadoSinapi: string;
    encSociaisSemDesSbc: string;
    encSociaisSemDesSinapi: string;
    descontoSbc: string;
    descontoSinapi: string;
  }>({
    idParametros: null,
    nome: "",
    ufSinapi: "",
    dataBaseSbc: "",
    dataBaseSinapi: "",
    bdiServicosSbc: "",
    bdiServicosSinapi: "",
    bdiDiferenciadoSbc: "",
    bdiDiferenciadoSinapi: "",
    encSociaisSemDesSbc: "",
    encSociaisSemDesSinapi: "",
    descontoSbc: "",
    descontoSinapi: "",
  });

  function parseNumberLoose(v: unknown) {
    const raw = String(v ?? "").trim();
    if (!raw) return null;
    const cleaned = raw.replace(/[^\d,.\-]/g, "");
    if (!cleaned) return null;
    if (cleaned.includes(",") && cleaned.includes(".")) {
      if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
        const n = Number(cleaned.replace(/\./g, "").replace(",", "."));
        return Number.isFinite(n) ? n : null;
      }
      const n = Number(cleaned.replace(/,/g, ""));
      return Number.isFinite(n) ? n : null;
    }
    if (cleaned.includes(",")) {
      const n = Number(cleaned.replace(",", "."));
      return Number.isFinite(n) ? n : null;
    }
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }

  async function authFetch(input: RequestInfo | URL, init?: RequestInit) {
    let token: string | null = null;
    try {
      if (typeof window !== "undefined") token = localStorage.getItem("token");
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

  async function carregar() {
    try {
      setLoading(true);
      setErr(null);
      const res = await authFetch(`/api/v1/engenharia/planilhas/parametros`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar parâmetros");
      const list = Array.isArray(json.data?.parametros) ? (json.data.parametros as any[]) : [];
      const normalized: ParametroDTO[] = list.map((r) => ({
        idParametros: Number(r.idParametros),
        nome: String(r.nome || "").trim(),
        ufSinapi: String(r.ufSinapi || "").trim(),
        dataBaseSbc: String(r.dataBaseSbc || "").trim(),
        dataBaseSinapi: String(r.dataBaseSinapi || "").trim(),
        bdiServicosSbc: r.bdiServicosSbc == null ? null : Number(r.bdiServicosSbc),
        bdiServicosSinapi: r.bdiServicosSinapi == null ? null : Number(r.bdiServicosSinapi),
        bdiDiferenciadoSbc: r.bdiDiferenciadoSbc == null ? null : Number(r.bdiDiferenciadoSbc),
        bdiDiferenciadoSinapi: r.bdiDiferenciadoSinapi == null ? null : Number(r.bdiDiferenciadoSinapi),
        encSociaisSemDesSbc: r.encSociaisSemDesSbc == null ? null : Number(r.encSociaisSemDesSbc),
        encSociaisSemDesSinapi: r.encSociaisSemDesSinapi == null ? null : Number(r.encSociaisSemDesSinapi),
        descontoSbc: r.descontoSbc == null ? null : Number(r.descontoSbc),
        descontoSinapi: r.descontoSinapi == null ? null : Number(r.descontoSinapi),
      }));
      setParametros(normalized);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar parâmetros");
      setParametros([]);
    } finally {
      setLoading(false);
    }
  }

  async function salvar() {
    const nome = String(form.nome || "").trim();
    if (!nome) {
      setErr("Nome do parâmetro é obrigatório.");
      return;
    }
    try {
      setLoading(true);
      setErr(null);
      setOkMsg(null);
      const res = await authFetch(`/api/v1/engenharia/planilhas/parametros`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idParametros: form.idParametros,
          nome,
          ufSinapi: String(form.ufSinapi || "").trim().toUpperCase() || null,
          dataBaseSbc: String(form.dataBaseSbc || "").trim().toUpperCase() || null,
          dataBaseSinapi: String(form.dataBaseSinapi || "").trim().toUpperCase() || null,
          bdiServicosSbc: parseNumberLoose(form.bdiServicosSbc),
          bdiServicosSinapi: parseNumberLoose(form.bdiServicosSinapi),
          bdiDiferenciadoSbc: parseNumberLoose(form.bdiDiferenciadoSbc),
          bdiDiferenciadoSinapi: parseNumberLoose(form.bdiDiferenciadoSinapi),
          encSociaisSemDesSbc: parseNumberLoose(form.encSociaisSemDesSbc),
          encSociaisSemDesSinapi: parseNumberLoose(form.encSociaisSemDesSinapi),
          descontoSbc: parseNumberLoose(form.descontoSbc),
          descontoSinapi: parseNumberLoose(form.descontoSinapi),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao salvar parâmetro");
      setOkMsg(json?.message || "Parâmetro salvo.");
      setForm({
        idParametros: null,
        nome: "",
        ufSinapi: "",
        dataBaseSbc: "",
        dataBaseSinapi: "",
        bdiServicosSbc: "",
        bdiServicosSinapi: "",
        bdiDiferenciadoSbc: "",
        bdiDiferenciadoSinapi: "",
        encSociaisSemDesSbc: "",
        encSociaisSemDesSinapi: "",
        descontoSbc: "",
        descontoSinapi: "",
      });
      await carregar();
    } catch (e: any) {
      setErr(e?.message || "Erro ao salvar parâmetro");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void carregar();
  }, []);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl text-slate-900">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs text-slate-500">Engenharia → Planilhas → Parâmetros</div>
          <h1 className="text-2xl font-semibold">Parâmetros</h1>
          <div className="text-sm text-slate-600">Cadastro compartilhado. Alterações podem impactar várias planilhas.</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60" type="button" onClick={carregar} disabled={loading}>
            Atualizar
          </button>
          <button
            className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={() => router.push(safeReturnTo || "/dashboard/engenharia/obras")}
            disabled={loading}
          >
            Voltar
          </button>
        </div>
      </div>

      {okMsg ? <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{okMsg}</div> : null}
      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        Atenção: este Parâmetro é compartilhado. Alterar este cadastro pode afetar TODAS as planilhas que usam este mesmo id.
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
          <div className="text-lg font-semibold">Parâmetros cadastrados</div>
          <div className="overflow-auto rounded-lg border">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-700">
                <tr>
                  <th className="px-3 py-2">#id - nome</th>
                  <th className="px-3 py-2">SINAPI</th>
                  <th className="px-3 py-2">SBC</th>
                  <th className="px-3 py-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {parametros.map((p) => (
                  <tr key={p.idParametros} className="border-t">
                    <td className="px-3 py-2">{`#${p.idParametros} - ${p.nome || "—"}`}</td>
                    <td className="px-3 py-2">{p.dataBaseSinapi ? `${p.ufSinapi || "—"} • ${p.dataBaseSinapi}` : "—"}</td>
                    <td className="px-3 py-2">{p.dataBaseSbc || "—"}</td>
                    <td className="px-3 py-2">
                      <button
                        className="rounded border bg-white px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-60"
                        type="button"
                        onClick={() =>
                          setForm({
                            idParametros: p.idParametros,
                            nome: p.nome || "",
                            ufSinapi: p.ufSinapi || "",
                            dataBaseSbc: p.dataBaseSbc || "",
                            dataBaseSinapi: p.dataBaseSinapi || "",
                            bdiServicosSbc: p.bdiServicosSbc == null ? "" : String(p.bdiServicosSbc),
                            bdiServicosSinapi: p.bdiServicosSinapi == null ? "" : String(p.bdiServicosSinapi),
                            bdiDiferenciadoSbc: p.bdiDiferenciadoSbc == null ? "" : String(p.bdiDiferenciadoSbc),
                            bdiDiferenciadoSinapi: p.bdiDiferenciadoSinapi == null ? "" : String(p.bdiDiferenciadoSinapi),
                            encSociaisSemDesSbc: p.encSociaisSemDesSbc == null ? "" : String(p.encSociaisSemDesSbc),
                            encSociaisSemDesSinapi: p.encSociaisSemDesSinapi == null ? "" : String(p.encSociaisSemDesSinapi),
                            descontoSbc: p.descontoSbc == null ? "" : String(p.descontoSbc),
                            descontoSinapi: p.descontoSinapi == null ? "" : String(p.descontoSinapi),
                          })
                        }
                        disabled={loading}
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
                {!parametros.length ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                      Nenhum parâmetro cadastrado.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
          <div className="text-lg font-semibold">{form.idParametros ? `Editar parâmetro #${form.idParametros}` : "Cadastrar parâmetro"}</div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 md:col-span-2">
              <div className="text-xs text-slate-500">Nome</div>
              <input className="input bg-white w-full" value={form.nome} onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))} disabled={loading} />
            </label>
            <label className="space-y-1">
              <div className="text-xs text-slate-500">UF (SINAPI)</div>
              <input className="input bg-white w-full" value={form.ufSinapi} onChange={(e) => setForm((p) => ({ ...p, ufSinapi: e.target.value }))} disabled={loading} placeholder="SP" />
            </label>
            <label className="space-y-1">
              <div className="text-xs text-slate-500">Data-base SINAPI</div>
              <input className="input bg-white w-full" value={form.dataBaseSinapi} onChange={(e) => setForm((p) => ({ ...p, dataBaseSinapi: e.target.value }))} disabled={loading} placeholder="2024-01" />
            </label>
            <label className="space-y-1 md:col-span-2">
              <div className="text-xs text-slate-500">Data-base SBC</div>
              <input className="input bg-white w-full" value={form.dataBaseSbc} onChange={(e) => setForm((p) => ({ ...p, dataBaseSbc: e.target.value }))} disabled={loading} placeholder="2024-01" />
            </label>
            <label className="space-y-1">
              <div className="text-xs text-slate-500">BDI de Serviços (SBC)</div>
              <input className="input bg-white w-full" value={form.bdiServicosSbc} onChange={(e) => setForm((p) => ({ ...p, bdiServicosSbc: e.target.value }))} disabled={loading} />
            </label>
            <label className="space-y-1">
              <div className="text-xs text-slate-500">BDI de Serviços (SINAPI)</div>
              <input className="input bg-white w-full" value={form.bdiServicosSinapi} onChange={(e) => setForm((p) => ({ ...p, bdiServicosSinapi: e.target.value }))} disabled={loading} />
            </label>
            <label className="space-y-1">
              <div className="text-xs text-slate-500">BDI Diferenciado (SBC)</div>
              <input className="input bg-white w-full" value={form.bdiDiferenciadoSbc} onChange={(e) => setForm((p) => ({ ...p, bdiDiferenciadoSbc: e.target.value }))} disabled={loading} />
            </label>
            <label className="space-y-1">
              <div className="text-xs text-slate-500">BDI Diferenciado (SINAPI)</div>
              <input className="input bg-white w-full" value={form.bdiDiferenciadoSinapi} onChange={(e) => setForm((p) => ({ ...p, bdiDiferenciadoSinapi: e.target.value }))} disabled={loading} />
            </label>
            <label className="space-y-1">
              <div className="text-xs text-slate-500">Enc. Sociais (SBC)</div>
              <input className="input bg-white w-full" value={form.encSociaisSemDesSbc} onChange={(e) => setForm((p) => ({ ...p, encSociaisSemDesSbc: e.target.value }))} disabled={loading} />
            </label>
            <label className="space-y-1">
              <div className="text-xs text-slate-500">Enc. Sociais (SINAPI)</div>
              <input className="input bg-white w-full" value={form.encSociaisSemDesSinapi} onChange={(e) => setForm((p) => ({ ...p, encSociaisSemDesSinapi: e.target.value }))} disabled={loading} />
            </label>
            <label className="space-y-1">
              <div className="text-xs text-slate-500">Desconto (SBC)</div>
              <input className="input bg-white w-full" value={form.descontoSbc} onChange={(e) => setForm((p) => ({ ...p, descontoSbc: e.target.value }))} disabled={loading} />
            </label>
            <label className="space-y-1">
              <div className="text-xs text-slate-500">Desconto (SINAPI)</div>
              <input className="input bg-white w-full" value={form.descontoSinapi} onChange={(e) => setForm((p) => ({ ...p, descontoSinapi: e.target.value }))} disabled={loading} />
            </label>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
              type="button"
              onClick={() =>
                setForm({
                  idParametros: null,
                  nome: "",
                  ufSinapi: "",
                  dataBaseSbc: "",
                  dataBaseSinapi: "",
                  bdiServicosSbc: "",
                  bdiServicosSinapi: "",
                  bdiDiferenciadoSbc: "",
                  bdiDiferenciadoSinapi: "",
                  encSociaisSemDesSbc: "",
                  encSociaisSemDesSinapi: "",
                  descontoSbc: "",
                  descontoSinapi: "",
                })
              }
              disabled={loading}
            >
              Limpar
            </button>
            <button className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-60" type="button" onClick={salvar} disabled={loading}>
              Salvar
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

