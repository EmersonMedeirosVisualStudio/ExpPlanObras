import { PrismaPlaybooksRepository } from '@/infra/database/repositories/PrismaPlaybooksRepository.js'
import { CreatePlaybookUseCase } from '@/application/use-cases/playbooks/commands/CreatePlaybook.js'
import { UpdatePlaybookUseCase } from '@/application/use-cases/playbooks/commands/UpdatePlaybook.js'
import { SimularPlaybookUseCase } from '@/application/use-cases/playbooks/commands/SimularPlaybook.js'
import { ExecutarPlaybookUseCase } from '@/application/use-cases/playbooks/commands/ExecutarPlaybook.js'
import { AprovarExecucaoUseCase } from '@/application/use-cases/playbooks/commands/AprovarExecucao.js'
import { CancelarExecucaoUseCase } from '@/application/use-cases/playbooks/commands/CancelarExecucao.js'
import { CreateIncidenteTimelineUseCase } from '@/application/use-cases/playbooks/commands/CreateIncidenteTimeline.js'
import { CreateCasoComplianceUseCase } from '@/application/use-cases/playbooks/commands/CreateCasoCompliance.js'
import { CreateEvidenciaUseCase } from '@/application/use-cases/playbooks/commands/CreateEvidencia.js'
import { EncerrarCasoComplianceUseCase } from '@/application/use-cases/playbooks/commands/EncerrarCasoCompliance.js'
import { ListPlaybooksUseCase } from '@/application/use-cases/playbooks/queries/ListPlaybooks.js'
import { GetPlaybookByIdUseCase } from '@/application/use-cases/playbooks/queries/GetPlaybookById.js'
import { ListExecucoesUseCase } from '@/application/use-cases/playbooks/queries/ListExecucoes.js'
import { GetIncidenteByIdUseCase } from '@/application/use-cases/playbooks/queries/GetIncidenteById.js'
import { ListIncidenteTimelineUseCase } from '@/application/use-cases/playbooks/queries/ListIncidenteTimeline.js'
import { ListCasosComplianceUseCase } from '@/application/use-cases/playbooks/queries/ListCasosCompliance.js'
import { GetCasoComplianceByIdUseCase } from '@/application/use-cases/playbooks/queries/GetCasoComplianceById.js'

export function makePlaybooksUseCases() {
  const repo = new PrismaPlaybooksRepository()

  return {
    // Commands
    createPlaybook: new CreatePlaybookUseCase(repo),
    updatePlaybook: new UpdatePlaybookUseCase(repo),
    simularPlaybook: new SimularPlaybookUseCase(repo),
    executarPlaybook: new ExecutarPlaybookUseCase(),
    aprovarExecucao: new AprovarExecucaoUseCase(),
    cancelarExecucao: new CancelarExecucaoUseCase(),
    createIncidenteTimeline: new CreateIncidenteTimelineUseCase(repo),
    createCasoCompliance: new CreateCasoComplianceUseCase(repo),
    createEvidencia: new CreateEvidenciaUseCase(repo),
    encerrarCasoCompliance: new EncerrarCasoComplianceUseCase(repo),

    // Queries
    listPlaybooks: new ListPlaybooksUseCase(repo),
    getPlaybookById: new GetPlaybookByIdUseCase(repo),
    listExecucoes: new ListExecucoesUseCase(repo),
    getIncidenteById: new GetIncidenteByIdUseCase(repo),
    listIncidenteTimeline: new ListIncidenteTimelineUseCase(repo),
    listCasosCompliance: new ListCasosComplianceUseCase(repo),
    getCasoComplianceById: new GetCasoComplianceByIdUseCase(repo),

    // Repo exposed for auth checks (getTenantUserRole)
    repo,
  }
}
