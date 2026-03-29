"use client";

import { useMemo, useState } from "react";

type Linha = {
  idManutencao: number;
  idAtivo: number;
  ativoDescricao: string;
  ativoCategoria: string;
  localTipo: string | null;
  localId: number | null;
  tipo: "PREVENTIVA" | "CORRETIVA";
  status: "ABERTA" | "EXECUTADA" | "CANCELADA";
  dataProgramada: string | null;
  dataExecucao: string | null;
  descricao: string | null;
  codigoServico: string | null;
  custoTotal: number | null;
  idContraparte: number | null;
  criadoEm: string;
};

export default function ManutencoesClient() {
  const [idAtivo, setIdAtivo] = useState("");
  const [status, setStatus] = useState<"" | Linha["status"]>("ABERTA");
  const [rows, setRows] = useState<Linha[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [novo, setNovo] = useState({
    idAtivo: "",
    tipo: "PREVENTIVA" as Linha["tipo"],
    dataProgramada: "",
    descricao: "",
    codigoServico: "",
    custoTotal: "",
    idContraparte: "",
  });

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (idAtivo) params.set("idAtivo", String(Number(idAtivo || 0)));
    if (status) params.set("status", status);
    const s = params.toString();
    return s ? `?${s}` : "";
  }, [idAtivo, status]);

  async function carregar() {
    try {
      setLoading(true);
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/ativos/manutencoes${queryString}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || "Erro ao carregar manutenções");
      setRows(Array.isArray(json) ? json : []);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar manutenções");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function criar() {
    try {
      setErr(null);
      const payload: any = {
        idAtivo: Number(novo.idAtivo || 0),
        tipo: novo.tipo,
        dataProgramada: novo.dataProgramada || null,
        descricao: novo.descricao || null,
        codigoServico: novo.codigoServico || null,
        custoTotal: novo.custoTotal ? Number(novo.custoTotal.replace(",", ".")) : null,
        idContraparte: novo.idContraparte ? Number(novo.idContraparte) : null,
      };
      const res = await fetch("/api/v1/engenharia/ativos/manutencoes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || "Erro ao criar manutenção");
      setNovo({ idAtivo: "", tipo: "PREVENTIVA", dataProgramada: "", descricao: "", codigoServico: "", custoTotal: "", idContraparte: "" });
      await carregar();
    } catch (e: any) {
      setErr(e?.message || "Erro ao criar manutenção");
    }
  }

  async function acao(idManutencao: number, acao: "EXECUTAR" | "CANCELAR") {
    try {
      setErr(null);
      const dataExecucao = acao === "EXECUTAR" ? window.prompt("Data de execução (YYYY-MM-DD) ou vazio para hoje") || "" : "";
      const res = await fetch(`/api/v1/engenharia/ativos/manutencoes/${idManutencao}/acao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao, dataExecucao: dataExecucao || null }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || "Erro ao executar ação");
      await carregar();
    } catch (e: any) {
      setErr(e?.message || "Erro ao executar ação");
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Manutenções de Ativos</h1>
        <p className="text-sm text-slate-600">Preventiva e corretiva, com histórico e custo opcional por código do serviço.</p>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <div className="text-sm text-slate-600">ID Ativo (opcional)</div>
            <input className="input" value={idAtivo} onChange={(e) => setIdAtivo(e.target.value)} placeholder="Ex.: 10" />
          </div>
          <div>
            <div className="text-sm text-slate-600">Status</div>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value as any)}>
              <option value="">Todos</option>
              <option value="ABERTA">Aberta</option>
              <option value="EXECUTADA">Executada</option>
              <option value="CANCELADA">Cancelada</option>
            </select>
          </div>
          <div className="flex items-end justify-end md:col-span-2">
            <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" type="button" onClick={carregar} disabled={loading}>
              {loading ? "Carregando..." : "Carregar"}
            </button>
          </div>
        </div>
        {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="text-lg font-semibold">Nova manutenção</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <div>
            <div className="text-sm text-slate-600">ID Ativo</div>
            <input className="input" value={novo.idAtivo} onChange={(e) => setNovo((p) => ({ ...p, idAtivo: e.target.value }))} />
          </div>
          <div>
            <div className="text-sm text-slate-600">Tipo</div>
            <select className="input" value={novo.tipo} onChange={(e) => setNovo((p) => ({ ...p, tipo: e.target.value as any }))}>
              <option value="PREVENTIVA">Preventiva</option>
              <option value="CORRETIVA">Corretiva</option>
            </select>
          </div>
          <div>
            <div className="text-sm text-slate-600">Data programada</div>
            <input className="input" type="date" value={novo.dataProgramada} onChange={(e) => setNovo((p) => ({ ...p, dataProgramada: e.target.value }))} />
          </div>
          <div className="md:col-span-3">
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
            <div className="text-sm text-slate-600">Custo total</div>
            <input className="input" value={novo.custoTotal} onChange={(e) => setNovo((p) => ({ ...p, custoTotal: e.target.value }))} />
          </div>
          <div>
            <div className="text-sm text-slate-600">Contraparte (opcional)</div>
            <input className="input" value={novo.idContraparte} onChange={(e) => setNovo((p) => ({ ...p, idContraparte: e.target.value }))} placeholder="ID" />
          </div>
          <div className="flex items-end justify-end md:col-span-2">
            <button className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white" type="button" onClick={criar}>
              Criar
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="text-lg font-semibold">Manutenções</div>
        <div className="mt-3 overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Ativo</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Programada</th>
                <th className="px-3 py-2">Execução</th>
                <th className="px-3 py-2">Serviço</th>
                <th className="px-3 py-2">Custo</th>
                <th className="px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.idManutencao} className="border-t">
                  <td className="px-3 py-2">{r.idManutencao}</td>
                  <td className="px-3 py-2">
                    #{r.idAtivo} {r.ativoDescricao}
                  </td>
                  <td className="px-3 py-2">{r.tipo}</td>
                  <td className="px-3 py-2">{r.status}</td>
                  <td className="px-3 py-2">{r.dataProgramada || "-"}</td>
                  <td className="px-3 py-2">{r.dataExecucao || "-"}</td>
                  <td className="px-3 py-2">{r.codigoServico || "-"}</td>
                  <td className="px-3 py-2">{r.custoTotal == null ? "-" : r.custoTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                  <td className="px-3 py-2">
                    {r.status === "ABERTA" ? (
                      <div className="flex gap-2">
                        <button className="rounded border px-2 py-1 text-xs" type="button" onClick={() => acao(r.idManutencao, "EXECUTAR")}>
                          Executar
                        </button>
                        <button className="rounded border px-2 py-1 text-xs" type="button" onClick={() => acao(r.idManutencao, "CANCELAR")}>
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td className="px-3 py-6 text-center text-slate-500" colSpan={9}>
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

