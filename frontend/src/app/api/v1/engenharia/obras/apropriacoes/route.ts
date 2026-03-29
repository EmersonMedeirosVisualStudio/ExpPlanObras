import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { canAccessObra } from '@/lib/auth/access';
import { ensureEngenhariaImportTables } from '@/lib/modules/engenharia-importacao/server';

export const runtime = 'nodejs';

async function ensureTables() {
  await ensureEngenhariaImportTables();
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_apropriacoes (
      id_apropriacao BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      data_referencia DATE NOT NULL,
      id_obra BIGINT UNSIGNED NOT NULL,
      codigo_servico VARCHAR(80) NOT NULL,
      codigo_centro_custo VARCHAR(40) NULL,
      tipo_recurso ENUM('FUNCIONARIO','EQUIPAMENTO') NOT NULL DEFAULT 'FUNCIONARIO',
      id_recurso BIGINT UNSIGNED NOT NULL,
      quantidade DECIMAL(14,4) NOT NULL DEFAULT 0,
      horas DECIMAL(10,2) NOT NULL DEFAULT 0,
      observacao TEXT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      id_usuario_criador BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY (id_apropriacao),
      KEY idx_tenant (tenant_id),
      KEY idx_obra_data (tenant_id, id_obra, data_referencia),
      KEY idx_servico (tenant_id, codigo_servico),
      KEY idx_cc (tenant_id, codigo_centro_custo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS tenant_configuracoes (
      id_config BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      chave VARCHAR(120) NOT NULL,
      valor_json JSON NULL,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      id_usuario_atualizador BIGINT UNSIGNED NULL,
      PRIMARY KEY (id_config),
      UNIQUE KEY uk_tenant_chave (tenant_id, chave),
      KEY idx_tenant (tenant_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS obras_planilhas_itens (
      id_item BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_obra BIGINT UNSIGNED NOT NULL,
      codigo_servico VARCHAR(80) NOT NULL,
      descricao_servico VARCHAR(220) NULL,
      unidade_medida VARCHAR(32) NULL,
      quantidade_contratada DECIMAL(14,4) NULL,
      preco_unitario DECIMAL(14,6) NULL,
      valor_total DECIMAL(14,6) NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      id_usuario_criador BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY (id_item),
      UNIQUE KEY uk_item (tenant_id, id_obra, codigo_servico),
      KEY idx_tenant (tenant_id),
      KEY idx_obra (tenant_id, id_obra)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS obras_servicos_centros_custo (
      id_vinculo BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_obra BIGINT UNSIGNED NOT NULL,
      codigo_servico VARCHAR(80) NOT NULL,
      codigo_centro_custo VARCHAR(40) NOT NULL,
      origem ENUM('SUGERIDO','MANUAL') NOT NULL DEFAULT 'SUGERIDO',
      justificativa TEXT NULL,
      id_usuario_criador BIGINT UNSIGNED NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_vinculo),
      UNIQUE KEY uk_servico_cc (tenant_id, id_obra, codigo_servico, codigo_centro_custo),
      KEY idx_tenant (tenant_id),
      KEY idx_obra (tenant_id, id_obra),
      KEY idx_servico (tenant_id, id_obra, codigo_servico)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS obras_composicoes_itens_overrides (
      id_override BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_obra BIGINT UNSIGNED NOT NULL,
      id_item_base BIGINT UNSIGNED NOT NULL,
      codigo_centro_custo VARCHAR(40) NULL,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      id_usuario_atualizador BIGINT UNSIGNED NULL,
      PRIMARY KEY (id_override),
      UNIQUE KEY uk_override (tenant_id, id_obra, id_item_base),
      KEY idx_tenant (tenant_id),
      KEY idx_obra (tenant_id, id_obra)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

const KEY = 'engenharia.apropriacao.cc_policy';

async function loadCcPolicy(tenantId: number) {
  const [[row]]: any = await db.query(`SELECT valor_json AS valorJson FROM tenant_configuracoes WHERE tenant_id = ? AND chave = ? LIMIT 1`, [tenantId, KEY]);
  const cfg = row?.valorJson ? (typeof row.valorJson === 'string' ? JSON.parse(row.valorJson) : row.valorJson) : {};
  return {
    permitirSemCentroCusto: cfg?.permitirSemCentroCusto !== false,
    exibirAlerta: cfg?.exibirAlerta !== false,
    bloquearSalvamento: cfg?.bloquearSalvamento === true,
  };
}

function normalizeDate(v: unknown) {
  const s = String(v ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function toNumber(v: unknown) {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

function normalizeCodigoServico(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s ? s : null;
}

function normalizeCodigoCentroCusto(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s ? s : null;
}

function normalizeTipoRecurso(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'EQUIPAMENTO' ? 'EQUIPAMENTO' : 'FUNCIONARIO';
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    await ensureTables();

    const idObra = Number(req.nextUrl.searchParams.get('idObra') || 0);
    const dataInicio = normalizeDate(req.nextUrl.searchParams.get('dataInicio'));
    const dataFim = normalizeDate(req.nextUrl.searchParams.get('dataFim'));
    if (!Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra é obrigatório');
    if (!canAccessObra(current as any, idObra)) return fail(403, 'Sem acesso à obra');

    const where: string[] = ['tenant_id = ?', 'id_obra = ?'];
    const params: any[] = [current.tenantId, idObra];
    if (dataInicio) {
      where.push('data_referencia >= ?');
      params.push(dataInicio);
    }
    if (dataFim) {
      where.push('data_referencia <= ?');
      params.push(dataFim);
    }

    const [rows]: any = await db.query(
      `
      SELECT
        id_apropriacao AS id,
        data_referencia AS dataReferencia,
        id_obra AS idObra,
        codigo_servico AS codigoServico,
        codigo_centro_custo AS codigoCentroCusto,
        tipo_recurso AS tipoRecurso,
        id_recurso AS idRecurso,
        quantidade,
        horas,
        observacao,
        atualizado_em AS atualizadoEm
      FROM engenharia_apropriacoes
      WHERE ${where.join(' AND ')}
      ORDER BY data_referencia DESC, id_apropriacao DESC
      LIMIT 2000
      `,
      params
    );

    return ok((rows as any[]).map((r) => ({ ...r, id: Number(r.id), idObra: Number(r.idObra), idRecurso: Number(r.idRecurso) })));
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    await ensureTables();

    const policy = await loadCcPolicy(current.tenantId);

    const body = await req.json().catch(() => null);
    const dataReferencia = normalizeDate(body?.dataReferencia);
    const idObra = Number(body?.idObra || 0);
    const codigoServico = normalizeCodigoServico(body?.codigoServico);
    const codigoCentroCusto = normalizeCodigoCentroCusto(body?.codigoCentroCusto);
    const tipoRecurso = normalizeTipoRecurso(body?.tipoRecurso);
    const idRecurso = Number(body?.idRecurso || 0);
    const quantidade = toNumber(body?.quantidade);
    const horas = toNumber(body?.horas);
    const observacao = body?.observacao ? String(body.observacao).trim() : null;

    if (!dataReferencia) return fail(422, 'dataReferencia é obrigatória');
    if (!Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra é obrigatório');
    if (!canAccessObra(current as any, idObra)) return fail(403, 'Sem acesso à obra');
    if (!codigoServico) return fail(422, 'codigoServico é obrigatório');
    if (!Number.isFinite(idRecurso) || idRecurso <= 0) return fail(422, 'idRecurso é obrigatório');
    if (!Number.isFinite(quantidade) || quantidade < 0) return fail(422, 'quantidade inválida');
    if (!Number.isFinite(horas) || horas < 0) return fail(422, 'horas inválidas');

    if (policy.bloquearSalvamento && !codigoCentroCusto) return fail(422, 'Centro de custo é obrigatório');
    if (!codigoCentroCusto && !policy.permitirSemCentroCusto) return fail(422, 'Centro de custo é obrigatório (ou habilite a permissão para apropriar sem centro de custo)');

    const [[svc]]: any = await db.query(
      `SELECT id_item AS id FROM obras_planilhas_itens WHERE tenant_id = ? AND id_obra = ? AND codigo_servico = ? LIMIT 1`,
      [current.tenantId, idObra, codigoServico]
    );
    if (!svc) return fail(422, `Serviço inválido para a obra (não está na planilha): ${codigoServico}`);

    if (codigoCentroCusto) {
      const [[plan]]: any = await db.query(
        `SELECT codigo_composicao AS codigoComposicao FROM obras_planilhas_itens WHERE tenant_id = ? AND id_obra = ? AND codigo_servico = ? LIMIT 1`,
        [current.tenantId, idObra, codigoServico]
      );
      const codigoComposicao = plan?.codigoComposicao ? String(plan.codigoComposicao) : null;
      if (!codigoComposicao) return fail(422, `Serviço sem composição vinculada na obra: ${codigoServico}`);

      const [[compRow]]: any = await db.query(`SELECT id_composicao AS idComposicao FROM engenharia_composicoes WHERE tenant_id = ? AND codigo = ? LIMIT 1`, [
        current.tenantId,
        codigoComposicao,
      ]);
      if (!compRow?.idComposicao) return fail(422, `Composição inválida para o serviço na obra: ${codigoServico}`);

      const [[okCc]]: any = await db.query(
        `
        SELECT 1 AS ok
        FROM engenharia_composicoes_itens i
        LEFT JOIN obras_composicoes_itens_overrides o
          ON o.tenant_id = i.tenant_id AND o.id_obra = ? AND o.id_item_base = i.id_item
        WHERE i.tenant_id = ?
          AND i.id_composicao = ?
          AND COALESCE(o.codigo_centro_custo, i.codigo_centro_custo) = ?
        LIMIT 1
        `,
        [idObra, current.tenantId, Number(compRow.idComposicao), codigoCentroCusto]
      );
      if (!okCc) return fail(422, `Centro de custo inválido para o serviço na obra (não está na composição): ${codigoServico}:${codigoCentroCusto}`);
    }

    const [ins]: any = await db.query(
      `
      INSERT INTO engenharia_apropriacoes
        (tenant_id, data_referencia, id_obra, codigo_servico, codigo_centro_custo, tipo_recurso, id_recurso, quantidade, horas, observacao, id_usuario_criador)
      VALUES
        (?,?,?,?,?,?,?,?,?,?,?)
      `,
      [current.tenantId, dataReferencia, idObra, codigoServico, codigoCentroCusto, tipoRecurso, idRecurso, quantidade, horas, observacao, current.id]
    );

    return ok({ id: Number(ins.insertId) });
  } catch (e) {
    return handleApiError(e);
  }
}
