import type { ISecurityFieldsRepository, UpdatePolicyInput } from '@/domain/repositories/ISecurityFieldsRepository.js'
import { PolicyNotFoundError } from '@/domain/errors/SecurityFieldsErrors.js'

export class UpdatePolicyUseCase {
  constructor(private readonly repo: ISecurityFieldsRepository) {}

  async execute(tenantId: number, id: number, input: UpdatePolicyInput): Promise<unknown> {
    const existing = await this.repo.getPolicyById(tenantId, id)
    if (!existing) throw new PolicyNotFoundError(id)
    return this.repo.updatePolicy(tenantId, id, input)
  }
}
