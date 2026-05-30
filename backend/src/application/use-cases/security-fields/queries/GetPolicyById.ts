import type { ISecurityFieldsRepository } from '@/domain/repositories/ISecurityFieldsRepository.js'
import { PolicyNotFoundError } from '@/domain/errors/SecurityFieldsErrors.js'

export class GetPolicyByIdUseCase {
  constructor(private readonly repo: ISecurityFieldsRepository) {}

  async execute(tenantId: number, id: number): Promise<unknown> {
    const policy = await this.repo.getPolicyById(tenantId, id)
    if (!policy) throw new PolicyNotFoundError(id)
    return policy
  }
}
