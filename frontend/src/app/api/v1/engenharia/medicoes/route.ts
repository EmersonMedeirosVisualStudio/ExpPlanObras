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

function normalizeCompetencia(v: unknown) {
  const s = String(v ?? '').trim();
  return /^\d{4}-\d{2}$/.test(s) ? s : null;
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const idObra = Number(req.nextUrl.searchParams.get('idObra') || 0);
    const status = String(req.nextUrl.searchParams.get('status') || '').trim().toUpperCase();
    const limite = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get('limite') || 50)));
    if (!Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra é obrigatório');
    if (!canAccessObra(current as any, idObra)) return fail(403, 'Sem acesso à obra');

    await ensureMedicoesDetailsTable();
    const hasIdObra = await contratosMedicoesHasIdObra();

    const where: string[] = ['m.tenant_id = ?', 'o.id_obra = ?'];
    const params: any[] = [current.tenantId, idObra];
    if (status) {
      where.push('m.status_medicao = ?');
      params.push(status);
    }

    const sqlIdObraMed = hasIdObra ? 'AND m.id_obra = o.id_obra' : '';

    const [rows]: any = await db.query(
      `
      SELECT
        m.id_medicao AS idMedicao,
        m.status_medicao AS status,
        COALESCE(NULLIF(m.competencia,''), DATE_FORMAT(m.created_at, '%Y-%m')) AS competencia,
        COALESCE(m.valor_medido, 0) AS valorMedido,
        m.created_at AS criadoEm,
        c.id_contrato AS idContrato,
        c.numero_contrato AS numeroContrato,
        d.origem,
        d.id_medicao_origem AS idMedicaoOrigem,
        d.descricao,
        d.data_hora AS dataHora,
        d.servicos_json AS servicosJson
      FROM obras o
      INNER JOIN contratos c ON c.id_contrato = o.id_contrato
      INNER JOIN contratos_medicoes m ON m.id_contrato = c.id_contrato AND m.tenant_id = c.tenant_id ${sqlIdObraMed}
      LEFT JOIN contratos_medicoes_detalhes d ON d.tenant_id = m.tenant_id AND d.id_medicao = m.id_medicao
      WHERE ${where.join(' AND ')}
      ORDER BY m.id_medicao DESC
      LIMIT ?
      `,
      [...params, limite]
    );

    const out = (rows as any[]).map((r) => ({
      ...r,
      idMedicao: Number(r.idMedicao),
      idContrato: Number(r.idContrato),
      idMedicaoOrigem: r.idMedicaoOrigem ? Number(r.idMedicaoOrigem) : null,
      valorMedido: Number(r.valorMedido || 0),
      servicos: r.servicosJson ? (typeof r.servicosJson === 'string' ? JSON.parse(r.servicosJson) : r.servicosJson) : null,
    }));
    return ok(out);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const body = await req.json().catch(() => null);
    const idObra = Number(body?.idObra || 0);
    const competencia = normalizeCompetencia(body?.competencia);
    const valorMedido = Number(body?.valorMedido || 0);
    const descricao = body?.descricao ? String(body.descricao).trim() : null;
    const dataHora = body?.dataHora ? String(body.dataHora).trim() : null;
    const servicos = Array.isArray(body?.servicos) ? body.servicos.map((s: any) => String(s ?? '').trim()).filter(Boolean) : null;

    if (!Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra é obrigatório');
    if (!canAccessObra(current as any, idObra)) return fail(403, 'Sem acesso à obra');
    if (!competencia) return fail(422, 'competencia inválida (use YYYY-MM)');
    if (!Number.isFinite(valorMedido) || valorMedido < 0) return fail(422, 'valorMedido inválido');
    if (dataHora && Number.isNaN(Date.parse(dataHora))) return fail(422, 'dataHora inválida');

    await ensureMedicoesDetailsTable();
    const hasIdObra = await contratosMedicoesHasIdObra();

    const [[obra]]: any = await conn.query(
      `
      SELECT o.id_obra, o.id_contrato, c.numero_contrato
      FROM obras o
      INNER JOIN contratos c ON c.id_contrato = o.id_contrato
      WHERE c.tenant_id = ? AND o.id_obra = ?
      LIMIT 1
      `,
      [current.tenantId, idObra]
    );
    if (!obra) return fail(404, 'Obra não encontrada');
    if (!String(obra.numero_contrato || '').trim()) return fail(422, 'Contrato principal sem número. Cadastre o número do contrato.');

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
      ? [current.tenantId, obra.id_contrato, idObra, competencia, valorMedido]
      : [current.tenantId, obra.id_contrato, competencia, valorMedido];

    const [ins]: any = await conn.query(insertSql, insertParams);
    const idMedicao = Number(ins.insertId);

    await conn.query(
      `
      INSERT INTO contratos_medicoes_detalhes
        (tenant_id, id_medicao, id_obra, origem, id_medicao_origem, descricao, data_hora, servicos_json, id_usuario_criador)
      VALUES
        (?,?,?,?,?,?,?,?,?)
      `,
      [
        current.tenantId,
        idMedicao,
        idObra,
        'ENGENHEIRO',
        null,
        descricao,
        dataHora ? new Date(dataHora) : null,
        servicos ? JSON.stringify(servicos) : null,
        current.id,
      ]
    );

    await audit({
      tenantId: current.tenantId,
      userId: current.id,
      entidade: 'contratos_medicoes',
      idRegistro: String(idMedicao),
      acao: 'CREATE_RASCUNHO_ENGENHEIRO',
      dadosNovos: { idObra, idContrato: Number(obra.id_contrato), competencia, valorMedido, descricao, dataHora, servicos },
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

