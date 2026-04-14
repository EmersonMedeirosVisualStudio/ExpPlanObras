"use client";

import { useEffect, useState } from "react";
import { SstTreinamentosApi } from "@/lib/modules/sst-treinamentos/api";
import { EpiApi } from "@/lib/modules/epi/api";

function formatFuncionarioRef(id: number | string, nome: string) {
  return `#${id} - ${nome}`;
}

export default function SstTreinamentosClient() {
  const [modelos, setModelos] = useState<any[]>([]);
  const [turmas, setTurmas] = useState<any[]>([]);
  const [detalhe, setDetalhe] = useState<any | null>(null);
  const [aptosConsulta, setAptosConsulta] = useState<{ codigoServico: string; rows: any[] } | null>(null);

  async function carregar() {
    const [m, t] = await Promise.all([SstTreinamentosApi.listarModelos(), SstTreinamentosApi.listarTurmas()]);
    setModelos(m);
    setTurmas(t);
  }

  async function abrir(id: number) {
    setDetalhe(await SstTreinamentosApi.obterTurma(id));
  }

  async function novoModelo() {
    const nomeTreinamento = prompt("Nome do treinamento:") || "";
    if (!nomeTreinamento.trim()) return;
    const tipoTreinamento = (prompt("Tipo (INTEGRACAO/NR/RECICLAGEM/OPERACIONAL/DDS/OUTRO):") || "INTEGRACAO").trim().toUpperCase();
    await SstTreinamentosApi.criarModelo({
      nomeTreinamento: nomeTreinamento.trim(),
      tipoTreinamento,
      cargaHorariaHoras: 1,
      validadeMeses: 12,
      antecedenciaAlertaDias: 30,
      exigeAssinaturaParticipante: true,
      exigeAssinaturaInstrutor: true,
      exigeAprovacao: false,
    });
    await carregar();
  }

  async function novaTurma() {
    const idTreinamentoModelo = Number(prompt("ID do modelo:") || "");
    if (!idTreinamentoModelo) return;
    const tipoLocal = (prompt("Tipo local (OBRA/UNIDADE/EMPRESA):") || "OBRA").trim().toUpperCase();
    const idRef = tipoLocal === "EMPRESA" ? null : Number(prompt(`ID da ${tipoLocal === "OBRA" ? "obra" : "unidade"}:`) || "");
    const dataInicio = (prompt("Data início (YYYY-MM-DD HH:mm):") || `${new Date().toISOString().slice(0, 10)} 08:00`).trim();
    const tipoInstrutor = (prompt("Instrutor (FUNCIONARIO/EXTERNO/EMPRESA_PARCEIRA):") || "FUNCIONARIO").trim().toUpperCase();
    const idInstrutorFuncionario = tipoInstrutor === "FUNCIONARIO" ? Number(prompt("ID do instrutor (funcionário):") || "") : null;
    const nomeInstrutorExterno = tipoInstrutor === "EXTERNO" ? (prompt("Nome do instrutor externo:") || "").trim() : null;

    const resp = await SstTreinamentosApi.criarTurma({
      idTreinamentoModelo,
      tipoLocal,
      idObra: tipoLocal === "OBRA" ? idRef : null,
      idUnidade: tipoLocal === "UNIDADE" ? idRef : null,
      dataInicio,
      tipoInstrutor,
      idInstrutorFuncionario: idInstrutorFuncionario || null,
      nomeInstrutorExterno: nomeInstrutorExterno || null,
    });
    await carregar();
    await abrir(resp.id);
  }

  async function adicionarParticipante() {
    if (!detalhe) return;
    const tipoLocal = detalhe.tipoLocal;
    const idObra = tipoLocal === "OBRA" ? detalhe.idObra : undefined;
    const idUnidade = tipoLocal === "UNIDADE" ? detalhe.idUnidade : undefined;

    const trabalhadores = await EpiApi.listarTrabalhadores(tipoLocal, idObra, idUnidade);
    const escolhido = trabalhadores[0];
    if (!escolhido) return alert("Nenhum trabalhador disponível");

    await SstTreinamentosApi.adicionarParticipante(detalhe.id, {
      tipoParticipante: escolhido.tipoDestinatario,
      idFuncionario: escolhido.tipoDestinatario === "FUNCIONARIO" ? escolhido.id : null,
      idTerceirizadoTrabalhador: escolhido.tipoDestinatario === "TERCEIRIZADO" ? escolhido.id : null,
    });
    await abrir(detalhe.id);
  }

  async function assinarParticipante(p: any) {
    const tipoAssinatura = (prompt("Tipo assinatura (ASSINATURA_TELA/PIN):") || "ASSINATURA_TELA").trim().toUpperCase();
    const pin = tipoAssinatura === "PIN" ? (prompt("PIN:") || "").trim() : "";
    await SstTreinamentosApi.assinarParticipante(p.id, { tipoAssinatura, pin: pin || undefined });
    await abrir(detalhe.id);
  }

  async function finalizarTurma() {
    if (!detalhe) return;
    const tipoAssinatura = (prompt("Tipo assinatura do instrutor (ASSINATURA_TELA/PIN):") || "ASSINATURA_TELA").trim().toUpperCase();
    const pin = tipoAssinatura === "PIN" ? (prompt("PIN:") || "").trim() : "";
    await SstTreinamentosApi.finalizarTurma(detalhe.id, { tipoAssinatura, pin: pin || undefined });
    await abrir(detalhe.id);
    await carregar();
  }

  async function definirServicosModelo(m: any) {
    const atual = await SstTreinamentosApi.listarServicosModelo(m.id).catch(() => []);
    const raw = prompt(
      `Serviços vinculados ao treinamento (códigos, separados por vírgula).\n\nEx.: SER-0001, SER-0002\n\nAtual: ${(Array.isArray(atual) ? atual : []).join(', ')}`,
      (Array.isArray(atual) ? atual : []).join(', ')
    );
    if (raw == null) return;
    const codigos = raw
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    await SstTreinamentosApi.salvarServicosModelo(m.id, { codigos });
    alert('Serviços atualizados.');
  }

  async function consultarAptos() {
    const codigoServico = (prompt('Código do serviço (SER-0001):') || '').trim().toUpperCase();
    if (!codigoServico) return;
    const rows = await SstTreinamentosApi.listarAptosPorServico(codigoServico);
    setAptosConsulta({ codigoServico, rows: Array.isArray(rows) ? rows : [] });
  }

  useEffect(() => {
    carregar();
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Treinamentos SST</h1>
        <div className="flex gap-2">
          <button onClick={novoModelo} className="rounded-lg bg-slate-700 px-4 py-2 text-white">
            Novo modelo
          </button>
          <button onClick={consultarAptos} className="rounded-lg border px-4 py-2">
            Aptos por serviço
          </button>
          <button onClick={novaTurma} className="rounded-lg bg-blue-600 px-4 py-2 text-white">
            Nova turma
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border bg-white p-4">
          <h2 className="mb-3 font-semibold">Modelos</h2>
          <div className="space-y-2">
            {modelos.map((m) => (
              <div key={m.id} className="rounded border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{m.nomeTreinamento}</div>
                    <div className="text-sm text-slate-500">
                      {m.tipoTreinamento} • {m.normaReferencia || "-"} • {m.validadeMeses ? `${m.validadeMeses}m` : "sem validade"}
                    </div>
                  </div>
                  <button onClick={() => definirServicosModelo(m)} className="rounded border px-3 py-1.5 text-xs">
                    Serviços
                  </button>
                </div>
                <div className="text-sm text-slate-500">
                  ID {m.id}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border bg-white p-4">
          <h2 className="mb-3 font-semibold">Turmas</h2>
          <div className="space-y-2">
            {turmas.map((t) => (
              <button key={t.id} onClick={() => abrir(t.id)} className="w-full rounded border p-3 text-left hover:bg-slate-50">
                <div className="font-medium">{t.nomeTreinamento}</div>
                <div className="text-sm text-slate-500">
                  {t.tipoLocal} {t.idObra || t.idUnidade || ""} • {t.dataInicio} • {t.statusTurma}
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>

      {detalhe && (
        <section className="rounded-xl border bg-white p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold">{detalhe.nomeTreinamento}</h2>
              <div className="text-sm text-slate-500">
                {detalhe.tipoLocal} {detalhe.idObra || detalhe.idUnidade || ""} • {detalhe.statusTurma}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={adicionarParticipante} className="rounded border px-3 py-2 text-xs">
                Adicionar participante
              </button>
              <button onClick={finalizarTurma} className="rounded border px-3 py-2 text-xs">
                Finalizar turma
              </button>
            </div>
          </div>

          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2">Nome</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Ass.</th>
                </tr>
              </thead>
              <tbody>
                {detalhe.participantes?.map((p: any) => (
                  <tr key={p.id} className="border-t">
                    <td className="px-3 py-2">{p.participanteNome}</td>
                    <td className="px-3 py-2">{p.tipoParticipante}</td>
                    <td className="px-3 py-2">{p.statusParticipacao}</td>
                    <td className="px-3 py-2">
                      {p.idAssinaturaParticipante ? (
                        "Sim"
                      ) : (
                        <button onClick={() => assinarParticipante(p)} className="rounded border px-2 py-1 text-xs">
                          Assinar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {aptosConsulta ? (
        <section className="rounded-xl border bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-semibold">Aptos para {aptosConsulta.codigoServico}</h2>
            <button className="rounded border px-3 py-1.5 text-xs" type="button" onClick={() => setAptosConsulta(null)}>
              Fechar
            </button>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2">Funcionário</th>
                  <th className="px-3 py-2">Validade</th>
                </tr>
              </thead>
              <tbody>
                {aptosConsulta.rows.map((r: any) => (
                  <tr key={r.idFuncionario} className="border-t">
                    <td className="px-3 py-2">{formatFuncionarioRef(r.idFuncionario, r.funcionarioNome)}</td>
                    <td className="px-3 py-2">{r.validadeAteMax === "2999-12-31" ? "sem validade" : r.validadeAteMax || "-"}</td>
                  </tr>
                ))}
                {!aptosConsulta.rows.length ? (
                  <tr>
                    <td colSpan={2} className="px-3 py-6 text-center text-slate-500">
                      Nenhum apto encontrado.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
