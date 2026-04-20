import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { canAccessObra } from '@/lib/auth/access';

export const runtime = 'nodejs';

function normalizeDate(v: unknown) {
  const s = String(v ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function addDays(dateIso: string, days: number) {
  const d = new Date(`${dateIso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function minutesBetween(dateIso: string, horaInicio: string | null, horaFim: string | null) {
  if (!horaInicio || !horaFim) return 0;
  const a = new Date(`${dateIso}T${horaInicio.length === 5 ? `${horaInicio}:00` : horaInicio}`);
  const b = new Date(`${dateIso}T${horaFim.length === 5 ? `${horaFim}:00` : horaFim}`);
  const diff = Math.round((b.getTime() - a.getTime()) / 60000);
  return diff > 0 ? diff : 0;
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const idObra = Number(req.nextUrl.searchParams.get('idObra') || 0);
    const semanaInicio = normalizeDate(req.nextUrl.searchParams.get('semanaInicio'));
    if (!Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra é obrigatório');
    if (!canAccessObra(current as any, idObra)) return fail(403, 'Sem acesso à obra');
    if (!semanaInicio) return fail(422, 'semanaInicio é obrigatório (YYYY-MM-DD)');

    const semanaFim = addDays(semanaInicio, 6);

    const [planRows]: any = await db.query(
      `
      SELECT
        i.data_referencia AS dataReferencia,
        i.codigo_servico AS codigoServico,
        i.codigo_centro_custo AS codigoCentroCusto,
        i.id_funcionario AS idFuncionario,
        i.hora_inicio_prevista AS horaInicioPrevista,
        i.hora_fim_prevista AS horaFimPrevista,
        i.he_prevista_minutos AS hePrevistaMinutos,
        i.producao_prevista AS producaoPrevista
      FROM engenharia_programacoes_semanais p
      INNER JOIN engenharia_programacoes_semanais_itens i
        ON i.tenant_id = p.tenant_id AND i.id_programacao = p.id_programacao
      WHERE p.tenant_id = ?
        AND p.id_obra = ?
        AND p.semana_inicio = ?
      `,
      [current.tenantId, idObra, semanaInicio]
    );

    const [execRows]: any = await db.query(
      `
      SELECT
        data_referencia AS dataReferencia,
        codigo_servico AS codigoServico,
        codigo_centro_custo AS codigoCentroCusto,
        SUM(quantidade) AS quantidade,
        SUM(horas) AS horas
      FROM engenharia_apropriacoes
      WHERE tenant_id = ?
        AND id_obra = ?
        AND data_referencia >= ?
        AND data_referencia <= ?
      GROUP BY data_referencia, codigo_servico, codigo_centro_custo
      `,
      [current.tenantId, idObra, semanaInicio, semanaFim]
    );

    const execMap = new Map<string, { quantidade: number; horas: number }>();
    for (const r of execRows as any[]) {
      const key = `${String(r.dataReferencia)}|${String(r.codigoServico)}|${r.codigoCentroCusto ? String(r.codigoCentroCusto) : ''}`;
      execMap.set(key, { quantidade: Number(r.quantidade || 0), horas: Number(r.horas || 0) });
    }

    const grid: Array<{
      data: string;
      cc: string | null;
      servico: string;
      pessoas: number;
      planejadoQtd: number;
      executadoQtd: number;
      execucaoPct: number | null;
      status: 'OK' | 'ATRASADO' | 'RISCO';
    }> = [];

    const byCc = new Map<string, { cc: string | null; planejadoQtd: number; executadoQtd: number; planejadoHoras: number; executadoHoras: number; pessoasSet: Set<number> }>();

    const todayIso = new Date().toISOString().slice(0, 10);

    const group = new Map<string, any>();
    for (const r of planRows as any[]) {
      const data = String(r.dataReferencia);
      const servico = String(r.codigoServico || '').trim().toUpperCase();
      const cc = r.codigoCentroCusto ? String(r.codigoCentroCusto).trim().toUpperCase() : '';
      const idFuncionario = Number(r.idFuncionario || 0);
      if (!data || !servico) continue;
      const key = `${data}|${servico}|${cc}`;
      const g = group.get(key) || { data, servico, cc: cc || null, pessoasSet: new Set<number>(), planejadoQtd: 0, planejadoHoras: 0 };
      if (idFuncionario) g.pessoasSet.add(idFuncionario);
      g.planejadoQtd += r.producaoPrevista == null ? 0 : Number(r.producaoPrevista || 0);
      const min = minutesBetween(data, r.horaInicioPrevista ? String(r.horaInicioPrevista).slice(0, 5) : null, r.horaFimPrevista ? String(r.horaFimPrevista).slice(0, 5) : null);
      g.planejadoHoras += (min + Number(r.hePrevistaMinutos || 0)) / 60;
      group.set(key, g);

      const ccKey = cc || '(SEM_CC)';
      const c = byCc.get(ccKey) || { cc: cc || null, planejadoQtd: 0, executadoQtd: 0, planejadoHoras: 0, executadoHoras: 0, pessoasSet: new Set<number>() };
      c.planejadoQtd += r.producaoPrevista == null ? 0 : Number(r.producaoPrevista || 0);
      c.planejadoHoras += (min + Number(r.hePrevistaMinutos || 0)) / 60;
      if (idFuncionario) c.pessoasSet.add(idFuncionario);
      byCc.set(ccKey, c);
    }

    let totalPlan = 0;
    let totalExec = 0;
    let totalExecHoras = 0;
    let totalPlanHoras = 0;

    for (const [key, g] of group.entries()) {
      const [data, servico, ccRaw] = key.split('|');
      const exec = execMap.get(key) || { quantidade: 0, horas: 0 };
      const planejadoQtd = Number(g.planejadoQtd || 0);
      const executadoQtd = Number(exec.quantidade || 0);
      const execucaoPct = planejadoQtd > 0 ? executadoQtd / planejadoQtd : null;

      const status: 'OK' | 'ATRASADO' | 'RISCO' =
        planejadoQtd <= 0
          ? 'RISCO'
          : execucaoPct != null && execucaoPct >= 1
            ? 'OK'
            : data <= todayIso
              ? 'ATRASADO'
              : 'RISCO';

      grid.push({
        data,
        cc: ccRaw ? (ccRaw ? ccRaw : null) : null,
        servico,
        pessoas: g.pessoasSet.size,
        planejadoQtd,
        executadoQtd,
        execucaoPct: execucaoPct == null ? null : Number(execucaoPct.toFixed(4)),
        status,
      });

      totalPlan += planejadoQtd;
      totalExec += executadoQtd;
      totalExecHoras += Number(exec.horas || 0);
      totalPlanHoras += Number(g.planejadoHoras || 0);

      const ccKey = ccRaw || '(SEM_CC)';
      const c = byCc.get(ccKey);
      if (c) {
        c.executadoQtd += executadoQtd;
        c.executadoHoras += Number(exec.horas || 0);
      }
    }

    const execucaoFisica = totalPlan > 0 ? totalExec / totalPlan : null;
    const produtividade = totalExecHoras > 0 ? totalExec / totalExecHoras : null;

    const desempenhoCc = Array.from(byCc.values())
      .map((c) => {
        const execPct = c.planejadoQtd > 0 ? c.executadoQtd / c.planejadoQtd : null;
        const prod = c.executadoHoras > 0 ? c.executadoQtd / c.executadoHoras : null;
        return {
          cc: c.cc,
          planejadoQtd: Number(c.planejadoQtd || 0),
          executadoQtd: Number(c.executadoQtd || 0),
          execucaoPct: execPct == null ? null : Number(execPct.toFixed(4)),
          produtividade: prod == null ? null : Number(prod.toFixed(4)),
          pessoas: c.pessoasSet.size,
        };
      })
      .sort((a, b) => (b.execucaoPct ?? 0) - (a.execucaoPct ?? 0));

    const criticalChain = desempenhoCc
      .filter((c) => c.cc)
      .slice(0, 12)
      .map((c) => ({
        cc: c.cc as string,
        status: (c.execucaoPct ?? 0) >= 1 ? 'OK' : (c.execucaoPct ?? 0) >= 0.7 ? 'RISCO' : 'ATRASADO',
      }));

    const alertas: Array<{ prioridade: 'ALTA' | 'MEDIA' | 'BAIXA'; tipo: string; mensagem: string }> = [];
    if (execucaoFisica != null && execucaoFisica < 0.7) alertas.push({ prioridade: 'ALTA', tipo: 'PRAZO', mensagem: 'Execução física abaixo de 70% da semana.' });
    if (produtividade != null && produtividade < 0.6) alertas.push({ prioridade: 'MEDIA', tipo: 'PRODUTIVIDADE', mensagem: 'Produtividade abaixo do esperado (executado/horas).' });
    if (desempenhoCc.some((c) => c.cc == null)) alertas.push({ prioridade: 'MEDIA', tipo: 'DADOS', mensagem: 'Existem itens planejados sem centro de custo.' });

    const visaoHoje = grid.filter((g) => g.data === todayIso).sort((a, b) => String(a.cc || '').localeCompare(String(b.cc || ''), 'pt-BR'));

    return ok({
      idObra,
      semanaInicio,
      semanaFim,
      kpis: {
        execucaoFisica: execucaoFisica == null ? null : Number(execucaoFisica.toFixed(4)),
        produtividade: produtividade == null ? null : Number(produtividade.toFixed(4)),
        prazoDias: null,
        custoVariacaoPct: null,
      },
      caminhoCritico: criticalChain,
      programacao: grid.sort((a, b) => (a.data === b.data ? String(a.cc || '').localeCompare(String(b.cc || ''), 'pt-BR') : a.data.localeCompare(b.data))),
      recursos: {
        maoObra: { necessario: desempenhoCc.reduce((s, c) => s + (c.pessoas || 0), 0), alocado: null, deficit: null },
        equipamentos: { necessario: null, disponivel: null, deficit: null },
        insumos: { necessario: null, disponivel: null, deficit: null },
      },
      desempenhoCc,
      alertas,
      solicitacoes: [],
      visaoDiaria: { data: todayIso, itens: visaoHoje },
      debug: { totalPlanejadoQtd: totalPlan, totalExecutadoQtd: totalExec, totalPlanejadoHoras: totalPlanHoras, totalExecutadoHoras: totalExecHoras },
    });
  } catch (e) {
    return handleApiError(e);
  }
}

