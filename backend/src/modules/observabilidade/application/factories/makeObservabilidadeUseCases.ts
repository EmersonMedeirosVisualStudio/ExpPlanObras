import { PrismaObservabilidadeRepository } from '@/modules/observabilidade/infrastructure/persistence/PrismaObservabilidadeRepository.js'
import { CreateEventoUseCase } from '@/modules/observabilidade/application/use-cases/commands/CreateEvento.js'
import { ListEventosUseCase } from '@/modules/observabilidade/application/use-cases/queries/ListEventos.js'
import { GetEventoByIdUseCase } from '@/modules/observabilidade/application/use-cases/queries/GetEventoById.js'
import { ListAlertasUseCase } from '@/modules/observabilidade/application/use-cases/queries/ListAlertas.js'
import { ListIncidentesUseCase } from '@/modules/observabilidade/application/use-cases/queries/ListIncidentes.js'
import { GetIncidenteByIdUseCase } from '@/modules/observabilidade/application/use-cases/queries/GetIncidenteById.js'
import { ListRegrasUseCase } from '@/modules/observabilidade/application/use-cases/queries/ListRegras.js'

export function makeObservabilidadeUseCases() {
  const repo = new PrismaObservabilidadeRepository()
  return {
    createEvento: new CreateEventoUseCase(repo),
    listEventos: new ListEventosUseCase(repo),
    getEventoById: new GetEventoByIdUseCase(repo),
    listAlertas: new ListAlertasUseCase(repo),
    listIncidentes: new ListIncidentesUseCase(repo),
    getIncidenteById: new GetIncidenteByIdUseCase(repo),
    listRegras: new ListRegrasUseCase(repo),
  }
}
