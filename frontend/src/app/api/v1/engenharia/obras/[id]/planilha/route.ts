import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { canAccessObra } from '@/lib/auth/access';
import { ensureEngenhariaImportTables } from '@/lib/modules/engenharia-importacao/server';

export const runtime = 'nodejs';

async function ensureTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS obras_planilhas_versoes (
      id_planilha BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_obra BIGINT UNSIGNED NOT NULL,
      numero_versao INT NOT NULL,
      nome VARCHAR(120) NOT NULL DEFAULT 'Planilha orçamentária',
      atual TINYINT(1) NOT NULL DEFAULT 1,
      origem ENUM('MANUAL','CSV','MIGRACAO') NOT NULL DEFAULT 'MANUAL',
      data_base_sbc VARCHAR(16) NULL,
      data_base_sinapi VARCHAR(16) NULL,
      bdi_servicos_sbc DECIMAL(10,4) NULL,
      bdi_servicos_sinapi DECIMAL(10,4) NULL,
      bdi_diferenciado_sbc DECIMAL(10,4) NULL,
      bdi_diferenciado_sinapi DECIMAL(10,4) NULL,
      enc_sociais_sem_des_sbc DECIMAL(10,4) NULL,
      enc_sociais_sem_des_sinapi DECIMAL(10,4) NULL,
      desconto_sbc DECIMAL(10,4) NULL,
      desconto_sinapi DECIMAL(10,4) NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      id_usuario_criador BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY (id_planilha),
      UNIQUE KEY uk_versao (tenant_id, id_obra, numero_versao),
      KEY idx_atual (tenant_id, id_obra, atual),
      KEY idx_obra (tenant_id, id_obra)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS obras_planilhas_linhas (
      id_linha BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_planilha BIGINT UNSIGNED NOT NULL,
      ordem INT NOT NULL DEFAULT 0,
      item VARCHAR(40) NULL,
      codigo VARCHAR(80) NULL,
      fonte VARCHAR(40) NULL,
      servico VARCHAR(260) NULL,
      und VARCHAR(16) NULL,
      quantidade DECIMAL(14,4) NULL,
      valor_unitario DECIMAL(14,6) NULL,
      valor_parcial DECIMAL(14,6) NULL,
      nivel TINYINT UNSIGNED NOT NULL DEFAULT 0,
      tipo_linha ENUM('ITEM','SUBITEM','SERVICO') NOT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_linha),
      KEY idx_planilha (tenant_id, id_planilha, ordem),
      KEY idx_tipo (tenant_id, id_planilha, tipo_linha)
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
  await db.query(`ALTER TABLE obras_planilhas_itens ADD COLUMN codigo_composicao VARCHAR(64) NULL AFTER codigo_servico`).catch(() => null);

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
    CREATE TABLE IF NOT EXISTS engenharia_servicos_centros_custo (
      id_vinculo BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      codigo_servico VARCHAR(80) NOT NULL,
      codigo_centro_custo VARCHAR(40) NOT NULL,
      id_equipe_padrao BIGINT UNSIGNED NULL,
      produtividade_prevista DECIMAL(14,6) NULL,
      custo_unitario_previsto DECIMAL(14,6) NULL,
      ativo TINYINT(1) NOT NULL DEFAULT 1,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      id_usuario_criador BIGINT UNSIGNED NULL,
      justificativa TEXT NULL,
      PRIMARY KEY (id_vinculo),
      UNIQUE KEY uk_servico_cc (tenant_id, codigo_servico, codigo_centro_custo),
      KEY idx_tenant (tenant_id),
      KEY idx_servico (tenant_id, codigo_servico),
      KEY idx_cc (tenant_id, codigo_centro_custo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

function toNumber(v: unknown) {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

function normServico(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s ? s : null;
}

function normalizeHeader(h: string) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseCsvTextAuto(text: string) {
  const cleaned = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = cleaned.split('\n').filter((l) => l.trim().length > 0);
  if (!lines.length) return { headers: [] as string[], rows: [] as string[][] };
  const first = lines[0];
  const comma = (first.match(/,/g) || []).length;
  const semi = (first.match(/;/g) || []).length;
  const sep = semi > comma ? ';' : ',';
  const split = (line: string) => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          const next = line[i + 1];
          if (next === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          cur += ch;
        }
        continue;
      }
      if (ch === '"') {
        inQuotes = true;
        continue;
      }
      if (ch === sep) {
        out.push(cur);
        cur = '';
        continue;
      }
      cur += ch;
    }
    out.push(cur);
    return out.map((v) => v.trim());
  };
  const headers = split(lines[0]);
  const rows = lines.slice(1).map((l) => split(l));
  return { headers, rows };
}

function toDec(v: unknown) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const norm = s.replace(/\./g, '').replace(',', '.').replace(/[^\d.\-]/g, '');
  if (!norm) return null;
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

function detectTipoLinha(item: string, und: string, quant: string, valorUnit: string) {
  const hasServ = !!(und.trim() || quant.trim() || valorUnit.trim());
  if (hasServ) return { tipo: 'SERVICO' as const, nivel: item.trim() ? Math.max(0, item.split('.').filter(Boolean).length) : 0 };
  const parts = item.trim() ? item.split('.').filter(Boolean) : [];
  if (parts.length <= 1) return { tipo: 'ITEM' as const, nivel: parts.length };
  return { tipo: 'SUBITEM' as const, nivel: parts.length };
}

async function getObraStatus(tenantId: number, idObra: number) {
  const [[row]]: any = await db.query(
    `
    SELECT status_obra AS statusObra
    FROM obras
    WHERE tenant_id = ? AND id_obra = ?
    LIMIT 1
    `,
    [tenantId, idObra]
  );
  return row?.statusObra ? String(row.statusObra) : null;
}

async function ensureMigrationFromLegacy(current: any, idObra: number) {
  const [[exists]]: any = await db.query(
    `SELECT id_planilha AS idPlanilha FROM obras_planilhas_versoes WHERE tenant_id = ? AND id_obra = ? LIMIT 1`,
    [current.tenantId, idObra]
  );
  if (exists) return;

  const [legacy]: any = await db.query(
    `
    SELECT codigo_servico AS codigo, descricao_servico AS servico, unidade_medida AS und, quantidade_contratada AS quantidade, preco_unitario AS valorUnitario, valor_total AS valorParcial
    FROM obras_planilhas_itens
    WHERE tenant_id = ? AND id_obra = ?
    ORDER BY codigo_servico ASC
    `,
    [current.tenantId, idObra]
  );
  if (!Array.isArray(legacy) || legacy.length === 0) return;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [ins]: any = await conn.query(
      `
      INSERT INTO obras_planilhas_versoes
        (tenant_id, id_obra, numero_versao, nome, atual, origem, id_usuario_criador)
      VALUES
        (?,?,1,'Versão 1',1,'MIGRACAO',?)
      `,
      [current.tenantId, idObra, current.id]
    );
    const idPlanilha = Number(ins.insertId);

    for (let i = 0; i < legacy.length; i++) {
      const r = legacy[i];
      await conn.query(
        `
        INSERT INTO obras_planilhas_linhas
          (tenant_id, id_planilha, ordem, item, codigo, fonte, servico, und, quantidade, valor_unitario, valor_parcial, nivel, tipo_linha)
        VALUES
          (?,?,?,?,?,?,?,?,?,?,?,?,?)
        `,
        [
          current.tenantId,
          idPlanilha,
          i + 1,
          null,
          String(r.codigo || '').trim() || null,
          null,
          r.servico ? String(r.servico) : null,
          r.und ? String(r.und) : null,
          r.quantidade == null ? null : Number(r.quantidade),
          r.valorUnitario == null ? null : Number(r.valorUnitario),
          r.valorParcial == null ? null : Number(r.valorParcial),
          0,
          'SERVICO',
        ]
      );
    }

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function getPlanilhaAtualId(tenantId: number, idObra: number) {
  const [[row]]: any = await db.query(
    `
    SELECT id_planilha AS idPlanilha
    FROM obras_planilhas_versoes
    WHERE tenant_id = ? AND id_obra = ? AND atual = 1
    ORDER BY numero_versao DESC, id_planilha DESC
    LIMIT 1
    `,
    [tenantId, idObra]
  );
  return row?.idPlanilha ? Number(row.idPlanilha) : null;
}

async function syncServicosDerivados(conn: any, current: any, idObra: number, idPlanilha: number) {
  await conn.query(`DELETE FROM obras_planilhas_itens WHERE tenant_id = ? AND id_obra = ?`, [current.tenantId, idObra]);

  const [servicos]: any = await conn.query(
    `
    SELECT
      codigo,
      servico,
      und,
      quantidade,
      valor_unitario AS valorUnitario,
      valor_parcial AS valorParcial
    FROM obras_planilhas_linhas
    WHERE tenant_id = ? AND id_planilha = ? AND tipo_linha = 'SERVICO'
    ORDER BY ordem ASC, id_linha ASC
    `,
    [current.tenantId, idPlanilha]
  );

  for (const r of servicos as any[]) {
    const codigoServico = normServico(r.codigo);
    if (!codigoServico) continue;
    const [[comp]]: any = await conn.query(
      `
      SELECT codigo
      FROM engenharia_composicoes
      WHERE tenant_id = ? AND codigo_servico = ? AND ativo = 1
      ORDER BY codigo
      LIMIT 1
      `,
      [current.tenantId, codigoServico]
    );
    const codigoComposicao = comp?.codigo ? String(comp.codigo) : null;
    await conn.query(
      `
      INSERT INTO obras_planilhas_itens
        (tenant_id, id_obra, codigo_servico, codigo_composicao, descricao_servico, unidade_medida, quantidade_contratada, preco_unitario, valor_total, id_usuario_criador)
      VALUES
        (?,?,?,?,?,?,?,?,?,?)
      `,
      [
        current.tenantId,
        idObra,
        codigoServico,
        codigoComposicao,
        r.servico ? String(r.servico).trim() : null,
        r.und ? String(r.und).trim() : null,
        r.quantidade == null ? null : Number(r.quantidade),
        r.valorUnitario == null ? null : Number(r.valorUnitario),
        r.valorParcial == null ? null : Number(r.valorParcial),
        current.id,
      ]
    );
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const { id } = await params;
    const idObra = Number(id || 0);
    if (!Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra inválido');
    if (!canAccessObra(current as any, idObra)) return fail(403, 'Sem acesso à obra');

    await ensureEngenhariaImportTables();
    await ensureTables();
    await ensureMigrationFromLegacy(current as any, idObra);

    const url = new URL(_req.url);
    const view = String(url.searchParams.get('view') || '').trim().toLowerCase();
    const planilhaIdParam = url.searchParams.get('planilhaId');
    const obraStatus = await getObraStatus(current.tenantId, idObra);

    if (view === 'versoes') {
      const [rows]: any = await db.query(
        `
        SELECT
          v.id_planilha AS idPlanilha,
          v.numero_versao AS numeroVersao,
          v.nome,
          v.atual,
          v.origem,
          v.criado_em AS criadoEm,
          COALESCE(SUM(CASE WHEN l.tipo_linha = 'SERVICO' THEN COALESCE(l.valor_parcial, 0) ELSE 0 END), 0) AS valorTotal,
          SUM(CASE WHEN l.tipo_linha = 'SERVICO' THEN 1 ELSE 0 END) AS totalServicos
        FROM obras_planilhas_versoes v
        LEFT JOIN obras_planilhas_linhas l
          ON l.tenant_id = v.tenant_id AND l.id_planilha = v.id_planilha
        WHERE v.tenant_id = ? AND v.id_obra = ?
        GROUP BY v.id_planilha, v.numero_versao, v.nome, v.atual, v.origem, v.criado_em
        ORDER BY v.numero_versao DESC, v.id_planilha DESC
        `,
        [current.tenantId, idObra]
      );
      return ok({
        idObra,
        obraStatus,
        versoes: (rows as any[]).map((r) => ({
          idPlanilha: Number(r.idPlanilha),
          numeroVersao: Number(r.numeroVersao),
          nome: String(r.nome || ''),
          atual: Boolean(r.atual),
          origem: String(r.origem || 'MANUAL'),
          criadoEm: String(r.criadoEm),
          valorTotal: r.valorTotal == null ? 0 : Number(r.valorTotal),
          totalServicos: Number(r.totalServicos || 0),
        })),
      });
    }

    const planilhaId = planilhaIdParam ? Number(planilhaIdParam) : null;
    const idPlanilha = planilhaId && Number.isFinite(planilhaId) && planilhaId > 0 ? planilhaId : await getPlanilhaAtualId(current.tenantId, idObra);
    if (!idPlanilha) return ok({ idObra, obraStatus, planilha: null });

    const [[v]]: any = await db.query(
      `
      SELECT
        id_planilha AS idPlanilha,
        numero_versao AS numeroVersao,
        nome,
        atual,
        origem,
        data_base_sbc AS dataBaseSbc,
        data_base_sinapi AS dataBaseSinapi,
        bdi_servicos_sbc AS bdiServicosSbc,
        bdi_servicos_sinapi AS bdiServicosSinapi,
        bdi_diferenciado_sbc AS bdiDiferenciadoSbc,
        bdi_diferenciado_sinapi AS bdiDiferenciadoSinapi,
        enc_sociais_sem_des_sbc AS encSociaisSemDesSbc,
        enc_sociais_sem_des_sinapi AS encSociaisSemDesSinapi,
        desconto_sbc AS descontoSbc,
        desconto_sinapi AS descontoSinapi,
        criado_em AS criadoEm
      FROM obras_planilhas_versoes
      WHERE tenant_id = ? AND id_obra = ? AND id_planilha = ?
      LIMIT 1
      `,
      [current.tenantId, idObra, idPlanilha]
    );
    if (!v) return ok({ idObra, obraStatus, planilha: null });

    const [linhas]: any = await db.query(
      `
      SELECT
        id_linha AS idLinha,
        ordem,
        item,
        codigo,
        fonte,
        servico,
        und,
        quantidade,
        valor_unitario AS valorUnitario,
        valor_parcial AS valorParcial,
        nivel,
        tipo_linha AS tipoLinha
      FROM obras_planilhas_linhas
      WHERE tenant_id = ? AND id_planilha = ?
      ORDER BY ordem ASC, id_linha ASC
      `,
      [current.tenantId, idPlanilha]
    );

    return ok({
      idObra,
      obraStatus,
      planilha: {
        idPlanilha: Number(v.idPlanilha),
        numeroVersao: Number(v.numeroVersao),
        nome: String(v.nome || ''),
        atual: Boolean(v.atual),
        origem: String(v.origem || 'MANUAL'),
        criadoEm: String(v.criadoEm),
        parametros: {
          dataBaseSbc: v.dataBaseSbc ? String(v.dataBaseSbc) : null,
          dataBaseSinapi: v.dataBaseSinapi ? String(v.dataBaseSinapi) : null,
          bdiServicosSbc: v.bdiServicosSbc == null ? null : Number(v.bdiServicosSbc),
          bdiServicosSinapi: v.bdiServicosSinapi == null ? null : Number(v.bdiServicosSinapi),
          bdiDiferenciadoSbc: v.bdiDiferenciadoSbc == null ? null : Number(v.bdiDiferenciadoSbc),
          bdiDiferenciadoSinapi: v.bdiDiferenciadoSinapi == null ? null : Number(v.bdiDiferenciadoSinapi),
          encSociaisSemDesSbc: v.encSociaisSemDesSbc == null ? null : Number(v.encSociaisSemDesSbc),
          encSociaisSemDesSinapi: v.encSociaisSemDesSinapi == null ? null : Number(v.encSociaisSemDesSinapi),
          descontoSbc: v.descontoSbc == null ? null : Number(v.descontoSbc),
          descontoSinapi: v.descontoSinapi == null ? null : Number(v.descontoSinapi),
        },
        linhas: (linhas as any[]).map((r) => ({
          idLinha: Number(r.idLinha),
          ordem: Number(r.ordem || 0),
          item: r.item ? String(r.item) : "",
          codigo: r.codigo ? String(r.codigo) : "",
          fonte: r.fonte ? String(r.fonte) : "",
          servicos: r.servico ? String(r.servico) : "",
          und: r.und ? String(r.und) : "",
          quant: r.quantidade == null ? "" : String(r.quantidade),
          valorUnitario: r.valorUnitario == null ? "" : String(r.valorUnitario),
          valorParcial: r.valorParcial == null ? "" : String(r.valorParcial),
          nivel: Number(r.nivel || 0),
          tipoLinha: String(r.tipoLinha || 'ITEM'),
        })),
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const { id } = await params;
    const idObra = Number(id || 0);
    if (!Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra inválido');
    if (!canAccessObra(current as any, idObra)) return fail(403, 'Sem acesso à obra');

    await ensureEngenhariaImportTables();
    await ensureTables();
    await ensureMigrationFromLegacy(current as any, idObra);

    const obraStatus = await getObraStatus(current.tenantId, idObra);
    const isObraNaoIniciada = String(obraStatus || '').toUpperCase() === 'NAO_INICIADA';

    const contentType = String(req.headers.get('content-type') || '').toLowerCase();
    const isMultipart = contentType.includes('multipart/form-data');
    const jsonBody = isMultipart ? null : await req.json().catch(() => null);

    const action = String((jsonBody?.action ?? '') || '').trim().toUpperCase();

    await conn.beginTransaction();

    const [[last]]: any = await conn.query(
      `SELECT MAX(numero_versao) AS maxVersao FROM obras_planilhas_versoes WHERE tenant_id = ? AND id_obra = ?`,
      [current.tenantId, idObra]
    );
    const nextVersao = Number(last?.maxVersao || 0) + 1;

    async function setAtual(idPlanilha: number) {
      await conn.query(`UPDATE obras_planilhas_versoes SET atual = 0 WHERE tenant_id = ? AND id_obra = ?`, [current.tenantId, idObra]);
      await conn.query(`UPDATE obras_planilhas_versoes SET atual = 1 WHERE tenant_id = ? AND id_obra = ? AND id_planilha = ?`, [current.tenantId, idObra, idPlanilha]);
    }

    if (isMultipart) {
      if (!isObraNaoIniciada) {
        await conn.rollback();
        return fail(422, 'A obra precisa estar em status "Não iniciada" para alterar a planilha atual.');
      }
      const form = await req.formData();
      const act = String(form.get('action') || '').trim().toUpperCase();
      if (act !== 'IMPORTAR_CSV') {
        await conn.rollback();
        return fail(422, 'Ação inválida');
      }
      const file = form.get('file');
      if (!(file instanceof File)) {
        await conn.rollback();
        return fail(422, 'Arquivo CSV é obrigatório (campo "file")');
      }
      const nome = String(form.get('nome') || `Versão ${nextVersao}`).trim() || `Versão ${nextVersao}`;
      const buf = await file.arrayBuffer();
      let csvText = '';
      try {
        csvText = new TextDecoder('utf-8', { fatal: true }).decode(buf);
      } catch {
        await conn.rollback();
        return fail(422, 'Arquivo CSV deve estar em UTF-8');
      }

      const { headers, rows } = parseCsvTextAuto(csvText);
      if (!headers.length || !rows.length) {
        await conn.rollback();
        return fail(422, 'CSV vazio ou inválido');
      }
      const idx = Object.fromEntries(headers.map((h, i) => [normalizeHeader(h), i]));
      const get = (r: string[], key: string) => String(r[idx[key]] ?? '').trim();

      const required = ['item', 'codigo', 'fonte', 'servicos', 'und', 'quant', 'valor_unitario', 'valor_parcial'];
      const missing = required.filter((k) => idx[k] == null);
      if (missing.length) {
        await conn.rollback();
        return fail(422, `Colunas obrigatórias ausentes no CSV: ${missing.join(', ')}`);
      }

      const [insPlan]: any = await conn.query(
        `
        INSERT INTO obras_planilhas_versoes
          (tenant_id, id_obra, numero_versao, nome, atual, origem, id_usuario_criador)
        VALUES
          (?,?,?,?,1,'CSV',?)
        `,
        [current.tenantId, idObra, nextVersao, nome, current.id]
      );
      const idPlanilha = Number(insPlan.insertId);
      await setAtual(idPlanilha);

      const toInsert: any[] = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const item = get(r, 'item');
        const codigo = get(r, 'codigo');
        const fonte = get(r, 'fonte');
        const servicos = get(r, 'servicos');
        const und = get(r, 'und');
        const quant = get(r, 'quant');
        const valorUnit = get(r, 'valor_unitario');
        const valorParcial = get(r, 'valor_parcial');
        const det = detectTipoLinha(item, und, quant, valorUnit);
        const quantidade = toDec(quant);
        const vUnit = toDec(valorUnit);
        const parcialCalc = quantidade != null && vUnit != null ? Number((quantidade * vUnit).toFixed(6)) : null;
        const vParc = toDec(valorParcial) ?? parcialCalc;

        toInsert.push({
          ordem: i + 1,
          item: item || null,
          codigo: codigo || null,
          fonte: fonte || null,
          servico: servicos || null,
          und: und || null,
          quantidade: quantidade == null ? null : quantidade,
          valorUnitario: vUnit == null ? null : vUnit,
          valorParcial: vParc == null ? null : vParc,
          nivel: det.nivel,
          tipoLinha: det.tipo,
        });
      }

      for (const row of toInsert) {
        await conn.query(
          `
          INSERT INTO obras_planilhas_linhas
            (tenant_id, id_planilha, ordem, item, codigo, fonte, servico, und, quantidade, valor_unitario, valor_parcial, nivel, tipo_linha)
          VALUES
            (?,?,?,?,?,?,?,?,?,?,?,?,?)
          `,
          [
            current.tenantId,
            idPlanilha,
            row.ordem,
            row.item,
            row.codigo,
            row.fonte,
            row.servico,
            row.und,
            row.quantidade,
            row.valorUnitario,
            row.valorParcial,
            row.nivel,
            row.tipoLinha,
          ]
        );
      }

      await syncServicosDerivados(conn, current as any, idObra, idPlanilha);
      await conn.commit();
      return ok({ idObra, idPlanilha, numeroVersao: nextVersao });
    }

    if (action === 'NOVA_VERSAO') {
      if (!isObraNaoIniciada) {
        await conn.rollback();
        return fail(422, 'A obra precisa estar em status "Não iniciada" para alterar a planilha atual.');
      }
      const nome = String(jsonBody?.nome || `Versão ${nextVersao}`).trim() || `Versão ${nextVersao}`;
      const copyFrom = jsonBody?.copyFromPlanilhaId != null ? Number(jsonBody.copyFromPlanilhaId) : null;
      const [insPlan]: any = await conn.query(
        `
        INSERT INTO obras_planilhas_versoes
          (tenant_id, id_obra, numero_versao, nome, atual, origem, id_usuario_criador)
        VALUES
          (?,?,?,?,1,'MANUAL',?)
        `,
        [current.tenantId, idObra, nextVersao, nome, current.id]
      );
      const idPlanilha = Number(insPlan.insertId);
      await setAtual(idPlanilha);

      if (copyFrom && Number.isFinite(copyFrom) && copyFrom > 0) {
        const [origRows]: any = await conn.query(
          `
          SELECT ordem, item, codigo, fonte, servico, und, quantidade, valor_unitario AS valorUnitario, valor_parcial AS valorParcial, nivel, tipo_linha AS tipoLinha
          FROM obras_planilhas_linhas
          WHERE tenant_id = ? AND id_planilha = ?
          ORDER BY ordem ASC, id_linha ASC
          `,
          [current.tenantId, copyFrom]
        );
        for (const r of origRows as any[]) {
          await conn.query(
            `
            INSERT INTO obras_planilhas_linhas
              (tenant_id, id_planilha, ordem, item, codigo, fonte, servico, und, quantidade, valor_unitario, valor_parcial, nivel, tipo_linha)
            VALUES
              (?,?,?,?,?,?,?,?,?,?,?,?,?)
            `,
            [
              current.tenantId,
              idPlanilha,
              Number(r.ordem || 0),
              r.item ? String(r.item) : null,
              r.codigo ? String(r.codigo) : null,
              r.fonte ? String(r.fonte) : null,
              r.servico ? String(r.servico) : null,
              r.und ? String(r.und) : null,
              r.quantidade == null ? null : Number(r.quantidade),
              r.valorUnitario == null ? null : Number(r.valorUnitario),
              r.valorParcial == null ? null : Number(r.valorParcial),
              Number(r.nivel || 0),
              String(r.tipoLinha || 'ITEM'),
            ]
          );
        }
      }

      await syncServicosDerivados(conn, current as any, idObra, idPlanilha);
      await conn.commit();
      return ok({ idObra, idPlanilha, numeroVersao: nextVersao });
    }

    if (action === 'ATUALIZAR_PARAMETROS') {
      if (!isObraNaoIniciada) {
        await conn.rollback();
        return fail(422, 'A obra precisa estar em status "Não iniciada" para alterar a planilha atual.');
      }
      const idPlanilha = Number(jsonBody?.idPlanilha || 0);
      if (!idPlanilha) {
        await conn.rollback();
        return fail(422, 'idPlanilha é obrigatório');
      }
      const [[v]]: any = await conn.query(
        `SELECT atual FROM obras_planilhas_versoes WHERE tenant_id = ? AND id_obra = ? AND id_planilha = ? LIMIT 1`,
        [current.tenantId, idObra, idPlanilha]
      );
      if (!v) {
        await conn.rollback();
        return fail(404, 'Planilha não encontrada');
      }
      if (!v.atual) {
        await conn.rollback();
        return fail(422, 'Não é permitido editar versões obsoletas');
      }

      const p = jsonBody?.parametros || {};
      await conn.query(
        `
        UPDATE obras_planilhas_versoes
        SET
          data_base_sbc = ?,
          data_base_sinapi = ?,
          bdi_servicos_sbc = ?,
          bdi_servicos_sinapi = ?,
          bdi_diferenciado_sbc = ?,
          bdi_diferenciado_sinapi = ?,
          enc_sociais_sem_des_sbc = ?,
          enc_sociais_sem_des_sinapi = ?,
          desconto_sbc = ?,
          desconto_sinapi = ?
        WHERE tenant_id = ? AND id_obra = ? AND id_planilha = ?
        `,
        [
          p.dataBaseSbc ? String(p.dataBaseSbc).trim() : null,
          p.dataBaseSinapi ? String(p.dataBaseSinapi).trim() : null,
          p.bdiServicosSbc == null ? null : toDec(p.bdiServicosSbc),
          p.bdiServicosSinapi == null ? null : toDec(p.bdiServicosSinapi),
          p.bdiDiferenciadoSbc == null ? null : toDec(p.bdiDiferenciadoSbc),
          p.bdiDiferenciadoSinapi == null ? null : toDec(p.bdiDiferenciadoSinapi),
          p.encSociaisSemDesSbc == null ? null : toDec(p.encSociaisSemDesSbc),
          p.encSociaisSemDesSinapi == null ? null : toDec(p.encSociaisSemDesSinapi),
          p.descontoSbc == null ? null : toDec(p.descontoSbc),
          p.descontoSinapi == null ? null : toDec(p.descontoSinapi),
          current.tenantId,
          idObra,
          idPlanilha,
        ]
      );
      await conn.commit();
      return ok({ idObra, idPlanilha });
    }

    if (action === 'UPSERT_LINHA') {
      if (!isObraNaoIniciada) {
        await conn.rollback();
        return fail(422, 'A obra precisa estar em status "Não iniciada" para alterar a planilha atual.');
      }
      const idPlanilha = Number(jsonBody?.idPlanilha || 0);
      if (!idPlanilha) {
        await conn.rollback();
        return fail(422, 'idPlanilha é obrigatório');
      }
      const [[v]]: any = await conn.query(
        `SELECT atual FROM obras_planilhas_versoes WHERE tenant_id = ? AND id_obra = ? AND id_planilha = ? LIMIT 1`,
        [current.tenantId, idObra, idPlanilha]
      );
      if (!v) {
        await conn.rollback();
        return fail(404, 'Planilha não encontrada');
      }
      if (!v.atual) {
        await conn.rollback();
        return fail(422, 'Não é permitido editar versões obsoletas');
      }
      const linha = jsonBody?.linha || {};
      const idLinha = linha?.idLinha != null ? Number(linha.idLinha) : null;
      const ordem = Number(linha?.ordem || 0) || 0;
      const item = String(linha?.item || '').trim() || null;
      const codigo = String(linha?.codigo || '').trim() || null;
      const fonte = String(linha?.fonte || '').trim() || null;
      const servico = String(linha?.servicos || '').trim() || null;
      const und = String(linha?.und || '').trim() || null;
      const quant = toDec(linha?.quant);
      const valorUnit = toDec(linha?.valorUnitario);
      const parcialCalc = quant != null && valorUnit != null ? Number((quant * valorUnit).toFixed(6)) : null;
      const valorParcial = toDec(linha?.valorParcial) ?? parcialCalc;
      const tipoLinha = String(linha?.tipoLinha || '').trim().toUpperCase();
      if (tipoLinha !== 'ITEM' && tipoLinha !== 'SUBITEM' && tipoLinha !== 'SERVICO') {
        await conn.rollback();
        return fail(422, 'tipoLinha inválido');
      }
      const det = detectTipoLinha(item || '', und || '', String(quant ?? ''), String(valorUnit ?? ''));
      const nivel = tipoLinha === 'SERVICO' ? det.nivel : det.nivel;

      if (idLinha) {
        await conn.query(
          `
          UPDATE obras_planilhas_linhas
          SET ordem = ?, item = ?, codigo = ?, fonte = ?, servico = ?, und = ?, quantidade = ?, valor_unitario = ?, valor_parcial = ?, nivel = ?, tipo_linha = ?
          WHERE tenant_id = ? AND id_planilha = ? AND id_linha = ?
          `,
          [
            ordem,
            item,
            codigo,
            fonte,
            servico,
            und,
            quant == null ? null : quant,
            valorUnit == null ? null : valorUnit,
            valorParcial == null ? null : valorParcial,
            nivel,
            tipoLinha,
            current.tenantId,
            idPlanilha,
            idLinha,
          ]
        );
      } else {
        await conn.query(
          `
          INSERT INTO obras_planilhas_linhas
            (tenant_id, id_planilha, ordem, item, codigo, fonte, servico, und, quantidade, valor_unitario, valor_parcial, nivel, tipo_linha)
          VALUES
            (?,?,?,?,?,?,?,?,?,?,?,?,?)
          `,
          [
            current.tenantId,
            idPlanilha,
            ordem,
            item,
            codigo,
            fonte,
            servico,
            und,
            quant == null ? null : quant,
            valorUnit == null ? null : valorUnit,
            valorParcial == null ? null : valorParcial,
            nivel,
            tipoLinha,
          ]
        );
      }

      await syncServicosDerivados(conn, current as any, idObra, idPlanilha);
      await conn.commit();
      return ok({ idObra, idPlanilha });
    }

    if (action === 'EXCLUIR_LINHA') {
      if (!isObraNaoIniciada) {
        await conn.rollback();
        return fail(422, 'A obra precisa estar em status "Não iniciada" para alterar a planilha atual.');
      }
      const idPlanilha = Number(jsonBody?.idPlanilha || 0);
      const idLinha = Number(jsonBody?.idLinha || 0);
      if (!idPlanilha || !idLinha) {
        await conn.rollback();
        return fail(422, 'idPlanilha e idLinha são obrigatórios');
      }
      const [[v]]: any = await conn.query(
        `SELECT atual FROM obras_planilhas_versoes WHERE tenant_id = ? AND id_obra = ? AND id_planilha = ? LIMIT 1`,
        [current.tenantId, idObra, idPlanilha]
      );
      if (!v) {
        await conn.rollback();
        return fail(404, 'Planilha não encontrada');
      }
      if (!v.atual) {
        await conn.rollback();
        return fail(422, 'Não é permitido editar versões obsoletas');
      }
      await conn.query(`DELETE FROM obras_planilhas_linhas WHERE tenant_id = ? AND id_planilha = ? AND id_linha = ?`, [current.tenantId, idPlanilha, idLinha]);
      await syncServicosDerivados(conn, current as any, idObra, idPlanilha);
      await conn.commit();
      return ok({ idObra, idPlanilha });
    }

    await conn.rollback();
    return fail(422, 'Ação não suportada');
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}
