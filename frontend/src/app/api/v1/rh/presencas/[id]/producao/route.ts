import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { audit } from '@/lib/api/audit';
import { ensureEngenhariaImportTables } from '@/lib/modules/engenharia-importacao/server';

export const runtime = 'nodejs';

async function ensureProducaoTables() {
  await ensureEngenhariaImportTables();
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS presencas_producao_itens (
      id_producao_item BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_presenca_item BIGINT UNSIGNED NOT NULL,
      servicos_json JSON NULL,
      quantidade_executada DECIMAL(14,4) NOT NULL DEFAULT 0,
      unidade_medida VARCHAR(32) NULL,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      id_usuario_atualizador BIGINT UNSIGNED NULL,
      PRIMARY KEY (id_producao_item),
      UNIQUE KEY uk_item (tenant_id, id_presenca_item),
      KEY idx_tenant (tenant_id)
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

function toNumber(v: unknown) {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

function normalizeServicosInput(v: any): Array<{ codigoServico: string; codigoCentroCusto: string | null; quantidade: number | null }> | null {
  if (!Array.isArray(v)) return null;
  const out: Array<{ codigoServico: string; codigoCentroCusto: string | null; quantidade: number | null }> = [];
  for (const s of v) {
    if (typeof s === 'string') {
      const codigoServico = s.trim().toUpperCase();
      if (codigoServico) out.push({ codigoServico, codigoCentroCusto: null, quantidade: null });
      continue;
    }
    if (s && typeof s === 'object') {
      const codigoServico = String((s as any).codigoServico ?? (s as any).codigo ?? '').trim().toUpperCase();
      if (!codigoServico) continue;
      const ccCodeRaw = (s as any).codigoCentroCusto ?? (s as any).centroCustoCodigo ?? (s as any).cc ?? null;
      const ccCode = ccCodeRaw == null ? null : String(ccCodeRaw).trim().toUpperCase();
      const qRaw = (s as any).quantidade ?? (s as any).qtd ?? null;
      const q = qRaw == null ? null : toNumber(qRaw);
      out.push({
        codigoServico,
        codigoCentroCusto: ccCode || null,
        quantidade: q == null || Number.isNaN(q) ? null : Number(q),
      });
    }
  }
  return out.length ? out : null;
}

const CC_POLICY_KEY = 'engenharia.apropriacao.cc_policy';

async function loadCcPolicy(tenantId: number) {
  const [[row]]: any = await db.query(`SELECT valor_json AS valorJson FROM tenant_configuracoes WHERE tenant_id = ? AND chave = ? LIMIT 1`, [tenantId, CC_POLICY_KEY]);
  const cfg = row?.valorJson ? (typeof row.valorJson === 'string' ? JSON.parse(row.valorJson) : row.valorJson) : {};
  return {
    permitirSemCentroCusto: cfg?.permitirSemCentroCusto !== false,
    bloquearSalvamento: cfg?.bloquearSalvamento === true,
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.RH_PRESENCAS_VIEW);
    const { id } = await params;
    const idPresenca = Number(id || 0);
    if (!Number.isFinite(idPresenca) || idPresenca <= 0) return fail(422, 'idPresenca inválido');

    await ensureProducaoTables();

    const [rows]: any = await db.query(
      `
      SELECT
        i.id_presenca_item AS idPresencaItem,
        i.id_funcionario AS idFuncionario,
        f.nome_completo AS funcionarioNome,
        p.servicos_json AS servicosJson,
        p.quantidade_executada AS quantidadeExecutada,
        p.unidade_medida AS unidadeMedida
      FROM presencas_itens i
      INNER JOIN presencas_cabecalho h ON h.id_presenca = i.id_presenca AND h.tenant_id = ?
      INNER JOIN funcionarios f ON f.id_funcionario = i.id_funcionario
      LEFT JOIN presencas_producao_itens p ON p.tenant_id = ? AND p.id_presenca_item = i.id_presenca_item
      WHERE i.id_presenca = ?
      ORDER BY f.nome_completo
      `,
      [current.tenantId, current.tenantId, idPresenca]
    );

    return ok(
      (rows as any[]).map((r) => ({
        idPresencaItem: Number(r.idPresencaItem),
        idFuncionario: Number(r.idFuncionario),
        funcionarioNome: String(r.funcionarioNome || ''),
        quantidadeExecutada: r.quantidadeExecutada == null ? 0 : Number(r.quantidadeExecutada),
        unidadeMedida: r.unidadeMedida ? String(r.unidadeMedida) : null,
        servicos: r.servicosJson ? (typeof r.servicosJson === 'string' ? JSON.parse(r.servicosJson) : r.servicosJson) : null,
      }))
    );
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.RH_PRESENCAS_CRUD);
    const { id } = await params;
    const idPresenca = Number(id || 0);
    if (!Number.isFinite(idPresenca) || idPresenca <= 0) return fail(422, 'idPresenca inválido');

    const body = await req.json().catch(() => null);
    const itens = Array.isArray(body?.itens) ? body.itens : null;
    if (!itens || !itens.length) return fail(422, 'itens é obrigatório');

    await ensureProducaoTables();

    const [headRows]: any = await conn.query(`SELECT * FROM presencas_cabecalho WHERE id_presenca = ? AND tenant_id = ?`, [
      idPresenca,
      current.tenantId,
    ]);
    if (!headRows.length) return fail(404, 'Ficha não encontrada');
    const head = headRows[0];
    if (!['EM_PREENCHIMENTO', 'REJEITADA_RH'].includes(head.status_presenca)) return fail(422, 'Ficha não pode mais ser alterada');
    if (Number(head.id_supervisor_lancamento) !== Number(current.idFuncionario)) return fail(403, 'Somente o supervisor responsável pode lançar esta ficha');

    const policy = await loadCcPolicy(current.tenantId);

    let allowedServicos: Set<string> | null = null;
    let ccMap: Map<string, Set<string>> | null = null;
    if (String(head.tipo_local).toUpperCase() === 'OBRA') {
      const idObra = Number(head.id_obra || 0);
      if (!idObra) return fail(422, 'Ficha sem obra associada');
      const [svcRows]: any = await conn.query(
        `SELECT codigo_servico AS codigoServico FROM obras_planilhas_itens WHERE tenant_id = ? AND id_obra = ?`,
        [current.tenantId, idObra]
      );
      allowedServicos = new Set((svcRows as any[]).map((r) => String(r.codigoServico || '').trim().toUpperCase()).filter(Boolean));
      if (!allowedServicos.size) return fail(422, 'A obra só pode iniciar após cadastrar a planilha orçamentária (serviços da obra).');

      const [ccRows]: any = await conn.query(
        `SELECT codigo_servico AS codigoServico, codigo_centro_custo AS codigoCentroCusto FROM obras_servicos_centros_custo WHERE tenant_id = ? AND id_obra = ?`,
        [current.tenantId, idObra]
      );
      ccMap = new Map();
      for (const r of ccRows as any[]) {
        const s = String(r.codigoServico || '').trim().toUpperCase();
        const c = String(r.codigoCentroCusto || '').trim().toUpperCase();
        if (!s || !c) continue;
        const set = ccMap.get(s) || new Set<string>();
        set.add(c);
        ccMap.set(s, set);
      }
    }

    for (const it of itens) {
      const quantidadeExecutada = toNumber(it?.quantidadeExecutada);
      const servicos = normalizeServicosInput(it?.servicos);
      if (!Number.isFinite(quantidadeExecutada) || quantidadeExecutada < 0) continue;
      if (allowedServicos && servicos) {
        for (const s of servicos) {
          const codServ = String(s.codigoServico || '').trim().toUpperCase();
          if (codServ && !allowedServicos.has(codServ)) return fail(422, `Serviço inválido para a obra (não está na planilha): ${codServ}`);
          if (codServ && s.codigoCentroCusto) {
            const cc = String(s.codigoCentroCusto).trim().toUpperCase();
            const [[plan]]: any = await conn.query(
              `SELECT codigo_composicao AS codigoComposicao FROM obras_planilhas_itens WHERE tenant_id = ? AND id_obra = ? AND codigo_servico = ? LIMIT 1`,
              [current.tenantId, Number(head.id_obra), codServ]
            );
            const codigoComposicao = plan?.codigoComposicao ? String(plan.codigoComposicao) : null;
            if (!codigoComposicao) return fail(422, `Serviço sem composição vinculada na obra: ${codServ}`);

            const [[compRow]]: any = await conn.query(`SELECT id_composicao AS idComposicao FROM engenharia_composicoes WHERE tenant_id = ? AND codigo = ? LIMIT 1`, [
              current.tenantId,
              codigoComposicao,
            ]);
            if (!compRow?.idComposicao) return fail(422, `Composição inválida para o serviço na obra: ${codServ}`);

            const [[okCc]]: any = await conn.query(
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
              [Number(head.id_obra), current.tenantId, Number(compRow.idComposicao), cc]
            );
            if (!okCc) return fail(422, `Centro de custo inválido para o serviço na obra (não está na composição): ${codServ}:${cc}`);
          }
        }
      }
      if (policy.bloquearSalvamento && (!servicos || servicos.some((s) => !s.codigoCentroCusto))) {
        return fail(422, 'Centro de custo é obrigatório na apropriação (por serviço).');
      }
      if (!policy.permitirSemCentroCusto && (!servicos || servicos.some((s) => !s.codigoCentroCusto))) {
        return fail(422, 'Centro de custo é obrigatório na apropriação (por serviço).');
      }
    }

    await conn.beginTransaction();
    for (const it of itens) {
      const idPresencaItem = Number(it?.idPresencaItem || 0);
      const quantidadeExecutada = toNumber(it?.quantidadeExecutada);
      const unidadeMedida = it?.unidadeMedida ? String(it.unidadeMedida).trim() : null;
      const servicos = normalizeServicosInput(it?.servicos);

      if (!idPresencaItem) continue;
      if (!Number.isFinite(quantidadeExecutada) || quantidadeExecutada < 0) continue;

      const [[val]]: any = await conn.query(
        `SELECT id_presenca_item FROM presencas_itens WHERE id_presenca_item = ? AND id_presenca = ? LIMIT 1`,
        [idPresencaItem, idPresenca]
      );
      if (!val) continue;

      await conn.query(
        `
        INSERT INTO presencas_producao_itens
          (tenant_id, id_presenca_item, servicos_json, quantidade_executada, unidade_medida, id_usuario_atualizador)
        VALUES
          (?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE
          servicos_json = VALUES(servicos_json),
          quantidade_executada = VALUES(quantidade_executada),
          unidade_medida = VALUES(unidade_medida),
          id_usuario_atualizador = VALUES(id_usuario_atualizador)
        `,
        [current.tenantId, idPresencaItem, servicos ? JSON.stringify(servicos) : null, quantidadeExecutada, unidadeMedida, current.id]
      );
    }

    await audit({
      tenantId: current.tenantId,
      userId: current.id,
      entidade: 'presencas_producao_itens',
      idRegistro: String(idPresenca),
      acao: 'UPSERT_LOTE',
      dadosNovos: { idPresenca, totalItens: itens.length },
    });

    await conn.commit();
    return ok({ idPresenca });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}
