import type { DashboardExportDataDTO } from './types';
import { createZip } from './zip';

type Cell = string | number | null | undefined;
type Row = Cell[];

function xmlEscape(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function colName(n: number) {
  let s = '';
  let x = n;
  while (x > 0) {
    const r = (x - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

function sheetXml(rows: Row[]) {
  const lines: string[] = [];
  lines.push(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`);
  lines.push(`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`);
  lines.push(`<sheetData>`);
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const rIdx = r + 1;
    lines.push(`<row r="${rIdx}">`);
    for (let c = 0; c < row.length; c++) {
      const v = row[c];
      if (v === null || v === undefined || v === '') continue;
      const addr = `${colName(c + 1)}${rIdx}`;
      if (typeof v === 'number' && Number.isFinite(v)) {
        lines.push(`<c r="${addr}"><v>${v}</v></c>`);
      } else {
        const s = xmlEscape(String(v));
        lines.push(`<c r="${addr}" t="inlineStr"><is><t>${s}</t></is></c>`);
      }
    }
    lines.push(`</row>`);
  }
  lines.push(`</sheetData>`);
  lines.push(`</worksheet>`);
  return Buffer.from(lines.join(''), 'utf8');
}

function normalizeSheetName(name: string) {
  const cleaned = name.replace(/[\\/*?:\[\]]/g, ' ').trim();
  return (cleaned || 'Sheet').slice(0, 31);
}

function buildResumoRows(data: DashboardExportDataDTO): Row[] {
  const rows: Row[] = [];
  rows.push([data.titulo]);
  if (data.subtitulo) rows.push([data.subtitulo]);
  rows.push([new Date().toLocaleString('pt-BR')]);
  rows.push([]);
  if (data.filtrosAplicados) {
    rows.push(['Filtros']);
    for (const [k, v] of Object.entries(data.filtrosAplicados)) rows.push([k, v]);
    rows.push([]);
  }
  if (data.cards?.length) {
    rows.push(['Cards']);
    rows.push(['Indicador', 'Valor']);
    for (const c of data.cards) rows.push([c.label, c.valor as any]);
    rows.push([]);
  }
  if (data.alertas?.length) {
    rows.push(['Alertas']);
    rows.push(['Tipo', 'Título', 'Subtítulo', 'Criticidade']);
    for (const a of data.alertas) rows.push([a.tipo, a.titulo, a.subtitulo || '', a.criticidade || '']);
    rows.push([]);
  }
  return rows;
}

function buildSeriesRows(series: DashboardExportDataDTO['series']): Row[] {
  const set = new Set<string>();
  for (const s of series || []) {
    for (const k of Object.keys(s || {})) set.add(k);
  }
  const keys: string[] = Array.from(set);
  const idxRef = keys.indexOf('referencia');
  if (idxRef > 0) keys.unshift(keys.splice(idxRef, 1)[0]);

  const header: Row = keys;
  const rows: Row[] = [header];
  for (const s of series || []) {
    const r: Row = keys.map((k) => {
      const v = (s as any)[k];
      if (v === null || v === undefined) return '';
      if (typeof v === 'string' || typeof v === 'number') return v;
      return String(v);
    });
    rows.push(r);
  }
  return rows;
}

export async function renderXlsx(data: DashboardExportDataDTO): Promise<Buffer> {
  const sheets: { name: string; rows: Row[] }[] = [];
  sheets.push({ name: 'Resumo', rows: buildResumoRows(data) });
  if (data.series?.length) sheets.push({ name: 'Series', rows: buildSeriesRows(data.series) });
  if (data.tabelas?.length) {
    for (const t of data.tabelas) {
      const rows: Row[] = [t.colunas, ...(t.linhas as Row[])];
      sheets.push({ name: normalizeSheetName(t.titulo), rows });
    }
  }

  const workbookXml = (() => {
    const lines: string[] = [];
    lines.push(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`);
    lines.push(`<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`);
    lines.push(`<sheets>`);
    for (let i = 0; i < sheets.length; i++) {
      lines.push(`<sheet name="${xmlEscape(sheets[i].name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`);
    }
    lines.push(`</sheets>`);
    lines.push(`</workbook>`);
    return Buffer.from(lines.join(''), 'utf8');
  })();

  const workbookRelsXml = (() => {
    const lines: string[] = [];
    lines.push(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`);
    lines.push(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`);
    for (let i = 0; i < sheets.length; i++) {
      lines.push(
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
      );
    }
    lines.push(`<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`);
    lines.push(`</Relationships>`);
    return Buffer.from(lines.join(''), 'utf8');
  })();

  const rootRelsXml = Buffer.from(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'utf8'
  );

  const contentTypesXml = (() => {
    const lines: string[] = [];
    lines.push(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`);
    lines.push(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`);
    lines.push(`<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`);
    lines.push(`<Default Extension="xml" ContentType="application/xml"/>`);
    lines.push(`<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`);
    for (let i = 0; i < sheets.length; i++) {
      lines.push(`<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`);
    }
    lines.push(`<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>`);
    lines.push(`</Types>`);
    return Buffer.from(lines.join(''), 'utf8');
  })();

  const stylesXml = Buffer.from(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    'utf8'
  );

  const files: { path: string; data: Buffer }[] = [
    { path: '[Content_Types].xml', data: contentTypesXml },
    { path: '_rels/.rels', data: rootRelsXml },
    { path: 'xl/workbook.xml', data: workbookXml },
    { path: 'xl/_rels/workbook.xml.rels', data: workbookRelsXml },
    { path: 'xl/styles.xml', data: stylesXml },
  ];

  for (let i = 0; i < sheets.length; i++) {
    files.push({ path: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(sheets[i].rows) });
  }

  return createZip(files);
}
