import { PrismaObservabilidadeRepository } from '@/infra/database/repositories/PrismaObservabilidadeRepository.js'
import { CreateEventoUseCase } from '@/application/use-cases/observabilidade/commands/CreateEvento.js'
import { ListEventosUseCase } from '@/application/use-cases/observabilidade/queries/ListEventos.js'
import { GetEventoByIdUseCase } from '@/application/use-cases/observabilidade/queries/GetEventoById.js'
import { ListAlertasUseCase } from '@/application/use-cases/observabilidade/queries/ListAlertas.js'
import { ListIncidentesUseCase } from '@/application/use-cases/observabilidade/queries/ListIncidentes.js'
import { GetIncidenteByIdUseCase } from '@/application/use-cases/observabilidade/queries/GetIncidenteById.js'
import { ListRegrasUseCase } from '@/application/use-cases/observabilidade/queries/ListRegras.js'

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
