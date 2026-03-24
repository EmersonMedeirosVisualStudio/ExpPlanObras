import type { EmailTemplateBuildInput, EmailTemplateBuildOutput } from '../types';
import { renderBaseEmail } from './base';

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildDigestoDiarioTemplate(input: EmailTemplateBuildInput): EmailTemplateBuildOutput {
  const itens = input.itensDigesto || [];
  const assunto = `Digesto diário de notificações (${new Date().toISOString().slice(0, 10)})`;

  const htmlList = itens
    .slice(0, 50)
    .map((it) => `<li style="margin-bottom: 8px;"><strong>[${esc(it.modulo)}]</strong> ${esc(it.titulo)}<br/><span style="color:#555;">${esc(it.mensagem)}</span></li>`)
    .join('');
  const html = renderBaseEmail({
    titulo: 'Digesto diário',
    conteudoHtml: `<div style="margin-bottom: 10px;">Olá, <strong>${esc(input.usuario.nome)}</strong>.</div><ul style="padding-left: 18px;">${htmlList || '<li>Sem notificações relevantes.</li>'}</ul>`,
    conteudoText: `Olá, ${input.usuario.nome}.\n\n${itens.map((it) => `[${it.modulo}] ${it.titulo} - ${it.mensagem}`).join('\n') || 'Sem notificações relevantes.'}`,
  });

  return { assunto, html: html.html, text: html.text };
}

