import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

async function ensureTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_contratos_locacao (
      id_contrato_locacao BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      tipo ENUM('ATIVO','PASSIVO','SERVICO') NOT NULL,
      id_contraparte BIGINT UNSIGNED NOT NULL,
      numero VARCHAR(80) NULL,
      descricao VARCHAR(255) NULL,
      codigo_servico VARCHAR(80) NULL,
      data_inicio DATE NULL,
      data_fim DATE NULL,
      valor_mensal DECIMAL(14,2) NULL,
      status ENUM('ATIVO','ENCERRADO') NOT NULL DEFAULT 'ATIVO',
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_contrato_locacao),
      KEY idx_tenant (tenant_id),
      KEY idx_contraparte (tenant_id, id_contraparte),
      KEY idx_tipo (tenant_id, tipo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

async function ensureContraparteTable() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_contrapartes (
      id_contraparte BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      tipo ENUM('PJ','PF') NOT NULL,
      nome_razao VARCHAR(255) NOT NULL,
      documento VARCHAR(32) NULL,
      email VARCHAR(120) NULL,
      telefone VARCHAR(40) NULL,
      status ENUM('ATIVO','INATIVO') NOT NULL DEFAULT 'ATIVO',
      observacao TEXT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_contraparte),
      KEY idx_tenant (tenant_id),
      KEY idx_tipo (tenant_id, tipo),
      KEY idx_doc (tenant_id, documento)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

async function assertServicoExists(tenantId: number, codigo: string) {
  const [[row]]: any = await db.query(`SELECT 1 AS ok FROM engenharia_servicos WHERE tenant_id = ? AND codigo = ? LIMIT 1`, [tenantId, codigo]);
  if (!row) throw new Error('Código de serviço inválido');
}

function normalizeTipo(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'ATIVO' || s === 'PASSIVO' || s === 'SERVICO' ? s : null;
}

function normalizeStatus(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'ATIVO' || s === 'ENCERRADO' ? s : null;
}

function normalizeDate(v: unknown) {
  const s = String(v ?? '').trim();
  return s ? (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null) : null;
}

function toNumberOrNull(v: unknown) {
  if (v == null || String(v).trim() === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const tipo = normalizeTipo(req.nextUrl.searchParams.get('tipo'));
    const status = normalizeStatus(req.nextUrl.searchParams.get('status'));
    const idContraparte = req.nextUrl.searchParams.get('idContraparte') ? Number(req.nextUrl.searchParams.get('idContraparte')) : null;

    await ensureTables();
    await ensureContraparteTable();

    const where: string[] = ['c.tenant_id = ?'];
    const params: any[] = [current.tenantId];
    if (tipo) {
      where.push('c.tipo = ?');
      params.push(tipo);
    }
    if (status) {
      where.push('c.status = ?');
      params.push(status);
    }
    if (idContraparte && Number.isFinite(idContraparte) && idContraparte > 0) {
      where.push('c.id_contraparte = ?');
      params.push(idContraparte);
    }

    const [rows]: any = await db.query(
      `
      SELECT
        c.id_contrato_locacao AS idContratoLocacao,
        c.tipo,
        c.status,
        c.numero,
        c.descricao,
        c.codigo_servico AS codigoServico,
        c.data_inicio AS dataInicio,
        c.data_fim AS dataFim,
        c.valor_mensal AS valorMensal,
        p.id_contraparte AS idContraparte,
        p.nome_razao AS contraparteNome,
        p.tipo AS contraparteTipo
      FROM engenharia_contratos_locacao c
      INNER JOIN engenharia_contrapartes p ON p.tenant_id = c.tenant_id AND p.id_contraparte = c.id_contraparte
      WHERE ${where.join(' AND ')}
      ORDER BY c.id_contrato_locacao DESC
      LIMIT 500
      `,
      params
    );

    return ok(
      (rows as any[]).map((r) => ({
        ...r,
        idContratoLocacao: Number(r.idContratoLocacao),
        idContraparte: Number(r.idContraparte),
        valorMensal: r.valorMensal == null ? null : Number(r.valorMensal),
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
    const body = await req.json().catch(() => null);

    const tipo = normalizeTipo(body?.tipo);
    const idContraparte = Number(body?.idContraparte || 0);
    const numero = body?.numero ? String(body.numero).trim() : null;
    const descricao = body?.descricao ? String(body.descricao).trim() : null;
    const codigoServico = body?.codigoServico ? String(body.codigoServico).trim() : null;
    const dataInicio = normalizeDate(body?.dataInicio);
    const dataFim = normalizeDate(body?.dataFim);
    const valorMensal = toNumberOrNull(body?.valorMensal);

    if (!tipo) return fail(422, 'tipo é obrigatório (ATIVO|PASSIVO|SERVICO)');
    if (!Number.isFinite(idContraparte) || idContraparte <= 0) return fail(422, 'idContraparte é obrigatório');
    if (tipo === 'SERVICO' && !codigoServico) return fail(422, 'codigoServico é obrigatório para tipo SERVICO');
    if (valorMensal != null && valorMensal < 0) return fail(422, 'valorMensal inválido');

    await ensureTables();
    await ensureContraparteTable();
    if (codigoServico) await assertServicoExists(current.tenantId, codigoServico);

    const [[cp]]: any = await conn.query(`SELECT id_contraparte FROM engenharia_contrapartes WHERE tenant_id = ? AND id_contraparte = ? LIMIT 1`, [
      current.tenantId,
      idContraparte,
    ]);
    if (!cp) return fail(404, 'Contraparte não encontrada');

    await conn.beginTransaction();
    const [ins]: any = await conn.query(
      `
      INSERT INTO engenharia_contratos_locacao
        (tenant_id, tipo, id_contraparte, numero, descricao, codigo_servico, data_inicio, data_fim, valor_mensal, status)
      VALUES
        (?,?,?,?,?,?,?,?,?,'ATIVO')
      `,
      [
        current.tenantId,
        tipo,
        idContraparte,
        numero ? numero.slice(0, 80) : null,
        descricao ? descricao.slice(0, 255) : null,
        codigoServico ? codigoServico.slice(0, 80) : null,
        dataInicio,
        dataFim,
        valorMensal,
      ]
    );
    await conn.commit();
    return ok({ idContratoLocacao: Number(ins.insertId) });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}
