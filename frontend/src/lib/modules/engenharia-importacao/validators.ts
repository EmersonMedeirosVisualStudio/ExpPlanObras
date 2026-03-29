import type { ImportPreviewErrorDTO, ImportPreviewResultDTO } from './types';
import { isDangerousCsvValue, parseCsvText } from './csv';

function err(linha: number, campo: string | null, codigo: string, mensagem: string): ImportPreviewErrorDTO {
  return { linha, campo, codigo, mensagem };
}

function normalizeHeader(h: string) {
  return h.trim().toLowerCase();
}

function toNumber(v: string) {
  const s = String(v ?? '').trim().replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toBool01(v: string) {
  const s = String(v ?? '').trim().toLowerCase();
  if (s === '1' || s === 'true' || s === 'sim' || s === 'yes') return 1;
  if (s === '0' || s === 'false' || s === 'nao' || s === 'não' || s === 'no') return 0;
  return null;
}

function validateHeaders(headers: string[], required: string[]) {
  const set = new Set(headers.map(normalizeHeader));
  return required.filter((r) => !set.has(normalizeHeader(r)));
}

function buildResult(totalLinhas: number, erros: ImportPreviewErrorDTO[], avisos: ImportPreviewErrorDTO[]): ImportPreviewResultDTO {
  const invalidas = new Set(erros.map((e) => e.linha)).size;
  const validas = Math.max(0, totalLinhas - invalidas);
  return { totalLinhas, validas, invalidas, erros, avisos };
}

export function previewMateriais(csvText: string) {
  const required = ['codigo', 'descricao', 'unidade', 'grupo', 'categoria', 'preco_unitario', 'estoque_minimo', 'ativo'];
  const { headers, rows } = parseCsvText(csvText);
  const missing = validateHeaders(headers, required);
  const erros: ImportPreviewErrorDTO[] = [];
  const avisos: ImportPreviewErrorDTO[] = [];
  if (missing.length) {
    for (const h of missing) erros.push(err(1, h, 'HEADER_MISSING', `Coluna obrigatória ausente: ${h}`));
    return { result: buildResult(rows.length, erros, avisos) };
  }
  const idx = Object.fromEntries(headers.map((h, i) => [normalizeHeader(h), i]));
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const linha = i + 2;
    const codigo = String(r[idx.codigo] ?? '').trim();
    const descricao = String(r[idx.descricao] ?? '').trim();
    const unidade = String(r[idx.unidade] ?? '').trim();
    const grupo = String(r[idx.grupo] ?? '').trim();
    const categoria = String(r[idx.categoria] ?? '').trim();
    const preco = toNumber(String(r[idx.preco_unitario] ?? ''));
    const estoqueMinimo = toNumber(String(r[idx.estoque_minimo] ?? ''));
    const ativo = toBool01(String(r[idx.ativo] ?? ''));

    if (!codigo) erros.push(err(linha, 'codigo', 'REQUIRED', 'Código obrigatório'));
    if (!descricao) erros.push(err(linha, 'descricao', 'REQUIRED', 'Descrição obrigatória'));
    if (!unidade) erros.push(err(linha, 'unidade', 'REQUIRED', 'Unidade obrigatória'));
    if (codigo && seen.has(codigo)) erros.push(err(linha, 'codigo', 'DUPLICATE', 'Código duplicado no arquivo'));
    if (codigo) seen.add(codigo);

    for (const [campo, val] of [
      ['codigo', codigo],
      ['descricao', descricao],
      ['unidade', unidade],
      ['grupo', grupo],
      ['categoria', categoria],
    ] as Array<[string, string]>) {
      if (val && isDangerousCsvValue(val)) erros.push(err(linha, campo, 'DANGEROUS_FORMULA', 'Valor inicia com fórmula perigosa'));
    }

    if (preco == null) erros.push(err(linha, 'preco_unitario', 'INVALID_NUMBER', 'Preço inválido'));
    if (preco != null && preco < 0) erros.push(err(linha, 'preco_unitario', 'NEGATIVE', 'Preço não pode ser negativo'));
    if (estoqueMinimo == null) erros.push(err(linha, 'estoque_minimo', 'INVALID_NUMBER', 'Estoque mínimo inválido'));
    if (estoqueMinimo != null && estoqueMinimo < 0) erros.push(err(linha, 'estoque_minimo', 'NEGATIVE', 'Estoque mínimo não pode ser negativo'));
    if (ativo == null) erros.push(err(linha, 'ativo', 'INVALID_BOOL', 'Ativo deve ser 0 ou 1'));
  });
  return { result: buildResult(rows.length, erros, avisos) };
}

