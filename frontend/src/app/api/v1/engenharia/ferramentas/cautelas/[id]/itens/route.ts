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
    CREATE TABLE IF NOT EXISTS engenharia_ferramentas_cautelas (
      id_cautela BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      tipo_local ENUM('OBRA','UNIDADE') NOT NULL,
      id_local BIGINT UNSIGNED NOT NULL,
      data_referencia DATE NOT NULL,
      status ENUM('ABERTA','FECHADA') NOT NULL DEFAULT 'ABERTA',
      id_funcionario_responsavel BIGINT UNSIGNED NULL,
      observacao TEXT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_cautela),
      UNIQUE KEY uk_local_data (tenant_id, tipo_local, id_local, data_referencia),
      KEY idx_tenant (tenant_id),
      KEY idx_local (tenant_id, tipo_local, id_local)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_ferramentas_cautelas_itens (
      id_item BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_cautela BIGINT UNSIGNED NOT NULL,
      codigo_ferramenta VARCHAR(80) NOT NULL,
      acao ENUM('ENTREGA','DEVOLUCAO') NOT NULL,
      quantidade DECIMAL(14,4) NOT NULL DEFAULT 1,
      id_funcionario_destinatario BIGINT UNSIGNED NULL,
      codigo_servico VARCHAR(80) NULL,
      observacao TEXT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_item),
      KEY idx_cautela (tenant_id, id_cautela),
      KEY idx_codigo (tenant_id, codigo_ferramenta),
      KEY idx_data (tenant_id, criado_em)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

async function assertServicoExists(tenantId: number, codigo: string) {
  const [[row]]: any = await db.query(`SELECT 1 AS ok FROM engenharia_servicos WHERE tenant_id = ? AND codigo = ? LIMIT 1`, [tenantId, codigo]);
  if (!row) throw new Error('Código de serviço inválido');
}

function normalizeAcao(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'ENTREGA' || s === 'DEVOLUCAO' ? s : null;
}

