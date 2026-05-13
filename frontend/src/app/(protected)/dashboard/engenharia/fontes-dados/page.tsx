"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type FonteDadosDTO = {
  idFonteDados: number;
  nome: string;
  tipo: string;
  uf: string;
  dataBase: string;
  tipoPreco: string;
};

type PlanilhaAfetadaRow = {
  idObra: number;
  obraNome: string;
  obraStatus: string;
  contratoId: number | null;
  contratoNumero: string | null;
  contratoStatus: string | null;
  idPlanilha: number;
  numeroVersao: number;
  nome: string;
  atual: boolean;
};

export default function FontesDadosPage() {
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
  const [fontes, setFontes] = useState<FonteDadosDTO[]>([]);
  const [afetadasLoading, setAfetadasLoading] = useState(false);
  const [afetadasErr, setAfetadasErr] = useState<string | null>(null);
  const [afetadasRows, setAfetadasRows] = useState<PlanilhaAfetadaRow[]>([]);
  const [form, setForm] = useState<{
    idFonteDados: number | null;
    nome: string;
    tipo: string;
    uf: string;
    dataBase: string;
    tipoPreco: string;
  }>({ idFonteDados: null, nome: "", tipo: "SINAPI", uf: "", dataBase: "", tipoPreco: "" });

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
      const res = await authFetch(`/api/v1/engenharia/fontes-dados`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar fontes");
      const list = Array.isArray(json.data?.fontes) ? (json.data.fontes as any[]) : [];
      const normalized: FonteDadosDTO[] = list.map((r) => ({
        idFonteDados: Number(r.idFonteDados),
        nome: String(r.nome || "").trim(),
        tipo: String(r.tipo || "").trim(),
        uf: String(r.uf || "").trim(),
        dataBase: String(r.dataBase || "").trim(),
        tipoPreco: String(r.tipoPreco || "").trim(),
      }));
      setFontes(normalized);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar fontes");
      setFontes([]);
    } finally {
      setLoading(false);
    }
  }

  async function salvar() {
    const nome = String(form.nome || "").trim();
    const tipo = String(form.tipo || "").trim().toUpperCase();
    const uf = String(form.uf || "").trim().toUpperCase();
    const dataBase = String(form.dataBase || "").trim().toUpperCase();
    const tipoPreco = String(form.tipoPreco || "").trim().toUpperCase();
    if (!nome) {
      setErr("Nome da fonte é obrigatório.");
      return;
    }
    if (!tipo) {
      setErr("Tipo da fonte é obrigatório.");
      return;
    }
    try {
      setLoading(true);
      setErr(null);
      setOkMsg(null);
      const res = await authFetch(`/api/v1/engenharia/fontes-dados`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idFonteDados: form.idFonteDados,
          nome,
          tipo,
          uf,
          dataBase,
          tipoPreco,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao salvar fonte");
      setOkMsg(json?.message || "Fonte salva.");
      setForm({ idFonteDados: null, nome: "", tipo: "SINAPI", uf: "", dataBase: "", tipoPreco: "" });
      await carregar();
    } catch (e: any) {
      setErr(e?.message || "Erro ao salvar fonte");
    } finally {
      setLoading(false);
    }
  }

  async function clonarFonte(idFonteDados: number) {
    if (!idFonteDados) return;
    const nome = window.prompt("Nome da nova fonte (opcional). Se deixar vazio, será gerado automaticamente.", "") || "";
    try {
      setLoading(true);
      setErr(null);
      setOkMsg(null);
      const res = await authFetch(`/api/v1/engenharia/fontes-dados/clonar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idFonteDados, nome: nome.trim() ? nome.trim() : null }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao clonar fonte");
      setOkMsg(`Fonte clonada (#${Number(json.data?.idFonteDados || 0) || "?"}).`);
      await carregar();
    } catch (e: any) {
      setErr(e?.message || "Erro ao clonar fonte");
    } finally {
      setLoading(false);
    }
  }

  async function carregarAfetadas(idFonteDados: number) {
    try {
      setAfetadasLoading(true);
      setAfetadasErr(null);
      const res = await authFetch(`/api/v1/engenharia/fontes-dados/${idFonteDados}/planilhas-afetadas`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar planilhas afetadas");
      const rows = Array.isArray(json.data?.rows) ? json.data.rows : [];
      setAfetadasRows(
        rows.map((r: any) => ({
          idObra: Number(r.idObra || 0),
          obraNome: String(r.obraNome || ""),
          obraStatus: String(r.obraStatus || ""),
          contratoId: r.contratoId == null ? null : Number(r.contratoId),
          contratoNumero: r.contratoNumero == null ? null : String(r.contratoNumero || ""),
          contratoStatus: r.contratoStatus == null ? null : String(r.contratoStatus || ""),
          idPlanilha: Number(r.idPlanilha || 0),
          numeroVersao: Number(r.numeroVersao || 0),
          nome: String(r.nome || ""),
          atual: Boolean(r.atual),
        }))
      );
    } catch (e: any) {
      setAfetadasErr(e?.message || "Erro ao carregar planilhas afetadas");
      setAfetadasRows([]);
    } finally {
      setAfetadasLoading(false);
    }
  }

  useEffect(() => {
    void carregar();
  }, []);

  useEffect(() => {
    const idFonteDados = form.idFonteDados != null ? Number(form.idFonteDados) : 0;
    if (!idFonteDados) {
      setAfetadasErr(null);
      setAfetadasRows([]);
      return;
    }
    void carregarAfetadas(idFonteDados);
  }, [form.idFonteDados]);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl text-slate-900">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs text-slate-500">Engenharia → Fontes de dados</div>
          <h1 className="text-2xl font-semibold">Fontes de dados</h1>
          <div className="text-sm text-slate-600">Cadastro compartilhado. Alterações podem impactar várias planilhas.</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={() => {
              const qs = new URLSearchParams();
              if (safeReturnTo) qs.set("returnTo", safeReturnTo);
              const tail = qs.toString();
              router.push(`/dashboard/engenharia/planilhas/parametros${tail ? `?${tail}` : ""}`);
            }}
            disabled={loading}
            title="Abrir Parâmetros"
          >
            Parâmetros
          </button>
          <button
            className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={() => (safeReturnTo ? router.push(safeReturnTo) : null)}
            disabled={loading || !safeReturnTo}
            title={!safeReturnTo ? "Abra esta tela a partir da Planilha para habilitar o retorno" : "Voltar para Planilha"}
          >
            Planilha
          </button>
          <button
            className="rounded-lg border bg-blue-600 px-4 py-2 text-sm text-white border-blue-600 hover:bg-blue-500 disabled:opacity-60"
            type="button"
            onClick={() => router.push(`/dashboard/engenharia/fontes-dados${safeReturnTo ? `?returnTo=${encodeURIComponent(safeReturnTo)}` : ""}`)}
            disabled={loading}
            title="Você está em Fontes de Dados"
          >
            Fonte de Dados
          </button>
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
        Atenção: esta Fonte de dados é um catálogo compartilhado. Alterar Serviços/Insumos/Composições desta Fonte pode afetar TODAS as planilhas que usam este mesmo id.
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
          <div className="text-lg font-semibold">Fontes cadastradas</div>
          <div className="overflow-auto rounded-lg border">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-700">
                <tr>
                  <th className="px-3 py-2">Id da fonte de dados</th>
                  <th className="px-3 py-2">Descrição</th>
                  <th className="px-3 py-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {fontes.map((f) => (
                  <tr key={f.idFonteDados} className="border-t">
                    <td className="px-3 py-2 font-medium">{`#${f.idFonteDados}`}</td>
                    <td className="px-3 py-2">{f.nome || "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <button
                          className="rounded border bg-white px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-60"
                          type="button"
                          onClick={() =>
                            setForm({
                              idFonteDados: f.idFonteDados,
                              nome: f.nome || "",
                              tipo: f.tipo || "SINAPI",
                              uf: f.uf || "",
                              dataBase: f.dataBase || "",
                              tipoPreco: f.tipoPreco || "",
                            })
                          }
                          disabled={loading}
                        >
                          Editar
                        </button>
                        <button
                          className="rounded border bg-white px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-60"
                          type="button"
                          onClick={() => clonarFonte(f.idFonteDados)}
                          disabled={loading}
                          title="Clonar esta Fonte (inclui serviços, composições e insumos)"
                        >
                          Clonar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!fontes.length ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-slate-500">
                      Nenhuma fonte cadastrada.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
          <div className="text-lg font-semibold">{form.idFonteDados ? `Editar fonte #${form.idFonteDados}` : "Cadastrar fonte"}</div>
          <div className="rounded-lg border bg-slate-50 p-3">
            <div className="text-sm font-semibold text-slate-800">Fonte de dados</div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="rounded border bg-white px-3 py-2 text-sm">
                <div className="text-xs text-slate-500">Id da fonte de dados</div>
                <div className="font-semibold text-slate-900">{form.idFonteDados ? `#${form.idFonteDados}` : "—"}</div>
              </div>
              <label className="rounded border bg-white px-3 py-2 text-sm">
                <div className="text-xs text-slate-500">Descrição</div>
                <input className="input bg-white w-full mt-1" value={form.nome} onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))} disabled={loading} />
              </label>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
              type="button"
              onClick={() => setForm({ idFonteDados: null, nome: "", tipo: "SINAPI", uf: "", dataBase: "", tipoPreco: "" })}
              disabled={loading}
            >
              {form.idFonteDados ? "Cancelar" : "Limpar"}
            </button>
            <button className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-60" type="button" onClick={salvar} disabled={loading}>
              Salvar
            </button>
          </div>
        </section>
      </div>

      <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <div className="text-lg font-semibold">Planilhas afetadas</div>
            <div className="text-sm text-slate-600">Mostra as planilhas que usam esta Fonte (por id).</div>
          </div>
          <div className="text-sm text-slate-600">
            {afetadasLoading ? "Carregando…" : form.idFonteDados ? `${afetadasRows.length} planilha(s)` : "Selecione uma fonte para ver"}
          </div>
        </div>

        {afetadasErr ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{afetadasErr}</div> : null}

        {form.idFonteDados ? (
          <div className="overflow-auto rounded-lg border">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-700">
                <tr>
                  <th className="px-3 py-2">OBRA</th>
                  <th className="px-3 py-2">STATUS (OBRA)</th>
                  <th className="px-3 py-2">CONTRATO</th>
                  <th className="px-3 py-2">STATUS (CONTRATO)</th>
                  <th className="px-3 py-2">PLANILHA</th>
                  <th className="px-3 py-2">VERSÃO</th>
                  <th className="px-3 py-2">ATUAL</th>
                </tr>
              </thead>
              <tbody>
                {afetadasRows.map((r) => (
                  <tr key={`${r.idPlanilha}-${r.idObra}`} className="border-t">
                    <td className="px-3 py-2">{`Obra #${r.idObra} - ${r.obraNome || "—"}`}</td>
                    <td className="px-3 py-2">{r.obraStatus || "—"}</td>
                    <td className="px-3 py-2">{r.contratoId ? `#${r.contratoId} - ${r.contratoNumero || "—"}` : r.contratoNumero ? r.contratoNumero : "—"}</td>
                    <td className="px-3 py-2">{r.contratoStatus || "—"}</td>
                    <td className="px-3 py-2">{`Planilha #${r.idPlanilha} - ${r.nome || "—"}`}</td>
                    <td className="px-3 py-2">{r.numeroVersao ? `v${r.numeroVersao}` : "—"}</td>
                    <td className="px-3 py-2">{r.atual ? "Sim" : "Não"}</td>
                  </tr>
                ))}
                {!afetadasRows.length && !afetadasLoading ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                      Nenhuma planilha encontrada usando esta Fonte.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg border bg-slate-50 p-3 text-sm text-slate-700">Selecione uma fonte (Editar) para listar as planilhas afetadas.</div>
        )}
      </section>
    </div>
  );
}
