import type { IObraRepository } from '@/modules/obras/domain/ports/IObraRepository.js'
import { ObraAccessDeniedError } from '@/modules/obras/domain/errors/ObraErrors.js'
import type { CreateObraDto } from '@/modules/obras/application/dtos/createObraDto.js'

export class CreateObraUseCase {
  constructor(private readonly repo: IObraRepository) {}

  async execute(tenantId: number, input: CreateObraDto) {
    return this.repo.create(tenantId, input)
  }
}
