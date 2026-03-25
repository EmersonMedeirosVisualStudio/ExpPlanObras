"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { DocumentosApi } from "@/lib/modules/documentos/api";
import type { DocumentoVerificacaoDTO } from "@/lib/modules/documentos/types";

function fmtDateTime(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("pt-BR");
}

export default function Page() {
  const params = useParams<{ token: string }>();
  const token = String(params?.token || "");

  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [data, setData] = useState<DocumentoVerificacaoDTO | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setErro(null);
    DocumentosApi.verificarToken(token)
      .then((d) => setData(d))
      .catch((e: any) => setErro(e?.message || "Erro ao verificar documento."))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">Verificação de documento</h1>
        <p className="mt-1 text-sm text-slate-500">Token: {token || "-"}</p>
      </div>

      {loading ? <div className="rounded-xl border bg-white p-4 text-sm text-slate-600">Verificando...</div> : null}
      {erro ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{erro}</div> : null}

      {data ? (
        <div className="space-y-4">
          <div className={`rounded-xl border p-4 ${data.valido ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
            <div className={`text-sm font-semibold ${data.valido ? "text-emerald-800" : "text-red-800"}`}>{data.valido ? "Íntegro" : "Falha de integridade"}</div>
            <div className="mt-1 text-sm text-slate-700">{data.tituloDocumento}</div>
            <div className="mt-1 text-xs text-slate-600">Versão: {data.numeroVersao}</div>
          </div>

          <div className="rounded-xl border bg-white p-4">
            <div className="text-sm font-semibold text-slate-700">Hashes</div>
            <div className="mt-2 space-y-2 text-xs text-slate-700">
              <div>
                <div className="text-slate-500">Esperado</div>
                <div className="break-all">{data.hashEsperado || "-"}</div>
              </div>
              <div>
                <div className="text-slate-500">Conferido</div>
                <div className="break-all">{data.hashConferido || "-"}</div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-white">
            <div className="border-b bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">Assinaturas</div>
            <div className="p-4 space-y-2">
              {data.signatarios.length ? (
                data.signatarios.map((s, idx) => (
                  <div key={`${s.codigo}-${idx}`} className="rounded-lg border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">{s.nome}</div>
                      <div className="text-xs text-slate-500">{fmtDateTime(s.dataHora)}</div>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {s.papel} • {s.decisao} • Código: {s.codigo}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-slate-500">Nenhuma assinatura registrada.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

