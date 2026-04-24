"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/api";

type ContratoBasic = {
  id: number;
  numeroContrato: string;
  nome: string | null;
  objeto: string | null;
  empresaParceiraNome: string | null;
  vigenciaAtual: string | null;
  valorTotalAtual: number | null;
  planilhaVersao?: number | null;
};

type EventoAnexo = {
  id: number;
  nomeArquivo: string;
  downloadUrl: string;
};

type EventoRow = {
  id: number;
  tipoOrigem: string;
  tipoEvento: string;
  descricao: string;
  observacaoTexto?: string | null;
  criadoEm: string;
  anexos?: EventoAnexo[];
};

async function fileToBase64(file: File) {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
    reader.readAsDataURL(file);
  });
  const comma = dataUrl.indexOf("base64,");
  return comma >= 0 ? dataUrl.slice(comma + 7) : dataUrl;
}

export default function DocumentosContratoClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const contratoId = sp.get("contratoId");
  const returnTo = sp.get("returnTo");
  const apiBase = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/+$/, "");
  const tokenForLinks = useMemo(() => {
    try {
      return localStorage.getItem("token") || "";
    } catch {
      return "";
    }
  }, []);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [contrato, setContrato] = useState<ContratoBasic | null>(null);
  const [docs, setDocs] = useState<EventoRow[]>([]);

  const [descricao, setDescricao] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(1);

  async function carregar() {
    if (!contratoId) return;
    try {
      setLoading(true);
      setErr(null);
      const [cres, dres] = await Promise.all([
        api.get(`/api/contratos/${contratoId}`),
        api.get(`/api/contratos/${contratoId}/eventos`, { params: { origens: "DOCUMENTO", incluirObservacoes: "true", limit: 200 } }),
      ]);
      const c: any = cres.data;
      setContrato({
        id: Number(c.id),
        numeroContrato: String(c.numeroContrato || ""),
        nome: c.nome ? String(c.nome) : null,
        objeto: c.objeto ? String(c.objeto) : null,
        empresaParceiraNome: c.empresaParceiraNome ? String(c.empresaParceiraNome) : null,
        vigenciaAtual: c.vigenciaAtual ? String(c.vigenciaAtual) : null,
        valorTotalAtual: c.valorTotalAtual == null ? null : Number(c.valorTotalAtual || 0),
        planilhaVersao: c.planilhaVersao == null ? null : Number(c.planilhaVersao || 0),
      });
      setDocs((Array.isArray(dres.data) ? (dres.data as any[]) : []) as any);
    } catch (e: any) {
      setContrato(null);
      setDocs([]);
      setErr(e?.response?.data?.message || e?.message || "Erro ao carregar documentos do contrato");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, [contratoId]);

  async function salvarDocumento() {
    if (!contratoId) return;
    if (!file) return;
    const texto = String(descricao || "").trim() ? `Documento do contrato — ${String(descricao || "").trim()}` : "Documento do contrato";
    try {
      setLoading(true);
      setErr(null);
      const evRes = await api.post(`/api/contratos/${contratoId}/observacoes`, { texto, nivel: "NORMAL", tipoOrigem: "DOCUMENTO" });
      const eventoId = Number((evRes.data as any)?.id || 0);
      if (!eventoId) throw new Error("Falha ao criar evento do documento");
      const conteudoBase64 = await fileToBase64(file);
      await api.post(`/api/contratos/${contratoId}/eventos/${eventoId}/anexos`, { nomeArquivo: file.name, mimeType: file.type || "application/octet-stream", conteudoBase64 });
      setDescricao("");
      setFile(null);
      setInputKey((k) => k + 1);
      await carregar();
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao salvar documento");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 space-y-6 bg-[#f7f8fa] text-slate-900">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Documentos do contrato</h1>
          <div className="text-sm text-slate-600">Lista, upload e visualização de documentos vinculados ao contrato.</div>
        </div>
        <button
          className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50"
          type="button"
          onClick={() => {
            if (returnTo) router.push(returnTo);
            else if (contratoId) router.push(`/dashboard/contratos?id=${contratoId}`);
            else router.push("/dashboard/contratos");
          }}
        >
          {contratoId || returnTo ? "Voltar ao contrato" : "Voltar para Contratos"}
        </button>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}
      {loading ? <div className="text-sm text-slate-600">Carregando...</div> : null}

      {!contratoId ? (
        <section className="rounded-xl border border-[#e6edf5] bg-white p-4 shadow-sm space-y-2">
          <div className="text-sm font-semibold">Abra pelo contrato</div>
          <div className="text-sm text-slate-600">A tela de documentos é acessada pelo contrato selecionado.</div>
        </section>
      ) : (
        <>
          <section className="rounded-xl border border-[#e6edf5] bg-white p-4 shadow-sm space-y-2">
            <div className="text-sm text-slate-500">Contrato</div>
            <div className="text-lg font-semibold">
              {contrato?.numeroContrato || "—"} — {contrato?.nome || contrato?.objeto || "—"}
            </div>
            <div className="text-sm text-slate-600">
              {contrato?.empresaParceiraNome || "Sem empresa"} • Vigência: {contrato?.vigenciaAtual ? new Date(contrato.vigenciaAtual).toLocaleDateString("pt-BR") : "—"} • Valor atual:{" "}
              {contrato?.valorTotalAtual != null ? contrato.valorTotalAtual.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"} • Planilha v{contrato?.planilhaVersao != null ? Math.trunc(Number(contrato.planilhaVersao || 1)) : 1}
            </div>
          </section>

          <section className="rounded-xl border border-[#e6edf5] bg-white p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-sm font-semibold">Inserir documento</div>
              <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50" type="button" onClick={salvarDocumento} disabled={loading || !file}>
                Salvar
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="md:col-span-2">
                <div className="text-sm text-slate-600">Descrição</div>
                <input className="input bg-white text-slate-900" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex: Contrato assinado, OS, termo, etc." />
              </div>
              <div>
                <div className="text-sm text-slate-600">Arquivo</div>
                <input
                  key={inputKey}
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={(e) => {
                    const f = (e.target.files || [])[0] || null;
                    setFile(f);
                  }}
                />
                {file ? <div className="mt-1 text-xs text-slate-600">📎 {file.name}</div> : null}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-[#e6edf5] bg-white p-4 shadow-sm space-y-3">
            <div className="text-sm font-semibold">Lista de documentos</div>
            <div className="space-y-2">
              {docs.map((d) => (
                <div key={d.id} className="rounded-lg border bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-semibold">{d.observacaoTexto || d.descricao}</div>
                    <div className="text-xs text-slate-500">{new Date(d.criadoEm).toLocaleString("pt-BR")}</div>
                  </div>
                  {d.anexos?.length ? (
                    <div className="mt-2 flex flex-col gap-1">
                      {d.anexos.map((a) => (
                        <a key={a.id} href={`${apiBase}${a.downloadUrl}?token=${encodeURIComponent(tokenForLinks)}`} target="_blank" className="text-blue-600 text-xs underline">
                          📎 {a.nomeArquivo}
                        </a>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-2 text-xs text-slate-600">Sem arquivo anexado.</div>
                  )}
                </div>
              ))}
              {!docs.length ? <div className="text-sm text-slate-500">Nenhum documento cadastrado.</div> : null}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

