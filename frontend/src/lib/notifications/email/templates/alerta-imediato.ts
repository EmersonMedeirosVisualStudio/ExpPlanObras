import type { EmailTemplateBuildInput, EmailTemplateBuildOutput } from '../types';
import { renderBaseEmail } from './base';

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildAlertaImediatoTemplate(input: EmailTemplateBuildInput): EmailTemplateBuildOutput {
  const n = input.notificacao;
  const assunto = `[${n.modulo}] ${n.titulo}`.slice(0, 180);

  const link = n.rota ? `${n.rota}` : null;
  const htmlParts: string[] = [];
  htmlParts.push(`<div style="font-size: 14px; margin-bottom: 10px;">Olá, <strong>${esc(input.usuario.nome)}</strong>.</div>`);
  htmlParts.push(`<div style="font-size: 13px; color: #444; margin-bottom: 10px;">Severidade: <strong>${esc(n.severidade)}</strong></div>`);
  htmlParts.push(`<div style="font-size: 14px; margin-bottom: 12px;">${esc(n.mensagem)}</div>`);
  if (link) {
    htmlParts.push(
      `<a href="${esc(link)}" style="display: inline-block; padding: 10px 14px; background: #2563eb; color: #fff; border-radius: 8px; text-decoration: none; font-size: 14px;">Abrir no sistema</a>`
    );
  }

  const textParts: string[] = [];
  textParts.push(`Olá, ${input.usuario.nome}.`);
  textParts.push(`Módulo: ${n.modulo}`);
  textParts.push(`Severidade: ${n.severidade}`);
  textParts.push(n.mensagem);
  if (link) textParts.push(`Abrir: ${link}`);

  const base = renderBaseEmail({ titulo: esc(n.titulo), conteudoHtml: htmlParts.join(''), conteudoText: textParts.join('\n') });
  return { assunto, html: base.html, text: base.text };
}

