import type { CreatePolicyInput, ISecurityFieldsRepository } from '@/domain/repositories/ISecurityFieldsRepository.js'

export class CreatePolicyUseCase {
  constructor(private readonly repo: ISecurityFieldsRepository) {}

  async execute(tenantId: number, input: CreatePolicyInput): Promise<unknown> {
    return this.repo.createPolicy(tenantId, input)
  }
}
