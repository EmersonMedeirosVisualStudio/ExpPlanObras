"use client";

import { useState } from "react";

type Linha = { tipoConsumo: "ENERGIA" | "AGUA" | "ESGOTO"; consumo: number | null; valorTotal: number; observacao: string | null };

export default function ConsumosClient() {
  const [tipoLocal, setTipoLocal] = useState<"OBRA" | "UNIDADE">("OBRA");
  const [idLocal, setIdLocal] = useState("");
  const [competencia, setCompetencia] = useState(() => new Date().toISOString().slice(0, 7));
  const [rows, setRows] = useState<Linha[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function carregar() {
    try {
      const id = Number(idLocal || 0);
      if (!id) return;
      setLoading(true);
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/consumos?tipoLocal=${tipoLocal}&idLocal=${id}&competencia=${competencia}`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "Erro ao carregar consumos");
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar consumos");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function salvar(tipoConsumo: Linha["tipoConsumo"], payload: { consumo: string; valorTotal: string; observacao: string }) {
    try {
      const id = Number(idLocal || 0);
      if (!id) return;
      setErr(null);
      const res = await fetch("/api/v1/engenharia/consumos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipoLocal,
          idLocal: id,
          competencia,
          tipoConsumo,
          consumo: payload.consumo ? Number(payload.consumo.replace(",", ".")) : null,
          valorTotal: Number(payload.valorTotal.replace(",", ".")),
          observacao: payload.observacao || null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "Erro ao salvar consumo");
      await carregar();
    } catch (e: any) {
      setErr(e?.message || "Erro ao salvar consumo");
    }
  }

  function linha(tipoConsumo: Linha["tipoConsumo"]) {
    const r = rows.find((x) => x.tipoConsumo === tipoConsumo);
    return {
      consumo: r?.consumo == null ? "" : String(r.consumo),
      valorTotal: r ? String(r.valorTotal) : "0",
      observacao: r?.observacao || "",
    };
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Gestão de Consumos</h1>
        <p className="text-sm text-slate-600">Energia, água e esgoto por unidade/obra (competência mensal).</p>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
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
            <div className="text-sm text-slate-600">Competência</div>
            <input className="input" type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} />
          </div>
          <div className="flex items-end justify-end">
            <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" type="button" onClick={carregar} disabled={loading}>
              {loading ? "Carregando..." : "Carregar"}
            </button>
          </div>
        </div>
        {err ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}
      </div>

      {(["ENERGIA", "AGUA", "ESGOTO"] as const).map((tipo) => {
        const l = linha(tipo);
        return (
          <ConsumoForm key={tipo} tipo={tipo} initial={l} onSave={(p) => salvar(tipo, p)} />
        );
      })}
    </div>
  );
}

function ConsumoForm({
  tipo,
  initial,
  onSave,
}: {
  tipo: "ENERGIA" | "AGUA" | "ESGOTO";
  initial: { consumo: string; valorTotal: string; observacao: string };
  onSave: (p: { consumo: string; valorTotal: string; observacao: string }) => void;
}) {
  const [consumo, setConsumo] = useState(initial.consumo);
  const [valorTotal, setValorTotal] = useState(initial.valorTotal);
  const [observacao, setObservacao] = useState(initial.observacao);

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
      <div className="text-lg font-semibold">{tipo}</div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
        <div className="md:col-span-2">
          <div className="text-sm text-slate-600">Consumo (opcional)</div>
          <input className="input" value={consumo} onChange={(e) => setConsumo(e.target.value)} placeholder="kWh / m³" />
        </div>
        <div className="md:col-span-2">
          <div className="text-sm text-slate-600">Valor total</div>
          <input className="input" value={valorTotal} onChange={(e) => setValorTotal(e.target.value)} placeholder="0" />
        </div>
        <div className="md:col-span-2">
          <div className="text-sm text-slate-600">Observação</div>
          <input className="input" value={observacao} onChange={(e) => setObservacao(e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end">
        <button className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white" type="button" onClick={() => onSave({ consumo, valorTotal, observacao })}>
          Salvar
        </button>
      </div>
    </div>
  );
}

