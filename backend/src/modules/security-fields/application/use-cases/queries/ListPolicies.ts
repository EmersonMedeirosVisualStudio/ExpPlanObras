import type { ISecurityFieldsRepository, ListPoliciesFilter, ListPoliciesResult } from '@/modules/security-fields/domain/ports/ISecurityFieldsRepository.js'

export class ListPoliciesUseCase {
  constructor(private readonly repo: ISecurityFieldsRepository) {}

  async execute(tenantId: number, filter: ListPoliciesFilter): Promise<ListPoliciesResult> {
    return this.repo.listPolicies(tenantId, filter)
  }
}
