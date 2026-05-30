export interface IBillingRepository {
  createCheckout(tenantId: number, payerEmail: string, plan: 'ANNUAL' | 'BIENNIAL'): Promise<{ initPoint: string; externalId: string }>
  findTenantByCnpj(cnpj: string): Promise<{ id: number } | null>
}
