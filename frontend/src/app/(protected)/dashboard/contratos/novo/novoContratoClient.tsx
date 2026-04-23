"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/api";

function parseMoneyBR(input: string) {
  const s = String(input || "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function formatMoneyBRFromDigits(digits: string) {
  const onlyDigits = (digits || "").replace(/\D/g, "");
  const cents = onlyDigits ? Number(onlyDigits) : 0;
  const value = cents / 100;
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function NovoContratoClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const contratoId = sp.get("id");
  const isEdit = Boolean(contratoId);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [numeroContrato, setNumeroContrato] = useState("");
  const [nome, setNome] = useState("");
  const [objeto, setObjeto] = useState("");
  const [descricao, setDescricao] = useState("");
  const [tipoContratante, setTipoContratante] = useState<"PUBLICO" | "PRIVADO" | "PF">("PUBLICO");
  const [empresaParceiraNome, setEmpresaParceiraNome] = useState("");
  const [empresaParceiraDocumento, setEmpresaParceiraDocumento] = useState("");
  const [status, setStatus] = useState("ATIVO");
  const [dataAssinatura, setDataAssinatura] = useState("");
  const [dataOS, setDataOS] = useState("");
  const [prazoValor, setPrazoValor] = useState("");
  const [prazoUnidade, setPrazoUnidade] = useState<"DIAS" | "SEMANAS" | "MESES" | "ANOS">("DIAS");

  const [vigenciaCalculada, setVigenciaCalculada] = useState<string>("");
  const [aditivosInfo, setAditivosInfo] = useState<{ total: number; rascunho: number } | null>(null);

  const [valorConcedenteInicial, setValorConcedenteInicial] = useState("0,00");
  const [valorProprioInicial, setValorProprioInicial] = useState("0,00");
  const [valorConcedenteAtual, setValorConcedenteAtual] = useState("0,00");
  const [valorProprioAtual, setValorProprioAtual] = useState("0,00");
  const [valorTotalInicial, setValorTotalInicial] = useState("0,00");
  const [valorTotalAtual, setValorTotalAtual] = useState("0,00");

  const isPublico = tipoContratante === "PUBLICO";

  const baseDate = useMemo(() => dataOS || dataAssinatura || "", [dataOS, dataAssinatura]);
  const prazoDias = useMemo(() => {
    const q = Math.trunc(Number(prazoValor || 0));
    if (!q || q <= 0) return 0;
    if (prazoUnidade === "SEMANAS") return q * 7;
    if (prazoUnidade === "MESES") return q * 30;
    if (prazoUnidade === "ANOS") return q * 365;
    return q;
  }, [prazoValor, prazoUnidade]);

  useEffect(() => {
    if (!baseDate || !prazoDias || prazoDias <= 0) {
      setVigenciaCalculada("");
      return;
    }
    const base = new Date(`${baseDate}T00:00:00`);
    if (Number.isNaN(base.getTime())) {
      setVigenciaCalculada("");
      return;
    }
    const result = new Date(base);
    result.setDate(result.getDate() + prazoDias);
    setVigenciaCalculada(result.toISOString().slice(0, 10));
  }, [baseDate, prazoDias]);

  useEffect(() => {
    if (!contratoId) {
      setAditivosInfo(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const [cres, ares] = await Promise.all([api.get(`/api/contratos/${contratoId}`), api.get(`/api/contratos/${contratoId}/aditivos`)]);
        if (cancelled) return;
        const c: any = cres.data;
        const ads: any[] = Array.isArray(ares.data) ? (ares.data as any[]) : [];
        setNumeroContrato(String(c.numeroContrato || ""));
        setNome(c.nome ? String(c.nome) : "");
        setObjeto(c.objeto ? String(c.objeto) : "");
        setDescricao(c.descricao ? String(c.descricao) : "");
        setTipoContratante((String(c.tipoContratante || "PRIVADO").toUpperCase() === "PUBLICO" ? "PUBLICO" : String(c.tipoContratante || "PRIVADO").toUpperCase() === "PF" ? "PF" : "PRIVADO") as any);
        setEmpresaParceiraNome(c.empresaParceiraNome ? String(c.empresaParceiraNome) : "");
        setEmpresaParceiraDocumento(c.empresaParceiraDocumento ? String(c.empresaParceiraDocumento) : "");
        setStatus(String(c.status || "ATIVO"));
        setDataAssinatura(c.dataAssinatura ? new Date(String(c.dataAssinatura)).toISOString().slice(0, 10) : "");
        setDataOS(c.dataOS ? new Date(String(c.dataOS)).toISOString().slice(0, 10) : "");

        const pd = c.prazoDias == null ? 0 : Number(c.prazoDias || 0);
        if (pd > 0 && pd % 365 === 0) {
          setPrazoUnidade("ANOS");
          setPrazoValor(String(Math.trunc(pd / 365)));
        } else if (pd > 0 && pd % 30 === 0) {
          setPrazoUnidade("MESES");
          setPrazoValor(String(Math.trunc(pd / 30)));
        } else if (pd > 0 && pd % 7 === 0) {
          setPrazoUnidade("SEMANAS");
          setPrazoValor(String(Math.trunc(pd / 7)));
        } else {
          setPrazoUnidade("DIAS");
          setPrazoValor(pd > 0 ? String(Math.trunc(pd)) : "");
        }

        setValorConcedenteInicial(c.valorConcedenteInicial == null ? "0,00" : formatMoneyBRFromDigits(String(Math.round(Number(c.valorConcedenteInicial || 0) * 100))));
        setValorProprioInicial(c.valorProprioInicial == null ? "0,00" : formatMoneyBRFromDigits(String(Math.round(Number(c.valorProprioInicial || 0) * 100))));
        setValorTotalInicial(c.valorTotalInicial == null ? "0,00" : formatMoneyBRFromDigits(String(Math.round(Number(c.valorTotalInicial || 0) * 100))));
        setValorConcedenteAtual(c.valorConcedenteAtual == null ? "0,00" : formatMoneyBRFromDigits(String(Math.round(Number(c.valorConcedenteAtual || 0) * 100))));
        setValorProprioAtual(c.valorProprioAtual == null ? "0,00" : formatMoneyBRFromDigits(String(Math.round(Number(c.valorProprioAtual || 0) * 100))));
        setValorTotalAtual(c.valorTotalAtual == null ? "0,00" : formatMoneyBRFromDigits(String(Math.round(Number(c.valorTotalAtual || 0) * 100))));

        const rasc = ads.filter((a) => String((a as any)?.status || "").toUpperCase() === "RASCUNHO").length;
        setAditivosInfo({ total: ads.length, rascunho: rasc });
      } catch (e: any) {
        if (cancelled) return;
        setErr(e?.response?.data?.message || e?.message || "Erro ao carregar contrato");
      } finally {
        if (cancelled) return;
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [contratoId]);

  useEffect(() => {
    if (!isPublico) return;
    const total = parseMoneyBR(valorConcedenteInicial) + parseMoneyBR(valorProprioInicial);
    setValorTotalInicial(formatMoneyBRFromDigits(String(Math.round(total * 100))));
  }, [isPublico, valorConcedenteInicial, valorProprioInicial]);

  useEffect(() => {
    if (!isPublico) return;
    const total = parseMoneyBR(valorConcedenteAtual) + parseMoneyBR(valorProprioAtual);
    setValorTotalAtual(formatMoneyBRFromDigits(String(Math.round(total * 100))));
  }, [isPublico, valorConcedenteAtual, valorProprioAtual]);

  async function salvar() {
    try {
      setLoading(true);
      setErr(null);
      if (!baseDate || !prazoDias || prazoDias <= 0) {
        setErr("Informe a data base (OS ou Assinatura) e o prazo.");
        return;
      }

      const vti = parseMoneyBR(valorTotalInicial);
      const vta = parseMoneyBR(valorTotalAtual);
      if (vti <= 0 || vta <= 0) {
        setErr("Valor total do contrato deve ser maior que zero.");
        return;
      }

      const payload = {
        numeroContrato,
        nome: nome || null,
        objeto: objeto || null,
        descricao: descricao || null,
        tipoContratante,
        empresaParceiraNome: empresaParceiraNome || null,
        empresaParceiraDocumento: empresaParceiraDocumento || null,
        status,
        dataAssinatura: dataAssinatura ? new Date(`${dataAssinatura}T00:00:00`).toISOString() : null,
        dataOS: dataOS ? new Date(`${dataOS}T00:00:00`).toISOString() : null,
        prazoDias,
        vigenciaInicial: vigenciaCalculada ? new Date(`${vigenciaCalculada}T00:00:00`).toISOString() : null,
        vigenciaAtual: vigenciaCalculada ? new Date(`${vigenciaCalculada}T00:00:00`).toISOString() : null,
        valorConcedenteInicial: isPublico ? parseMoneyBR(valorConcedenteInicial) : null,
        valorProprioInicial: isPublico ? parseMoneyBR(valorProprioInicial) : null,
        valorTotalInicial: isPublico ? parseMoneyBR(valorTotalInicial) : parseMoneyBR(valorTotalInicial),
        valorConcedenteAtual: isPublico ? parseMoneyBR(valorConcedenteAtual) : null,
        valorProprioAtual: isPublico ? parseMoneyBR(valorProprioAtual) : null,
        valorTotalAtual: isPublico ? parseMoneyBR(valorTotalAtual) : parseMoneyBR(valorTotalAtual),
      };
      if (contratoId) {
        await api.put(`/api/contratos/${contratoId}`, payload);
        router.push(`/dashboard/contratos?id=${contratoId}`);
      } else {
        const res = await api.post("/api/contratos", payload);
        const id = (res.data as any)?.id;
        if (id) router.push(`/dashboard/contratos?id=${id}`);
        else router.push("/dashboard/contratos");
      }
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao salvar contrato");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">{isEdit ? "Editar Contrato" : "Novo Contrato"}</h1>
          <div className="text-sm text-slate-600">Um contrato pode existir sem obra; obras podem ser vinculadas depois.</div>
        </div>
        <button className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50" type="button" onClick={() => router.push("/dashboard/contratos")}>
          Voltar
        </button>
      </div>

      {isEdit && aditivosInfo ? (
        <div className="rounded-xl border bg-white p-4 shadow-sm text-sm text-slate-700">
          <div className="font-semibold">Aditivos</div>
          <div className="mt-1">
            Total: <span className="font-semibold">{aditivosInfo.total}</span>
            {" • "}
            Em rascunho: <span className="font-semibold">{aditivosInfo.rascunho}</span>
          </div>
        </div>
      ) : null}

      <section className="rounded-xl border bg-white p-4 shadow-sm space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <div className="text-sm text-slate-600">Número do contrato</div>
            <input className="input" value={numeroContrato} onChange={(e) => setNumeroContrato(e.target.value)} placeholder="Ex: 012/2026" />
          </div>
          <div>
            <div className="text-sm text-slate-600">Status</div>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="ATIVO">Ativo</option>
              <option value="PENDENTE">Pendente</option>
              <option value="PARALISADO">Paralisado</option>
              <option value="ENCERRADO">Encerrado</option>
              <option value="FINALIZADO">Finalizado</option>
              <option value="CANCELADO">Cancelado</option>
              <option value="RESCINDIDO">Rescindido</option>
            </select>
          </div>
          <div>
            <div className="text-sm text-slate-600">Tipo de contratante</div>
            <select className="input" value={tipoContratante} onChange={(e) => setTipoContratante(e.target.value as any)}>
              <option value="PUBLICO">Órgão público</option>
              <option value="PRIVADO">Empresa privada (PJ)</option>
              <option value="PF">Pessoa física (PF)</option>
            </select>
          </div>
          <div>
            <div className="text-sm text-slate-600">Nome do contrato</div>
            <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Construção UBS" />
          </div>
          <div className="md:col-span-2">
            <div className="text-sm text-slate-600">Objeto</div>
            <textarea className="input min-h-[100px]" value={objeto} onChange={(e) => setObjeto(e.target.value)} placeholder="Descrição do objeto do contrato" />
          </div>
          <div className="md:col-span-2">
            <div className="text-sm text-slate-600">Descrição/Observações</div>
            <textarea className="input min-h-[100px]" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Observações gerais, contexto, particularidades, etc." />
          </div>
        </div>

        <div className="rounded-xl border bg-slate-50 p-4">
          <div className="text-sm font-semibold">Datas</div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <div className="text-sm text-slate-600">Data assinatura</div>
              <input className="input" type="date" value={dataAssinatura} onChange={(e) => setDataAssinatura(e.target.value)} />
            </div>
            <div>
              <div className="text-sm text-slate-600">Data OS (preferencial)</div>
              <input className="input" type="date" value={dataOS} onChange={(e) => setDataOS(e.target.value)} />
            </div>
            <div>
              <div className="text-sm text-slate-600">Prazo</div>
              <div className="flex gap-2">
                <input className="input flex-1" value={prazoValor} onChange={(e) => setPrazoValor(e.target.value)} placeholder="Ex: 180" />
                <select className="input w-[140px]" value={prazoUnidade} onChange={(e) => setPrazoUnidade(e.target.value as any)}>
                  <option value="DIAS">Dias</option>
                  <option value="SEMANAS">Semanas</option>
                  <option value="MESES">Meses</option>
                  <option value="ANOS">Anos</option>
                </select>
              </div>
            </div>
            <div className="md:col-span-3">
              <div className="text-sm text-slate-600">Vigência (calculada)</div>
              <input className="input" value={vigenciaCalculada || "—"} disabled />
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-sm font-semibold">Empresa parceira</div>
            <button className="rounded-lg border bg-white px-3 py-1 text-sm hover:bg-slate-50" type="button" onClick={() => router.push("/dashboard/engenharia/contrapartes")}>
              Gerenciar empresas
            </button>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <div className="text-sm text-slate-600">Nome</div>
              <input className="input" value={empresaParceiraNome} onChange={(e) => setEmpresaParceiraNome(e.target.value)} placeholder="Ex: Construtora XPTO" />
            </div>
            <div>
              <div className="text-sm text-slate-600">CNPJ/CPF</div>
              <input className="input" value={empresaParceiraDocumento} onChange={(e) => setEmpresaParceiraDocumento(e.target.value)} placeholder="Opcional" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-slate-50 p-4">
          <div className="text-sm font-semibold">Valores</div>
          {isPublico ? (
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <div className="text-sm text-slate-600">Concedente (inicial)</div>
                <input className="input" value={valorConcedenteInicial} onChange={(e) => setValorConcedenteInicial(formatMoneyBRFromDigits(e.target.value))} />
              </div>
              <div>
                <div className="text-sm text-slate-600">Recursos próprios (inicial)</div>
                <input className="input" value={valorProprioInicial} onChange={(e) => setValorProprioInicial(formatMoneyBRFromDigits(e.target.value))} />
              </div>
              <div>
                <div className="text-sm text-slate-600">Total (inicial)</div>
                <input className="input" value={valorTotalInicial} disabled />
              </div>

              <div>
                <div className="text-sm text-slate-600">Concedente (atual)</div>
                <input className="input" value={valorConcedenteAtual} onChange={(e) => setValorConcedenteAtual(formatMoneyBRFromDigits(e.target.value))} />
              </div>
              <div>
                <div className="text-sm text-slate-600">Recursos próprios (atual)</div>
                <input className="input" value={valorProprioAtual} onChange={(e) => setValorProprioAtual(formatMoneyBRFromDigits(e.target.value))} />
              </div>
              <div>
                <div className="text-sm text-slate-600">Total (atual)</div>
                <input className="input" value={valorTotalAtual} disabled />
              </div>
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <div className="text-sm text-slate-600">Valor total (inicial)</div>
                <input className="input" value={valorTotalInicial} onChange={(e) => setValorTotalInicial(formatMoneyBRFromDigits(e.target.value))} />
              </div>
              <div>
                <div className="text-sm text-slate-600">Valor total (atual)</div>
                <input className="input" value={valorTotalAtual} onChange={(e) => setValorTotalAtual(formatMoneyBRFromDigits(e.target.value))} />
              </div>
            </div>
          )}
        </div>

        {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

        <div className="flex justify-end">
          <button
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
            type="button"
            onClick={salvar}
            disabled={loading || !numeroContrato.trim()}
          >
            {loading ? "Salvando..." : isEdit ? "Salvar alterações" : "Salvar"}
          </button>
        </div>
      </section>
    </div>
  );
}
