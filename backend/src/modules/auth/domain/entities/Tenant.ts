export interface Tenant {
  id: number
  name: string
  slug: string
  status: string
  subscriptionStatus: string | null
  trialEndsAt: Date | null
  paidUntil: Date | null
  gracePeriodEndsAt: Date | null
}
