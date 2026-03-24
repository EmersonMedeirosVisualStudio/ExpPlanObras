import { db } from '@/lib/db';
import type { DashboardExportContexto, DashboardExportFiltrosDTO } from '@/lib/modules/dashboard-export/types';
import { DASHBOARD_EXPORT_PROVIDERS } from '@/lib/modules/dashboard-export/registry';
import { renderPdf } from '@/lib/modules/dashboard-export/render-pdf';
import { renderXlsx } from '@/lib/modules/dashboard-export/render-xlsx';
import { buildDashboardExportFilename } from '@/lib/modules/dashboard-export/build-filename';

export function calcularProximaExecucao(input: {
  recorrencia: 'DIARIO' | 'SEMANAL' | 'MENSAL';
  horarioExecucao: string;
  timezone: string;
  diaSemana?: number | null;
  diaMes?: number | null;
  base?: Date;
}): Date {
  const base = input.base ? new Date(input.base) : new Date();
  const [hh, mm, ss] = String(input.horarioExecucao || '08:00:00')
    .split(':')
    .map((x) => Number(x || 0));

  const candidate = new Date(base);
  candidate.setSeconds(ss || 0, 0);
  candidate.setMinutes(mm || 0);
  candidate.setHours(hh || 0);

  const addDays = (n: number) => {
    const d = new Date(candidate);
    d.setDate(d.getDate() + n);
    return d;
  };

  if (input.recorrencia === 'DIARIO') {
    if (candidate <= base) return addDays(1);
    return candidate;
  }

  if (input.recorrencia === 'SEMANAL') {
    const target = typeof input.diaSemana === 'number' ? input.diaSemana : 1;
    const cur = candidate.getDay();
    let delta = (target - cur + 7) % 7;
    if (delta === 0 && candidate <= base) delta = 7;
    return addDays(delta);
  }

  const day = typeof input.diaMes === 'number' ? input.diaMes : 1;
  const d = new Date(candidate);
  d.setDate(1);
  const month = d.getMonth();
  const year = d.getFullYear();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  d.setDate(Math.min(Math.max(1, day), daysInMonth));
  if (d <= base) {
    const next = new Date(year, month + 1, 1, d.getHours(), d.getMinutes(), d.getSeconds(), 0);
    const nextDays = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(Math.max(1, day), nextDays));
    return next;
  }
  return d;
}

export async function getUserPermissionCodes(tenantId: number, userId: number): Promise<string[]> {
  try {
    const [rows]: any = await db.query(
      `
      SELECT DISTINCT CONCAT(pp.modulo, '.', pp.janela, '.', pp.acao) AS codigo
      FROM usuario_perfis up
      INNER JOIN perfil_permissoes pp ON pp.id_perfil = up.id_perfil AND pp.permitido = 1
      WHERE up.id_usuario = ? AND up.ativo = 1
      `,
      [userId]
    );
    return (rows as any[]).map((r) => String(r.codigo)).filter(Boolean);
  } catch {
    return [];
  }
}

export async function executarExport(args: {
  tenantId: number;
  userId: number;
  contexto: DashboardExportContexto;
  filtros?: DashboardExportFiltrosDTO;
  formato: 'PDF' | 'XLSX' | 'AMBOS';
}) {
  const provider = DASHBOARD_EXPORT_PROVIDERS[args.contexto];
  if (!provider) throw new Error('Contexto não suportado');

  const data = await provider.build({
    tenantId: args.tenantId,
    userId: args.userId,
    filtros: args.filtros,
  });

  const out: { formato: 'PDF' | 'XLSX'; filename: string; contentType: string; buffer: Buffer }[] = [];
  if (args.formato === 'PDF' || args.formato === 'AMBOS') {
    out.push({
      formato: 'PDF',
      filename: buildDashboardExportFilename(args.contexto, 'PDF'),
      contentType: 'application/pdf',
      buffer: await renderPdf(data),
    });
  }
  if (args.formato === 'XLSX' || args.formato === 'AMBOS') {
    out.push({
      formato: 'XLSX',
      filename: buildDashboardExportFilename(args.contexto, 'XLSX'),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: await renderXlsx(data),
    });
  }
  return out;
}

export async function inserirExecucao(args: { tenantId: number; agendamentoId: number; manual: boolean; executorUserId?: number | null }) {
  await db.execute(
    `
    INSERT INTO relatorios_agendamentos_execucoes
      (tenant_id, id_relatorio_agendamento, status_execucao, execucao_manual, id_usuario_executor_manual)
    VALUES (?, ?, 'PENDENTE', ?, ?)
    `,
    [args.tenantId, args.agendamentoId, args.manual ? 1 : 0, args.executorUserId ?? null]
  );
  const [[row]]: any = await db.query(
    `SELECT MAX(id_relatorio_agendamento_execucao) AS id FROM relatorios_agendamentos_execucoes WHERE tenant_id = ? AND id_relatorio_agendamento = ?`,
    [args.tenantId, args.agendamentoId]
  );
  return Number(row?.id);
}

