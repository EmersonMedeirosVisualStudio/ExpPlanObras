 "use client";
 
import { useEffect, useMemo, useRef, useState } from "react";
 import { useParams, useRouter, useSearchParams } from "next/navigation";
 
 type ItemRow = {
  idItemBase: number;
   etapa: string;
   tipoItem: string;
   codigoItem: string;
   descricao: string;
   und: string;
   quantidade: string;
   perdaPercentual: string;
   codigoCentroCusto: string;
  codigoCentroCustoBase: string;
 };
 
type CentroCustoOption = { codigo: string; descricao: string };

type PrevistoPlanilhaRow = {
  item: string;
  servicos: string;
  und: string;
  quant: string;
  valorUnitario: string;
  valorParcial: string;
};

 function toNum(v: string) {
   const s = String(v || "").trim();
   if (!s) return null;
   const norm = s.replace(/\./g, "").replace(",", ".").replace(/[^\d.\-]/g, "");
   const n = Number(norm);
   return Number.isFinite(n) ? n : null;
 }
 
function parseNumberLoose(v: unknown) {
  const raw = String(v ?? "").trim();
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d,.\-]/g, "");
  if (!cleaned) return null;
  if (cleaned.includes(",") && cleaned.includes(".")) {
    if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
      const n = Number(cleaned.replace(/\./g, "").replace(",", "."));
      return Number.isFinite(n) ? n : null;
    }
    const n = Number(cleaned.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  if (cleaned.includes(",")) {
    const n = Number(cleaned.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

 export default function Page() {
   const router = useRouter();
   const params = useParams();
   const search = useSearchParams();
 
   const idObra = useMemo(() => Number((params as any)?.id || 0), [params]);
   const codigoServico = useMemo(() => decodeURIComponent(String((params as any)?.codigo || "")).trim().toUpperCase(), [params]);
   const returnTo = search.get("returnTo");
 
   const [loading, setLoading] = useState(false);
   const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
   const [itens, setItens] = useState<ItemRow[]>([]);
  const [centrosCusto, setCentrosCusto] = useState<CentroCustoOption[]>([]);
  const [previstoRows, setPrevistoRows] = useState<PrevistoPlanilhaRow[]>([]);
 
   const fileInputRef = useRef<HTMLInputElement | null>(null);
 
   async function authFetch(input: RequestInfo | URL, init?: RequestInit) {
     let token: string | null = null;
     try {
       token = localStorage.getItem("token");
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
     if (!idObra || !codigoServico) return;
     try {
       setLoading(true);
       setErr(null);
      setOkMsg(null);
       const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/servicos/${encodeURIComponent(codigoServico)}/composicao-itens`);
       const json = await res.json().catch(() => null);
       if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar composição");
       const list = Array.isArray(json.data?.itens) ? json.data.itens : [];
       setItens(
         list.map((i: any) => ({
          idItemBase: Number(i.idItemBase || 0),
           etapa: String(i.etapa || ""),
           tipoItem: String(i.tipoItem || "INSUMO"),
           codigoItem: String(i.codigoItem || ""),
           descricao: String(i.descricao || ""),
           und: String(i.und || ""),
           quantidade: i.quantidade == null ? "" : String(i.quantidade),
           perdaPercentual: i.perdaPercentual == null ? "" : String(i.perdaPercentual),
           codigoCentroCusto: String(i.codigoCentroCusto || ""),
          codigoCentroCustoBase: String(i.codigoCentroCustoBase || ""),
         }))
       );
     } catch (e: any) {
       setErr(e?.message || "Erro ao carregar composição");
       setItens([]);
     } finally {
       setLoading(false);
     }
   }
 
   async function salvar() {
     if (!idObra || !codigoServico) return;
     try {
       setLoading(true);
       setErr(null);
      setOkMsg(null);
       const payload = itens
         .map((i) => ({
           etapa: i.etapa,
           tipoItem: i.tipoItem,
           codigoItem: i.codigoItem,
           descricao: i.descricao,
           und: i.und,
           quantidade: i.quantidade,
           perdaPercentual: i.perdaPercentual,
           codigoCentroCusto: i.codigoCentroCusto,
         }))
         .filter((i) => i.codigoItem.trim() && toNum(i.quantidade) != null);
 
       const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/servicos/${encodeURIComponent(codigoServico)}/composicao-itens`, {
         method: "PUT",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ itens: payload }),
       });
       const json = await res.json().catch(() => null);
       if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao salvar composição");
       await carregar();
      setOkMsg("Composição salva com sucesso.");
     } catch (e: any) {
       setErr(e?.message || "Erro ao salvar composição");
     } finally {
       setLoading(false);
     }
   }
 
   async function importarCsv(file: File) {
     if (!idObra || !codigoServico) return;
     try {
       setLoading(true);
       setErr(null);
      setOkMsg(null);
       const form = new FormData();
       form.append("file", file);
       const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/servicos/${encodeURIComponent(codigoServico)}/composicao-importar-csv`, { method: "POST", body: form });
       const json = await res.json().catch(() => null);
       if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao importar CSV");
       await carregar();
      setOkMsg("CSV importado com sucesso.");
     } catch (e: any) {
       setErr(e?.message || "Erro ao importar CSV");
     } finally {
       setLoading(false);
       if (fileInputRef.current) fileInputRef.current.value = "";
     }
   }

  async function carregarCentrosCusto() {
    try {
      const res = await authFetch(`/api/v1/engenharia/centros-custo?ativo=1`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setCentrosCusto([]);
        return;
      }
      const lista = Array.isArray(json.data) ? json.data : [];
      setCentrosCusto(lista.map((c: any) => ({ codigo: String(c.codigo), descricao: String(c.descricao || "") })));
    } catch {
      setCentrosCusto([]);
    }
  }

  async function carregarPrevistoPlanilha() {
    if (!idObra || !codigoServico) return;
    try {
      const resV = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha?view=versoes`);
      const jsonV = await resV.json().catch(() => null);
      if (!resV.ok || !jsonV?.success) throw new Error(jsonV?.message || "Erro ao carregar versões");
      const versoes = Array.isArray(jsonV.data?.versoes) ? jsonV.data.versoes : [];
      const atual = versoes.find((v: any) => Boolean(v.atual)) || versoes[0] || null;
      const planilhaId = atual?.idPlanilha != null ? Number(atual.idPlanilha) : 0;
      if (!planilhaId) {
        setPrevistoRows([]);
        return;
      }

      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha?planilhaId=${planilhaId}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar planilha");
      const linhas = Array.isArray(json.data?.planilha?.linhas) ? json.data.planilha.linhas : [];
      const rows = linhas
        .filter((l: any) => String(l.tipoLinha || "").toUpperCase() === "SERVICO" && String(l.codigo || "").trim().toUpperCase() === codigoServico)
        .map((l: any) => ({
          item: String(l.item || ""),
          servicos: String(l.servicos || ""),
          und: String(l.und || ""),
          quant: String(l.quant || ""),
          valorUnitario: String(l.valorUnitario || ""),
          valorParcial: String(l.valorParcial || ""),
        }));
      setPrevistoRows(rows);
    } catch {
      setPrevistoRows([]);
    }
  }

  function baixarModeloComposicoesCsv() {
    const sep = ";";
    const lines = [
      ["codigo_servico", "etapa", "tipo_item", "codigo_item", "descricao", "und", "quantidade", "perda_percentual", "codigo_centro_custo"].join(sep),
      [`${codigoServico || "SER-0001"}`, "PRELIMINARES", "INSUMO", "INS-0001", "Cimento CP-II", "kg", "100", "0", ""].join(sep),
      [`${codigoServico || "SER-0001"}`, "PRELIMINARES", "INSUMO", "INS-0002", "Areia média", "m³", "0,50", "5", ""].join(sep),
    ];
    const csv = `${lines.join("\n")}\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `composicao_servico_${codigoServico || "modelo"}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    if (!idObra || !codigoServico) return;
    carregarCentrosCusto();
    carregar();
    carregarPrevistoPlanilha();
  }, [idObra, codigoServico]);

  const previstoTotal = useMemo(() => {
    let total = 0;
    for (const r of previstoRows) {
      const n = parseNumberLoose(r.valorParcial);
      if (n != null) total += n;
    }
    return Number(total.toFixed(2));
  }, [previstoRows]);
 
   return (
     <div className="p-6 space-y-4 max-w-7xl text-slate-900">
       <div className="flex items-start justify-between gap-3 flex-wrap">
         <div>
           <div className="text-xs text-slate-500">Engenharia → Obras → Obra selecionada → Planilha orçamentária → Serviço</div>
           <h1 className="text-2xl font-semibold">Composição do serviço {codigoServico || "—"}</h1>
           <div className="text-sm text-slate-600">Importe por CSV ou cadastre manualmente os insumos do serviço.</div>
         </div>
         <div className="flex items-center gap-2 flex-wrap">
           <button className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50" type="button" onClick={() => router.push(returnTo || `/dashboard/engenharia/obras/${idObra}/planilha`)}>
             Voltar
           </button>
          <button
            className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={async () => {
              await Promise.all([carregar(), carregarPrevistoPlanilha()]);
            }}
            disabled={loading}
          >
             Carregar
           </button>
           <input
             ref={fileInputRef}
             type="file"
             accept=".csv,text/csv"
             className="hidden"
             onChange={(e) => {
               const f = (e.target.files || [])[0] || null;
               if (f) importarCsv(f);
             }}
           />
           <button className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60" type="button" onClick={() => fileInputRef.current?.click()} disabled={loading}>
             Importar CSV
           </button>
           <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-60" type="button" onClick={salvar} disabled={loading}>
             Salvar
           </button>
         </div>
       </div>
 
      <div className="flex flex-wrap gap-2">
        <button className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50" type="button" onClick={baixarModeloComposicoesCsv} disabled={loading}>
          Modelo CSV (composição)
        </button>
      </div>

      {okMsg ? <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{okMsg}</div> : null}
       {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}
 
      <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-lg font-semibold">Previsto na planilha</div>
            <div className="text-sm text-slate-600">Quant., valor unit. e total previsto para este serviço (se houver mais de 1 linha, aparece separado).</div>
          </div>
          <div className="text-sm text-slate-700">
            Total: <span className="font-semibold">{moeda(Number(previstoTotal || 0))}</span>
          </div>
        </div>

        <div className="overflow-auto">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-700">
              <tr>
                <th className="px-3 py-2">ITEM</th>
                <th className="px-3 py-2">SERVIÇO</th>
                <th className="px-3 py-2">UND</th>
                <th className="px-3 py-2 text-right">QUANT.</th>
                <th className="px-3 py-2 text-right">VALOR UNIT.</th>
                <th className="px-3 py-2 text-right">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {previstoRows.map((r, idx) => (
                <tr key={`${r.item}-${idx}`} className="border-t">
                  <td className="px-3 py-2">{r.item}</td>
                  <td className="px-3 py-2">{r.servicos}</td>
                  <td className="px-3 py-2">{r.und}</td>
                  <td className="px-3 py-2 text-right">{r.quant}</td>
                  <td className="px-3 py-2 text-right">{r.valorUnitario}</td>
                  <td className="px-3 py-2 text-right">{r.valorParcial ? moeda(Number(parseNumberLoose(r.valorParcial) || 0)) : ""}</td>
                </tr>
              ))}
              {previstoRows.length > 1 ? (
                <tr className="border-t bg-slate-50">
                  <td className="px-3 py-2 font-semibold" colSpan={5}>
                    Totais
                  </td>
                  <td className="px-3 py-2 text-right font-semibold">{moeda(Number(previstoTotal || 0))}</td>
                </tr>
              ) : null}
              {!previstoRows.length ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                    Serviço não encontrado na planilha atual.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

       <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
         <div className="flex items-center justify-between gap-3 flex-wrap">
           <div className="text-lg font-semibold">Itens (insumos)</div>
           <button
             className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
             type="button"
             onClick={() =>
               setItens((p) => [
                 ...p,
                {
                  idItemBase: Date.now(),
                  etapa: "",
                  tipoItem: "INSUMO",
                  codigoItem: "",
                  descricao: "",
                  und: "",
                  quantidade: "",
                  perdaPercentual: "",
                  codigoCentroCusto: "",
                  codigoCentroCustoBase: "",
                },
               ])
             }
             disabled={loading}
           >
             Adicionar item
           </button>
         </div>
 
         <div className="overflow-auto">
           <table className="min-w-[1100px] w-full text-sm">
             <thead className="bg-slate-50 text-left text-slate-700">
               <tr>
                 <th className="px-3 py-2">Etapa</th>
                 <th className="px-3 py-2">Tipo</th>
                 <th className="px-3 py-2">Código</th>
                 <th className="px-3 py-2">Descrição</th>
                 <th className="px-3 py-2">UND</th>
                 <th className="px-3 py-2">Qtd</th>
                 <th className="px-3 py-2">Perda%</th>
                 <th className="px-3 py-2">Centro de custo</th>
                 <th className="px-3 py-2">Ações</th>
               </tr>
             </thead>
             <tbody>
               {itens.map((r, idx) => (
                 <tr key={idx} className="border-t">
                   <td className="px-3 py-2">
                     <input className="input bg-white" value={r.etapa} onChange={(e) => setItens((p) => p.map((x, i) => (i === idx ? { ...x, etapa: e.target.value } : x)))} />
                   </td>
                   <td className="px-3 py-2">
                     <select className="input bg-white" value={r.tipoItem} onChange={(e) => setItens((p) => p.map((x, i) => (i === idx ? { ...x, tipoItem: e.target.value } : x)))}>
                       <option value="INSUMO">INSUMO</option>
                       <option value="MAO_DE_OBRA">MAO_DE_OBRA</option>
                       <option value="EQUIPAMENTO">EQUIPAMENTO</option>
                     </select>
                   </td>
                   <td className="px-3 py-2">
                     <input className="input bg-white" value={r.codigoItem} onChange={(e) => setItens((p) => p.map((x, i) => (i === idx ? { ...x, codigoItem: e.target.value } : x)))} />
                   </td>
                   <td className="px-3 py-2">
                     <input className="input bg-white" value={r.descricao} onChange={(e) => setItens((p) => p.map((x, i) => (i === idx ? { ...x, descricao: e.target.value } : x)))} />
                   </td>
                   <td className="px-3 py-2">
                     <input className="input bg-white" value={r.und} onChange={(e) => setItens((p) => p.map((x, i) => (i === idx ? { ...x, und: e.target.value } : x)))} />
                   </td>
                   <td className="px-3 py-2">
                     <input className="input bg-white" value={r.quantidade} onChange={(e) => setItens((p) => p.map((x, i) => (i === idx ? { ...x, quantidade: e.target.value } : x)))} />
                   </td>
                   <td className="px-3 py-2">
                     <input className="input bg-white" value={r.perdaPercentual} onChange={(e) => setItens((p) => p.map((x, i) => (i === idx ? { ...x, perdaPercentual: e.target.value } : x)))} />
                   </td>
                   <td className="px-3 py-2">
                    <select
                      className="input bg-white"
                      value={r.codigoCentroCusto}
                      onChange={(e) => setItens((p) => p.map((x, i) => (i === idx ? { ...x, codigoCentroCusto: e.target.value } : x)))}
                    >
                      <option value="">(sem CC)</option>
                      {centrosCusto.map((c) => (
                        <option key={c.codigo} value={c.codigo}>
                          {c.codigo} — {c.descricao}
                        </option>
                      ))}
                    </select>
                   </td>
                   <td className="px-3 py-2">
                     <button className="rounded border px-2 py-1 text-xs text-red-700 disabled:opacity-60" type="button" onClick={() => setItens((p) => p.filter((_, i) => i !== idx))} disabled={loading}>
                       Remover
                     </button>
                   </td>
                 </tr>
               ))}
               {!itens.length ? (
                 <tr>
                   <td colSpan={9} className="px-3 py-6 text-center text-slate-500">
                     Sem itens. Clique em Carregar, Importar CSV ou Adicionar item.
                   </td>
                 </tr>
               ) : null}
             </tbody>
           </table>
         </div>
       </section>
     </div>
   );
 }
