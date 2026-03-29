import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

async function ensureTables() {
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
    CREATE TABLE IF NOT EXISTS engenharia_orcamentos_insumos (
      id_item BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_orcamento BIGINT UNSIGNED NOT NULL,
      id_versao BIGINT UNSIGNED NOT NULL,
      codigo VARCHAR(64) NOT NULL,
      descricao VARCHAR(255) NOT NULL,
      unidade VARCHAR(32) NOT NULL,
      custo_base DECIMAL(14,6) NOT NULL DEFAULT 0,
      preco_compra_min DECIMAL(14,6) NULL,
      preco_compra_max DECIMAL(14,6) NULL,
      preco_venda_min DECIMAL(14,6) NULL,
      preco_venda_max DECIMAL(14,6) NULL,
      preco_atual DECIMAL(14,6) NOT NULL DEFAULT 0,
      origem ENUM('COPIADO','IMPORTADO','MANUAL') NOT NULL DEFAULT 'IMPORTADO',
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      id_usuario_atualizador BIGINT UNSIGNED NULL,
      PRIMARY KEY (id_item),
      UNIQUE KEY uk_item (tenant_id, id_orcamento, id_versao, codigo),
      KEY idx_tenant (tenant_id),
      KEY idx_orcamento (tenant_id, id_orcamento, id_versao)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_orcamentos_composicoes (
      id_item BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_orcamento BIGINT UNSIGNED NOT NULL,
      id_versao BIGINT UNSIGNED NOT NULL,
      codigo VARCHAR(64) NOT NULL,
      codigo_servico VARCHAR(64) NULL,
      descricao VARCHAR(255) NOT NULL,
      unidade VARCHAR(32) NOT NULL,
      bdi DECIMAL(8,4) NOT NULL DEFAULT 0,
      origem ENUM('COPIADO','IMPORTADO','MANUAL') NOT NULL DEFAULT 'IMPORTADO',
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      id_usuario_atualizador BIGINT UNSIGNED NULL,
      PRIMARY KEY (id_item),
      UNIQUE KEY uk_item (tenant_id, id_orcamento, id_versao, codigo),
      KEY idx_tenant (tenant_id),
      KEY idx_orcamento (tenant_id, id_orcamento, id_versao)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_orcamentos_composicoes_itens (
      id_item BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_orcamento BIGINT UNSIGNED NOT NULL,
      id_versao BIGINT UNSIGNED NOT NULL,
      codigo_composicao VARCHAR(64) NOT NULL,
      etapa VARCHAR(120) NOT NULL DEFAULT '',
      tipo_item VARCHAR(16) NOT NULL,
      codigo_item VARCHAR(64) NOT NULL,
      quantidade DECIMAL(14,6) NOT NULL DEFAULT 0,
      perda_percentual DECIMAL(8,2) NOT NULL DEFAULT 0,
      codigo_centro_custo VARCHAR(40) NULL,
      origem ENUM('COPIADO','IMPORTADO','MANUAL') NOT NULL DEFAULT 'IMPORTADO',
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      id_usuario_atualizador BIGINT UNSIGNED NULL,
      PRIMARY KEY (id_item),
      UNIQUE KEY uk_item (tenant_id, id_orcamento, id_versao, codigo_composicao, etapa, tipo_item, codigo_item),
      KEY idx_tenant (tenant_id),
      KEY idx_orcamento (tenant_id, id_orcamento, id_versao)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_orcamentos_servicos (
      id_item BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_orcamento BIGINT UNSIGNED NOT NULL,
      id_versao BIGINT UNSIGNED NOT NULL,
      codigo VARCHAR(64) NOT NULL,
      descricao VARCHAR(255) NOT NULL,
      unidade VARCHAR(32) NOT NULL,
      referencia VARCHAR(120) NULL,
      preco_base DECIMAL(14,6) NOT NULL DEFAULT 0,
      preco_atual DECIMAL(14,6) NOT NULL DEFAULT 0,
      origem ENUM('COPIADO','IMPORTADO','MANUAL') NOT NULL DEFAULT 'IMPORTADO',
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      id_usuario_atualizador BIGINT UNSIGNED NULL,
      PRIMARY KEY (id_item),
      UNIQUE KEY uk_item (tenant_id, id_orcamento, id_versao, codigo),
      KEY idx_tenant (tenant_id),
      KEY idx_orcamento (tenant_id, id_orcamento, id_versao)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

function parseCsv(text: string) {
  const t = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!t) return { header: [], rows: [] as string[][] };
  const lines = t.split('\n').filter((l) => l.trim().length);
  const delim = lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';
  const rows: string[][] = [];
  for (const line of lines) {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === delim && !inQuotes) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    rows.push(out);
  }
  const header = rows.shift() || [];
  return { header: header.map((h) => h.trim().toLowerCase()), rows };
}

function toNumber(v: string) {
  const n = Number(String(v ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const { id } = await params;
    const idOrcamento = Number(id || 0);
    if (!Number.isFinite(idOrcamento) || idOrcamento <= 0) return fail(422, 'idOrcamento inválido');

    await ensureTables();

    const body = await req.json().catch(() => null);
    const tipo = String(body?.tipo || '').trim().toUpperCase();
    const csv = String(body?.csv || '');
    const idVersao = Number(body?.idVersao || 0);
    if (!idVersao) return fail(422, 'idVersao é obrigatório');
    if (!csv.trim()) return fail(422, 'csv é obrigatório');
    if (!['INSUMOS', 'COMPOSICOES', 'SERVICOS'].includes(tipo)) return fail(422, 'tipo inválido');

    const [[versao]]: any = await conn.query(
      `SELECT 1 AS ok FROM engenharia_orcamentos_versoes WHERE tenant_id = ? AND id_orcamento = ? AND id_versao = ? LIMIT 1`,
      [current.tenantId, idOrcamento, idVersao]
    );
    if (!versao) return fail(404, 'Versão não encontrada');

    const [[cInsumos]]: any = await conn.query(
      `SELECT COUNT(*) AS total FROM engenharia_orcamentos_insumos WHERE tenant_id = ? AND id_orcamento = ? AND id_versao = ?`,
      [current.tenantId, idOrcamento, idVersao]
    );
    const hasInsumos = Number(cInsumos?.total || 0) > 0;
    const [[cComps]]: any = await conn.query(
      `SELECT COUNT(*) AS total FROM engenharia_orcamentos_composicoes WHERE tenant_id = ? AND id_orcamento = ? AND id_versao = ?`,
      [current.tenantId, idOrcamento, idVersao]
    );
    const hasComps = Number(cComps?.total || 0) > 0;
    if (tipo === 'COMPOSICOES' && !hasInsumos) return fail(422, 'Ordem obrigatória: primeiro importe INSUMOS.');
    if (tipo === 'SERVICOS' && (!hasInsumos || !hasComps)) return fail(422, 'Ordem obrigatória: primeiro importe INSUMOS e COMPOSICOES.');

    const parsed = parseCsv(csv);
    const h = parsed.header;
    const idx = (name: string) => h.indexOf(name);

    await conn.beginTransaction();

    let imported = 0;

    if (tipo === 'INSUMOS') {
      const iCodigo = idx('codigo');
      const iDescricao = idx('descricao');
      const iUnidade = idx('unidade');
      const iCusto = idx('custo_base');
      const iCompraMin = idx('compra_min');
      const iCompraMax = idx('compra_max');
      const iVendaMin = idx('venda_min');
      const iVendaMax = idx('venda_max');
      if (iCodigo < 0 || iDescricao < 0 || iUnidade < 0) return fail(422, 'CSV de INSUMOS deve conter colunas: codigo, descricao, unidade (e opcional: custo_base, compra_min, compra_max, venda_min, venda_max)');

      for (const r of parsed.rows) {
        const codigo = String(r[iCodigo] || '').trim().toUpperCase();
        const descricao = String(r[iDescricao] || '').trim();
        const unidade = String(r[iUnidade] || '').trim();
        if (!codigo || !descricao || !unidade) continue;
        const custoBase = iCusto >= 0 ? toNumber(r[iCusto]) : 0;
        const compraMin = iCompraMin >= 0 ? toNumber(r[iCompraMin]) : NaN;
        const compraMax = iCompraMax >= 0 ? toNumber(r[iCompraMax]) : NaN;
        const vendaMin = iVendaMin >= 0 ? toNumber(r[iVendaMin]) : NaN;
        const vendaMax = iVendaMax >= 0 ? toNumber(r[iVendaMax]) : NaN;
        await conn.query(
          `
          INSERT INTO engenharia_orcamentos_insumos
            (tenant_id, id_orcamento, id_versao, codigo, descricao, unidade, custo_base, preco_compra_min, preco_compra_max, preco_venda_min, preco_venda_max, preco_atual, origem, id_usuario_atualizador)
          VALUES
            (?,?,?,?,?,?,?,?,?,?,?,?, 'IMPORTADO', ?)
          ON DUPLICATE KEY UPDATE
            descricao = VALUES(descricao),
            unidade = VALUES(unidade),
            custo_base = VALUES(custo_base),
            preco_compra_min = VALUES(preco_compra_min),
            preco_compra_max = VALUES(preco_compra_max),
            preco_venda_min = VALUES(preco_venda_min),
            preco_venda_max = VALUES(preco_venda_max),
            preco_atual = VALUES(preco_atual),
            origem = 'IMPORTADO',
            id_usuario_atualizador = VALUES(id_usuario_atualizador),
            atualizado_em = CURRENT_TIMESTAMP
          `,
          [
            current.tenantId,
            idOrcamento,
            idVersao,
            codigo,
            descricao,
            unidade,
            Number.isNaN(custoBase) ? 0 : custoBase,
            Number.isNaN(compraMin) ? null : compraMin,
            Number.isNaN(compraMax) ? null : compraMax,
            Number.isNaN(vendaMin) ? null : vendaMin,
            Number.isNaN(vendaMax) ? null : vendaMax,
            Number.isNaN(custoBase) ? 0 : custoBase,
            current.id,
          ]
        );
        imported++;
      }
    }

    if (tipo === 'COMPOSICOES') {
      const iCodigo = idx('codigo_composicao');
      const iCodigoServico = idx('codigo_servico');
      const iDescricao = idx('descricao');
      const iUnidade = idx('unidade');
      const iBdi = idx('bdi');
      const iEtapa = idx('etapa');
      const iTipoItem = idx('tipo_item');
      const iCodigoItem = idx('codigo_item');
      const iQtd = idx('quantidade');
      const iPerda = idx('perda_percentual');
      const iCc = idx('codigo_centro_custo');
      if (iCodigo < 0 || iDescricao < 0 || iUnidade < 0) {
        return fail(422, 'CSV de COMPOSICOES deve conter colunas: codigo_composicao, descricao, unidade (e opcional: codigo_servico, bdi, etapa, tipo_item, codigo_item, quantidade, perda_percentual, codigo_centro_custo)');
      }

      for (const r of parsed.rows) {
        const codigoComposicao = String(r[iCodigo] || '').trim().toUpperCase();
        const descricao = String(r[iDescricao] || '').trim();
        const unidade = String(r[iUnidade] || '').trim();
        if (!codigoComposicao || !descricao || !unidade) continue;
        const codigoServico = iCodigoServico >= 0 ? String(r[iCodigoServico] || '').trim().toUpperCase() : '';
        const bdi = iBdi >= 0 ? toNumber(r[iBdi]) : 0;
        await conn.query(
          `
          INSERT INTO engenharia_orcamentos_composicoes
            (tenant_id, id_orcamento, id_versao, codigo, codigo_servico, descricao, unidade, bdi, origem, id_usuario_atualizador)
          VALUES (?,?,?,?,?,?,?,?, 'IMPORTADO', ?)
          ON DUPLICATE KEY UPDATE
            codigo_servico = VALUES(codigo_servico),
            descricao = VALUES(descricao),
            unidade = VALUES(unidade),
            bdi = VALUES(bdi),
            origem = 'IMPORTADO',
            id_usuario_atualizador = VALUES(id_usuario_atualizador),
            atualizado_em = CURRENT_TIMESTAMP
          `,
          [current.tenantId, idOrcamento, idVersao, codigoComposicao, codigoServico || null, descricao, unidade, Number.isNaN(bdi) ? 0 : bdi, current.id]
        );
        imported++;

        if (iTipoItem >= 0 && iCodigoItem >= 0) {
          const etapa = iEtapa >= 0 ? String(r[iEtapa] || '').trim() : '';
          const tipoItem = String(r[iTipoItem] || '').trim().toUpperCase();
          const codigoItem = String(r[iCodigoItem] || '').trim().toUpperCase();
          const qtd = iQtd >= 0 ? toNumber(r[iQtd]) : NaN;
          const perda = iPerda >= 0 ? toNumber(r[iPerda]) : 0;
          const cc = iCc >= 0 ? String(r[iCc] || '').trim().toUpperCase() : '';
          if (tipoItem && codigoItem && Number.isFinite(qtd)) {
            await conn.query(
              `
              INSERT INTO engenharia_orcamentos_composicoes_itens
                (tenant_id, id_orcamento, id_versao, codigo_composicao, etapa, tipo_item, codigo_item, quantidade, perda_percentual, codigo_centro_custo, origem, id_usuario_atualizador)
              VALUES (?,?,?,?,?,?,?,?,?,?, 'IMPORTADO', ?)
              ON DUPLICATE KEY UPDATE
                quantidade = VALUES(quantidade),
                perda_percentual = VALUES(perda_percentual),
                codigo_centro_custo = VALUES(codigo_centro_custo),
                origem = 'IMPORTADO',
                id_usuario_atualizador = VALUES(id_usuario_atualizador),
                atualizado_em = CURRENT_TIMESTAMP
              `,
              [
                current.tenantId,
                idOrcamento,
                idVersao,
                codigoComposicao,
                etapa,
                tipoItem,
                codigoItem,
                qtd,
                Number.isNaN(perda) ? 0 : perda,
                cc || null,
                current.id,
              ]
            );
          }
        }
      }
    }

    if (tipo === 'SERVICOS') {
      const iCodigo = idx('codigo');
      const iDescricao = idx('descricao');
      const iUnidade = idx('unidade');
      const iRef = idx('referencia');
      const iPreco = idx('preco');
      if (iCodigo < 0 || iDescricao < 0 || iUnidade < 0) return fail(422, 'CSV de SERVICOS deve conter colunas: codigo, descricao, unidade (e opcional: referencia, preco)');

      for (const r of parsed.rows) {
        const codigo = String(r[iCodigo] || '').trim().toUpperCase();
        const descricao = String(r[iDescricao] || '').trim();
        const unidade = String(r[iUnidade] || '').trim();
        if (!codigo || !descricao || !unidade) continue;
        const referencia = iRef >= 0 ? String(r[iRef] || '').trim() : null;
        const preco = iPreco >= 0 ? toNumber(r[iPreco]) : 0;
        await conn.query(
          `
          INSERT INTO engenharia_orcamentos_servicos
            (tenant_id, id_orcamento, id_versao, codigo, descricao, unidade, referencia, preco_base, preco_atual, origem, id_usuario_atualizador)
          VALUES (?,?,?,?,?,?,?,?,?, 'IMPORTADO', ?)
          ON DUPLICATE KEY UPDATE
            descricao = VALUES(descricao),
            unidade = VALUES(unidade),
            referencia = VALUES(referencia),
            preco_base = VALUES(preco_base),
            preco_atual = VALUES(preco_atual),
            origem = 'IMPORTADO',
            id_usuario_atualizador = VALUES(id_usuario_atualizador),
            atualizado_em = CURRENT_TIMESTAMP
          `,
          [current.tenantId, idOrcamento, idVersao, codigo, descricao, unidade, referencia, Number.isNaN(preco) ? 0 : preco, Number.isNaN(preco) ? 0 : preco, current.id]
        );
        imported++;
      }
    }

    await conn.commit();
    return ok({ tipo, imported });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

