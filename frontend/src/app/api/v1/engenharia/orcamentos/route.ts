import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

async function ensureTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_orcamentos (
      id_orcamento BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      nome VARCHAR(180) NOT NULL,
      tipo ENUM('LICITACAO','CONTRATO_PRIVADO') NOT NULL DEFAULT 'CONTRATO_PRIVADO',
      data_base_label VARCHAR(120) NULL,
      referencia_base VARCHAR(120) NULL,
      ativo TINYINT(1) NOT NULL DEFAULT 1,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      id_usuario_criador BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY (id_orcamento),
      KEY idx_tenant (tenant_id),
      KEY idx_tipo (tenant_id, tipo),
      KEY idx_ativo (tenant_id, ativo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_orcamentos_versoes (
      id_versao BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_orcamento BIGINT UNSIGNED NOT NULL,
      numero_versao INT NOT NULL,
      titulo_versao VARCHAR(180) NULL,
      status ENUM('RASCUNHO','CONGELADO') NOT NULL DEFAULT 'RASCUNHO',
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      id_usuario_criador BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY (id_versao),
      UNIQUE KEY uk_orcamento_versao (tenant_id, id_orcamento, numero_versao),
      KEY idx_tenant (tenant_id),
      KEY idx_orcamento (tenant_id, id_orcamento)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_orcamentos_parametros (
      id_param BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_orcamento BIGINT UNSIGNED NOT NULL,
      parametros_json JSON NULL,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      id_usuario_atualizador BIGINT UNSIGNED NULL,
      PRIMARY KEY (id_param),
      UNIQUE KEY uk_orcamento (tenant_id, id_orcamento),
      KEY idx_tenant (tenant_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

function normTipo(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'LICITACAO' ? 'LICITACAO' : s === 'CONTRATO_PRIVADO' ? 'CONTRATO_PRIVADO' : null;
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    await ensureTables();

    const q = (req.nextUrl.searchParams.get('q') || '').trim().toLowerCase();
    const where: string[] = ['tenant_id = ?', 'ativo = 1'];
    const params: any[] = [current.tenantId];
    if (q) {
      where.push('LOWER(nome) LIKE ?');
      params.push(`%${q}%`);
    }

    const [rows]: any = await db.query(
      `
      SELECT
        o.id_orcamento AS idOrcamento,
        o.nome,
        o.tipo,
        o.data_base_label AS dataBaseLabel,
        o.referencia_base AS referenciaBase,
        o.atualizado_em AS atualizadoEm,
        (SELECT MAX(v.numero_versao) FROM engenharia_orcamentos_versoes v WHERE v.tenant_id = o.tenant_id AND v.id_orcamento = o.id_orcamento) AS versaoAtual
      FROM engenharia_orcamentos o
      WHERE ${where.join(' AND ')}
      ORDER BY o.id_orcamento DESC
      LIMIT 500
      `,
      params
    );

    return ok(
      (rows as any[]).map((r) => ({
        idOrcamento: Number(r.idOrcamento),
        nome: String(r.nome),
        tipo: String(r.tipo),
        dataBaseLabel: r.dataBaseLabel ? String(r.dataBaseLabel) : null,
        referenciaBase: r.referenciaBase ? String(r.referenciaBase) : null,
        versaoAtual: r.versaoAtual == null ? null : Number(r.versaoAtual),
        atualizadoEm: r.atualizadoEm ? new Date(r.atualizadoEm).toISOString() : null,
      }))
    );
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    await ensureTables();

    const body = await req.json().catch(() => null);
    const nome = String(body?.nome || '').trim();
    const tipo = normTipo(body?.tipo) || 'CONTRATO_PRIVADO';
    const dataBaseLabel = body?.dataBaseLabel ? String(body.dataBaseLabel).trim() : null;
    const referenciaBase = body?.referenciaBase ? String(body.referenciaBase).trim() : null;

    if (!nome) return fail(422, 'nome é obrigatório');

    await conn.beginTransaction();

    const [ins]: any = await conn.query(
      `
      INSERT INTO engenharia_orcamentos (tenant_id, nome, tipo, data_base_label, referencia_base, id_usuario_criador)
      VALUES (?,?,?,?,?,?)
      `,
      [current.tenantId, nome.slice(0, 180), tipo, dataBaseLabel, referenciaBase, current.id]
    );
    const idOrcamento = Number(ins.insertId);

    await conn.query(
      `
      INSERT INTO engenharia_orcamentos_versoes (tenant_id, id_orcamento, numero_versao, titulo_versao, id_usuario_criador)
      VALUES (?,?,?,?,?)
      `,
      [current.tenantId, idOrcamento, 1, 'Versão 1', current.id]
    );

    const defaultParams = {
      bdi: { administracao: 0, riscos: 0, margem: 0, lucro: 0 },
      impostos: { materiais: {}, servicos: {}, equipamentos: {} },
      faixaPrecos: {},
    };
    await conn.query(
      `
      INSERT INTO engenharia_orcamentos_parametros (tenant_id, id_orcamento, parametros_json, id_usuario_atualizador)
      VALUES (?,?,?,?)
      `,
      [current.tenantId, idOrcamento, JSON.stringify(defaultParams), current.id]
    );

    await conn.commit();
    return ok({ idOrcamento });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

