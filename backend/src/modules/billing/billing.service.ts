import crypto from 'crypto';
import prisma from '../../plugins/prisma.js';

type BillingPlan = 'ANNUAL' | 'BIENNIAL';

function getEnvNumber(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function getPlanConfig(plan: BillingPlan) {
  const annualPrice = getEnvNumber('MP_ANNUAL_PRICE_BRL', 1200);
  if (plan === 'ANNUAL') {
    return { plan, months: 12, amount: annualPrice, currency: 'BRL' as const };
  }
  const biennial = Math.round(annualPrice * 2 * 0.85 * 100) / 100;
  return { plan, months: 24, amount: biennial, currency: 'BRL' as const };
}

function getAccessToken() {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) {
    throw new Error('Mercado Pago não configurado');
  }
  return token;
}

function getNotificationUrl() {
  const url = process.env.MP_WEBHOOK_URL || process.env.PUBLIC_API_URL;
  if (!url) {
    throw new Error('PUBLIC_API_URL ou MP_WEBHOOK_URL não configurado');
  }
  if (url.startsWith('http')) {
    if (url.includes('/api/webhooks/mercadopago')) return url;
    return `${url.replace(/\/$/, '')}/api/webhooks/mercadopago`;
  }
  throw new Error('URL inválida');
}

function getBackUrl() {
  const url = process.env.PUBLIC_APP_URL;
  if (!url) return undefined;
  return url;
}

export async function createTenantCheckout(tenantId: number, payerEmail: string, plan: BillingPlan) {
  const token = getAccessToken();
  const cfg = getPlanConfig(plan);

  const externalReference = `${tenantId}|${plan}|${payerEmail}`;
  const notificationUrl = getNotificationUrl();
  const backUrl = getBackUrl();

  const idempotencyKey = crypto.randomUUID();
  const res = await fetch('https://api.mercadopago.com/preapproval', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({
      reason: `ExpPlanObras - ${plan}`,
      external_reference: externalReference,
      payer_email: payerEmail,
      back_url: backUrl,
      notification_url: notificationUrl,
      status: 'authorized',
      auto_recurring: {
        frequency: cfg.months,
        frequency_type: 'months',
        transaction_amount: cfg.amount,
        currency_id: cfg.currency,
      },
    }),
  });

  const data: any = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.message || data?.error || 'Falha ao criar assinatura no Mercado Pago';
    throw new Error(msg);
  }

  if (!data?.init_point || !data?.id) {
    throw new Error('Resposta inválida do Mercado Pago');
  }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      billingProvider: 'MERCADOPAGO',
      billingPlan: plan,
      billingExternalId: String(data.id),
    },
  });

  return { initPoint: String(data.init_point), externalId: String(data.id) };
}

export function verifyMercadoPagoSignature(input: {
  xSignature?: string;
  xRequestId?: string;
  dataId?: string;
}) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return { ok: true, skipped: true };

  const xSignature = input.xSignature;
  const xRequestId = input.xRequestId;
  const dataId = input.dataId;

  if (!xSignature || !xRequestId || !dataId) return { ok: false, skipped: false };

  const parts = xSignature.split(',');
  let ts: string | undefined;
  let hash: string | undefined;

  for (const part of parts) {
    const [k, v] = part.split('=', 2);
    if (!k || !v) continue;
    const key = k.trim();
    const value = v.trim();
    if (key === 'ts') ts = value;
    if (key === 'v1') hash = value;
  }

  if (!ts || !hash) return { ok: false, skipped: false };

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const calculated = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  return { ok: calculated === hash, skipped: false };
}

export async function syncTenantFromPreapproval(preapprovalId: string) {
  const token = getAccessToken();

  const res = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(preapprovalId)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  const data: any = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.message || data?.error || 'Falha ao consultar assinatura no Mercado Pago';
    throw new Error(msg);
  }

  const externalRef = String(data?.external_reference || '');
  const [tenantIdStr, plan, email] = externalRef.split('|');
  const tenantId = Number(tenantIdStr);
  if (!Number.isFinite(tenantId)) {
    throw new Error('external_reference inválida');
  }

  const status = String(data?.status || '');
  const cfg = getPlanConfig(plan as BillingPlan);

  const now = new Date();
  const paidUntil = new Date(now);
  paidUntil.setMonth(paidUntil.getMonth() + cfg.months);

  const update: any = {
    billingProvider: 'MERCADOPAGO',
    billingPlan: cfg.plan,
    billingExternalId: String(data?.id || preapprovalId),
  };

  if (status === 'authorized' || status === 'active') {
    update.subscriptionStatus = 'ACTIVE';
    update.paidUntil = paidUntil;
  } else if (status === 'pending') {
    update.subscriptionStatus = 'PAST_DUE';
  } else if (status === 'cancelled' || status === 'cancelled_by_payer') {
    update.subscriptionStatus = 'CANCELED';
  }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: update,
  });

  if (update.subscriptionStatus === 'ACTIVE' && email) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const existing = await prisma.tenantUser.findUnique({
        where: { tenantId_userId: { tenantId, userId: user.id } },
      });
      if (!existing) {
        await prisma.tenantUser.create({
          data: {
            tenantId,
            userId: user.id,
            role: 'ADMIN',
          },
        });
      }
    }
  }

  return { tenantId, status: update.subscriptionStatus || status };
}

