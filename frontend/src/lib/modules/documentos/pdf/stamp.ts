import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export async function stampPdf(args: {
  pdfBytes: Uint8Array;
  titulo: string;
  codigoVerificacao: string;
  verificacaoUrl: string;
  hashOriginal: string;
  assinaturasResumo: Array<{ nome: string; papel: string; decisao: string; dataHora: string; codigo: string }>;
}) {
  const doc = await PDFDocument.load(args.pdfBytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pages = doc.getPages();
  const last = pages[pages.length - 1];
  const { width } = last.getSize();

  const margin = 36;
  const stampWidth = Math.min(300, width - margin * 2);
  const stampHeight = 90;
  const x = width - margin - stampWidth;
  const y = margin;

  last.drawRectangle({ x, y, width: stampWidth, height: stampHeight, color: rgb(0.95, 0.96, 0.98), borderColor: rgb(0.2, 0.2, 0.2), borderWidth: 1 });
  last.drawText('ASSINADO ELETRONICAMENTE', { x: x + 10, y: y + stampHeight - 18, size: 10, font: fontBold, color: rgb(0.05, 0.1, 0.2) });
  last.drawText(args.titulo.slice(0, 60), { x: x + 10, y: y + stampHeight - 32, size: 8, font, color: rgb(0.1, 0.1, 0.1) });
  last.drawText(`Código: ${args.codigoVerificacao}`, { x: x + 10, y: y + stampHeight - 48, size: 8, font, color: rgb(0.1, 0.1, 0.1) });
  last.drawText(`Hash: ${args.hashOriginal.slice(0, 10)}...${args.hashOriginal.slice(-10)}`, { x: x + 10, y: y + stampHeight - 62, size: 8, font, color: rgb(0.1, 0.1, 0.1) });
  last.drawText(args.verificacaoUrl.slice(0, 70), { x: x + 10, y: y + 10, size: 7, font, color: rgb(0.1, 0.1, 0.1) });

  const summary = doc.addPage();
  const { width: sw, height: sh } = summary.getSize();
  let cy = sh - 60;
  summary.drawText('TRILHA DE ASSINATURAS', { x: 40, y: sh - 40, size: 16, font: fontBold, color: rgb(0.05, 0.1, 0.2) });
  summary.drawText(args.titulo, { x: 40, y: sh - 60, size: 10, font, color: rgb(0.1, 0.1, 0.1) });
  summary.drawText(`Código: ${args.codigoVerificacao}`, { x: 40, y: sh - 80, size: 10, font, color: rgb(0.1, 0.1, 0.1) });
  summary.drawText(`URL: ${args.verificacaoUrl}`, { x: 40, y: sh - 95, size: 9, font, color: rgb(0.1, 0.1, 0.1) });
  summary.drawText(`Hash original: ${args.hashOriginal}`, { x: 40, y: sh - 110, size: 8, font, color: rgb(0.1, 0.1, 0.1) });

  cy = sh - 145;
  const lines = args.assinaturasResumo.length ? args.assinaturasResumo : [];
  for (const a of lines) {
    if (cy < 60) break;
    summary.drawText(`${a.dataHora} • ${a.nome} • ${a.papel} • ${a.decisao} • ${a.codigo}`, { x: 40, y: cy, size: 9, font, color: rgb(0.1, 0.1, 0.1) });
    cy -= 14;
  }

  summary.drawText(`Gerado em ${new Date().toLocaleString('pt-BR')}`, { x: 40, y: 40, size: 8, font, color: rgb(0.3, 0.3, 0.3) });

  const out = await doc.save();
  return Buffer.from(out);
}

