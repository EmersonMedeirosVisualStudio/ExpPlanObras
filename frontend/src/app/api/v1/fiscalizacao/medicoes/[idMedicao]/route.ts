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

function normalizeCompetencia(v: unknown) {
  const s = String(v ?? '').trim();
  return /^\d{4}-\d{2}$/.test(s) ? s : null;
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ idMedicao: string }> }) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.FISCALIZACAO_MEDICOES_EDIT);
    const { idMedicao: idStr } = await ctx.params;
    const idMedicao = Number(idStr || 0);
    if (!Number.isFinite(idMedicao) || idMedicao <= 0) return fail(422, 'idMedicao inválido');

    const body = await req.json().catch(() => null);
    const competencia = normalizeCompetencia(body?.competencia);
    const valorMedido = Number(body?.valorMedido || 0);
    const descricao = body?.descricao ? String(body.descricao).trim() : null;
    const dataHora = body?.dataHora ? String(body.dataHora).trim() : null;
    const servicos = Array.isArray(body?.servicos) ? body.servicos.map((s: any) => String(s ?? '').trim()).filter(Boolean) : null;

    if (!competencia) return fail(422, 'competencia inválida (use YYYY-MM)');
    if (!Number.isFinite(valorMedido) || valorMedido < 0) return fail(422, 'valorMedido inválido');
    if (dataHora && Number.isNaN(Date.parse(dataHora))) return fail(422, 'dataHora inválida');

    await ensureMedicoesDetailsTable();

    const [[row]]: any = await conn.query(
      `
      SELECT m.id_medicao, m.status_medicao AS status, d.id_obra AS idObra, d.origem
      FROM contratos_medicoes m
      LEFT JOIN contratos_medicoes_detalhes d ON d.tenant_id = m.tenant_id AND d.id_medicao = m.id_medicao
      WHERE m.tenant_id = ? AND m.id_medicao = ?
      LIMIT 1
      `,
      [current.tenantId, idMedicao]
    );
    if (!row) return fail(404, 'Medição não encontrada');
    if (!row.idObra) return fail(422, 'Medição sem vínculo de obra (detalhes ausentes).');
    if (!canAccessObra(current as any, Number(row.idObra))) return fail(403, 'Sem acesso à obra');

    if (String(row.origem || 'ENGENHEIRO') !== 'FISCAL') return fail(422, 'Fiscal não altera a medição original do engenheiro. Duplique e edite a cópia.');
    if (String(row.status) !== 'EM_ELABORACAO') return fail(422, 'Medição do fiscal fora de rascunho não pode ser editada');

    await conn.beginTransaction();
    await conn.query(
      `UPDATE contratos_medicoes SET competencia = ?, valor_medido = ? WHERE tenant_id = ? AND id_medicao = ?`,
      [competencia, valorMedido, current.tenantId, idMedicao]
    );
    await conn.query(
      `
      UPDATE contratos_medicoes_detalhes
      SET descricao = ?, data_hora = ?, servicos_json = ?
      WHERE tenant_id = ? AND id_medicao = ?
      `,
      [descricao, dataHora ? new Date(dataHora) : null, servicos ? JSON.stringify(servicos) : null, current.tenantId, idMedicao]
    );

    await audit({
      tenantId: current.tenantId,
      userId: current.id,
      entidade: 'contratos_medicoes',
      idRegistro: String(idMedicao),
      acao: 'UPDATE_RASCUNHO_FISCAL',
      dadosNovos: { competencia, valorMedido, descricao, dataHora, servicos },
    });

    await conn.commit();
    return ok({ idMedicao });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

