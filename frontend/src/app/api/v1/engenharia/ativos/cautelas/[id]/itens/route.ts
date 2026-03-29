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
    CREATE TABLE IF NOT EXISTS engenharia_cautelas (
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
    CREATE TABLE IF NOT EXISTS engenharia_cautelas_itens (
      id_item BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_cautela BIGINT UNSIGNED NOT NULL,
      id_ativo BIGINT UNSIGNED NOT NULL,
      acao ENUM('ENTREGA','DEVOLUCAO') NOT NULL,
      quantidade DECIMAL(14,4) NOT NULL DEFAULT 1,
      id_funcionario_destinatario BIGINT UNSIGNED NULL,
      codigo_servico VARCHAR(80) NULL,
      observacao TEXT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_item),
      UNIQUE KEY uk_cautela_ativo_acao (tenant_id, id_cautela, id_ativo, acao),
      KEY idx_cautela (tenant_id, id_cautela),
      KEY idx_ativo (tenant_id, id_ativo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_ativos (
      id_ativo BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      categoria ENUM('EQUIPAMENTO','FERRAMENTA','VEICULO') NOT NULL DEFAULT 'EQUIPAMENTO',
      descricao VARCHAR(255) NOT NULL,
      codigo_interno VARCHAR(80) NULL,
      patrimonio VARCHAR(80) NULL,
      proprietario ENUM('PROPRIO','TERCEIRO') NOT NULL DEFAULT 'PROPRIO',
      status ENUM('ATIVO','MANUTENCAO','DESCARTADO','INATIVO') NOT NULL DEFAULT 'ATIVO',
      local_tipo ENUM('OBRA','UNIDADE','ALMOXARIFADO','TERCEIRO') NULL,
      local_id BIGINT UNSIGNED NULL,
      id_contraparte BIGINT UNSIGNED NULL,
      id_contrato_locacao BIGINT UNSIGNED NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_ativo),
      KEY idx_tenant (tenant_id),
      KEY idx_local (tenant_id, local_tipo, local_id),
      KEY idx_status (tenant_id, status)
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

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const { id } = await params;
    const idCautela = Number(id || 0);
    if (!Number.isFinite(idCautela) || idCautela <= 0) return fail(422, 'idCautela inválido');

    await ensureTables();

    const [[head]]: any = await db.query(
      `SELECT tipo_local AS tipoLocal, id_local AS idLocal FROM engenharia_cautelas WHERE tenant_id = ? AND id_cautela = ? LIMIT 1`,
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
        i.id_ativo AS idAtivo,
        a.descricao AS ativoDescricao,
        a.categoria AS ativoCategoria,
        i.acao,
        i.quantidade,
        i.id_funcionario_destinatario AS idFuncionarioDestinatario,
        i.codigo_servico AS codigoServico,
        i.observacao
      FROM engenharia_cautelas_itens i
      INNER JOIN engenharia_ativos a ON a.tenant_id = i.tenant_id AND a.id_ativo = i.id_ativo
      WHERE i.tenant_id = ? AND i.id_cautela = ?
      ORDER BY i.id_item DESC
      LIMIT 500
      `,
      [current.tenantId, idCautela]
    );

    return ok((rows as any[]).map((r) => ({ ...r, idItem: Number(r.idItem), idAtivo: Number(r.idAtivo) })));
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const { id } = await params;
    const idCautela = Number(id || 0);
    if (!Number.isFinite(idCautela) || idCautela <= 0) return fail(422, 'idCautela inválido');

    await ensureTables();

    const [[head]]: any = await db.query(
      `SELECT tipo_local AS tipoLocal, id_local AS idLocal, status FROM engenharia_cautelas WHERE tenant_id = ? AND id_cautela = ? LIMIT 1`,
      [current.tenantId, idCautela]
    );
    if (!head) return fail(404, 'Cautela não encontrada');
    if (String(head.status) !== 'ABERTA') return fail(422, 'Cautela fechada');

    const scope = await getDashboardScope(current);
    if (!scope.empresaTotal && head.tipoLocal === 'OBRA' && !scope.obras.includes(Number(head.idLocal))) return fail(403, 'Obra fora da abrangência');
    if (!scope.empresaTotal && head.tipoLocal === 'UNIDADE' && !scope.unidades.includes(Number(head.idLocal))) return fail(403, 'Unidade fora da abrangência');

    const body = await req.json().catch(() => null);
    const idAtivo = Number(body?.idAtivo || 0);
    const acao = normalizeAcao(body?.acao);
    const quantidade = Number(String(body?.quantidade ?? '1').trim().replace(',', '.'));
    const idFuncionarioDestinatario = body?.idFuncionarioDestinatario ? Number(body.idFuncionarioDestinatario) : null;
    const codigoServico = body?.codigoServico ? String(body.codigoServico).trim() : null;
    const observacao = body?.observacao ? String(body.observacao).trim() : null;

    if (!Number.isFinite(idAtivo) || idAtivo <= 0) return fail(422, 'idAtivo é obrigatório');
    if (!acao) return fail(422, 'acao é obrigatória');
    if (!Number.isFinite(quantidade) || quantidade <= 0) return fail(422, 'quantidade inválida');
    if (codigoServico) await assertServicoExists(current.tenantId, codigoServico);

    const [[ativo]]: any = await db.query(`SELECT id_ativo FROM engenharia_ativos WHERE tenant_id = ? AND id_ativo = ? LIMIT 1`, [
      current.tenantId,
      idAtivo,
    ]);
    if (!ativo) return fail(404, 'Ativo não encontrado');

    const [res]: any = await db.query(
      `
      INSERT INTO engenharia_cautelas_itens
        (tenant_id, id_cautela, id_ativo, acao, quantidade, id_funcionario_destinatario, codigo_servico, observacao)
      VALUES
        (?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE
        quantidade = VALUES(quantidade),
        id_funcionario_destinatario = VALUES(id_funcionario_destinatario),
        codigo_servico = VALUES(codigo_servico),
        observacao = VALUES(observacao)
      `,
      [current.tenantId, idCautela, idAtivo, acao, quantidade, idFuncionarioDestinatario, codigoServico, observacao]
    );

    return ok({ id: Number(res.insertId || 0) });
  } catch (e) {
    return handleApiError(e);
  }
}

