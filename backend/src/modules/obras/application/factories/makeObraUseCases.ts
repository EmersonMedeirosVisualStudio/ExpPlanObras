import { PrismaObraRepository } from '@/modules/obras/infrastructure/persistence/PrismaObraRepository.js'
import { CreateObraUseCase } from '@/modules/obras/application/use-cases/CreateObra.js'
import { DeleteObraUseCase } from '@/modules/obras/application/use-cases/DeleteObra.js'
import { GetObraByIdUseCase } from '@/modules/obras/application/use-cases/GetObraById.js'
import { ListObrasUseCase } from '@/modules/obras/application/use-cases/ListObras.js'
import { UpdateObraUseCase } from '@/modules/obras/application/use-cases/UpdateObra.js'

export function makeObraUseCases() {
  const repo = new PrismaObraRepository()
  return {
    create: new CreateObraUseCase(repo),
    update: new UpdateObraUseCase(repo),
    delete: new DeleteObraUseCase(repo),
    getById: new GetObraByIdUseCase(repo),
    list: new ListObrasUseCase(repo),
    repo,
  }
}
