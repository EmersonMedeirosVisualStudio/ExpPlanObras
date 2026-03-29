"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type ObraRef = { id: number; nome: string };

export default function EngenhariaObrasPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [obras, setObras] = useState<ObraRef[]>([]);

  async function carregar() {
    try {
      setLoading(true);
      setErr(null);
      const res = await fetch("/api/v1/dashboard/me/filtros", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar obras");
      const lista = Array.isArray(json.data?.obras) ? json.data.obras : [];
      setObras(lista.map((o: any) => ({ id: Number(o.id), nome: String(o.nome || `Obra #${o.id}`) })));
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar obras");
      setObras([]);
    } finally {
      setLoading(false);
    }
  }

  const filtradas = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return obras;
    return obras.filter((o) => String(o.id).includes(term) || o.nome.toLowerCase().includes(term));
  }, [obras, q]);

  useEffect(() => {
    carregar();
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Engenharia → Obras</h1>
          <div className="text-sm text-slate-600">Selecione uma obra para abrir as janelas operacionais (planejamento, apropriação, equipamentos, insumos e documentos).</div>
        </div>
        <button className="rounded-lg border px-4 py-2 text-sm" type="button" onClick={carregar} disabled={loading}>
          {loading ? "Carregando..." : "Atualizar"}
        </button>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <div className="md:col-span-4">
            <div className="text-sm text-slate-600">Buscar obra</div>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Digite ID ou nome" />
          </div>
          <div className="md:col-span-2 flex items-end justify-end">
            <div className="text-sm text-slate-500">{filtradas.length} obra(s)</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {filtradas.map((o) => (
          <button
            key={o.id}
            type="button"
            className="rounded-xl border bg-white p-4 shadow-sm text-left hover:bg-slate-50"
            onClick={() => router.push(`/dashboard/engenharia/obras/${o.id}`)}
          >
            <div className="font-semibold">{o.nome}</div>
            <div className="text-sm text-slate-600">Abrir janelas da obra</div>
          </button>
        ))}
        {!filtradas.length ? <div className="rounded-xl border bg-white p-6 text-sm text-slate-500">Nenhuma obra encontrada.</div> : null}
      </div>
    </div>
  );
}

