import type { CreatePolicyInput, ISecurityFieldsRepository } from '@/modules/security-fields/domain/ports/ISecurityFieldsRepository.js'

export class CreatePolicyUseCase {
  constructor(private readonly repo: ISecurityFieldsRepository) {}

  async execute(tenantId: number, input: CreatePolicyInput): Promise<unknown> {
    return this.repo.createPolicy(tenantId, input)
  }
}
