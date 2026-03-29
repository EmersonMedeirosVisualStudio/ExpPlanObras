"use client";

import { useEffect, useMemo, useState } from "react";

type Acervo = {
  idAcervo: number;
  titulo: string;
  tipo: string;
  numeroDocumento: string | null;
  orgaoEmissor: string | null;
  dataEmissao: string | null;
  nomeObra: string | null;
  categoria: string | null;
  idDocumentoRegistro: number | null;
};

export default function AcervoEmpresaClient() {
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState("");
  const [rows, setRows] = useState<Acervo[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [novo, setNovo] = useState({ titulo: "", tipo: "ATESTADO", numeroDocumento: "", orgaoEmissor: "", dataEmissao: "", nomeObra: "", categoria: "" });

  const queryString = useMemo(() => {
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    if (tipo.trim()) sp.set("tipo", tipo.trim());
    const s = sp.toString();
    return s ? `?${s}` : "";
  }, [q, tipo]);

  async function carregar() {
    try {
      setLoading(true);
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/licitacoes/acervo-empresa${queryString}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar acervo");
      setRows(Array.isArray(json.data) ? json.data : []);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar acervo");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function criar() {
    try {
      setErr(null);
      const payload: any = {
        titulo: novo.titulo.trim(),
        tipo: novo.tipo,
        numeroDocumento: novo.numeroDocumento.trim() || null,
        orgaoEmissor: novo.orgaoEmissor.trim() || null,
        dataEmissao: novo.dataEmissao || null,
        nomeObra: novo.nomeObra.trim() || null,
        categoria: novo.categoria.trim() || null,
      };
      const res = await fetch(`/api/v1/engenharia/licitacoes/acervo-empresa`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao criar acervo");
      setNovo({ titulo: "", tipo: "ATESTADO", numeroDocumento: "", orgaoEmissor: "", dataEmissao: "", nomeObra: "", categoria: "" });
      await carregar();
    } catch (e: any) {
      setErr(e?.message || "Erro ao criar acervo");
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Acervo da Empresa</h1>
          <div className="text-sm text-slate-600">Biblioteca corporativa de CATs/Atestados/Obras executadas. Cada licitação vincula itens a partir daqui.</div>
        </div>
        <button className="rounded-lg border px-4 py-2 text-sm" type="button" onClick={carregar} disabled={loading}>
          Atualizar
        </button>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="text-lg font-semibold">Novo item</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <div className="md:col-span-3">
            <div className="text-sm text-slate-600">Título</div>
            <input className="input" value={novo.titulo} onChange={(e) => setNovo((p) => ({ ...p, titulo: e.target.value }))} />
          </div>
          <div>
            <div className="text-sm text-slate-600">Tipo</div>
            <select className="input" value={novo.tipo} onChange={(e) => setNovo((p) => ({ ...p, tipo: e.target.value }))}>
              <option value="CAT">CAT</option>
              <option value="ATESTADO">Atestado</option>
              <option value="OBRA_EXECUTADA">Obra executada</option>
            </select>
          </div>
          <div>
            <div className="text-sm text-slate-600">Número</div>
            <input className="input" value={novo.numeroDocumento} onChange={(e) => setNovo((p) => ({ ...p, numeroDocumento: e.target.value }))} />
          </div>
          <div>
            <div className="text-sm text-slate-600">Órgão emissor</div>
            <input className="input" value={novo.orgaoEmissor} onChange={(e) => setNovo((p) => ({ ...p, orgaoEmissor: e.target.value }))} />
          </div>
          <div>
            <div className="text-sm text-slate-600">Emissão</div>
            <input className="input" type="date" value={novo.dataEmissao} onChange={(e) => setNovo((p) => ({ ...p, dataEmissao: e.target.value }))} />
          </div>
          <div className="md:col-span-2">
            <div className="text-sm text-slate-600">Obra</div>
            <input className="input" value={novo.nomeObra} onChange={(e) => setNovo((p) => ({ ...p, nomeObra: e.target.value }))} />
          </div>
          <div className="md:col-span-2">
            <div className="text-sm text-slate-600">Categoria</div>
            <input className="input" value={novo.categoria} onChange={(e) => setNovo((p) => ({ ...p, categoria: e.target.value }))} />
          </div>
          <div className="md:col-span-6 flex justify-end">
            <button className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white" type="button" onClick={criar} disabled={!novo.titulo.trim()}>
              Criar
            </button>
          </div>
          <div className="md:col-span-6 text-xs text-slate-500">Após criar, abra o “Documento” do item para anexar o PDF.</div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-lg font-semibold">Biblioteca</div>
          <div className="flex gap-2 items-center">
            <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="">Todos</option>
              <option value="CAT">CAT</option>
              <option value="ATESTADO">Atestado</option>
              <option value="OBRA_EXECUTADA">Obra executada</option>
            </select>
            <input className="input w-80" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" />
          </div>
        </div>

        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Título</th>
                <th className="px-3 py-2">Obra</th>
                <th className="px-3 py-2">Emissão</th>
                <th className="px-3 py-2 text-right">Abrir</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.idAcervo} className="border-t">
                  <td className="px-3 py-2">{r.tipo}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.titulo}</div>
                    <div className="text-xs text-slate-500">
                      {[r.numeroDocumento ? `Nº ${r.numeroDocumento}` : null, r.orgaoEmissor ? `Órgão ${r.orgaoEmissor}` : null, r.categoria ? `Cat ${r.categoria}` : null]
                        .filter(Boolean)
                        .join(" • ")}
                    </div>
                  </td>
                  <td className="px-3 py-2">{r.nomeObra || "-"}</td>
                  <td className="px-3 py-2">{r.dataEmissao || "-"}</td>
                  <td className="px-3 py-2 text-right">
                    {r.idDocumentoRegistro ? (
                      <a className="underline" href={`/dashboard/documentos/${r.idDocumentoRegistro}`}>
                        Documento
                      </a>
                    ) : (
                      "-"
                    )}
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

