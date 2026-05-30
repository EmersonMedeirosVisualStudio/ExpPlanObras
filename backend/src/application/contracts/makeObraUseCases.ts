import { PrismaObraRepository } from '@/infra/database/repositories/PrismaObraRepository.js'
import { CreateObraUseCase } from '@/application/use-cases/obras/CreateObra.js'
import { DeleteObraUseCase } from '@/application/use-cases/obras/DeleteObra.js'
import { GetObraByIdUseCase } from '@/application/use-cases/obras/GetObraById.js'
import { ListObrasUseCase } from '@/application/use-cases/obras/ListObras.js'
import { UpdateObraUseCase } from '@/application/use-cases/obras/UpdateObra.js'

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
