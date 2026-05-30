import type { ISecurityFieldsRepository, UpdatePolicyInput } from '@/modules/security-fields/domain/ports/ISecurityFieldsRepository.js'
import { PolicyNotFoundError } from '@/modules/security-fields/domain/errors/SecurityFieldsErrors.js'

export class UpdatePolicyUseCase {
  constructor(private readonly repo: ISecurityFieldsRepository) {}

  async execute(tenantId: number, id: number, input: UpdatePolicyInput): Promise<unknown> {
    const existing = await this.repo.getPolicyById(tenantId, id)
    if (!existing) throw new PolicyNotFoundError(id)
    return this.repo.updatePolicy(tenantId, id, input)
  }
}
