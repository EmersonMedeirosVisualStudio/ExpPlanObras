import { AppError } from '@/shared/errors/AppError.js'

export class TenantAlreadyExistsError extends AppError {
  constructor() {
    super('Email, CPF, CNPJ or Slug already exists', 409, 'CONFLICT')
    this.name = 'TenantAlreadyExistsError'
  }
}

export class TenantNotFoundError extends AppError {
  constructor(id?: number) {
    super(id ? `Tenant ${id} not found` : 'Tenant not found', 404, 'NOT_FOUND')
    this.name = 'TenantNotFoundError'
  }
}
