import { NextRequest } from 'next/server';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { db } from '@/lib/db';
import { parseCsvText } from '@/lib/modules/engenharia-importacao/csv';
import { previewComposicoes, previewComposicoesItens } from '@/lib/modules/engenharia-importacao/validators';
import { auditBasica, ensureEngenhariaImportTables } from '@/lib/modules/engenharia-importacao/server';
import type { ImportPreviewErrorDTO, ImportPreviewResultDTO } from '@/lib/modules/engenharia-importacao/types';

export const runtime = 'nodejs';

async function readUtf8CsvFile(file: File) {
  if (!file) throw new Error('Arquivo ausente');
  if (file.size > 5 * 1024 * 1024) throw new Error('Arquivo muito grande (limite 5MB)');
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    throw new Error('Arquivo CSV deve estar em UTF-8');
  }
}

function err(linha: number, campo: string | null, codigo: string, mensagem: string): ImportPreviewErrorDTO {
  return { linha, campo, codigo, mensagem };
}

function normalizeHeader(h: string) {
  return h.trim().toLowerCase();
}

function buildResult(totalLinhas: number, erros: ImportPreviewErrorDTO[], avisos: ImportPreviewErrorDTO[]): ImportPreviewResultDTO {
  const invalidas = new Set(erros.map((e) => e.linha)).size;
  const validas = Math.max(0, totalLinhas - invalidas);
  return { totalLinhas, validas, invalidas, erros, avisos };
}

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function loadExistingCodes(args: { table: 'engenharia_materiais' | 'engenharia_servicos'; tenantId: number; codes: string[] }) {
  const existing = new Set<string>();
  const unique = Array.from(new Set(args.codes.filter(Boolean)));
  if (!unique.length) return existing;
  for (const part of chunk(unique, 800)) {
    const placeholders = part.map(() => '?').join(',');
    const [rows]: any = await db.query(`SELECT codigo FROM ${args.table} WHERE tenant_id = ? AND codigo IN (${placeholders})`, [
      args.tenantId,
      ...part,
    ]);
    for (const r of rows || []) existing.add(String(r.codigo));
  }
  return existing;
}

async function previewWithReferences(args: { tenantId: number; composicoesText: string; itensText: string }) {
  const p1 = previewComposicoes(args.composicoesText).result;
  const p2 = previewComposicoesItens(args.itensText).result;

  const erros: ImportPreviewErrorDTO[] = [...(p1.erros || []), ...(p2.erros || [])];
  const avisos: ImportPreviewErrorDTO[] = [...(p1.avisos || []), ...(p2.avisos || [])];

  const parsedComposicoes = parseCsvText(args.composicoesText);
  const parsedItens = parseCsvText(args.itensText);

  const idxC = Object.fromEntries(parsedComposicoes.headers.map((h, i) => [normalizeHeader(h), i]));
  const idxI = Object.fromEntries(parsedItens.headers.map((h, i) => [normalizeHeader(h), i]));

  const compLinhaByCodigo = new Map<string, number>();
  const compCodigos = new Set<string>();
  for (let i = 0; i < parsedComposicoes.rows.length; i++) {
    const linha = i + 2;
    const codigo = String(parsedComposicoes.rows[i]?.[idxC.codigo] ?? '').trim();
    if (!codigo) continue;
    compCodigos.add(codigo);
    if (!compLinhaByCodigo.has(codigo)) compLinhaByCodigo.set(codigo, linha);
  }

  const itensCountByComp = new Map<string, number>();
  const materialRefs = new Map<string, number[]>();
  const servicoRefs = new Map<string, number[]>();

  for (let i = 0; i < parsedItens.rows.length; i++) {
    const linha = i + 2;
    const r = parsedItens.rows[i] || [];
    const codigoComp = String(r[idxI.codigo_composicao] ?? '').trim();
    const tipoItem = String(r[idxI.tipo_item] ?? '').trim().toUpperCase();
    const codigoItem = String(r[idxI.codigo_item] ?? '').trim();

    if (codigoComp && !compCodigos.has(codigoComp)) {
      erros.push(err(linha, 'codigo_composicao', 'UNKNOWN_COMPOSICAO', 'Código de composição não existe no arquivo de composições'));
    } else if (codigoComp) {
      itensCountByComp.set(codigoComp, (itensCountByComp.get(codigoComp) || 0) + 1);
    }

    if (!codigoItem) continue;
    if (tipoItem === 'MATERIAL') {
      const prev = materialRefs.get(codigoItem) || [];
      prev.push(linha);
      materialRefs.set(codigoItem, prev);
    } else if (tipoItem === 'SERVICO') {
      const prev = servicoRefs.get(codigoItem) || [];
      prev.push(linha);
      servicoRefs.set(codigoItem, prev);
    }
  }

  for (const codigo of compCodigos) {
    if (!itensCountByComp.get(codigo)) {
      erros.push(err(compLinhaByCodigo.get(codigo) || 2, 'codigo', 'NO_ITEMS', 'Composição sem itens no arquivo de itens'));
    }
  }

  await ensureEngenhariaImportTables();

  const materiaisExistentes = await loadExistingCodes({
    table: 'engenharia_materiais',
    tenantId: args.tenantId,
    codes: Array.from(materialRefs.keys()),
  });
  const servicosExistentes = await loadExistingCodes({
    table: 'engenharia_servicos',
    tenantId: args.tenantId,
    codes: Array.from(servicoRefs.keys()),
  });

  for (const [codigoItem, linhas] of materialRefs.entries()) {
    if (materiaisExistentes.has(codigoItem)) continue;
    for (const linha of linhas) erros.push(err(linha, 'codigo_item', 'REFERENCE_NOT_FOUND', `Material inexistente: ${codigoItem}`));
  }
  for (const [codigoItem, linhas] of servicoRefs.entries()) {
    if (servicosExistentes.has(codigoItem)) continue;
    for (const linha of linhas) erros.push(err(linha, 'codigo_item', 'REFERENCE_NOT_FOUND', `Serviço inexistente: ${codigoItem}`));
  }

  return {
    parsedComposicoes,
    parsedItens,
    idxC,
    idxI,
    result: buildResult(parsedComposicoes.rows.length + parsedItens.rows.length, erros, avisos),
  };
}

