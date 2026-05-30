import type { Tenant } from '@/domain/entities/Tenant.js'

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function daysLeft(expiresAt: Date, now: Date): number {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(expiresAt)
  end.setHours(0, 0, 0, 0)
  return Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))
}

export function buildSubscriptionAlert(tenant: Tenant): string | null {
  const now = new Date()
  const status = String(tenant.subscriptionStatus || 'NONE')
  const graceDays = Number(process.env.GRACE_DAYS || '10')

  if (status === 'ACTIVE' && tenant.paidUntil) {
    if (daysLeft(tenant.paidUntil, now) === 15)
      return 'Sua assinatura vencerá em 15 dias. Regularize para evitar bloqueio do sistema.'
    if (tenant.paidUntil < now) {
      const graceEndsAt = addDays(tenant.paidUntil, graceDays)
      if (now <= graceEndsAt) {
        const gLeft = Math.max(0, daysLeft(graceEndsAt, now))
        return `Sua assinatura está vencida. Você tem ${gLeft} dia(s) para regularizar.`
      }
      return 'Assinatura expirada. Faça uma assinatura para reativação.'
    }
    return null
  }

  if (status === 'TRIAL' && tenant.trialEndsAt) {
    const left = daysLeft(tenant.trialEndsAt, now)
    if (left === 10) return 'Seu período de teste termina em 10 dias.'
    if (left === 5) return 'Seu período de teste termina em 5 dias.'
    if (tenant.trialEndsAt < now) return 'Período de teste expirou. Faça uma assinatura para reativação.'
    return null
  }

  if (status === 'GRACE_PERIOD') {
    const graceEndsAt =
      tenant.gracePeriodEndsAt ||
      (tenant.paidUntil
        ? addDays(tenant.paidUntil, graceDays)
        : addDays(now, -1))
    if (now <= graceEndsAt) {
      const gLeft = Math.max(0, daysLeft(graceEndsAt, now))
      return `Sua assinatura está vencida. Você tem ${gLeft} dia(s) para regularizar.`
    }
    return 'Assinatura expirada. Faça uma assinatura para reativação.'
  }

  if (status === 'EXPIRED') return 'Assinatura expirada. Faça uma assinatura para reativação.'
  if (status === 'NONE') return 'Sem assinatura. Faça uma assinatura para reativação.'
  return null
}
