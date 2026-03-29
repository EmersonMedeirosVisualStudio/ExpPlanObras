import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

async function ensureTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS sst_treinamentos_modelos_servicos (
      id_modelo_servico BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_treinamento_modelo BIGINT UNSIGNED NOT NULL,
      codigo_servico VARCHAR(80) NOT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_modelo_servico),
      UNIQUE KEY uk_modelo_servico (tenant_id, id_treinamento_modelo, codigo_servico),
      KEY idx_tenant (tenant_id),
      KEY idx_servico (tenant_id, codigo_servico)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

function normalizeCodigoServico(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s ? s : null;
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_TREINAMENTOS_VIEW);
    await ensureTables();

    const codigoServico = normalizeCodigoServico(req.nextUrl.searchParams.get('codigoServico'));
    if (!codigoServico) return fail(422, 'codigoServico é obrigatório');

    const [rows]: any = await db.query(
      `
      SELECT DISTINCT
        tp.id_funcionario AS idFuncionario,
        f.nome_completo AS funcionarioNome,
        MAX(COALESCE(tp.validade_ate, '2999-12-31')) AS validadeAteMax
      FROM sst_treinamentos_participantes tp
      INNER JOIN sst_treinamentos_turmas t ON t.tenant_id = tp.tenant_id AND t.id_treinamento_turma = tp.id_treinamento_turma
      INNER JOIN sst_treinamentos_modelos m ON m.tenant_id = t.tenant_id AND m.id_treinamento_modelo = t.id_treinamento_modelo
      INNER JOIN sst_treinamentos_modelos_servicos ms ON ms.tenant_id = m.tenant_id AND ms.id_treinamento_modelo = m.id_treinamento_modelo
      INNER JOIN funcionarios f ON f.id_funcionario = tp.id_funcionario
      WHERE tp.tenant_id = ?
        AND ms.codigo_servico = ?
        AND (tp.validade_ate IS NULL OR tp.validade_ate >= CURDATE())
        AND (
          (m.exige_aprovacao = 1 AND tp.status_participacao = 'APROVADO')
          OR
          (m.exige_aprovacao = 0 AND tp.status_participacao IN ('PRESENTE','APROVADO'))
        )
      GROUP BY tp.id_funcionario, f.nome_completo
      ORDER BY funcionarioNome
      LIMIT 2000
      `,
      [current.tenantId, codigoServico]
    );

    return ok(
      (rows as any[]).map((r) => ({
        idFuncionario: Number(r.idFuncionario),
        funcionarioNome: String(r.funcionarioNome || ''),
        validadeAteMax: r.validadeAteMax ? String(r.validadeAteMax) : null,
      }))
    );
  } catch (e) {
    return handleApiError(e);
  }
}

