import { PrismaSecurityFieldsRepository } from '@/modules/security-fields/infrastructure/persistence/PrismaSecurityFieldsRepository.js'
import { CreatePolicyUseCase } from '@/modules/security-fields/application/use-cases/commands/CreatePolicy.js'
import { UpdatePolicyUseCase } from '@/modules/security-fields/application/use-cases/commands/UpdatePolicy.js'
import { GetPolicyByIdUseCase } from '@/modules/security-fields/application/use-cases/queries/GetPolicyById.js'
import { ListAuditLogsUseCase } from '@/modules/security-fields/application/use-cases/queries/ListAuditLogs.js'
import { ListPoliciesUseCase } from '@/modules/security-fields/application/use-cases/queries/ListPolicies.js'

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
