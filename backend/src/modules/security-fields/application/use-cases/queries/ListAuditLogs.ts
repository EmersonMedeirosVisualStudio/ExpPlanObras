import type { ISecurityFieldsRepository, ListAuditLogsFilter, ListAuditLogsResult } from '@/modules/security-fields/domain/ports/ISecurityFieldsRepository.js'

export class ListAuditLogsUseCase {
  constructor(private readonly repo: ISecurityFieldsRepository) {}

  async execute(tenantId: number, filter: ListAuditLogsFilter): Promise<ListAuditLogsResult> {
    return this.repo.listAuditLogs(tenantId, filter)
  }
}
