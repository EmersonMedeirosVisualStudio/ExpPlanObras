import type { DashboardExportDataDTO } from './types';

type EmpresaDocLayout = { logoDataUrl?: string | null; cabecalhoHtml?: string | null; rodapeHtml?: string | null };

function htmlToText(html: string) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function replaceTokens(t: string, args: { dataHora: string; pagina: number; totalPaginas: number }) {
  return String(t || '')
    .replaceAll('{{DATA_HORA}}', args.dataHora)
    .replaceAll('{{DATA}}', args.dataHora.slice(0, 10))
    .replaceAll('{{PAGINA}}', String(args.pagina))
    .replaceAll('{{TOTAL_PAGINAS}}', String(args.totalPaginas))
    .replaceAll('{{LOGO}}', '');
}

export async function renderPdf(data: DashboardExportDataDTO, layout?: EmpresaDocLayout | null): Promise<Buffer> {
  const lines: string[] = [];
  const dataHora = new Date().toLocaleString('pt-BR');
  const headerText = layout?.cabecalhoHtml ? replaceTokens(htmlToText(layout.cabecalhoHtml), { dataHora, pagina: 1, totalPaginas: 1 }) : '';
  const footerText = layout?.rodapeHtml ? replaceTokens(htmlToText(layout.rodapeHtml), { dataHora, pagina: 1, totalPaginas: 1 }) : '';

  if (headerText) {
    lines.push(...headerText.split('\n'));
    lines.push('');
  }

  lines.push(data.titulo || 'Relatório de Dashboard');
  if (data.subtitulo) lines.push(data.subtitulo);
  lines.push(dataHora);
  lines.push('');

  if (data.filtrosAplicados) {
    lines.push('Filtros aplicados:');
    for (const [k, v] of Object.entries(data.filtrosAplicados)) lines.push(`- ${k}: ${v}`);
    lines.push('');
  }

  if (data.cards?.length) {
    lines.push('Cards:');
    for (const c of data.cards) lines.push(`• ${c.label}: ${String(c.valor)}`);
    lines.push('');
  }

  if (data.alertas?.length) {
    lines.push('Alertas:');
    for (const a of data.alertas.slice(0, 20)) {
      lines.push(`[${a.tipo}] ${a.titulo}`);
      if (a.subtitulo) lines.push(`  ${a.subtitulo}`);
    }
    lines.push('');
  }

  if (data.series?.length) {
    lines.push('Séries:');
    const keys = Object.keys(data.series[0] || {}).filter((k) => k !== 'referencia');
    for (const s of data.series.slice(0, 24)) {
      const vals = keys.map((k) => `${k}: ${(s as any)[k]}`).join(' | ');
      lines.push(`${(s as any).referencia} — ${vals}`);
    }
    lines.push('');
  }

  if (data.tabelas?.length) {
    for (const t of data.tabelas) {
      lines.push(t.titulo);
      lines.push(t.colunas.join(' | '));
      for (const l of t.linhas.slice(0, 50)) lines.push(l.map((x) => (x === null || x === undefined ? '' : String(x))).join(' | '));
      lines.push('');
    }
  }

  if (footerText) {
    lines.push('');
    lines.push(...footerText.split('\n'));
  }

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const fontSize = 10;
  const leading = 14;
  const startX = 40;
  const startY = 800;

  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const contentLines: string[] = [];
  contentLines.push('BT');
  contentLines.push(`/F1 ${fontSize} Tf`);
  contentLines.push(`${startX} ${startY} Td`);
  for (let i = 0; i < lines.length; i++) {
    const text = esc(lines[i]).slice(0, 220);
    contentLines.push(`(${text}) Tj`);
    if (i !== lines.length - 1) contentLines.push(`0 -${leading} Td`);
  }
  contentLines.push('ET');
  const content = contentLines.join('\n');
  const contentBuf = Buffer.from(content, 'utf8');

  const offsets: number[] = [];

  const header = '%PDF-1.4\n';
  let body = '';
  const add = (objNum: number, objBody: string) => {
    const off = Buffer.byteLength(header + body);
    offsets[objNum] = off;
    body += `${objNum} 0 obj\n${objBody}\nendobj\n`;
  };

  add(1, `<< /Type /Catalog /Pages 2 0 R >>`);
  add(2, `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`);
  add(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`
  );
  add(4, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`);
  add(5, `<< /Length ${contentBuf.length} >>\nstream\n${content}\nendstream`);

  const xrefStart = Buffer.byteLength(header + body);
  let xref = 'xref\n0 6\n';
  xref += '0000000000 65535 f \n';
  for (let i = 1; i <= 5; i++) {
    const off = offsets[i] || 0;
    xref += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return Buffer.from(header + body + xref + trailer, 'utf8');
}
