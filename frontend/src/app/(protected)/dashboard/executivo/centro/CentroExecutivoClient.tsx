"use client";

import { useEffect, useMemo, useState } from "react";
import { CentroExecutivoApi } from "@/lib/modules/centro-executivo/api";
import type {
  CentroExecutivoAlertaDTO,
  CentroExecutivoComparativoDTO,
  CentroExecutivoFiltrosDTO,
  CentroExecutivoMatrizLinhaDTO,
  CentroExecutivoRankingObraDTO,
  CentroExecutivoResumoDTO,
  CentroExecutivoSerieDTO,
  DashboardFiltrosExecutivosDTO,
} from "@/lib/modules/centro-executivo/types";

function fmtMoney(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));
}

function fmtInt(v: number) {
  return new Intl.NumberFormat("pt-BR").format(Number(v || 0));
}

export default function CentroExecutivoClient() {
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filtrosBase, setFiltrosBase] = useState<DashboardFiltrosExecutivosDTO | null>(null);
  const [filtros, setFiltros] = useState<CentroExecutivoFiltrosDTO>({ periodo: "ULTIMOS_6_MESES", recorte: "DIRETORIA" });

  const [resumo, setResumo] = useState<CentroExecutivoResumoDTO | null>(null);
  const [alertas, setAlertas] = useState<CentroExecutivoAlertaDTO[]>([]);
  const [series, setSeries] = useState<CentroExecutivoSerieDTO[]>([]);
  const [comparativo, setComparativo] = useState<CentroExecutivoComparativoDTO[]>([]);
  const [matriz, setMatriz] = useState<CentroExecutivoMatrizLinhaDTO[]>([]);
  const [ranking, setRanking] = useState<CentroExecutivoRankingObraDTO[]>([]);

  const filtrosQS = useMemo(() => filtros, [JSON.stringify(filtros)]);

  async function carregarTudo() {
    setLoading(true);
    setErro(null);
    try {
      const base = await CentroExecutivoApi.filtros();
      setFiltrosBase(base);

      const [r, a, s, c, m, ro] = await Promise.all([
        CentroExecutivoApi.resumo(filtrosQS),
        CentroExecutivoApi.alertas(filtrosQS),
        CentroExecutivoApi.series(filtrosQS),
        CentroExecutivoApi.comparativo(filtrosQS),
        CentroExecutivoApi.matriz(filtrosQS),
        CentroExecutivoApi.rankingObras(filtrosQS),
      ]);

      setResumo(r);
      setAlertas(a || []);
      setSeries(s || []);
      setComparativo(c || []);
      setMatriz(m || []);
      setRanking(ro || []);
    } catch (e: any) {
      setErro(String(e?.message || "Erro ao carregar"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarTudo();
  }, []);

  useEffect(() => {
    if (!filtrosBase) return;
    carregarTudo();
  }, [JSON.stringify(filtrosQS)]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Centro Executivo</h1>
          <p className="text-sm text-slate-600">Consolidado por diretoria com alertas, comparativos e ranking de obras.</p>
        </div>
        <div className="flex gap-2">
          <button className="rounded-lg border px-4 py-2 text-sm" onClick={carregarTudo} type="button">
            Atualizar
          </button>
        </div>
      </div>

      {erro ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</div> : null}

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <label className="text-sm">
            <div className="mb-1 text-xs text-slate-500">Diretoria</div>
            <select
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
              value={filtros.idDiretoria || ""}
              onChange={(e) => setFiltros((p) => ({ ...p, idDiretoria: e.target.value ? Number(e.target.value) : undefined, idObra: undefined, idUnidade: undefined }))}
            >
              <option value="">Todas</option>
              {filtrosBase?.diretorias?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <div className="mb-1 text-xs text-slate-500">Obra</div>
            <select
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
              value={filtros.idObra || ""}
              onChange={(e) => setFiltros((p) => ({ ...p, idObra: e.target.value ? Number(e.target.value) : undefined }))}
            >
              <option value="">Todas</option>
              {filtrosBase?.obras?.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <div className="mb-1 text-xs text-slate-500">Unidade</div>
            <select
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
              value={filtros.idUnidade || ""}
              onChange={(e) => setFiltros((p) => ({ ...p, idUnidade: e.target.value ? Number(e.target.value) : undefined }))}
            >
              <option value="">Todas</option>
              {filtrosBase?.unidades?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <div className="mb-1 text-xs text-slate-500">Período</div>
            <select
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
              value={filtros.periodo || "ULTIMOS_6_MESES"}
              onChange={(e) => setFiltros((p) => ({ ...p, periodo: e.target.value as any }))}
            >
              <option value="MES_ATUAL">Mês atual</option>
              <option value="ULTIMOS_3_MESES">Últimos 3 meses</option>
              <option value="ULTIMOS_6_MESES">Últimos 6 meses</option>
              <option value="ANO_ATUAL">Ano atual</option>
            </select>
          </label>
          <label className="text-sm">
            <div className="mb-1 text-xs text-slate-500">Comparativo</div>
            <select
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
              value={filtros.recorte || "DIRETORIA"}
              onChange={(e) => setFiltros((p) => ({ ...p, recorte: e.target.value as any }))}
            >
              <option value="DIRETORIA">Diretorias</option>
              <option value="OBRA">Obras</option>
              <option value="UNIDADE">Unidades</option>
            </select>
          </label>
        </div>
      </div>

      {loading && !resumo ? <div className="text-sm text-slate-500">Carregando...</div> : null}

      {resumo ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="text-xs text-slate-500">Contratos ativos</div>
            <div className="text-2xl font-semibold">{fmtInt(resumo.contratosAtivos)}</div>
          </div>
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="text-xs text-slate-500">Obras ativas</div>
            <div className="text-2xl font-semibold">{fmtInt(resumo.obrasAtivas)}</div>
            <div className="mt-1 text-xs text-slate-500">Paralisadas: {fmtInt(resumo.obrasParalisadas)}</div>
          </div>
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="text-xs text-slate-500">Medições pendentes</div>
            <div className="text-2xl font-semibold">{fmtInt(resumo.medicoesPendentes)}</div>
          </div>
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="text-xs text-slate-500">Urgências suprimentos</div>
            <div className="text-2xl font-semibold">{fmtInt(resumo.solicitacoesUrgentes)}</div>
          </div>
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="text-xs text-slate-500">Funcionários ativos</div>
            <div className="text-2xl font-semibold">{fmtInt(resumo.funcionariosAtivos)}</div>
            <div className="mt-1 text-xs text-slate-500">HE pendentes: {fmtInt(resumo.horasExtrasPendentes)}</div>
          </div>
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="text-xs text-slate-500">SST crítico</div>
            <div className="text-2xl font-semibold">{fmtInt(resumo.ncsCriticas)}</div>
            <div className="mt-1 text-xs text-slate-500">Acidentes no mês: {fmtInt(resumo.acidentesMes)}</div>
          </div>
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="text-xs text-slate-500">Treinamentos vencidos</div>
            <div className="text-2xl font-semibold">{fmtInt(resumo.treinamentosVencidos)}</div>
          </div>
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="text-xs text-slate-500">Estoque crítico</div>
            <div className="text-2xl font-semibold">{fmtInt(resumo.itensEstoqueCritico)}</div>
          </div>
          <div className="rounded-xl border bg-white p-4 shadow-sm md:col-span-2">
            <div className="text-xs text-slate-500">Financeiro</div>
            <div className="mt-1 grid grid-cols-1 gap-2 md:grid-cols-2">
              <div>
                <div className="text-xs text-slate-500">Contratado</div>
                <div className="text-lg font-semibold">{fmtMoney(resumo.valorContratado)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Executado</div>
                <div className="text-lg font-semibold">{fmtMoney(resumo.valorExecutado)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Pago</div>
                <div className="text-lg font-semibold">{fmtMoney(resumo.valorPago)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Saldo</div>
                <div className="text-lg font-semibold">{fmtMoney(resumo.saldoFinanceiro)}</div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="mb-2 font-medium">Alertas</div>
          {alertas.length ? (
            <div className="space-y-2">
              {alertas.slice(0, 12).map((a, idx) => (
                <a key={`${a.tipo}-${idx}`} href={a.rota || "#"} className="block rounded-lg border p-3 hover:bg-slate-50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{a.titulo}</div>
                      <div className="truncate text-xs text-slate-500">{a.subtitulo}</div>
                    </div>
                    <div className="text-xs text-slate-400">{a.modulo}</div>
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <div className="text-sm text-slate-500">Sem alertas.</div>
          )}
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="mb-2 font-medium">Séries (últimos meses)</div>
          {series.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-2">Mês</th>
                    <th className="py-2">Executado</th>
                    <th className="py-2">Medições</th>
                  </tr>
                </thead>
                <tbody>
                  {series.map((s) => (
                    <tr key={s.referencia} className="border-t">
                      <td className="py-2">{s.referencia}</td>
                      <td className="py-2">{fmtMoney(s.valorExecutado)}</td>
                      <td className="py-2">{fmtInt(s.medicoes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm text-slate-500">Sem dados.</div>
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="mb-2 font-medium">Comparativo ({filtros.recorte || "DIRETORIA"})</div>
        {comparativo.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-2">Nome</th>
                  <th className="py-2">Score</th>
                  <th className="py-2">Medições</th>
                  <th className="py-2">Urgências</th>
                  <th className="py-2">NCs</th>
                  <th className="py-2">Acidentes 90d</th>
                </tr>
              </thead>
              <tbody>
                {comparativo.map((c) => (
                  <tr key={`${c.recorte}-${c.referenciaId}`} className="border-t">
                    <td className="py-2">{c.nome}</td>
                    <td className="py-2 font-medium">{fmtInt(c.scoreSaude)}</td>
                    <td className="py-2">{fmtInt(c.medicoesPendentes)}</td>
                    <td className="py-2">{fmtInt(c.solicitacoesUrgentes)}</td>
                    <td className="py-2">{fmtInt(c.ncsCriticas)}</td>
                    <td className="py-2">{fmtInt(c.acidentes90d)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-sm text-slate-500">Sem dados.</div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="mb-2 font-medium">Matriz por módulo</div>
          {matriz.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-2">Nome</th>
                    <th className="py-2">RH</th>
                    <th className="py-2">SST</th>
                    <th className="py-2">Sup.</th>
                    <th className="py-2">Eng.</th>
                    <th className="py-2">Global</th>
                  </tr>
                </thead>
                <tbody>
                  {matriz.map((m) => (
                    <tr key={`${m.recorte}-${m.referenciaId}`} className="border-t">
                      <td className="py-2">{m.nome}</td>
                      <td className="py-2">{fmtInt(m.rhScore)}</td>
                      <td className="py-2">{fmtInt(m.sstScore)}</td>
                      <td className="py-2">{fmtInt(m.suprimentosScore)}</td>
                      <td className="py-2">{fmtInt(m.engenhariaScore)}</td>
                      <td className="py-2 font-medium">{fmtInt(m.scoreGlobal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm text-slate-500">Sem dados.</div>
          )}
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="mb-2 font-medium">Ranking de obras críticas</div>
          {ranking.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-2">Obra</th>
                    <th className="py-2">Diretoria</th>
                    <th className="py-2">Risco</th>
                    <th className="py-2">Medições</th>
                    <th className="py-2">Urgências</th>
                    <th className="py-2">NCs</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((r) => (
                    <tr key={r.idObra} className="border-t">
                      <td className="py-2">{r.nomeObra}</td>
                      <td className="py-2">{r.diretoriaNome || "-"}</td>
                      <td className="py-2 font-medium">{fmtInt(r.scoreRisco)}</td>
                      <td className="py-2">{fmtInt(r.medicoesPendentes)}</td>
                      <td className="py-2">{fmtInt(r.solicitacoesUrgentes)}</td>
                      <td className="py-2">{fmtInt(r.ncsCriticas)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm text-slate-500">Sem dados.</div>
          )}
        </div>
      </div>
    </div>
  );
}

