import { NextRequest } from 'next/server';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { db } from '@/lib/db';
import { canAccessObra } from '@/lib/auth/access';
import { audit } from '@/lib/api/audit';

export const runtime = 'nodejs';

async function ensureExecucaoTable() {
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

function normalizeCriterio(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'HORAS_HOMEM' || s === 'QNT_UN_SERV' ? s : null;
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const idObra = Number(req.nextUrl.searchParams.get('idObra') || 0);
    if (!Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra é obrigatório');
    if (!canAccessObra(current as any, idObra)) return fail(403, 'Sem acesso à obra');

    await ensureExecucaoTable();
    const [rows]: any = await db.query(
      `
      SELECT
        COALESCE(NULLIF(m.competencia,''), DATE_FORMAT(m.created_at, '%Y-%m')) AS competencia,
        SUM(COALESCE(e.quantidade_executada, 0)) AS quantidadeExecutada
      FROM contratos_medicoes_execucao_fisica e
      INNER JOIN contratos_medicoes m ON m.id_medicao = e.id_medicao AND m.tenant_id = e.tenant_id
      WHERE e.tenant_id = ?
        AND e.id_obra = ?
        AND m.status_medicao NOT IN ('EM_ELABORACAO','ENVIADA','CANCELADA','REJEITADA')
      GROUP BY COALESCE(NULLIF(m.competencia,''), DATE_FORMAT(m.created_at, '%Y-%m'))
      ORDER BY competencia ASC
      `,
      [current.tenantId, idObra]
    );
    return ok(rows || []);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PUT(req: NextRequest) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const body = await req.json().catch(() => null);
    const idObra = Number(body?.idObra || 0);
    const idMedicao = Number(body?.idMedicao || 0);
    const quantidadeExecutada = Number(body?.quantidadeExecutada);
    const criterioAvanco = normalizeCriterio(body?.criterioAvanco) || 'QNT_UN_SERV';
    const servicos = Array.isArray(body?.servicos) ? body.servicos.map((s: any) => String(s ?? '').trim()).filter(Boolean) : null;

    if (!Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra é obrigatório');
    if (!canAccessObra(current as any, idObra)) return fail(403, 'Sem acesso à obra');
    if (!Number.isFinite(idMedicao) || idMedicao <= 0) return fail(422, 'idMedicao é obrigatório');
    if (!Number.isFinite(quantidadeExecutada) || quantidadeExecutada < 0) return fail(422, 'quantidadeExecutada inválida');

    await ensureExecucaoTable();

    const [[obra]]: any = await conn.query(
      `
      SELECT o.id_obra, o.id_contrato
      FROM obras o
      INNER JOIN contratos c ON c.id_contrato = o.id_contrato
      WHERE c.tenant_id = ? AND o.id_obra = ?
      LIMIT 1
      `,
      [current.tenantId, idObra]
    );
    if (!obra) return fail(404, 'Obra não encontrada');

    const [[med]]: any = await conn.query(
      `
      SELECT id_medicao, id_contrato, status_medicao
      FROM contratos_medicoes
      WHERE tenant_id = ? AND id_medicao = ?
      LIMIT 1
      `,
      [current.tenantId, idMedicao]
    );
    if (!med) return fail(404, 'Medição não encontrada');
    if (Number(med.id_contrato) !== Number(obra.id_contrato)) return fail(422, 'Medição não pertence ao contrato principal da obra');

    const [[before]]: any = await conn.query(
      `
      SELECT
        id_execucao AS idExecucao,
        quantidade_executada AS quantidadeExecutada,
        criterio_avanco AS criterioAvanco,
        servicos_json AS servicosJson
      FROM contratos_medicoes_execucao_fisica
      WHERE tenant_id = ? AND id_medicao = ?
      LIMIT 1
      `,
      [current.tenantId, idMedicao]
    );

    await conn.beginTransaction();
    await conn.query(
      `
      INSERT INTO contratos_medicoes_execucao_fisica
        (tenant_id, id_obra, id_medicao, criterio_avanco, quantidade_executada, servicos_json, id_usuario_atualizador)
      VALUES
        (?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE
        quantidade_executada = VALUES(quantidade_executada),
        criterio_avanco = VALUES(criterio_avanco),
        servicos_json = VALUES(servicos_json),
        id_usuario_atualizador = VALUES(id_usuario_atualizador)
      `,
      [current.tenantId, idObra, idMedicao, criterioAvanco, quantidadeExecutada, servicos ? JSON.stringify(servicos) : null, current.id]
    );

    await audit({
      tenantId: current.tenantId,
      userId: current.id,
      entidade: 'contratos_medicoes_execucao_fisica',
      idRegistro: String(idMedicao),
      acao: before ? 'UPDATE' : 'CREATE',
      dadosAnteriores: before ?? null,
      dadosNovos: { idObra, idMedicao, criterioAvanco, quantidadeExecutada, servicos: servicos ?? null },
    });

    await conn.commit();
    return ok({ idObra, idMedicao, criterioAvanco, quantidadeExecutada });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}
