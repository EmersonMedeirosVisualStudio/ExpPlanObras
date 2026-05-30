import type { ISecurityFieldsRepository } from '@/modules/security-fields/domain/ports/ISecurityFieldsRepository.js'
import { PolicyNotFoundError } from '@/modules/security-fields/domain/errors/SecurityFieldsErrors.js'

export class GetPolicyByIdUseCase {
  constructor(private readonly repo: ISecurityFieldsRepository) {}

  async execute(tenantId: number, id: number): Promise<unknown> {
    const policy = await this.repo.getPolicyById(tenantId, id)
    if (!policy) throw new PolicyNotFoundError(id)
    return policy
  }
}
