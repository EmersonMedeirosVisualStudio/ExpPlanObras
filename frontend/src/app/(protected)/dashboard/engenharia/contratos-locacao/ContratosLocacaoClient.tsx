"use client";

import { useEffect, useMemo, useState } from "react";

type ContraparteDTO = { idContraparte: number; tipo: "PJ" | "PF"; nomeRazao: string };
type ContratoDTO = {
  idContratoLocacao: number;
  tipo: "ATIVO" | "PASSIVO" | "SERVICO";
  status: "ATIVO" | "ENCERRADO";
  numero: string | null;
  descricao: string | null;
  codigoServico: string | null;
  dataInicio: string | null;
  dataFim: string | null;
  valorMensal: number | null;
  idContraparte: number;
  contraparteNome: string;
  contraparteTipo: "PJ" | "PF";
};

export default function ContratosLocacaoClient() {
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tipo, setTipo] = useState<"" | "ATIVO" | "PASSIVO" | "SERVICO">("");
  const [rows, setRows] = useState<ContratoDTO[]>([]);
  const [contrapartes, setContrapartes] = useState<ContraparteDTO[]>([]);

  const [novo, setNovo] = useState({
    tipo: "PASSIVO" as "ATIVO" | "PASSIVO" | "SERVICO",
    idContraparte: "",
    numero: "",
    descricao: "",
    codigoServico: "",
    dataInicio: "",
    dataFim: "",
    valorMensal: "",
  });

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (tipo) params.set("tipo", tipo);
    const s = params.toString();
    return s ? `?${s}` : "";
  }, [tipo]);

  async function carregar() {
    try {
      setLoading(true);
      setErr(null);
      const [cpsRes, contratosRes] = await Promise.all([
        fetch("/api/v1/engenharia/contrapartes?status=ATIVO", { cache: "no-store" }),
        fetch(`/api/v1/engenharia/contratos-locacao${queryString}`, { cache: "no-store" }),
      ]);
      const cps = await cpsRes.json().catch(() => null);
      const cons = await contratosRes.json().catch(() => null);
      if (!cpsRes.ok) throw new Error(cps?.message || "Erro ao carregar contrapartes");
      if (!contratosRes.ok) throw new Error(cons?.message || "Erro ao carregar contratos");
      setContrapartes(Array.isArray(cps) ? cps : []);
      setRows(Array.isArray(cons) ? cons : []);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar dados");
      setRows([]);
      setContrapartes([]);
    } finally {
      setLoading(false);
    }
  }

  async function criar() {
    try {
      setErr(null);
      const payload: any = {
        tipo: novo.tipo,
        idContraparte: Number(novo.idContraparte || 0),
        numero: novo.numero || null,
        descricao: novo.descricao || null,
        codigoServico: novo.tipo === "SERVICO" ? novo.codigoServico || null : novo.codigoServico || null,
        dataInicio: novo.dataInicio || null,
        dataFim: novo.dataFim || null,
        valorMensal: novo.valorMensal ? Number(novo.valorMensal.replace(",", ".")) : null,
      };
      const res = await fetch("/api/v1/engenharia/contratos-locacao", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "Erro ao criar contrato");
      setNovo({ tipo: "PASSIVO", idContraparte: "", numero: "", descricao: "", codigoServico: "", dataInicio: "", dataFim: "", valorMensal: "" });
      await carregar();
    } catch (e: any) {
      setErr(e?.message || "Erro ao criar contrato");
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Contratos — Gestão</h1>
        <p className="text-sm text-slate-600">Contratos simples com contrapartes: locação ativa/passiva e prestação de serviços (por código do serviço).</p>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <div className="text-sm text-slate-600">Filtrar tipo</div>
            <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value as any)}>
              <option value="">Todos</option>
              <option value="PASSIVO">Locação passiva</option>
              <option value="ATIVO">Locação ativa</option>
              <option value="SERVICO">Serviço</option>
            </select>
          </div>
          <div className="flex items-end justify-end md:col-span-3">
            <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" type="button" onClick={carregar} disabled={loading}>
              {loading ? "Carregando..." : "Atualizar"}
            </button>
          </div>
        </div>
        {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="text-lg font-semibold">Novo contrato</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <div>
            <div className="text-sm text-slate-600">Tipo</div>
            <select className="input" value={novo.tipo} onChange={(e) => setNovo((p) => ({ ...p, tipo: e.target.value as any }))}>
              <option value="PASSIVO">Locação passiva</option>
              <option value="ATIVO">Locação ativa</option>
              <option value="SERVICO">Serviço</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <div className="text-sm text-slate-600">Contraparte</div>
            <select className="input" value={novo.idContraparte} onChange={(e) => setNovo((p) => ({ ...p, idContraparte: e.target.value }))}>
              <option value="">Selecione</option>
              {contrapartes.map((c) => (
                <option key={c.idContraparte} value={c.idContraparte}>
                  {c.nomeRazao} ({c.tipo})
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-sm text-slate-600">Número</div>
            <input className="input" value={novo.numero} onChange={(e) => setNovo((p) => ({ ...p, numero: e.target.value }))} />
          </div>
          <div className="md:col-span-2">
            <div className="text-sm text-slate-600">Descrição</div>
            <input className="input" value={novo.descricao} onChange={(e) => setNovo((p) => ({ ...p, descricao: e.target.value }))} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <div className="md:col-span-2">
            <div className="text-sm text-slate-600">Código do serviço (SER-0001)</div>
            <input className="input" value={novo.codigoServico} onChange={(e) => setNovo((p) => ({ ...p, codigoServico: e.target.value }))} />
          </div>
          <div>
            <div className="text-sm text-slate-600">Início</div>
            <input className="input" type="date" value={novo.dataInicio} onChange={(e) => setNovo((p) => ({ ...p, dataInicio: e.target.value }))} />
          </div>
          <div>
            <div className="text-sm text-slate-600">Fim</div>
            <input className="input" type="date" value={novo.dataFim} onChange={(e) => setNovo((p) => ({ ...p, dataFim: e.target.value }))} />
          </div>
          <div>
            <div className="text-sm text-slate-600">Valor mensal</div>
            <input className="input" value={novo.valorMensal} onChange={(e) => setNovo((p) => ({ ...p, valorMensal: e.target.value }))} />
          </div>
          <div className="flex items-end justify-end md:col-span-2">
            <button className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white" type="button" onClick={criar}>
              Criar
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="text-lg font-semibold">Contratos</div>
        <div className="mt-3 overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Contraparte</th>
                <th className="px-3 py-2">Número</th>
                <th className="px-3 py-2">Serviço</th>
                <th className="px-3 py-2">Valor mensal</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.idContratoLocacao} className="border-t">
                  <td className="px-3 py-2">{r.idContratoLocacao}</td>
                  <td className="px-3 py-2">{r.tipo}</td>
                  <td className="px-3 py-2">{r.status}</td>
                  <td className="px-3 py-2">
                    {r.contraparteNome} ({r.contraparteTipo})
                  </td>
                  <td className="px-3 py-2">{r.numero || "-"}</td>
                  <td className="px-3 py-2">{r.codigoServico || "-"}</td>
                  <td className="px-3 py-2">{r.valorMensal == null ? "-" : r.valorMensal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td className="px-3 py-6 text-center text-slate-500" colSpan={7}>
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