function toNumber(v: unknown) {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const { id } = await params;
    const idCautela = Number(id || 0);
    if (!Number.isFinite(idCautela) || idCautela <= 0) return fail(422, 'idCautela inválido');

    await ensureTables();

    const [[head]]: any = await db.query(
      `SELECT tipo_local AS tipoLocal, id_local AS idLocal FROM engenharia_ferramentas_cautelas WHERE tenant_id = ? AND id_cautela = ? LIMIT 1`,
      [current.tenantId, idCautela]
    );
    if (!head) return fail(404, 'Cautela não encontrada');

    const scope = await getDashboardScope(current);
    if (!scope.empresaTotal && head.tipoLocal === 'OBRA' && !scope.obras.includes(Number(head.idLocal))) return fail(403, 'Obra fora da abrangência');
    if (!scope.empresaTotal && head.tipoLocal === 'UNIDADE' && !scope.unidades.includes(Number(head.idLocal))) return fail(403, 'Unidade fora da abrangência');

    const [rows]: any = await db.query(
      `
      SELECT
        i.id_item AS idItem,
        i.codigo_ferramenta AS codigoFerramenta,
        c.descricao,
        c.unidade_medida AS unidadeMedida,
        i.acao,
        i.quantidade,
        i.id_funcionario_destinatario AS idFuncionarioDestinatario,
        i.codigo_servico AS codigoServico,
        i.observacao,
        i.criado_em AS criadoEm
      FROM engenharia_ferramentas_cautelas_itens i
      INNER JOIN engenharia_ferramentas_catalogo c ON c.tenant_id = i.tenant_id AND c.codigo = i.codigo_ferramenta
      WHERE i.tenant_id = ? AND i.id_cautela = ?
      ORDER BY i.id_item DESC
      LIMIT 500
      `,
      [current.tenantId, idCautela]
    );

    return ok(
      (rows as any[]).map((r) => ({
        ...r,
        idItem: Number(r.idItem),
        quantidade: Number(r.quantidade || 0),
        idFuncionarioDestinatario: r.idFuncionarioDestinatario == null ? null : Number(r.idFuncionarioDestinatario),
      }))
    );
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const { id } = await params;
    const idCautela = Number(id || 0);
    if (!Number.isFinite(idCautela) || idCautela <= 0) return fail(422, 'idCautela inválido');

    await ensureTables();

    const [[head]]: any = await conn.query(
      `SELECT tipo_local AS tipoLocal, id_local AS idLocal, status FROM engenharia_ferramentas_cautelas WHERE tenant_id = ? AND id_cautela = ? LIMIT 1`,
      [current.tenantId, idCautela]
    );
    if (!head) return fail(404, 'Cautela não encontrada');
    if (String(head.status) !== 'ABERTA') return fail(422, 'Cautela fechada');

    const scope = await getDashboardScope(current);
    const tipoLocal = String(head.tipoLocal);
    const idLocal = Number(head.idLocal);
    if (!scope.empresaTotal && tipoLocal === 'OBRA' && !scope.obras.includes(idLocal)) return fail(403, 'Obra fora da abrangência');
    if (!scope.empresaTotal && tipoLocal === 'UNIDADE' && !scope.unidades.includes(idLocal)) return fail(403, 'Unidade fora da abrangência');

    const body = await req.json().catch(() => null);
    const codigoFerramenta = String(body?.codigoFerramenta || '').trim();
    const acao = normalizeAcao(body?.acao);
    const quantidade = toNumber(body?.quantidade ?? 1);
    const idFuncionarioDestinatario = body?.idFuncionarioDestinatario ? Number(body.idFuncionarioDestinatario) : null;
    const codigoServico = body?.codigoServico ? String(body.codigoServico).trim() : null;
    const observacao = body?.observacao ? String(body.observacao).trim() : null;

    if (!codigoFerramenta) return fail(422, 'codigoFerramenta é obrigatório');
    if (!acao) return fail(422, 'acao é obrigatória (ENTREGA|DEVOLUCAO)');
    if (!Number.isFinite(quantidade) || quantidade <= 0) return fail(422, 'quantidade inválida');
    if (acao === 'ENTREGA') {
      if (!codigoServico) return fail(422, 'codigoServico é obrigatório para entrega (apropriação)');
      await assertServicoExists(current.tenantId, codigoServico);
    } else if (codigoServico) {
      await assertServicoExists(current.tenantId, codigoServico);
    }

    const [[cat]]: any = await conn.query(
      `SELECT codigo FROM engenharia_ferramentas_catalogo WHERE tenant_id = ? AND codigo = ? LIMIT 1`,
      [current.tenantId, codigoFerramenta]
    );
    if (!cat) return fail(404, 'Ferramenta não encontrada no catálogo');

    await conn.beginTransaction();

    const [[est]]: any = await conn.query(
      `
      SELECT quantidade_total AS qt, quantidade_disponivel AS qd
      FROM engenharia_ferramentas_estoque
      WHERE tenant_id = ? AND tipo_local = ? AND id_local = ? AND codigo_ferramenta = ?
      LIMIT 1
      FOR UPDATE
      `,
      [current.tenantId, tipoLocal, idLocal, codigoFerramenta]
    );
    if (!est) return fail(404, 'Ferramenta sem estoque registrado no local');

    const qt = Number(est.qt || 0);
    const qd = Number(est.qd || 0);

    const nextQd = acao === 'ENTREGA' ? qd - quantidade : qd + quantidade;
    if (nextQd < 0) return fail(422, 'Estoque insuficiente (disponível)');
    if (nextQd > qt) return fail(422, 'Devolução excede o total em estoque');

    await conn.query(
      `
      UPDATE engenharia_ferramentas_estoque
      SET quantidade_disponivel = ?, id_usuario_atualizador = ?
      WHERE tenant_id = ? AND tipo_local = ? AND id_local = ? AND codigo_ferramenta = ?
      `,
      [nextQd, current.id, current.tenantId, tipoLocal, idLocal, codigoFerramenta]
    );

    const [ins]: any = await conn.query(
      `
      INSERT INTO engenharia_ferramentas_cautelas_itens
        (tenant_id, id_cautela, codigo_ferramenta, acao, quantidade, id_funcionario_destinatario, codigo_servico, observacao)
      VALUES
        (?,?,?,?,?,?,?,?)
      `,
      [current.tenantId, idCautela, codigoFerramenta, acao, quantidade, idFuncionarioDestinatario, codigoServico, observacao]
    );

    await conn.commit();
    return ok({ idItem: Number(ins.insertId) });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}
