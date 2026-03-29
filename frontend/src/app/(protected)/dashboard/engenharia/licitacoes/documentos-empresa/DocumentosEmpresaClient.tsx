"use client";

import { useEffect, useMemo, useState } from "react";

type DocEmpresa = {
  idDocumentoEmpresa: number;
  categoria: string;
  nome: string;
  numero: string | null;
  orgaoEmissor: string | null;
  dataValidade: string | null;
  status: string;
  idDocumentoRegistro: number;
};

export default function DocumentosEmpresaClient() {
  const [q, setQ] = useState("");
  const [categoria, setCategoria] = useState("");
  const [rows, setRows] = useState<DocEmpresa[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [novo, setNovo] = useState({ categoria: "JURIDICO", nome: "", numero: "", orgaoEmissor: "", dataEmissao: "", dataValidade: "" });

  const queryString = useMemo(() => {
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    if (categoria.trim()) sp.set("categoria", categoria.trim());
    const s = sp.toString();
    return s ? `?${s}` : "";
  }, [q, categoria]);

  async function carregar() {
    try {
      setLoading(true);
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/licitacoes/documentos-empresa${queryString}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar documentos");
      setRows(Array.isArray(json.data) ? json.data : []);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar documentos");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function criar() {
    try {
      setErr(null);
      const payload: any = {
        categoria: novo.categoria,
        nome: novo.nome.trim(),
        numero: novo.numero.trim() || null,
        orgaoEmissor: novo.orgaoEmissor.trim() || null,
        dataEmissao: novo.dataEmissao || null,
        dataValidade: novo.dataValidade || null,
      };
      const res = await fetch(`/api/v1/engenharia/licitacoes/documentos-empresa`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao criar documento");
      setNovo({ categoria: "JURIDICO", nome: "", numero: "", orgaoEmissor: "", dataEmissao: "", dataValidade: "" });
      await carregar();
    } catch (e: any) {
      setErr(e?.message || "Erro ao criar documento");
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Documentos da Empresa (Licitações)</h1>
          <div className="text-sm text-slate-600">Biblioteca corporativa. Depois, cada licitação seleciona quais documentos serão vinculados.</div>
        </div>
        <button className="rounded-lg border px-4 py-2 text-sm" type="button" onClick={carregar} disabled={loading}>
          Atualizar
        </button>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="text-lg font-semibold">Novo documento</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <div>
            <div className="text-sm text-slate-600">Categoria</div>
            <input className="input" value={novo.categoria} onChange={(e) => setNovo((p) => ({ ...p, categoria: e.target.value }))} list="categorias-docs-empresa" />
            <datalist id="categorias-docs-empresa">
              <option value="JURIDICO" />
              <option value="FISCAL" />
              <option value="TRABALHISTA" />
              <option value="FGTS" />
              <option value="ECONOMICO" />
              <option value="DECLARACOES" />
              <option value="VISITA_TECNICA" />
              <option value="TECNICO" />
              <option value="PROPOSTA" />
            </datalist>
          </div>
          <div className="md:col-span-3">
            <div className="text-sm text-slate-600">Nome</div>
            <input className="input" value={novo.nome} onChange={(e) => setNovo((p) => ({ ...p, nome: e.target.value }))} />
          </div>
          <div>
            <div className="text-sm text-slate-600">Número</div>
            <input className="input" value={novo.numero} onChange={(e) => setNovo((p) => ({ ...p, numero: e.target.value }))} />
          </div>
          <div>
            <div className="text-sm text-slate-600">Órgão emissor</div>
            <input className="input" value={novo.orgaoEmissor} onChange={(e) => setNovo((p) => ({ ...p, orgaoEmissor: e.target.value }))} />
          </div>
          <div>
            <div className="text-sm text-slate-600">Emissão</div>
            <input className="input" type="date" value={novo.dataEmissao} onChange={(e) => setNovo((p) => ({ ...p, dataEmissao: e.target.value }))} />
          </div>
          <div>
            <div className="text-sm text-slate-600">Validade</div>
            <input className="input" type="date" value={novo.dataValidade} onChange={(e) => setNovo((p) => ({ ...p, dataValidade: e.target.value }))} />
          </div>
          <div className="md:col-span-6 flex justify-end">
            <button className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white" type="button" onClick={criar} disabled={!novo.nome.trim()}>
              Criar
            </button>
          </div>
          <div className="md:col-span-6 text-xs text-slate-500">
            Após criar, abra o documento e anexe o PDF em “Documentos” (detalhe do documento).
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-lg font-semibold">Biblioteca</div>
          <div className="flex gap-2 items-center">
            <select className="input" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              <option value="">Todas</option>
              <option value="JURIDICO">Jurídico</option>
              <option value="FISCAL">Fiscal</option>
              <option value="TRABALHISTA">Trabalhista</option>
              <option value="FGTS">FGTS</option>
              <option value="ECONOMICO">Econômico</option>
              <option value="DECLARACOES">Declarações</option>
              <option value="VISITA_TECNICA">Visita técnica</option>
              <option value="TECNICO">Técnico</option>
              <option value="PROPOSTA">Proposta</option>
            </select>
            <input className="input w-80" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" />
          </div>
        </div>

        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">Categoria</th>
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Validade</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Abrir</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.idDocumentoEmpresa} className="border-t">
                  <td className="px-3 py-2">{r.categoria}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.nome}</div>
                    <div className="text-xs text-slate-500">
                      {[r.numero ? `Nº ${r.numero}` : null, r.orgaoEmissor ? `Órgão ${r.orgaoEmissor}` : null].filter(Boolean).join(" • ")}
                    </div>
                  </td>
                  <td className="px-3 py-2">{r.dataValidade || "-"}</td>
                  <td className="px-3 py-2">{r.status}</td>
                  <td className="px-3 py-2 text-right">
                    <a className="underline" href={`/dashboard/documentos/${r.idDocumentoRegistro}`}>
                      Documento
                    </a>
                  </td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                    Sem dados.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
