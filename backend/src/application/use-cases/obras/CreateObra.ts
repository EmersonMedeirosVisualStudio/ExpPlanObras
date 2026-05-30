import type { IObraRepository } from '@/domain/repositories/IObraRepository.js'
import { ObraAccessDeniedError } from '@/domain/errors/ObraErrors.js'
import type { CreateObraDto } from '@/application/dto/obras/createObraDto.js'

export class CreateObraUseCase {
  constructor(private readonly repo: IObraRepository) {}

  async execute(tenantId: number, input: CreateObraDto) {
    return this.repo.create(tenantId, input)
  }
}
