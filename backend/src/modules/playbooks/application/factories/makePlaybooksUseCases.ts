import { PrismaPlaybooksRepository } from '@/modules/playbooks/infrastructure/persistence/PrismaPlaybooksRepository.js'
import { CreatePlaybookUseCase } from '@/modules/playbooks/application/use-cases/commands/CreatePlaybook.js'
import { UpdatePlaybookUseCase } from '@/modules/playbooks/application/use-cases/commands/UpdatePlaybook.js'
import { SimularPlaybookUseCase } from '@/modules/playbooks/application/use-cases/commands/SimularPlaybook.js'
import { ExecutarPlaybookUseCase } from '@/modules/playbooks/application/use-cases/commands/ExecutarPlaybook.js'
import { AprovarExecucaoUseCase } from '@/modules/playbooks/application/use-cases/commands/AprovarExecucao.js'
import { CancelarExecucaoUseCase } from '@/modules/playbooks/application/use-cases/commands/CancelarExecucao.js'
import { CreateIncidenteTimelineUseCase } from '@/modules/playbooks/application/use-cases/commands/CreateIncidenteTimeline.js'
import { CreateCasoComplianceUseCase } from '@/modules/playbooks/application/use-cases/commands/CreateCasoCompliance.js'
import { CreateEvidenciaUseCase } from '@/modules/playbooks/application/use-cases/commands/CreateEvidencia.js'
import { EncerrarCasoComplianceUseCase } from '@/modules/playbooks/application/use-cases/commands/EncerrarCasoCompliance.js'
import { ListPlaybooksUseCase } from '@/modules/playbooks/application/use-cases/queries/ListPlaybooks.js'
import { GetPlaybookByIdUseCase } from '@/modules/playbooks/application/use-cases/queries/GetPlaybookById.js'
import { ListExecucoesUseCase } from '@/modules/playbooks/application/use-cases/queries/ListExecucoes.js'
import { GetIncidenteByIdUseCase } from '@/modules/playbooks/application/use-cases/queries/GetIncidenteById.js'
import { ListIncidenteTimelineUseCase } from '@/modules/playbooks/application/use-cases/queries/ListIncidenteTimeline.js'
import { ListCasosComplianceUseCase } from '@/modules/playbooks/application/use-cases/queries/ListCasosCompliance.js'
import { GetCasoComplianceByIdUseCase } from '@/modules/playbooks/application/use-cases/queries/GetCasoComplianceById.js'

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
