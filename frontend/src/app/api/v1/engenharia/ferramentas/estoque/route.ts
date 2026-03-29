import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { getDashboardScope } from '@/lib/dashboard/scope';

export const runtime = 'nodejs';

async function ensureTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_ferramentas_catalogo (
      id_item BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      codigo VARCHAR(80) NOT NULL,
      descricao VARCHAR(255) NOT NULL,
      unidade_medida VARCHAR(32) NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_item),
      UNIQUE KEY uk_codigo (tenant_id, codigo),
      KEY idx_tenant (tenant_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_ferramentas_estoque (
      id_estoque BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      tipo_local ENUM('OBRA','UNIDADE') NOT NULL,
      id_local BIGINT UNSIGNED NOT NULL,
      codigo_ferramenta VARCHAR(80) NOT NULL,
      quantidade_total DECIMAL(14,4) NOT NULL DEFAULT 0,
      quantidade_disponivel DECIMAL(14,4) NOT NULL DEFAULT 0,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      id_usuario_atualizador BIGINT UNSIGNED NULL,
      PRIMARY KEY (id_estoque),
      UNIQUE KEY uk_local_codigo (tenant_id, tipo_local, id_local, codigo_ferramenta),
      KEY idx_local (tenant_id, tipo_local, id_local)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_ferramentas_movimentacoes (
      id_mov BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      tipo ENUM('ENTRADA','SAIDA','TRANSFERENCIA') NOT NULL,
      tipo_local_origem ENUM('OBRA','UNIDADE') NULL,
      id_local_origem BIGINT UNSIGNED NULL,
      tipo_local_destino ENUM('OBRA','UNIDADE') NULL,
      id_local_destino BIGINT UNSIGNED NULL,
      codigo_ferramenta VARCHAR(80) NOT NULL,
      quantidade DECIMAL(14,4) NOT NULL,
      codigo_servico VARCHAR(80) NULL,
      data_referencia DATE NOT NULL,
      id_funcionario_responsavel BIGINT UNSIGNED NULL,
      observacao TEXT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_mov),
      KEY idx_codigo (tenant_id, codigo_ferramenta),
      KEY idx_data (tenant_id, data_referencia)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

async function assertServicoExists(tenantId: number, codigo: string) {
  const [[row]]: any = await db.query(`SELECT 1 AS ok FROM engenharia_servicos WHERE tenant_id = ? AND codigo = ? LIMIT 1`, [tenantId, codigo]);
  if (!row) throw new Error('Código de serviço inválido');
}

async function assertFerramentaExists(tenantId: number, codigo: string) {
  const [[row]]: any = await db.query(`SELECT 1 AS ok FROM engenharia_ferramentas_catalogo WHERE tenant_id = ? AND codigo = ? LIMIT 1`, [tenantId, codigo]);
  if (!row) throw new Error('Código de ferramenta inválido');
}

function normalizeTipoLocal(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'OBRA' || s === 'UNIDADE' ? s : null;
}

function normalizeTipo(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'ENTRADA' || s === 'SAIDA' || s === 'TRANSFERENCIA' ? s : null;
}

function normalizeDate(v: unknown) {
  const s = String(v ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function toNumber(v: unknown) {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const scope = await getDashboardScope(current);
    const tipoLocal = normalizeTipoLocal(req.nextUrl.searchParams.get('tipoLocal'));
    const idLocal = Number(req.nextUrl.searchParams.get('idLocal') || 0);

    if (!tipoLocal) return fail(422, 'tipoLocal é obrigatório (OBRA|UNIDADE)');
    if (!Number.isFinite(idLocal) || idLocal <= 0) return fail(422, 'idLocal é obrigatório');
    if (!scope.empresaTotal && tipoLocal === 'OBRA' && !scope.obras.includes(idLocal)) return fail(403, 'Obra fora da abrangência');
    if (!scope.empresaTotal && tipoLocal === 'UNIDADE' && !scope.unidades.includes(idLocal)) return fail(403, 'Unidade fora da abrangência');

    await ensureTables();

    const [rows]: any = await db.query(
      `
      SELECT
        e.codigo_ferramenta AS codigoFerramenta,
        c.descricao,
        c.unidade_medida AS unidadeMedida,
        e.quantidade_total AS quantidadeTotal,
        e.quantidade_disponivel AS quantidadeDisponivel
      FROM engenharia_ferramentas_estoque e
      INNER JOIN engenharia_ferramentas_catalogo c ON c.tenant_id = e.tenant_id AND c.codigo = e.codigo_ferramenta
      WHERE e.tenant_id = ? AND e.tipo_local = ? AND e.id_local = ?
      ORDER BY c.descricao
      `,
      [current.tenantId, tipoLocal, idLocal]
    );
    return ok(
      (rows as any[]).map((r) => ({
        ...r,
        quantidadeTotal: Number(r.quantidadeTotal || 0),
        quantidadeDisponivel: Number(r.quantidadeDisponivel || 0),
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
    const scope = await getDashboardScope(current);
    const body = await req.json().catch(() => null);

    const tipo = normalizeTipo(body?.tipo);
    const codigoFerramenta = String(body?.codigoFerramenta || '').trim();
    const quantidade = toNumber(body?.quantidade);
    const dataReferencia = normalizeDate(body?.dataReferencia) || new Date().toISOString().slice(0, 10);
    const codigoServico = body?.codigoServico ? String(body.codigoServico).trim() : null;
    const observacao = body?.observacao ? String(body.observacao).trim() : null;

    const origemTipo = normalizeTipoLocal(body?.origemTipo);
    const origemId = body?.origemId ? Number(body.origemId) : null;
    const destinoTipo = normalizeTipoLocal(body?.destinoTipo);
    const destinoId = body?.destinoId ? Number(body.destinoId) : null;

    if (!tipo) return fail(422, 'tipo é obrigatório (ENTRADA|SAIDA|TRANSFERENCIA)');
    if (!codigoFerramenta) return fail(422, 'codigoFerramenta é obrigatório');
    if (!Number.isFinite(quantidade) || quantidade <= 0) return fail(422, 'quantidade inválida');
    if (!dataReferencia) return fail(422, 'dataReferencia inválida');
    if (codigoServico) await assertServicoExists(current.tenantId, codigoServico);

    if (tipo === 'ENTRADA') {
      if (!destinoTipo || !destinoId) return fail(422, 'destinoTipo/destinoId são obrigatórios');
      if (!scope.empresaTotal && destinoTipo === 'OBRA' && !scope.obras.includes(destinoId)) return fail(403, 'Obra fora da abrangência');
      if (!scope.empresaTotal && destinoTipo === 'UNIDADE' && !scope.unidades.includes(destinoId)) return fail(403, 'Unidade fora da abrangência');
    } else if (tipo === 'SAIDA') {
      if (!origemTipo || !origemId) return fail(422, 'origemTipo/origemId são obrigatórios');
      if (!scope.empresaTotal && origemTipo === 'OBRA' && !scope.obras.includes(origemId)) return fail(403, 'Obra fora da abrangência');
      if (!scope.empresaTotal && origemTipo === 'UNIDADE' && !scope.unidades.includes(origemId)) return fail(403, 'Unidade fora da abrangência');
      if (!codigoServico) return fail(422, 'codigoServico é obrigatório para saída (apropriação)');
    } else {
      if (!origemTipo || !origemId || !destinoTipo || !destinoId) return fail(422, 'origem e destino são obrigatórios');
      if (!scope.empresaTotal && origemTipo === 'OBRA' && !scope.obras.includes(origemId)) return fail(403, 'Obra fora da abrangência');
      if (!scope.empresaTotal && origemTipo === 'UNIDADE' && !scope.unidades.includes(origemId)) return fail(403, 'Unidade fora da abrangência');
      if (!scope.empresaTotal && destinoTipo === 'OBRA' && !scope.obras.includes(destinoId)) return fail(403, 'Obra fora da abrangência');
      if (!scope.empresaTotal && destinoTipo === 'UNIDADE' && !scope.unidades.includes(destinoId)) return fail(403, 'Unidade fora da abrangência');
    }

    await ensureTables();
    await assertFerramentaExists(current.tenantId, codigoFerramenta);

    await conn.beginTransaction();

    async function upsertLocal(tipoLocal: string, idLocal: number, deltaTotal: number, deltaDisp: number) {
      const [[cur]]: any = await conn.query(
        `SELECT quantidade_total AS qt, quantidade_disponivel AS qd FROM engenharia_ferramentas_estoque WHERE tenant_id = ? AND tipo_local = ? AND id_local = ? AND codigo_ferramenta = ? LIMIT 1`,
        [current.tenantId, tipoLocal, idLocal, codigoFerramenta]
      );
      const qt = Number(cur?.qt || 0) + deltaTotal;
      const qd = Number(cur?.qd || 0) + deltaDisp;
      if (qd < 0) throw new Error('Estoque insuficiente (disponível)');
      if (qt < 0) throw new Error('Estoque inválido');

      await conn.query(
        `
        INSERT INTO engenharia_ferramentas_estoque
          (tenant_id, tipo_local, id_local, codigo_ferramenta, quantidade_total, quantidade_disponivel, id_usuario_atualizador)
        VALUES
          (?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE
          quantidade_total = VALUES(quantidade_total),
          quantidade_disponivel = VALUES(quantidade_disponivel),
          id_usuario_atualizador = VALUES(id_usuario_atualizador)
        `,
        [current.tenantId, tipoLocal, idLocal, codigoFerramenta, qt, qd, current.id]
      );
    }

    if (tipo === 'ENTRADA') {
      await upsertLocal(destinoTipo!, destinoId!, quantidade, quantidade);
    } else if (tipo === 'SAIDA') {
      await upsertLocal(origemTipo!, origemId!, 0, -quantidade);
    } else {
      await upsertLocal(origemTipo!, origemId!, 0, -quantidade);
      await upsertLocal(destinoTipo!, destinoId!, 0, quantidade);
    }

    await conn.query(
      `
      INSERT INTO engenharia_ferramentas_movimentacoes
        (tenant_id, tipo, tipo_local_origem, id_local_origem, tipo_local_destino, id_local_destino, codigo_ferramenta, quantidade, codigo_servico, data_referencia, id_funcionario_responsavel, observacao)
      VALUES
        (?,?,?,?,?,?,?,?,?,?,?,?)
      `,
      [current.tenantId, tipo, origemTipo, origemId, destinoTipo, destinoId, codigoFerramenta, quantidade, codigoServico, dataReferencia, current.idFuncionario ?? null, observacao]
    );

    await conn.commit();
    return ok({ ok: true });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

