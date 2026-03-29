import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

async function ensureTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS sst_checklists_programacoes (
      id_programacao_checklist BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_modelo_checklist BIGINT UNSIGNED NOT NULL,
      tipo_local VARCHAR(20) NOT NULL,
      id_obra BIGINT UNSIGNED NULL,
      id_unidade BIGINT UNSIGNED NULL,
      periodicidade_override VARCHAR(20) NULL,
      dia_semana INT NULL,
      dia_mes INT NULL,
      data_inicio_vigencia DATE NOT NULL,
      data_fim_vigencia DATE NULL,
      ativo TINYINT(1) NOT NULL DEFAULT 1,
      observacao TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_programacao_checklist),
      KEY idx_tenant (tenant_id),
      KEY idx_modelo (tenant_id, id_modelo_checklist),
      KEY idx_local (tenant_id, tipo_local, id_obra, id_unidade),
      KEY idx_ativo (tenant_id, ativo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

function normalizeTipoLocal(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'OBRA' || s === 'UNIDADE' ? s : null;
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_CHECKLISTS_VIEW);
    await ensureTables();

    const tipoLocal = normalizeTipoLocal(req.nextUrl.searchParams.get('tipoLocal'));
    const idObra = req.nextUrl.searchParams.get('idObra') ? Number(req.nextUrl.searchParams.get('idObra')) : null;
    const idUnidade = req.nextUrl.searchParams.get('idUnidade') ? Number(req.nextUrl.searchParams.get('idUnidade')) : null;

    const where: string[] = ['p.tenant_id = ?'];
    const params: any[] = [current.tenantId];

    if (tipoLocal) {
      where.push('p.tipo_local = ?');
      params.push(tipoLocal);
    }
    if (idObra != null) {
      if (!Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra inválido');
      where.push('p.id_obra = ?');
      params.push(idObra);
    }
    if (idUnidade != null) {
      if (!Number.isFinite(idUnidade) || idUnidade <= 0) return fail(422, 'idUnidade inválido');
      where.push('p.id_unidade = ?');
      params.push(idUnidade);
    }

    const [rows]: any = await db.query(
      `
      SELECT
        p.id_programacao_checklist AS id,
        p.id_modelo_checklist AS idModeloChecklist,
        m.codigo AS modeloCodigo,
        m.nome_modelo AS nomeModelo,
        p.tipo_local AS tipoLocal,
        p.id_obra AS idObra,
        p.id_unidade AS idUnidade,
        COALESCE(p.periodicidade_override, m.periodicidade) AS periodicidade,
        p.periodicidade_override AS periodicidadeOverride,
        p.dia_semana AS diaSemana,
        p.dia_mes AS diaMes,
        p.data_inicio_vigencia AS dataInicioVigencia,
        p.data_fim_vigencia AS dataFimVigencia,
        p.ativo,
        p.observacao,
        u.ultima_execucao AS ultimaExecucao
      FROM sst_checklists_programacoes p
      INNER JOIN sst_checklists_modelos m ON m.id_modelo_checklist = p.id_modelo_checklist
      LEFT JOIN (
        SELECT
          e.tenant_id,
          e.id_modelo_checklist,
          e.tipo_local,
          COALESCE(e.id_obra, 0) AS id_obra_ref,
          COALESCE(e.id_unidade, 0) AS id_unidade_ref,
          MAX(CASE WHEN e.status_execucao = 'FINALIZADA' THEN e.data_referencia END) AS ultima_execucao
        FROM sst_checklists_execucoes e
        WHERE e.tenant_id = ?
        GROUP BY e.tenant_id, e.id_modelo_checklist, e.tipo_local, COALESCE(e.id_obra, 0), COALESCE(e.id_unidade, 0)
      ) u
        ON u.tenant_id = p.tenant_id
       AND u.id_modelo_checklist = p.id_modelo_checklist
       AND u.tipo_local = p.tipo_local
       AND u.id_obra_ref = COALESCE(p.id_obra, 0)
       AND u.id_unidade_ref = COALESCE(p.id_unidade, 0)
      WHERE ${where.join(' AND ')}
      ORDER BY p.ativo DESC, p.data_inicio_vigencia DESC, p.id_programacao_checklist DESC
      LIMIT 500
      `,
      [current.tenantId, ...params]
    );

    return ok(
      (rows as any[]).map((r) => ({
        ...r,
        id: Number(r.id),
        idModeloChecklist: Number(r.idModeloChecklist),
        idObra: r.idObra == null ? null : Number(r.idObra),
        idUnidade: r.idUnidade == null ? null : Number(r.idUnidade),
        ativo: Number(r.ativo || 0) ? 1 : 0,
      }))
    );
  } catch (e) {
    return handleApiError(e);
  }
}
