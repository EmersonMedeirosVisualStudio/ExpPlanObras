import { PrismaSecurityFieldsRepository } from '@/infra/database/repositories/PrismaSecurityFieldsRepository.js'
import { CreatePolicyUseCase } from '@/application/use-cases/security-fields/commands/CreatePolicy.js'
import { UpdatePolicyUseCase } from '@/application/use-cases/security-fields/commands/UpdatePolicy.js'
import { GetPolicyByIdUseCase } from '@/application/use-cases/security-fields/queries/GetPolicyById.js'
import { ListAuditLogsUseCase } from '@/application/use-cases/security-fields/queries/ListAuditLogs.js'
import { ListPoliciesUseCase } from '@/application/use-cases/security-fields/queries/ListPolicies.js'

export function makeSecurityFieldsUseCases() {
  const repo = new PrismaSecurityFieldsRepository()

  return {
    listPolicies: new ListPoliciesUseCase(repo),
    getPolicyById: new GetPolicyByIdUseCase(repo),
    createPolicy: new CreatePolicyUseCase(repo),
    updatePolicy: new UpdatePolicyUseCase(repo),
    listAuditLogs: new ListAuditLogsUseCase(repo),
    repo,
  }
}
