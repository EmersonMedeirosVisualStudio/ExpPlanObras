import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { getDashboardScope } from '@/lib/dashboard/scope';

export const runtime = 'nodejs';

async function ensureTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_ativos_tarifas (
      id_tarifa BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_ativo BIGINT UNSIGNED NOT NULL,
      custo_hora_produtiva DECIMAL(14,4) NOT NULL DEFAULT 0,
      custo_hora_improdutiva DECIMAL(14,4) NOT NULL DEFAULT 0,
      custo_km DECIMAL(14,4) NOT NULL DEFAULT 0,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      id_usuario_atualizador BIGINT UNSIGNED NULL,
      PRIMARY KEY (id_tarifa),
      UNIQUE KEY uk_ativo (tenant_id, id_ativo),
      KEY idx_tenant (tenant_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

function normalizeTipoLocal(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'OBRA' || s === 'UNIDADE' ? s : null;
}

function normalizeCompetencia(v: unknown) {
  const s = String(v ?? '').trim();
  return /^\d{4}-\d{2}$/.test(s) ? s : null;
}

type Linha = {
  codigoServico: string;
  horasProdutivas: number;
  horasImprodutivas: number;
  custoHoras: number;
  litros: number;
  custoCombustivel: number;
  viagens: number;
  km: number;
  custoKm: number;
  custoTotal: number;
  ativosSemTarifa: number;
};

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const scope = await getDashboardScope(current);

    const tipoLocal = normalizeTipoLocal(req.nextUrl.searchParams.get('tipoLocal'));
    const idLocal = Number(req.nextUrl.searchParams.get('idLocal') || 0);
    const competencia = normalizeCompetencia(req.nextUrl.searchParams.get('competencia'));

    if (!tipoLocal) return fail(422, 'tipoLocal é obrigatório (OBRA|UNIDADE)');
    if (!Number.isFinite(idLocal) || idLocal <= 0) return fail(422, 'idLocal é obrigatório');
    if (!competencia) return fail(422, 'competencia é obrigatória (YYYY-MM)');
    if (!scope.empresaTotal && tipoLocal === 'OBRA' && !scope.obras.includes(idLocal)) return fail(403, 'Obra fora da abrangência');
    if (!scope.empresaTotal && tipoLocal === 'UNIDADE' && !scope.unidades.includes(idLocal)) return fail(403, 'Unidade fora da abrangência');

    await ensureTables();

    const [horasRows]: any = await db.query(
      `
      SELECT
        h.codigo_servico AS codigoServico,
        SUM(COALESCE(h.horas_produtivas, 0)) AS horasProdutivas,
        SUM(COALESCE(h.horas_improdutivas, 0)) AS horasImprodutivas,
        SUM(COALESCE(h.horas_produtivas, 0) * COALESCE(t.custo_hora_produtiva, 0)) AS custoHorasProd,
        SUM(COALESCE(h.horas_improdutivas, 0) * COALESCE(t.custo_hora_improdutiva, 0)) AS custoHorasImprod,
        SUM(CASE WHEN COALESCE(t.custo_hora_produtiva,0) = 0 AND COALESCE(t.custo_hora_improdutiva,0) = 0 THEN 1 ELSE 0 END) AS ativosSemTarifa
      FROM engenharia_ativos_horas h
      LEFT JOIN engenharia_ativos_tarifas t ON t.tenant_id = h.tenant_id AND t.id_ativo = h.id_ativo
      WHERE h.tenant_id = ?
        AND h.tipo_local = ?
        AND h.id_local = ?
        AND DATE_FORMAT(h.data_referencia, '%Y-%m') = ?
      GROUP BY h.codigo_servico
      `,
      [current.tenantId, tipoLocal, idLocal, competencia]
    );

    const [combRows]: any = await db.query(
      `
      SELECT
        c.codigo_servico AS codigoServico,
        SUM(COALESCE(c.litros, 0)) AS litros,
        SUM(COALESCE(c.valor_total, 0)) AS custoCombustivel
      FROM engenharia_ativos_combustivel c
      WHERE c.tenant_id = ?
        AND c.tipo_local = ?
        AND c.id_local = ?
        AND DATE_FORMAT(c.data_referencia, '%Y-%m') = ?
      GROUP BY c.codigo_servico
      `,
      [current.tenantId, tipoLocal, idLocal, competencia]
    );

    const [viaRows]: any = await db.query(
      `
      SELECT
        v.codigo_servico AS codigoServico,
        COUNT(*) AS viagens,
        SUM(COALESCE(v.km, 0)) AS km,
        SUM(COALESCE(v.km, 0) * COALESCE(t.custo_km, 0)) AS custoKm,
        SUM(CASE WHEN COALESCE(t.custo_km,0) = 0 THEN 1 ELSE 0 END) AS ativosSemTarifaKm
      FROM engenharia_viagens_caminhao v
      LEFT JOIN engenharia_ativos_tarifas t ON t.tenant_id = v.tenant_id AND t.id_ativo = v.id_ativo
      WHERE v.tenant_id = ?
        AND v.tipo_local = ?
        AND v.id_local = ?
        AND DATE_FORMAT(v.data_referencia, '%Y-%m') = ?
      GROUP BY v.codigo_servico
      `,
      [current.tenantId, tipoLocal, idLocal, competencia]
    );

    const map = new Map<string, Linha>();
    function ensure(codigoServico: string) {
      const key = String(codigoServico || '').trim();
      if (!key) return null;
      if (!map.has(key)) {
        map.set(key, {
          codigoServico: key,
          horasProdutivas: 0,
          horasImprodutivas: 0,
          custoHoras: 0,
          litros: 0,
          custoCombustivel: 0,
          viagens: 0,
          km: 0,
          custoKm: 0,
          custoTotal: 0,
          ativosSemTarifa: 0,
        });
      }
      return map.get(key)!;
    }

    for (const r of horasRows || []) {
      const l = ensure(r.codigoServico);
      if (!l) continue;
      l.horasProdutivas = Number(r.horasProdutivas || 0);
      l.horasImprodutivas = Number(r.horasImprodutivas || 0);
      l.custoHoras = Number(r.custoHorasProd || 0) + Number(r.custoHorasImprod || 0);
      l.ativosSemTarifa += Number(r.ativosSemTarifa || 0);
    }

    for (const r of combRows || []) {
      const l = ensure(r.codigoServico);
      if (!l) continue;
      l.litros = Number(r.litros || 0);
      l.custoCombustivel = Number(r.custoCombustivel || 0);
    }

    for (const r of viaRows || []) {
      const l = ensure(r.codigoServico);
      if (!l) continue;
      l.viagens = Number(r.viagens || 0);
      l.km = Number(r.km || 0);
      l.custoKm = Number(r.custoKm || 0);
      l.ativosSemTarifa += Number(r.ativosSemTarifaKm || 0);
    }

    const out = Array.from(map.values()).map((l) => ({
      ...l,
      custoTotal: Number((l.custoHoras + l.custoCombustivel + l.custoKm).toFixed(2)),
    }));
    out.sort((a, b) => b.custoTotal - a.custoTotal);

    const warnings: string[] = [];
    if (out.some((l) => l.ativosSemTarifa > 0)) warnings.push('Há lançamentos sem tarifa cadastrada para o ativo (custos de horas/km podem ficar zerados).');

    return ok({ tipoLocal, idLocal, competencia, linhas: out, warnings });
  } catch (e) {
    return handleApiError(e);
  }
}

