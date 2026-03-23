import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, created, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_CHECKLISTS_VIEW);
    const [rows]: any = await db.query(
      `
      SELECT
        id_modelo_checklist id,
        codigo,
        nome_modelo nomeModelo,
        tipo_local_permitido tipoLocalPermitido,
        periodicidade,
        abrange_terceirizados abrangeTerceirizados,
        exige_assinatura_executor exigeAssinaturaExecutor,
        exige_ciencia_responsavel exigeCienciaResponsavel,
        ativo
      FROM sst_checklists_modelos
      WHERE tenant_id = ?
      ORDER BY nome_modelo
      `,
      [current.tenantId]
    );
    return ok(rows);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_CHECKLISTS_CRUD);
    const body = await req.json();

    if (!body.nomeModelo || !body.periodicidade) {
      return fail(422, 'Nome e periodicidade são obrigatórios');
    }

    await conn.beginTransaction();

    const [result]: any = await conn.query(
      `
      INSERT INTO sst_checklists_modelos
      (tenant_id, codigo, nome_modelo, tipo_local_permitido, periodicidade, abrange_terceirizados, exige_assinatura_executor, exige_ciencia_responsavel, ativo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `,
      [
        current.tenantId,
        body.codigo || null,
        body.nomeModelo,
        body.tipoLocalPermitido || 'AMBOS',
        body.periodicidade,
        body.abrangeTerceirizados ? 1 : 0,
        body.exigeAssinaturaExecutor ? 1 : 0,
        body.exigeCienciaResponsavel ? 1 : 0,
      ]
    );

    const idModelo = result.insertId;
    const itens = Array.isArray(body.itens) ? body.itens : [];
    for (const it of itens) {
      if (!it?.descricaoItem) continue;
      await conn.query(
        `
        INSERT INTO sst_checklists_modelos_itens
        (id_modelo_checklist, ordem_item, grupo_item, descricao_item, tipo_resposta, obrigatorio, gera_nc_quando_reprovado, ativo)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        `,
        [
          idModelo,
          Number(it.ordemItem || 0),
          it.grupoItem || null,
          it.descricaoItem,
          it.tipoResposta || 'OK_NOK_NA',
          it.obrigatorio ? 1 : 0,
          it.geraNcQuandoReprovado ? 1 : 0,
        ]
      );
    }

    await conn.commit();
    return created({ id: idModelo });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}