export function previewServicos(csvText: string) {
  const required = ['codigo', 'descricao', 'unidade', 'grupo', 'preco_unitario', 'ativo'];
  const { headers, rows } = parseCsvText(csvText);
  const missing = validateHeaders(headers, required);
  const erros: ImportPreviewErrorDTO[] = [];
  const avisos: ImportPreviewErrorDTO[] = [];
  if (missing.length) {
    for (const h of missing) erros.push(err(1, h, 'HEADER_MISSING', `Coluna obrigatória ausente: ${h}`));
    return { result: buildResult(rows.length, erros, avisos) };
  }
  const idx = Object.fromEntries(headers.map((h, i) => [normalizeHeader(h), i]));
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const linha = i + 2;
    const codigo = String(r[idx.codigo] ?? '').trim();
    const descricao = String(r[idx.descricao] ?? '').trim();
    const unidade = String(r[idx.unidade] ?? '').trim();
    const grupo = String(r[idx.grupo] ?? '').trim();
    const preco = toNumber(String(r[idx.preco_unitario] ?? ''));
    const ativo = toBool01(String(r[idx.ativo] ?? ''));

    if (!codigo) erros.push(err(linha, 'codigo', 'REQUIRED', 'Código obrigatório'));
    if (!descricao) erros.push(err(linha, 'descricao', 'REQUIRED', 'Descrição obrigatória'));
    if (!unidade) erros.push(err(linha, 'unidade', 'REQUIRED', 'Unidade obrigatória'));
    if (codigo && seen.has(codigo)) erros.push(err(linha, 'codigo', 'DUPLICATE', 'Código duplicado no arquivo'));
    if (codigo) seen.add(codigo);

    for (const [campo, val] of [
      ['codigo', codigo],
      ['descricao', descricao],
      ['unidade', unidade],
      ['grupo', grupo],
    ] as Array<[string, string]>) {
      if (val && isDangerousCsvValue(val)) erros.push(err(linha, campo, 'DANGEROUS_FORMULA', 'Valor inicia com fórmula perigosa'));
    }

    if (preco == null) erros.push(err(linha, 'preco_unitario', 'INVALID_NUMBER', 'Preço inválido'));
    if (preco != null && preco < 0) erros.push(err(linha, 'preco_unitario', 'NEGATIVE', 'Preço não pode ser negativo'));
    if (ativo == null) erros.push(err(linha, 'ativo', 'INVALID_BOOL', 'Ativo deve ser 0 ou 1'));
  });
  return { result: buildResult(rows.length, erros, avisos) };
}

export function previewComposicoes(csvText: string) {
  const required = ['codigo', 'descricao', 'unidade', 'bdi', 'ativo'];
  const { headers, rows } = parseCsvText(csvText);
  const missing = validateHeaders(headers, required);
  const erros: ImportPreviewErrorDTO[] = [];
  const avisos: ImportPreviewErrorDTO[] = [];
  if (missing.length) {
    for (const h of missing) erros.push(err(1, h, 'HEADER_MISSING', `Coluna obrigatória ausente: ${h}`));
    return { result: buildResult(rows.length, erros, avisos) };
  }
  const idx = Object.fromEntries(headers.map((h, i) => [normalizeHeader(h), i]));
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const linha = i + 2;
    const codigo = String(r[idx.codigo] ?? '').trim();
    const descricao = String(r[idx.descricao] ?? '').trim();
    const unidade = String(r[idx.unidade] ?? '').trim();
    const bdi = toNumber(String(r[idx.bdi] ?? ''));
    const ativo = toBool01(String(r[idx.ativo] ?? ''));

    if (!codigo) erros.push(err(linha, 'codigo', 'REQUIRED', 'Código obrigatório'));
    if (!descricao) erros.push(err(linha, 'descricao', 'REQUIRED', 'Descrição obrigatória'));
    if (!unidade) erros.push(err(linha, 'unidade', 'REQUIRED', 'Unidade obrigatória'));
    if (codigo && seen.has(codigo)) erros.push(err(linha, 'codigo', 'DUPLICATE', 'Código duplicado no arquivo'));
    if (codigo) seen.add(codigo);

    for (const [campo, val] of [
      ['codigo', codigo],
      ['descricao', descricao],
      ['unidade', unidade],
    ] as Array<[string, string]>) {
      if (val && isDangerousCsvValue(val)) erros.push(err(linha, campo, 'DANGEROUS_FORMULA', 'Valor inicia com fórmula perigosa'));
    }

    if (bdi == null) erros.push(err(linha, 'bdi', 'INVALID_NUMBER', 'BDI inválido'));
    if (bdi != null && (bdi < 0 || bdi > 2)) avisos.push(err(linha, 'bdi', 'OUT_OF_RANGE', 'BDI fora do esperado (0 a 2)'));
    if (ativo == null) erros.push(err(linha, 'ativo', 'INVALID_BOOL', 'Ativo deve ser 0 ou 1'));
  });
  return { result: buildResult(rows.length, erros, avisos) };
}

