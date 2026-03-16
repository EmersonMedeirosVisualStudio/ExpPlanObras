export function normalizeWhatsappPhone(input: string) {
  const digits = String(input || '').replace(/\D+/g, '');
  if (digits.length === 0) return '';
  if (digits.startsWith('55')) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export function formatDateBR(date: Date) {
  return date.toLocaleDateString('pt-BR');
}

export function getDaysLeft(expiresAt: Date, now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(expiresAt);
  end.setHours(0, 0, 0, 0);
  const diffMs = end.getTime() - start.getTime();
  return Math.round(diffMs / (24 * 60 * 60 * 1000));
}

export function buildSubscriptionReminder(input: {
  companyName: string;
  representativeName?: string;
  expiresAt: Date;
  daysLeft: number;
  kind: 'TRIAL' | 'RENEWAL' | 'REGULARIZE';
  billingUrl?: string;
  billingUrls?: Array<{ label: string; url: string }>;
  channel: 'EMAIL' | 'WHATSAPP';
}) {
  const dateBr = formatDateBR(input.expiresAt);
  const prefix = input.daysLeft === 30 ? '30 dias' : input.daysLeft === 15 ? '15 dias' : `${input.daysLeft} dias`;
  const who = input.representativeName && input.representativeName.trim().length > 0 ? input.representativeName.trim() : input.companyName;

  const subject =
    input.kind === 'TRIAL'
      ? `Seu período de teste vence em ${prefix} (${dateBr})`
      : input.kind === 'RENEWAL'
        ? `Sua assinatura vence em ${prefix} (${dateBr})`
        : `Regularize sua assinatura (vence em ${prefix} - ${dateBr})`;

  const actionLine =
    input.kind === 'TRIAL'
      ? 'Para continuar com acesso, inicie a assinatura antes do vencimento.'
      : input.kind === 'RENEWAL'
        ? 'Para evitar bloqueio de acesso, renove antes do vencimento.'
        : 'Para liberar o acesso, regularize a assinatura o quanto antes.';

  const urlItems =
    Array.isArray(input.billingUrls) && input.billingUrls.length > 0
      ? input.billingUrls
          .map((i) => ({ label: String(i?.label || '').trim(), url: String(i?.url || '').trim() }))
          .filter((i) => i.label.length > 0 && i.url.length > 0)
      : input.billingUrl && input.billingUrl.trim().length > 0
        ? [{ label: 'Assinar', url: input.billingUrl.trim() }]
        : [];

  const urlLine =
    urlItems.length > 0
      ? `\n\nLink para regularizar/iniciar:\n${urlItems.map((i) => `- ${i.label}: ${i.url}`).join('\n')}`
      : '';

  const email = {
    subject,
    body:
      `Olá, ${who}.\n\n` +
      `Lembrete do ExpPlanObras: ${input.kind === 'TRIAL' ? 'seu período de teste' : 'sua assinatura'} vence em ${prefix} (${dateBr}).\n\n` +
      `${actionLine}${urlLine}\n\n` +
      `Se precisar de ajuda, responda este e-mail.\n\n` +
      `Atenciosamente,\n` +
      `Equipe ExpPlanObras`,
  };

  const whatsapp =
    `Olá, ${who}.\n` +
    `Lembrete do ExpPlanObras: ${input.kind === 'TRIAL' ? 'seu período de teste' : 'sua assinatura'} vence em ${prefix} (${dateBr}).\n` +
    `${actionLine}` +
    `${urlItems.length > 0 ? `\n${urlItems.map((i) => `Link (${i.label}): ${i.url}`).join('\n')}` : ''}\n` +
    `Se precisar de ajuda, responda por aqui.`;

  return input.channel === 'EMAIL' ? email : whatsapp;
}
