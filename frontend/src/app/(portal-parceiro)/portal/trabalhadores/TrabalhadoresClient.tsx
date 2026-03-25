"use client";

import { useEffect, useState } from "react";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) throw new Error(json?.message || "Erro na requisição");
  return json.data as T;
}

type Trabalhador = {
  id: number;
  nome: string;
  cpfMascarado: string | null;
  funcao: string | null;
  tipoLocalAtual: "OBRA" | "UNIDADE" | null;
  localNomeAtual: string | null;
  integracaoPendente: boolean;
  treinamentoVencido: boolean;
  epiPendente: boolean;
  bloqueado: boolean;
};

export default function TrabalhadoresClient() {
  const [data, setData] = useState<Trabalhador[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function carregar() {
    setLoading(true);
    setErro(null);
    try {
      const d = await api<Trabalhador[]>(`/api/v1/portal-parceiro/trabalhadores?limit=200`);
      setData(Array.isArray(d) ? d : []);
    } catch (e: any) {
      setErro(e?.message || "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Trabalhadores</h1>
          <p className="text-sm text-slate-500">Pessoas vinculadas à empresa, com principais pendências.</p>
        </div>
        <button type="button" className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50" onClick={carregar} disabled={loading}>
          Atualizar
        </button>
      </div>

      {erro ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{erro}</div> : null}

      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="border-b bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">Lista</div>
        <div className="p-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-slate-600">
              <tr>
                <th className="px-2 py-2 text-left font-semibold">Nome</th>
                <th className="px-2 py-2 text-left font-semibold">Função</th>
                <th className="px-2 py-2 text-left font-semibold">Local atual</th>
                <th className="px-2 py-2 text-left font-semibold">Integração</th>
                <th className="px-2 py-2 text-left font-semibold">Treinamento</th>
                <th className="px-2 py-2 text-left font-semibold">EPI</th>
                <th className="px-2 py-2 text-left font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.length ? (
                data.map((t) => (
                  <tr key={t.id} className="border-t">
                    <td className="px-2 py-2">
                      <div className="font-medium text-slate-800">{t.nome}</div>
                      <div className="text-xs text-slate-500">{t.cpfMascarado || "-"}</div>
                    </td>
                    <td className="px-2 py-2">{t.funcao || "-"}</td>
                    <td className="px-2 py-2">
                      {t.tipoLocalAtual ? `${t.tipoLocalAtual} • ${t.localNomeAtual || "-"}` : "-"}
                    </td>
                    <td className="px-2 py-2">{t.integracaoPendente ? "Pendente" : "-"}</td>
                    <td className="px-2 py-2">{t.treinamentoVencido ? "Vencido" : "-"}</td>
                    <td className="px-2 py-2">{t.epiPendente ? "Pendente" : "-"}</td>
                    <td className="px-2 py-2">{t.bloqueado ? "Bloqueado" : "OK"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-2 py-3 text-slate-500" colSpan={7}>
                    {loading ? "Carregando..." : "Sem registros."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

