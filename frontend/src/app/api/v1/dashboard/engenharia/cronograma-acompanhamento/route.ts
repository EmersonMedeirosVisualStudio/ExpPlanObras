import { NextRequest } from 'next/server';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { db } from '@/lib/db';
import { canAccessObra } from '@/lib/auth/access';

export const runtime = 'nodejs';

type MesPlanejado = {
  competencia: string;
  quantidadePlanejada: number | null;
  valorPlanejado: number | null;
  percentualPlanejado: number | null;
};

function normalizeCompetencia(v: unknown) {
  const s = String(v ?? '').trim();
  return /^\d{4}-\d{2}$/.test(s) ? s : null;
}

function toNumberOrNull(v: unknown) {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function parseCronogramaMeses(cronogramaJson: any): MesPlanejado[] {
  const raw = Array.isArray(cronogramaJson?.meses)
    ? cronogramaJson.meses
    : Array.isArray(cronogramaJson?.cronograma)
      ? cronogramaJson.cronograma
      : Array.isArray(cronogramaJson)
        ? cronogramaJson
        : [];

  const out: MesPlanejado[] = [];
  const seen = new Set<string>();
  for (const it of raw) {
    const competencia =
      normalizeCompetencia(it?.competencia) ||
      normalizeCompetencia(it?.mes) ||
      normalizeCompetencia(it?.referencia) ||
      normalizeCompetencia(it?.periodo);
    if (!competencia) continue;
    if (seen.has(competencia)) continue;
    seen.add(competencia);
    out.push({
      competencia,
      quantidadePlanejada: toNumberOrNull(it?.quantidadePlanejada ?? it?.qtdPlanejada ?? it?.quantidadePrevista ?? it?.quantidade),
      valorPlanejado: toNumberOrNull(it?.valorPlanejado ?? it?.valorPrevisto ?? it?.valor),
      percentualPlanejado: toNumberOrNull(it?.percentualPlanejado ?? it?.percentualPrevisto ?? it?.percentual),
    });
  }
  out.sort((a, b) => a.competencia.localeCompare(b.competencia));
  return out;
}

async function ensureTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS contratos_medicoes_execucao_fisica (
      id_execucao BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_obra BIGINT UNSIGNED NOT NULL,
      id_medicao BIGINT UNSIGNED NOT NULL,
      criterio_avanco ENUM('QNT_UN_SERV','HORAS_HOMEM') NOT NULL DEFAULT 'QNT_UN_SERV',
      quantidade_executada DECIMAL(14,4) NOT NULL DEFAULT 0,
      servicos_json JSON NULL,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      id_usuario_atualizador BIGINT UNSIGNED NULL,
      PRIMARY KEY (id_execucao),
      UNIQUE KEY uk_medicao (tenant_id, id_medicao),
      KEY idx_obra (tenant_id, id_obra),
      KEY idx_obra_medicao (tenant_id, id_obra, id_medicao)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

let cachedHasIdObraInMedicoes: boolean | null = null;
async function contratosMedicoesHasIdObra() {
  if (cachedHasIdObraInMedicoes != null) return cachedHasIdObraInMedicoes;
  const [[row]]: any = await db.query(
    `
    SELECT COUNT(*) AS cnt
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'contratos_medicoes'
      AND COLUMN_NAME = 'id_obra'
    `
  );
  cachedHasIdObraInMedicoes = Number(row?.cnt || 0) > 0;
  return cachedHasIdObraInMedicoes;
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const idObra = Number(req.nextUrl.searchParams.get('idObra') || 0);
    if (!Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra é obrigatório');
    if (!canAccessObra(current as any, idObra)) return fail(403, 'Sem acesso à obra');

    await ensureTables();

    const [[obra]]: any = await db.query(
      `
      SELECT
        o.id_obra,
        o.id_contrato AS idContrato,
        c.numero_contrato AS numeroContrato,
        COALESCE(c.valor_contratado, 0) AS valorContratado
      FROM obras o
      INNER JOIN contratos c ON c.id_contrato = o.id_contrato
      WHERE c.tenant_id = ? AND o.id_obra = ?
      LIMIT 1
      `,
      [current.tenantId, idObra]
    );
    if (!obra) return fail(404, 'Obra não encontrada');

    const [[param]]: any = await db.query(
      `SELECT criterio_avanco AS criterioAvanco FROM obras_parametros WHERE tenant_id = ? AND id_obra = ? LIMIT 1`,
      [current.tenantId, idObra]
    );
    const criterioAvanco = String(param?.criterioAvanco || 'QNT_UN_SERV');

    const [[cron]]: any = await db.query(
      `
      SELECT cronograma_json AS cronogramaJson
      FROM obras_cronogramas
      WHERE tenant_id = ? AND id_obra = ?
      ORDER BY versao DESC, id_cronograma DESC
      LIMIT 1
      `,
      [current.tenantId, idObra]
    );
    const cronogramaJson = cron?.cronogramaJson ? (typeof cron.cronogramaJson === 'string' ? JSON.parse(cron.cronogramaJson) : cron.cronogramaJson) : null;
    const mesesPlanejados = cronogramaJson ? parseCronogramaMeses(cronogramaJson) : [];

    const hasIdObra = await contratosMedicoesHasIdObra();
    const whereMed: string[] = [
      'm.tenant_id = ?',
      'm.id_contrato = ?',
      "m.status_medicao NOT IN ('EM_ELABORACAO','ENVIADA','CANCELADA','REJEITADA')",
    ];
    const paramsMed: any[] = [current.tenantId, Number(obra.idContrato)];
    let execucaoFinanceiraNivel: 'OBRA' | 'CONTRATO' = 'CONTRATO';
    if (hasIdObra) {
      whereMed.push('m.id_obra = ?');
      paramsMed.push(idObra);
      execucaoFinanceiraNivel = 'OBRA';
    }

    const [medRows]: any = await db.query(
      `
      SELECT
        COALESCE(NULLIF(m.competencia,''), DATE_FORMAT(m.created_at, '%Y-%m')) AS competencia,
        SUM(COALESCE(m.valor_medido, 0)) AS valorMedidoMes
      FROM contratos_medicoes m
      WHERE ${whereMed.join(' AND ')}
      GROUP BY COALESCE(NULLIF(m.competencia,''), DATE_FORMAT(m.created_at, '%Y-%m'))
      ORDER BY competencia ASC
      `,
      paramsMed
    );
    const medMap = new Map<string, number>((medRows as any[]).map((r) => [String(r.competencia), Number(r.valorMedidoMes || 0)]));

    const [fisRows]: any = await db.query(
      `
      SELECT
        COALESCE(NULLIF(m.competencia,''), DATE_FORMAT(m.created_at, '%Y-%m')) AS competencia,
        SUM(COALESCE(e.quantidade_executada, 0)) AS quantidadeExecutada
      FROM contratos_medicoes_execucao_fisica e
      INNER JOIN contratos_medicoes m ON m.id_medicao = e.id_medicao AND m.tenant_id = e.tenant_id
      WHERE e.tenant_id = ?
        AND e.id_obra = ?
        AND m.id_contrato = ?
        AND m.status_medicao NOT IN ('EM_ELABORACAO','ENVIADA','CANCELADA','REJEITADA')
      GROUP BY COALESCE(NULLIF(m.competencia,''), DATE_FORMAT(m.created_at, '%Y-%m'))
      ORDER BY competencia ASC
      `,
      [current.tenantId, idObra, Number(obra.idContrato)]
    );
    const fisMap = new Map<string, number>((fisRows as any[]).map((r) => [String(r.competencia), Number(r.quantidadeExecutada || 0)]));

    const totalQtdPlanejada = mesesPlanejados.reduce((acc, m) => acc + (m.quantidadePlanejada || 0), 0);
    const totalValorPlanejado = mesesPlanejados.reduce((acc, m) => acc + (m.valorPlanejado || 0), 0);
    const totalPercentPlanejado = mesesPlanejados.reduce((acc, m) => acc + (m.percentualPlanejado || 0), 0);

    const valorContratado = Number(obra.valorContratado || 0);

    let acumPlanejado = 0;
    let acumMedido = 0;
    let acumExecQtd = 0;

    const meses = mesesPlanejados.map((m) => {
      const valorMedidoMes = medMap.get(m.competencia) || 0;
      acumMedido += valorMedidoMes;

      const qtdExecMes = fisMap.has(m.competencia) ? Number(fisMap.get(m.competencia) || 0) : null;
      if (qtdExecMes != null) acumExecQtd += qtdExecMes;

      let percPlanMes: number | null = null;
      if (m.percentualPlanejado != null) {
        const base = totalPercentPlanejado > 0 ? totalPercentPlanejado : 100;
        percPlanMes = m.percentualPlanejado / base;
      } else if (m.valorPlanejado != null && totalValorPlanejado > 0) {
        percPlanMes = m.valorPlanejado / totalValorPlanejado;
      } else if (m.quantidadePlanejada != null && totalQtdPlanejada > 0) {
        percPlanMes = m.quantidadePlanejada / totalQtdPlanejada;
      }
      acumPlanejado += percPlanMes || 0;

      const percFinMes = valorContratado > 0 ? valorMedidoMes / valorContratado : null;
      const percFinAcum = valorContratado > 0 ? acumMedido / valorContratado : null;

      const percQtdMes = totalQtdPlanejada > 0 && qtdExecMes != null ? qtdExecMes / totalQtdPlanejada : null;
      const percQtdAcum = totalQtdPlanejada > 0 && qtdExecMes != null ? acumExecQtd / totalQtdPlanejada : null;

      return {
        competencia: m.competencia,
        planejado: {
          percentualMes: percPlanMes,
          percentualAcumulado: acumPlanejado,
          quantidadePlanejada: m.quantidadePlanejada,
          valorPlanejado: m.valorPlanejado,
        },
        executado: {
          valorMedidoMes,
          valorMedidoAcumulado: acumMedido,
          percentualFinanceiroMes: percFinMes,
          percentualFinanceiroAcumulado: percFinAcum,
          quantidadeExecutadaMes: qtdExecMes,
          quantidadeExecutadaAcumulada: qtdExecMes != null ? acumExecQtd : null,
          percentualQuantidadeMes: percQtdMes,
          percentualQuantidadeAcumulado: percQtdAcum,
        },
      };
    });

    const warnings: string[] = [];
    if (!cronogramaJson) warnings.push('Cronograma não cadastrado para esta obra.');
    if (!valorContratado) warnings.push('Contrato sem valor_contratado; percentual financeiro não pode ser calculado.');
    if (execucaoFinanceiraNivel === 'CONTRATO') warnings.push('Execução financeira (medições) está no nível do contrato.');
    if (!fisRows?.length) warnings.push('Execução física não registrada por medição (quantidade/HH por medição).');

    return ok({
      idObra,
      idContrato: Number(obra.idContrato),
      numeroContrato: String(obra.numeroContrato || ''),
      valorContratado,
      criterioAvanco,
      execucaoFinanceiraNivel,
      meses,
      warnings,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
