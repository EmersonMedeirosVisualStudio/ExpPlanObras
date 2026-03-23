import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

async function obterProfissionalSstDoUsuario(tenantId: number, idFuncionario: number | null) {
  if (!idFuncionario) return null;
  const [rows]: any = await db.query(
    `SELECT id_sst_profissional FROM sst_profissionais WHERE tenant_id = ? AND id_funcionario = ? AND ativo = 1`,
    [tenantId, idFuncionario]
  );
  return rows[0] || null;
}

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_ACIDENTES_INVESTIGAR);
    const idAcidente = Number(params.id);
    const body = await req.json();

    const profissional = await obterProfissionalSstDoUsuario(current.tenantId, current.idFuncionario || null);
    if (!profissional) return fail(403, 'Usuário não é profissional SST ativo');

    const [rows]: any = await conn.query(`SELECT * FROM sst_acidentes WHERE id_acidente = ? AND tenant_id = ?`, [idAcidente, current.tenantId]);
    if (!rows.length) return fail(404, 'Ocorrência não encontrada');

    await conn.beginTransaction();

    await conn.query(
      `
      INSERT INTO sst_acidentes_investigacoes
      (id_acidente, metodologia, causas_imediatas, causas_raiz, fatores_contribuintes, medidas_imediatas, recomendacoes, conclusao,
       data_inicio, data_conclusao, id_usuario_responsavel)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        metodologia = VALUES(metodologia),
        causas_imediatas = VALUES(causas_imediatas),
        causas_raiz = VALUES(causas_raiz),
        fatores_contribuintes = VALUES(fatores_contribuintes),
        medidas_imediatas = VALUES(medidas_imediatas),
        recomendacoes = VALUES(recomendacoes),
        conclusao = VALUES(conclusao),
        data_inicio = VALUES(data_inicio),
        data_conclusao = VALUES(data_conclusao),
        id_usuario_responsavel = VALUES(id_usuario_responsavel),
        updated_at = CURRENT_TIMESTAMP
      `,
      [
        idAcidente,
        body.metodologia || '5_PORQUES',
        body.causasImediatas || null,
        body.causasRaiz || null,
        body.fatoresContribuintes || null,
        body.medidasImediatas || null,
        body.recomendacoes || null,
        body.conclusao || null,
        body.dataInicio || null,
        body.dataConclusao || null,
        current.id,
      ]
    );

    await conn.query(
      `
      UPDATE sst_acidentes
      SET status_acidente = 'EM_INVESTIGACAO',
        id_sst_profissional_responsavel_investigacao = COALESCE(id_sst_profissional_responsavel_investigacao, ?),
        data_inicio_investigacao = COALESCE(data_inicio_investigacao, NOW()),
        data_conclusao_investigacao = ?
      WHERE id_acidente = ? AND tenant_id = ?
      `,
      [profissional.id_sst_profissional, body.dataConclusao || null, idAcidente, current.tenantId]
    );

    await conn.commit();
    return ok({ id: idAcidente });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}