export function previewComposicoesItens(csvText: string) {
  const required = ['codigo_composicao', 'tipo_item', 'codigo_item', 'quantidade', 'perda_percentual'];
  const { headers, rows } = parseCsvText(csvText);
  const missing = validateHeaders(headers, required);
  const erros: ImportPreviewErrorDTO[] = [];
  const avisos: ImportPreviewErrorDTO[] = [];
  if (missing.length) {
    for (const h of missing) erros.push(err(1, h, 'HEADER_MISSING', `Coluna obrigatória ausente: ${h}`));
    return { result: buildResult(rows.length, erros, avisos) };
  }
  const idx = Object.fromEntries(headers.map((h, i) => [normalizeHeader(h), i]));
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const linha = i + 2;
    const codigoComposicao = String(r[idx.codigo_composicao] ?? '').trim();
    const tipoItem = String(r[idx.tipo_item] ?? '').trim().toUpperCase();
    const codigoItem = String(r[idx.codigo_item] ?? '').trim();
    const quantidade = toNumber(String(r[idx.quantidade] ?? ''));
    const perda = toNumber(String(r[idx.perda_percentual] ?? '')) ?? 0;

    if (!codigoComposicao) erros.push(err(linha, 'codigo_composicao', 'REQUIRED', 'Código da composição obrigatório'));
    if (!codigoItem) erros.push(err(linha, 'codigo_item', 'REQUIRED', 'Código do item obrigatório'));
    if (tipoItem !== 'MATERIAL' && tipoItem !== 'SERVICO') erros.push(err(linha, 'tipo_item', 'INVALID', 'tipo_item deve ser MATERIAL ou SERVICO'));
    if (quantidade == null) erros.push(err(linha, 'quantidade', 'INVALID_NUMBER', 'Quantidade inválida'));
    if (quantidade != null && quantidade <= 0) erros.push(err(linha, 'quantidade', 'NON_POSITIVE', 'Quantidade deve ser maior que 0'));
    if (perda < 0) erros.push(err(linha, 'perda_percentual', 'NEGATIVE', 'Perda não pode ser negativa'));
    if (perda > 100) avisos.push(err(linha, 'perda_percentual', 'OUT_OF_RANGE', 'Perda percentual acima de 100'));

    for (const [campo, val] of [
      ['codigo_composicao', codigoComposicao],
      ['codigo_item', codigoItem],
    ] as Array<[string, string]>) {
      if (val && isDangerousCsvValue(val)) erros.push(err(linha, campo, 'DANGEROUS_FORMULA', 'Valor inicia com fórmula perigosa'));
    }

    const key = `${codigoComposicao}::${tipoItem}::${codigoItem}`;
    if (codigoComposicao && codigoItem && seen.has(key)) erros.push(err(linha, 'codigo_item', 'DUPLICATE', 'Item duplicado na mesma composição'));
    if (codigoComposicao && codigoItem) seen.add(key);
  });
  return { result: buildResult(rows.length, erros, avisos) };
}

