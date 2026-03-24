import type { EmailTemplateBuildInput, EmailTemplateBuildOutput } from '../types';
import { renderBaseEmail } from './base';

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildRelatorioAgendadoTemplate(input: EmailTemplateBuildInput): EmailTemplateBuildOutput {
  const assunto = input.notificacao.titulo.slice(0, 180);
  const html = renderBaseEmail({
    titulo: esc(input.notificacao.titulo),
    conteudoHtml: `<div style="margin-bottom: 10px;">Olá, <strong>${esc(input.usuario.nome)}</strong>.</div><div style="font-size: 14px;">${esc(
      input.notificacao.mensagem
    )}</div>`,
    conteudoText: `Olá, ${input.usuario.nome}.\n\n${input.notificacao.mensagem}`,
  });
  return { assunto, html: html.html, text: html.text };
}

