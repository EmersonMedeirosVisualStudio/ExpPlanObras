"use client";

import { useEffect, useMemo, useState } from "react";

type ApropriacaoRow = {
  id: number;
  dataReferencia: string;
  idObra: number;
  codigoServico: string;
  codigoCentroCusto: string | null;
  tipoRecurso: "FUNCIONARIO" | "EQUIPAMENTO";
  idRecurso: number;
  quantidade: number;
  horas: number;
  observacao: string | null;
};

type CcPolicy = { permitirSemCentroCusto: boolean; exibirAlerta: boolean; bloquearSalvamento: boolean };
type Vinculo = { codigoCentroCusto: string; centroCustoDescricao: string | null };

export default function ApropriacaoObraClient({ idObra }: { idObra: number }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<ApropriacaoRow[]>([]);
  const [policy, setPolicy] = useState<CcPolicy>({ permitirSemCentroCusto: false, exibirAlerta: true, bloquearSalvamento: false });
  const [ccs, setCcs] = useState<Vinculo[]>([]);
  const [servicos, setServicos] = useState<Array<{ codigoServico: string; descricaoServico: string | null }>>([]);
  const [planilhaOk, setPlanilhaOk] = useState<boolean | null>(null);

  const [novo, setNovo] = useState({
    dataReferencia: new Date().toISOString().slice(0, 10),
    codigoServico: "",
    codigoCentroCusto: "",
    tipoRecurso: "FUNCIONARIO" as "FUNCIONARIO" | "EQUIPAMENTO",
    idRecurso: "",
    quantidade: "",
    horas: "",
    observacao: "",
  });

  const codigoServicoNorm = useMemo(() => novo.codigoServico.trim().toUpperCase(), [novo.codigoServico]);

  async function carregarPolicy() {
    const res = await fetch("/api/v1/engenharia/apropriacao/config", { cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (res.ok && json?.success) setPolicy(json.data);
  }

  async function carregar() {
    try {
      setLoading(true);
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/obras/apropriacoes?idObra=${idObra}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar apropriações");
      setRows(Array.isArray(json.data) ? json.data : []);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar apropriações");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function carregarCcsServico() {
    if (!codigoServicoNorm) {
      setCcs([]);
      return;
    }
    try {
      const res = await fetch(`/api/v1/engenharia/obras/${idObra}/planilha/servicos/${encodeURIComponent(codigoServicoNorm)}/centros-custo`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setCcs([]);
        return;
      }
      const lista = Array.isArray(json.data?.selecionados) ? json.data.selecionados : [];
      setCcs(lista.map((r: any) => ({ codigoCentroCusto: String(r.codigoCentroCusto), centroCustoDescricao: null })));
    } catch {
      setCcs([]);
    }
  }

  async function salvar() {
    try {
      setLoading(true);
      setErr(null);
      const payload: any = {
        idObra,
        dataReferencia: novo.dataReferencia,
        codigoServico: codigoServicoNorm,
        codigoCentroCusto: novo.codigoCentroCusto.trim().toUpperCase() || null,
        tipoRecurso: novo.tipoRecurso,
        idRecurso: Number(novo.idRecurso || 0),
        quantidade: Number(String(novo.quantidade || "0").replace(",", ".")),
        horas: Number(String(novo.horas || "0").replace(",", ".")),
        observacao: novo.observacao.trim() || null,
      };
      const res = await fetch("/api/v1/engenharia/obras/apropriacoes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao salvar apropriação");
      setNovo((p) => ({ ...p, idRecurso: "", quantidade: "", horas: "", observacao: "" }));
      await carregar();
    } catch (e: any) {
      setErr(e?.message || "Erro ao salvar apropriação");
    } finally {
      setLoading(false);
    }
  }

  const alertaCc = useMemo(() => {
    if (!policy.exibirAlerta) return null;
    if (!codigoServicoNorm) return null;
    if (!ccs.length) return "Serviço sem centros de custo vinculados.";
    return null;
  }, [policy.exibirAlerta, codigoServicoNorm, ccs.length]);

  useEffect(() => {
    async function boot() {
      await carregarPolicy();
      try {
        const s = await fetch(`/api/v1/engenharia/obras/${idObra}/planilha/status`, { cache: "no-store" });
        const sj = await s.json().catch(() => null);
        if (s.ok && sj?.success) setPlanilhaOk(!!sj.data?.possuiPlanilha);
        else setPlanilhaOk(false);
      } catch {
        setPlanilhaOk(false);
      }
      try {
        const res = await fetch(`/api/v1/engenharia/obras/${idObra}/planilha/servicos`, { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (res.ok && json?.success) setServicos(Array.isArray(json.data) ? json.data : []);
        else setServicos([]);
      } catch {
        setServicos([]);
      }
      await carregar();
    }
    boot();
  }, [idObra]);

  useEffect(() => {
    carregarCcsServico();
  }, [codigoServicoNorm]);

  if (!idObra) return <div className="p-6 rounded-xl border bg-white">Obra inválida.</div>;
  if (planilhaOk === false) {
    return (
      <div className="p-6 space-y-4 max-w-5xl">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="font-semibold text-amber-900">A obra só pode iniciar após cadastrar a planilha orçamentária</div>
          <div className="mt-1 text-sm text-amber-900">Cadastre a planilha contratada da obra e selecione os centros de custo por serviço. Depois disso, a apropriação será liberada.</div>
        </div>
        <a className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white inline-block" href={`/dashboard/engenharia/obras/${idObra}/planilha`}>
          Abrir planilha contratada
        </a>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Apropriação — Obra #{idObra}</h1>
          <div className="text-sm text-slate-600">Registro mínimo: data, serviço, centro de custo, recurso, quantidade e horas.</div>
        </div>
        <button className="rounded-lg border px-4 py-2 text-sm" type="button" onClick={carregar} disabled={loading}>
          Atualizar
        </button>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="text-lg font-semibold">Nova apropriação</div>
        {alertaCc ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{alertaCc}</div> : null}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <div>
            <div className="text-sm text-slate-600">Data</div>
            <input className="input" type="date" value={novo.dataReferencia} onChange={(e) => setNovo((p) => ({ ...p, dataReferencia: e.target.value }))} />
          </div>
          <div className="md:col-span-2">
            <div className="text-sm text-slate-600">Serviço</div>
            <select className="input" value={novo.codigoServico} onChange={(e) => setNovo((p) => ({ ...p, codigoServico: e.target.value, codigoCentroCusto: "" }))}>
              <option value="">Selecione</option>
              {servicos.map((s) => (
                <option key={s.codigoServico} value={s.codigoServico}>
                  {s.codigoServico} {s.descricaoServico ? `— ${s.descricaoServico}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <div className="text-sm text-slate-600">Centro de custo</div>
            <select className="input" value={novo.codigoCentroCusto} onChange={(e) => setNovo((p) => ({ ...p, codigoCentroCusto: e.target.value }))}>
              <option value="">{policy.permitirSemCentroCusto ? "(sem centro de custo)" : "Selecione"}</option>
              {ccs.map((c) => (
                <option key={c.codigoCentroCusto} value={c.codigoCentroCusto}>
                  {c.codigoCentroCusto} {c.centroCustoDescricao ? `— ${c.centroCustoDescricao}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-sm text-slate-600">Recurso</div>
            <select className="input" value={novo.tipoRecurso} onChange={(e) => setNovo((p) => ({ ...p, tipoRecurso: e.target.value as any }))}>
              <option value="FUNCIONARIO">Funcionário</option>
              <option value="EQUIPAMENTO">Equipamento</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <div>
            <div className="text-sm text-slate-600">ID recurso</div>
            <input className="input" value={novo.idRecurso} onChange={(e) => setNovo((p) => ({ ...p, idRecurso: e.target.value }))} placeholder="Ex.: 123" />
          </div>
          <div>
            <div className="text-sm text-slate-600">Quantidade</div>
            <input className="input" value={novo.quantidade} onChange={(e) => setNovo((p) => ({ ...p, quantidade: e.target.value }))} />
          </div>
          <div>
            <div className="text-sm text-slate-600">Horas</div>
            <input className="input" value={novo.horas} onChange={(e) => setNovo((p) => ({ ...p, horas: e.target.value }))} />
          </div>
          <div className="md:col-span-3">
            <div className="text-sm text-slate-600">Observação</div>
            <input className="input" value={novo.observacao} onChange={(e) => setNovo((p) => ({ ...p, observacao: e.target.value }))} />
          </div>
        </div>

        <div className="flex justify-end">
          <button className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white" type="button" onClick={salvar} disabled={loading}>
            Salvar
          </button>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="text-lg font-semibold">Lançamentos</div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2">Serviço</th>
                <th className="px-3 py-2">CC</th>
                <th className="px-3 py-2">Recurso</th>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Qtd</th>
                <th className="px-3 py-2">Horas</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2">{r.dataReferencia}</td>
                  <td className="px-3 py-2">{r.codigoServico}</td>
                  <td className="px-3 py-2">{r.codigoCentroCusto || "-"}</td>
                  <td className="px-3 py-2">{r.tipoRecurso}</td>
                  <td className="px-3 py-2">{r.idRecurso}</td>
                  <td className="px-3 py-2">{Number(r.quantidade || 0).toFixed(2)}</td>
                  <td className="px-3 py-2">{Number(r.horas || 0).toFixed(2)}</td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                    Sem lançamentos.
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
