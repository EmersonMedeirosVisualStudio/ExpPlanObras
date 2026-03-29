import type { DashboardExportDataDTO } from './types';

function sanitizeForCsvCell(input: any) {
  let s = input == null ? '' : String(input);
  s = s.replace(/^\t+/, '');
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return s;
}

function csvEscape(input: any) {
  const s = sanitizeForCsvCell(input);
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function row(values: any[]) {
  return values.map(csvEscape).join(',');
}

export function renderCsv(data: DashboardExportDataDTO) {
  const lines: string[] = [];
  lines.push(row([data.titulo]));
  if (data.subtitulo) lines.push(row([data.subtitulo]));
  lines.push('');

  if (data.filtrosAplicados && Object.keys(data.filtrosAplicados).length) {
    lines.push(row(['FILTROS']));
    for (const [k, v] of Object.entries(data.filtrosAplicados)) {
      lines.push(row([k, v == null ? '' : Array.isArray(v) ? v.join('|') : String(v)]));
    }
    lines.push('');
  }

  if (Array.isArray(data.cards) && data.cards.length) {
    lines.push(row(['CARDS']));
    lines.push(row(['label', 'valor']));
    for (const c of data.cards) {
      lines.push(row([c.label, c.valor]));
    }
    lines.push('');
  }

  if (Array.isArray(data.alertas) && data.alertas.length) {
    lines.push(row(['ALERTAS']));
    lines.push(row(['tipo', 'titulo', 'subtitulo', 'criticidade']));
    for (const a of data.alertas) {
      lines.push(row([a.tipo, a.titulo, a.subtitulo ?? '', a.criticidade ?? '']));
    }
    lines.push('');
  }

  if (Array.isArray(data.tabelas) && data.tabelas.length) {
    for (const t of data.tabelas) {
      lines.push(row([t.titulo]));
      lines.push(row(t.colunas));
      for (const l of t.linhas) lines.push(row(l));
      lines.push('');
    }
  }

  return new TextEncoder().encode(lines.join('\n'));
}

