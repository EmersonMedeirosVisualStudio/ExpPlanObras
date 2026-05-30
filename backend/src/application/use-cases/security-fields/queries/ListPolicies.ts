import type { ISecurityFieldsRepository, ListPoliciesFilter, ListPoliciesResult } from '@/domain/repositories/ISecurityFieldsRepository.js'

export class ListPoliciesUseCase {
  constructor(private readonly repo: ISecurityFieldsRepository) {}

  async execute(tenantId: number, filter: ListPoliciesFilter): Promise<ListPoliciesResult> {
    return this.repo.listPolicies(tenantId, filter)
  }
}
