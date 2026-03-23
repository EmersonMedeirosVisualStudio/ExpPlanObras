"use client";

import { useEffect, useState } from "react";
import { SstNcApi } from "@/lib/modules/sst-nc/api";

export default function SstNcClient() {
  const [lista, setLista] = useState<any[]>([]);
  const [detalhe, setDetalhe] = useState<any | null>(null);

  async function carregar() {
    setLista(await SstNcApi.listar());
  }

  async function abrir(id: number) {
    setDetalhe(await SstNcApi.obter(id));
  }

  async function novaNc() {
    const tipoLocal = (prompt("Tipo local (OBRA/UNIDADE):") || "OBRA").trim().toUpperCase();
    const idRef = Number(prompt(`ID da ${tipoLocal === "OBRA" ? "obra" : "unidade"}:`) || "");
    const titulo = (prompt("Título:") || "").trim();
    const descricao = (prompt("Descrição:") || "").trim();
    const severidade = (prompt("Severidade (BAIXA/MEDIA/ALTA/CRITICA):") || "MEDIA").trim().toUpperCase();
    const dataIdentificacao = (prompt("Data identificação (YYYY-MM-DD):") || new Date().toISOString().slice(0, 10)).trim();
    if (!titulo || !descricao) return;

    const resp = await SstNcApi.criar({
      tipoLocal,
      idObra: tipoLocal === "OBRA" ? idRef : null,
      idUnidade: tipoLocal === "UNIDADE" ? idRef : null,
      titulo,
      descricao,
      severidade,
      dataIdentificacao,
      origemTipo: "AVULSA",
    });

    await carregar();
    await abrir(resp.id);
  }

  async function novaAcao() {
    if (!detalhe) return;
    const descricaoAcao = (prompt("Descrição da ação:") || "").trim();
    if (!descricaoAcao) return;
    const tipoResponsavel = (prompt("Tipo responsável (FUNCIONARIO/EMPRESA_PARCEIRA/TERCEIRIZADO):") || "FUNCIONARIO").trim();
    const prazoAcao = (prompt("Prazo (YYYY-MM-DD) (opcional):") || "").trim();

    await SstNcApi.criarAcao(detalhe.id, {
      ordemAcao: detalhe.acoes?.length ? detalhe.acoes.length + 1 : 1,
      descricaoAcao,
      tipoResponsavel,
      prazoAcao: prazoAcao || null,
    });

    await abrir(detalhe.id);
    await carregar();
  }

  async function alterarStatusNc() {
    if (!detalhe) return;
    const acao = (prompt("Ação (ENVIAR_VALIDACAO/VALIDAR_CONCLUSAO/REABRIR_TRATAMENTO/CANCELAR):") || "").trim().toUpperCase();
    if (!acao) return;
    if (acao === "ENVIAR_VALIDACAO") {
      await SstNcApi.alterarStatusNc(detalhe.id, { acao: "ENVIAR_VALIDACAO" });
    } else if (acao === "VALIDAR_CONCLUSAO") {
      const parecerValidacao = (prompt("Parecer validação (opcional):") || "").trim();
      await SstNcApi.alterarStatusNc(detalhe.id, { acao: "VALIDAR_CONCLUSAO", parecerValidacao: parecerValidacao || null });
    } else if (acao === "REABRIR_TRATAMENTO") {
      const parecerValidacao = (prompt("Motivo (opcional):") || "").trim();
      await SstNcApi.alterarStatusNc(detalhe.id, { acao: "REABRIR_TRATAMENTO", parecerValidacao: parecerValidacao || null });
    } else if (acao === "CANCELAR") {
      const motivo = (prompt("Motivo (opcional):") || "").trim();
      await SstNcApi.alterarStatusNc(detalhe.id, { acao: "CANCELAR", motivo: motivo || null });
    } else {
      return;
    }
    await abrir(detalhe.id);
    await carregar();
  }

  async function alterarStatusAcao(idAcao: number) {
    const statusAcao = (prompt("Status da ação (PENDENTE/EM_EXECUCAO/CONCLUIDA/CANCELADA):") || "").trim().toUpperCase();
    if (!statusAcao) return;
    const observacaoExecucao = (prompt("Observação (opcional):") || "").trim();
    await SstNcApi.alterarStatusAcao(idAcao, { statusAcao, observacaoExecucao: observacaoExecucao || null });
    if (detalhe) await abrir(detalhe.id);
    await carregar();
  }

  useEffect(() => {
    carregar();
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Não conformidades (SST)</h1>
        <button onClick={novaNc} className="rounded-lg bg-blue-600 px-4 py-2 text-white">
          Nova NC
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border bg-white p-4">
          <h2 className="mb-3 font-semibold">NCs</h2>
          <div className="space-y-2">
            {lista.map((nc) => (
              <button key={nc.id} onClick={() => abrir(nc.id)} className="w-full rounded border p-3 text-left hover:bg-slate-50">
                <div className="font-medium">
                  {nc.titulo} <span className="text-slate-500 text-sm">({nc.severidade})</span>
                </div>
                <div className="text-sm text-slate-500">
                  {nc.tipoLocal} {nc.idObra || nc.idUnidade || ""} • {nc.dataIdentificacao} • {nc.statusNc}
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-xl border bg-white p-4">
          {!detalhe ? (
            <div className="text-slate-500">Selecione uma NC.</div>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="font-semibold">{detalhe.titulo}</div>
                  <div className="text-sm text-slate-500">
                    {detalhe.tipoLocal} {detalhe.idObra || detalhe.idUnidade || ""} • {detalhe.statusNc}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={alterarStatusNc} className="rounded border px-3 py-2 text-xs">
                    Alterar status
                  </button>
                  <button onClick={novaAcao} className="rounded border px-3 py-2 text-xs">
                    Nova ação
                  </button>
                </div>
              </div>

              <div className="rounded border bg-slate-50 p-3 text-sm">
                <div className="text-slate-700">{detalhe.descricao}</div>
              </div>

              <div className="mt-4">
                <h3 className="mb-2 font-semibold">Plano de ação</h3>
                <div className="space-y-2">
                  {detalhe.acoes?.map((a: any) => (
                    <div key={a.id} className="rounded border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium">
                          {a.ordemAcao}. {a.descricaoAcao}
                        </div>
                        <button onClick={() => alterarStatusAcao(a.id)} className="rounded border px-3 py-1 text-xs">
                          Status
                        </button>
                      </div>
                      <div className="text-sm text-slate-500">
                        {a.tipoResponsavel} • {a.statusAcao} {a.prazoAcao ? `• Prazo ${a.prazoAcao}` : ""}
                      </div>
                    </div>
                  ))}
                  {!detalhe.acoes?.length ? <div className="text-sm text-slate-500">Nenhuma ação.</div> : null}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
