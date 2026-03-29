"use client";

import { useMemo, useState } from "react";

type Linha = {
  idSolicitacao: number;
  tipoLocal: "OBRA" | "UNIDADE";
  idLocal: number;
  categoria: "EQUIPAMENTO" | "FERRAMENTA" | "COMBUSTIVEL" | "OUTRO";
  descricao: string;
  quantidade: number;
  unidadeMedida: string | null;
  codigoServico: string | null;
  prioridade: "BAIXA" | "MEDIA" | "ALTA" | "CRITICA";
  status: "RASCUNHO" | "ENVIADA" | "APROVADA" | "REJEITADA" | "CANCELADA";
  criadoEm: string;
};

export default function AquisicoesClient() {
  const [tipoLocal, setTipoLocal] = useState<"OBRA" | "UNIDADE">("OBRA");
  const [idLocal, setIdLocal] = useState("");
  const [status, setStatus] = useState<"" | Linha["status"]>("");
  const [rows, setRows] = useState<Linha[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [novo, setNovo] = useState({
    categoria: "EQUIPAMENTO" as Linha["categoria"],
    descricao: "",
    quantidade: "1",
    unidadeMedida: "",
    codigoServico: "",
    prioridade: "MEDIA" as Linha["prioridade"],
    justificativa: "",
  });

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("tipoLocal", tipoLocal);
    params.set("idLocal", String(Number(idLocal || 0)));
    if (status) params.set("status", status);
    const s = params.toString();
    return `?${s}`;
  }, [tipoLocal, idLocal, status]);

  async function carregar() {
    const id = Number(idLocal || 0);
    if (!id) return;
    try {
      setLoading(true);
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/aquisicoes${queryString}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || "Erro ao carregar solicitações");
      setRows(Array.isArray(json) ? json : []);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar solicitações");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function criar() {
    const id = Number(idLocal || 0);
    if (!id) return;
    try {
      setErr(null);
      const res = await fetch("/api/v1/engenharia/aquisicoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipoLocal,
          idLocal: id,
          categoria: novo.categoria,
          descricao: novo.descricao,
          quantidade: Number(novo.quantidade.replace(",", ".")),
          unidadeMedida: novo.unidadeMedida || null,
          codigoServico: novo.codigoServico || null,
          prioridade: novo.prioridade,
          justificativa: novo.justificativa || null,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || "Erro ao criar solicitação");
      setNovo({ categoria: "EQUIPAMENTO", descricao: "", quantidade: "1", unidadeMedida: "", codigoServico: "", prioridade: "MEDIA", justificativa: "" });
      await carregar();
    } catch (e: any) {
      setErr(e?.message || "Erro ao criar solicitação");
    }
  }

  async function acao(idSolicitacao: number, acao: "ENVIAR" | "APROVAR" | "REJEITAR" | "CANCELAR") {
    try {
      setErr(null);
      const motivo = acao === "REJEITAR" ? window.prompt("Motivo da rejeição?") || "" : "";
      const res = await fetch(`/api/v1/engenharia/aquisicoes/${idSolicitacao}/acao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao, motivo: motivo || null }),
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
        <h1 className="text-2xl font-semibold">Aquisições (Demandas)</h1>
        <p className="text-sm text-slate-600">Solicitações de aquisição para equipamentos, ferramentas e consumos, com apropriação por código do serviço quando aplicável.</p>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <div className="text-sm text-slate-600">Tipo local</div>
            <select className="input" value={tipoLocal} onChange={(e) => setTipoLocal(e.target.value as any)}>
              <option value="OBRA">Obra</option>
              <option value="UNIDADE">Unidade</option>
            </select>
          </div>
          <div>
            <div className="text-sm text-slate-600">ID Local</div>
            <input className="input" value={idLocal} onChange={(e) => setIdLocal(e.target.value)} placeholder="Ex.: 12" />
          </div>
          <div>
            <div className="text-sm text-slate-600">Status</div>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value as any)}>
              <option value="">Todos</option>
              <option value="RASCUNHO">Rascunho</option>
              <option value="ENVIADA">Enviada</option>
              <option value="APROVADA">Aprovada</option>
              <option value="REJEITADA">Rejeitada</option>
              <option value="CANCELADA">Cancelada</option>
            </select>
          </div>
          <div className="flex items-end justify-end">
            <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" type="button" onClick={carregar} disabled={loading}>
              {loading ? "Carregando..." : "Carregar"}
            </button>
          </div>
        </div>
        {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="text-lg font-semibold">Nova solicitação</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <div>
            <div className="text-sm text-slate-600">Categoria</div>
            <select className="input" value={novo.categoria} onChange={(e) => setNovo((p) => ({ ...p, categoria: e.target.value as any }))}>
              <option value="EQUIPAMENTO">Equipamento</option>
              <option value="FERRAMENTA">Ferramenta</option>
              <option value="COMBUSTIVEL">Combustível</option>
              <option value="OUTRO">Outro</option>
            </select>
          </div>
          <div className="md:col-span-3">
            <div className="text-sm text-slate-600">Descrição</div>
            <input className="input" value={novo.descricao} onChange={(e) => setNovo((p) => ({ ...p, descricao: e.target.value }))} />
          </div>
          <div>
            <div className="text-sm text-slate-600">Quantidade</div>
            <input className="input" value={novo.quantidade} onChange={(e) => setNovo((p) => ({ ...p, quantidade: e.target.value }))} />
          </div>
          <div>
            <div className="text-sm text-slate-600">Unidade</div>
            <input className="input" value={novo.unidadeMedida} onChange={(e) => setNovo((p) => ({ ...p, unidadeMedida: e.target.value }))} placeholder="un, L, m³" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <div className="md:col-span-2">
            <div className="text-sm text-slate-600">Código do serviço (SER-0001)</div>
            <input className="input" value={novo.codigoServico} onChange={(e) => setNovo((p) => ({ ...p, codigoServico: e.target.value }))} />
          </div>
          <div>
            <div className="text-sm text-slate-600">Prioridade</div>
            <select className="input" value={novo.prioridade} onChange={(e) => setNovo((p) => ({ ...p, prioridade: e.target.value as any }))}>
              <option value="BAIXA">Baixa</option>
              <option value="MEDIA">Média</option>
              <option value="ALTA">Alta</option>
              <option value="CRITICA">Crítica</option>
            </select>
          </div>
          <div className="md:col-span-3">
            <div className="text-sm text-slate-600">Justificativa</div>
            <input className="input" value={novo.justificativa} onChange={(e) => setNovo((p) => ({ ...p, justificativa: e.target.value }))} />
          </div>
        </div>
        <div className="flex justify-end">
          <button className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white" type="button" onClick={criar}>
            Criar
          </button>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="text-lg font-semibold">Solicitações</div>
        <div className="mt-3 overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Categoria</th>
                <th className="px-3 py-2">Descrição</th>
                <th className="px-3 py-2">Qtd</th>
                <th className="px-3 py-2">Serviço</th>
                <th className="px-3 py-2">Prioridade</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.idSolicitacao} className="border-t">
                  <td className="px-3 py-2">{r.idSolicitacao}</td>
                  <td className="px-3 py-2">{r.categoria}</td>
                  <td className="px-3 py-2">{r.descricao}</td>
                  <td className="px-3 py-2">
                    {Number(r.quantidade || 0).toFixed(2)} {r.unidadeMedida || ""}
                  </td>
                  <td className="px-3 py-2">{r.codigoServico || "-"}</td>
                  <td className="px-3 py-2">{r.prioridade}</td>
                  <td className="px-3 py-2">{r.status}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      {r.status === "RASCUNHO" ? (
                        <button className="rounded border px-2 py-1 text-xs" type="button" onClick={() => acao(r.idSolicitacao, "ENVIAR")}>
                          Enviar
                        </button>
                      ) : null}
                      {r.status === "ENVIADA" ? (
                        <>
                          <button className="rounded border px-2 py-1 text-xs" type="button" onClick={() => acao(r.idSolicitacao, "APROVAR")}>
                            Aprovar
                          </button>
                          <button className="rounded border px-2 py-1 text-xs" type="button" onClick={() => acao(r.idSolicitacao, "REJEITAR")}>
                            Rejeitar
                          </button>
                        </>
                      ) : null}
                      {["RASCUNHO", "ENVIADA"].includes(r.status) ? (
                        <button className="rounded border px-2 py-1 text-xs" type="button" onClick={() => acao(r.idSolicitacao, "CANCELAR")}>
                          Cancelar
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td className="px-3 py-6 text-center text-slate-500" colSpan={8}>
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

