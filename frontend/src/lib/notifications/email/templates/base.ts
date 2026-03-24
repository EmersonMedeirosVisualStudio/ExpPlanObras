export function renderBaseEmail(args: { titulo: string; conteudoHtml: string; conteudoText: string }) {
  const html = `<!doctype html><html><head><meta charset="utf-8"/></head><body style="font-family: Arial, sans-serif; color: #111; line-height: 1.4;">
  <div style="max-width: 680px; margin: 0 auto; padding: 24px;">
    <h2 style="margin: 0 0 12px 0;">${args.titulo}</h2>
    ${args.conteudoHtml}
    <hr style="margin: 24px 0; border: none; border-top: 1px solid #eee;" />
    <div style="font-size: 12px; color: #666;">Mensagem automática do sistema.</div>
  </div>
  </body></html>`;
  const text = `${args.titulo}\n\n${args.conteudoText}\n\n---\nMensagem automática do sistema.`;
  return { html, text };
}

