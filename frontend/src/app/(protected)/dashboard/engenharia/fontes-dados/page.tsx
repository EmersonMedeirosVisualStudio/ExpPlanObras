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

  useEffect(() => {
    void carregar();
  }, []);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl text-slate-900">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs text-slate-500">Engenharia → Fontes de dados</div>
          <h1 className="text-2xl font-semibold">Fontes de dados</h1>
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
        Atenção: esta Fonte de dados é um catálogo compartilhado. Alterar Serviços/Insumos/Composições desta Fonte pode afetar TODAS as planilhas que usam este mesmo id.
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
          <div className="text-lg font-semibold">Fontes cadastradas</div>
          <div className="overflow-auto rounded-lg border">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-700">
                <tr>
                  <th className="px-3 py-2">#id - nome</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">UF</th>
                  <th className="px-3 py-2">Data-base</th>
                  <th className="px-3 py-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {fontes.map((f) => (
                  <tr key={f.idFonteDados} className="border-t">
                    <td className="px-3 py-2">{`#${f.idFonteDados} - ${f.nome || "—"}`}</td>
                    <td className="px-3 py-2">{f.tipo || "—"}</td>
                    <td className="px-3 py-2">{f.uf || "—"}</td>
                    <td className="px-3 py-2">{f.dataBase || "—"}</td>
                    <td className="px-3 py-2">
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
                    </td>
                  </tr>
                ))}
                {!fontes.length ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
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
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 md:col-span-2">
              <div className="text-xs text-slate-500">Nome</div>
              <input className="input bg-white w-full" value={form.nome} onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))} disabled={loading} />
            </label>
            <label className="space-y-1">
              <div className="text-xs text-slate-500">Tipo</div>
              <select className="input bg-white w-full" value={form.tipo} onChange={(e) => setForm((p) => ({ ...p, tipo: e.target.value }))} disabled={loading}>
                <option value="SINAPI">SINAPI</option>
                <option value="SBC">SBC</option>
                <option value="MANUAL">MANUAL</option>
              </select>
            </label>
            <label className="space-y-1">
              <div className="text-xs text-slate-500">UF</div>
              <input className="input bg-white w-full" value={form.uf} onChange={(e) => setForm((p) => ({ ...p, uf: e.target.value }))} disabled={loading} placeholder="SP" />
            </label>
            <label className="space-y-1">
              <div className="text-xs text-slate-500">Data-base</div>
              <input className="input bg-white w-full" value={form.dataBase} onChange={(e) => setForm((p) => ({ ...p, dataBase: e.target.value }))} disabled={loading} placeholder="2024-01" />
            </label>
            <label className="space-y-1">
              <div className="text-xs text-slate-500">Tipo de preço</div>
              <input className="input bg-white w-full" value={form.tipoPreco} onChange={(e) => setForm((p) => ({ ...p, tipoPreco: e.target.value }))} disabled={loading} />
            </label>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
              type="button"
              onClick={() => setForm({ idFonteDados: null, nome: "", tipo: "SINAPI", uf: "", dataBase: "", tipoPreco: "" })}
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