function toNumber(v: string) {
  const s = String(v ?? '').trim().replace(',', '.');
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function toBool01(v: string) {
  const s = String(v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'sim' ? 1 : 0;
}

export async function POST(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.ENGENHARIA_COMPOSICOES_IMPORTAR);
    const form = await req.formData();
    const fileComposicoes = form.get('fileComposicoes');
    const fileItens = form.get('fileItens');
    if (!(fileComposicoes instanceof File)) return fail(422, 'Arquivo CSV de composições é obrigatório (campo "fileComposicoes")');
    if (!(fileItens instanceof File)) return fail(422, 'Arquivo CSV de itens é obrigatório (campo "fileItens")');

    const composicoesText = await readUtf8CsvFile(fileComposicoes);
    const itensText = await readUtf8CsvFile(fileItens);

    const preview = await previewWithReferences({ tenantId: current.tenantId, composicoesText, itensText });
    if (preview.result.invalidas > 0) return fail(422, 'Arquivo possui erros. Corrija antes de importar.', preview.result);

    const conn = await db.getConnection();
    let inseridosComposicoes = 0;
    let atualizadosComposicoes = 0;
    let inseridosItens = 0;
    let atualizadosItens = 0;
    let ignorados = 0;
    try {
      await conn.beginTransaction();

      const composicoesCodigos: string[] = [];
      for (const r of preview.parsedComposicoes.rows) {
        const codigo = String(r[preview.idxC.codigo] ?? '').trim();
        if (!codigo) {
          ignorados++;
          continue;
        }
        composicoesCodigos.push(codigo);
        const params = [
          current.tenantId,
          codigo,
          String(r[preview.idxC.descricao] ?? '').trim(),
          String(r[preview.idxC.unidade] ?? '').trim(),
          toNumber(String(r[preview.idxC.bdi] ?? '0')),
          toBool01(String(r[preview.idxC.ativo] ?? '1')),
        ];
        const [res]: any = await conn.query(
          `
          INSERT INTO engenharia_composicoes
            (tenant_id, codigo, descricao, unidade, bdi, ativo)
          VALUES
            (?,?,?,?,?,?)
          ON DUPLICATE KEY UPDATE
            descricao = VALUES(descricao),
            unidade = VALUES(unidade),
            bdi = VALUES(bdi),
            ativo = VALUES(ativo)
          `,
          params
        );
        const affected = Number(res?.affectedRows || 0);
        if (affected === 1) inseridosComposicoes++;
        else if (affected >= 2) atualizadosComposicoes++;
      }

      const compIdByCodigo = new Map<string, number>();
      for (const part of chunk(Array.from(new Set(composicoesCodigos)), 800)) {
        const placeholders = part.map(() => '?').join(',');
        const [rows]: any = await conn.query(
          `SELECT id_composicao, codigo FROM engenharia_composicoes WHERE tenant_id = ? AND codigo IN (${placeholders})`,
          [current.tenantId, ...part]
        );
        for (const r of rows || []) compIdByCodigo.set(String(r.codigo), Number(r.id_composicao));
      }

      for (const r of preview.parsedItens.rows) {
        const codigoComp = String(r[preview.idxI.codigo_composicao] ?? '').trim();
        const tipoItem = String(r[preview.idxI.tipo_item] ?? '').trim().toUpperCase();
        const codigoItem = String(r[preview.idxI.codigo_item] ?? '').trim();
        const idComposicao = compIdByCodigo.get(codigoComp);
        if (!codigoComp || !codigoItem || !idComposicao) {
          ignorados++;
          continue;
        }

        const params = [
          current.tenantId,
          idComposicao,
          tipoItem,
          codigoItem,
          toNumber(String(r[preview.idxI.quantidade] ?? '0')),
          toNumber(String(r[preview.idxI.perda_percentual] ?? '0')),
        ];

        const [res]: any = await conn.query(
          `
          INSERT INTO engenharia_composicoes_itens
            (tenant_id, id_composicao, tipo_item, codigo_item, quantidade, perda_percentual)
          VALUES
            (?,?,?,?,?,?)
          ON DUPLICATE KEY UPDATE
            quantidade = VALUES(quantidade),
            perda_percentual = VALUES(perda_percentual)
          `,
          params
        );
        const affected = Number(res?.affectedRows || 0);
        if (affected === 1) inseridosItens++;
        else if (affected >= 2) atualizadosItens++;
      }

      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    await auditBasica({
      tenantId: current.tenantId,
      userId: current.id,
      acao: 'IMPORT_CSV',
      entidade: 'ENGENHARIA_COMPOSICOES',
      resumo: {
        inseridosComposicoes,
        atualizadosComposicoes,
        inseridosItens,
        atualizadosItens,
        ignorados,
        totalLinhas: preview.parsedComposicoes.rows.length + preview.parsedItens.rows.length,
      },
    });

    return ok({
      inseridos: inseridosComposicoes + inseridosItens,
      atualizados: atualizadosComposicoes + atualizadosItens,
      ignorados,
      erros: 0,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
