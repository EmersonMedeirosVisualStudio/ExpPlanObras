import { NextRequest } from 'next/server';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { db } from '@/lib/db';
import { canAccessObra } from '@/lib/auth/access';
import { audit } from '@/lib/api/audit';

export const runtime = 'nodejs';

async function ensureMedicoesDetailsTable() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS contratos_medicoes_detalhes (
      id_det BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_medicao BIGINT UNSIGNED NOT NULL,
      id_obra BIGINT UNSIGNED NOT NULL,
      origem ENUM('ENGENHEIRO','FISCAL') NOT NULL DEFAULT 'ENGENHEIRO',
      id_medicao_origem BIGINT UNSIGNED NULL,
      descricao TEXT NULL,
      data_hora DATETIME NULL,
      servicos_json JSON NULL,
      enviado_em DATETIME NULL,
      aprovado_em DATETIME NULL,
      id_usuario_criador BIGINT UNSIGNED NULL,
      id_usuario_aprovador BIGINT UNSIGNED NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_det),
      UNIQUE KEY uk_med (tenant_id, id_medicao),
      KEY idx_obra (tenant_id, id_obra),
      KEY idx_origem (tenant_id, origem)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

async function contratosMedicoesHasIdObra() {
  const [[row]]: any = await db.query(
    `
    SELECT COUNT(*) AS cnt
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'contratos_medicoes'
      AND COLUMN_NAME = 'id_obra'
    `
  );
  return Number(row?.cnt || 0) > 0;
}

export async function POST(req: NextRequest) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.FISCALIZACAO_MEDICOES_EDIT);
    const body = await req.json().catch(() => null);
    const idMedicaoOriginal = Number(body?.idMedicaoOriginal || 0);
    if (!Number.isFinite(idMedicaoOriginal) || idMedicaoOriginal <= 0) return fail(422, 'idMedicaoOriginal é obrigatório');

    await ensureMedicoesDetailsTable();
    const hasIdObra = await contratosMedicoesHasIdObra();

    const [[orig]]: any = await conn.query(
      `
      SELECT
        m.id_medicao,
        m.id_contrato,
        m.status_medicao AS status,
        m.competencia,
        m.valor_medido,
        d.id_obra AS idObra,
        d.origem,
        d.descricao,
        d.data_hora AS dataHora,
        d.servicos_json AS servicosJson
      FROM contratos_medicoes m
      LEFT JOIN contratos_medicoes_detalhes d ON d.tenant_id = m.tenant_id AND d.id_medicao = m.id_medicao
      WHERE m.tenant_id = ? AND m.id_medicao = ?
      LIMIT 1
      `,
      [current.tenantId, idMedicaoOriginal]
    );
    if (!orig) return fail(404, 'Medição original não encontrada');
    if (!orig.idObra) return fail(422, 'Medição original sem vínculo de obra (detalhes ausentes).');
    if (!canAccessObra(current as any, Number(orig.idObra))) return fail(403, 'Sem acesso à obra');

    if (String(orig.status) !== 'ENVIADA') return fail(422, 'A duplicação é permitida apenas para medições enviadas pelo engenheiro');
    if (String(orig.origem || 'ENGENHEIRO') !== 'ENGENHEIRO') return fail(422, 'A duplicação é destinada à medição original do engenheiro');

    await conn.beginTransaction();

    const insertSql = hasIdObra
      ? `
        INSERT INTO contratos_medicoes
          (tenant_id, id_contrato, id_obra, competencia, status_medicao, valor_medido, created_at)
        VALUES
          (?,?,?,?, 'EM_ELABORACAO', ?, NOW())
        `
      : `
        INSERT INTO contratos_medicoes
          (tenant_id, id_contrato, competencia, status_medicao, valor_medido, created_at)
        VALUES
          (?,?,?, 'EM_ELABORACAO', ?, NOW())
        `;
    const insertParams = hasIdObra
      ? [current.tenantId, orig.id_contrato, Number(orig.idObra), String(orig.competencia || ''), Number(orig.valor_medido || 0)]
      : [current.tenantId, orig.id_contrato, String(orig.competencia || ''), Number(orig.valor_medido || 0)];

    const [ins]: any = await conn.query(insertSql, insertParams);
    const idMedicaoNova = Number(ins.insertId);

    await conn.query(
      `
      INSERT INTO contratos_medicoes_detalhes
        (tenant_id, id_medicao, id_obra, origem, id_medicao_origem, descricao, data_hora, servicos_json, id_usuario_criador)
      VALUES
        (?,?,?,?,?,?,?,?,?)
      `,
      [
        current.tenantId,
        idMedicaoNova,
        Number(orig.idObra),
        'FISCAL',
        idMedicaoOriginal,
        orig.descricao ? String(orig.descricao) : null,
        orig.dataHora ? new Date(orig.dataHora) : null,
        orig.servicosJson ? (typeof orig.servicosJson === 'string' ? orig.servicosJson : JSON.stringify(orig.servicosJson)) : null,
        current.id,
      ]
    );

    await audit({
      tenantId: current.tenantId,
      userId: current.id,
      entidade: 'contratos_medicoes',
      idRegistro: String(idMedicaoNova),
      acao: 'DUPLICAR_PARA_FISCAL',
      dadosNovos: { idObra: Number(orig.idObra), idMedicaoOriginal, idMedicaoNova },
    });

    await conn.commit();
    return ok({ idMedicaoOriginal, idMedicaoNova });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

