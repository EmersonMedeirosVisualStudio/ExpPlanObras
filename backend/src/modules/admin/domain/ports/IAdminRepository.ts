export interface IAdminRepository {
  listTenants(): Promise<unknown[]>
  createTenant(input: unknown, actorUserId?: number | null): Promise<unknown>
  updateTenant(id: number, input: unknown, actorUserId?: number | null): Promise<unknown>
  deleteTenant(id: number): Promise<unknown>
  grantAccess(id: number, input: { reason: 'PAYMENT' | 'TRIAL_EXTENSION'; days: number }, actorUserId?: number | null): Promise<unknown>
  revokeAccess(id: number, input: { reason: string }, actorUserId?: number | null): Promise<unknown>
  acceptClaim(input: { cnpj: string; email: string; plan: 'ANNUAL' | 'BIENNIAL' }, actorUserId?: number | null): Promise<unknown>
  activateSubscription(id: number, months: number, actorUserId?: number | null): Promise<unknown>
  resetRepresentativePassword(tenantId: number, newPassword: string): Promise<unknown>
  getTenantHistory(tenantId: number): Promise<unknown[]>
  addTenantHistory(tenantId: number, input: { message: string; attachmentUrls?: string[] }, actorUserId?: number | null): Promise<unknown>
  uploadTenantHistoryAttachment(tenantId: number, input: { message: string; files: Array<{ filename: string; mimetype: string; buffer: Buffer }> }, actorUserId?: number | null): Promise<unknown>
  getHistoryAttachment(attachmentId: number): Promise<unknown>
}
