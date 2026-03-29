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

function normalizeDate(v: unknown) {
  const s = String(v ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

const MODELOS_RECORRENTES_POR_CODIGO = ['EQP_DIARIO', 'EQP_PRE_OPERACAO', 'EQP_MANUT_PREVENTIVA'] as const;

export async function POST(req: NextRequest) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_CHECKLISTS_CRUD);
    const body = await req.json().catch(() => null);

    const tipoLocal = normalizeTipoLocal(body?.tipoLocal);
    const idObra = body?.idObra ? Number(body.idObra) : null;
    const idUnidade = body?.idUnidade ? Number(body.idUnidade) : null;
    const dataInicioVigencia = normalizeDate(body?.dataInicioVigencia) || new Date().toISOString().slice(0, 10);
    const observacao = body?.observacao ? String(body.observacao).trim() : 'Programação padrão';

    if (!tipoLocal) return fail(422, 'tipoLocal é obrigatório (OBRA|UNIDADE)');
    if (!dataInicioVigencia) return fail(422, 'dataInicioVigencia inválida');
    if (tipoLocal === 'OBRA') {
      if (!idObra || !Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra é obrigatório');
    }
    if (tipoLocal === 'UNIDADE') {
      if (!idUnidade || !Number.isFinite(idUnidade) || idUnidade <= 0) return fail(422, 'idUnidade é obrigatório');
    }

    await ensureTables();

    const [modelos]: any = await conn.query(
      `
      SELECT id_modelo_checklist AS id, codigo, periodicidade
      FROM sst_checklists_modelos
      WHERE tenant_id = ?
        AND ativo = 1
        AND codigo IN (${MODELOS_RECORRENTES_POR_CODIGO.map(() => '?').join(',')})
      `,
      [current.tenantId, ...MODELOS_RECORRENTES_POR_CODIGO]
    );

    const encontrados = new Map<string, { id: number; codigo: string; periodicidade: string }>();
    for (const m of modelos as any[]) {
      encontrados.set(String(m.codigo), { id: Number(m.id), codigo: String(m.codigo), periodicidade: String(m.periodicidade) });
    }

    const faltando = MODELOS_RECORRENTES_POR_CODIGO.filter((c) => !encontrados.has(c));
    if (faltando.length) return fail(422, `Modelos padrão não encontrados: ${faltando.join(', ')}. Crie os modelos padrão antes.`);

    await conn.beginTransaction();

    const resultado: any[] = [];

    for (const codigo of MODELOS_RECORRENTES_POR_CODIGO) {
      const m = encontrados.get(codigo)!;

      const [[exists]]: any = await conn.query(
        `
        SELECT id_programacao_checklist AS id
        FROM sst_checklists_programacoes
        WHERE tenant_id = ?
          AND id_modelo_checklist = ?
          AND tipo_local = ?
          AND COALESCE(id_obra, 0) = COALESCE(?, 0)
          AND COALESCE(id_unidade, 0) = COALESCE(?, 0)
        LIMIT 1
        `,
        [current.tenantId, m.id, tipoLocal, tipoLocal === 'OBRA' ? idObra : null, tipoLocal === 'UNIDADE' ? idUnidade : null]
      );

      if (exists?.id) {
        resultado.push({ codigo, idModeloChecklist: m.id, idProgramacao: Number(exists.id), criado: false });
        continue;
      }

      const [ins]: any = await conn.query(
        `
        INSERT INTO sst_checklists_programacoes
          (tenant_id, id_modelo_checklist, tipo_local, id_obra, id_unidade,
           periodicidade_override, dia_semana, dia_mes,
           data_inicio_vigencia, data_fim_vigencia, ativo, observacao)
        VALUES
          (?,?,?,?,?,?,?,?,?,NULL,1,?)
        `,
        [
          current.tenantId,
          m.id,
          tipoLocal,
          tipoLocal === 'OBRA' ? idObra : null,
          tipoLocal === 'UNIDADE' ? idUnidade : null,
          null,
          null,
          null,
          dataInicioVigencia,
          observacao,
        ]
      );

      resultado.push({ codigo, idModeloChecklist: m.id, idProgramacao: Number(ins.insertId), criado: true });
    }

    await conn.commit();

    const criados = resultado.filter((r) => r.criado).length;
    const existentes = resultado.filter((r) => !r.criado).length;
    return ok({ criados, existentes, programacoes: resultado });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}
