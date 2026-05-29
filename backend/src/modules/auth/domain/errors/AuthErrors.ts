import { AppError } from '@/shared/errors/AppError.js'

export class InvalidCredentialsError extends AppError {
  constructor() {
    super('Invalid credentials', 401, 'UNAUTHORIZED')
    this.name = 'InvalidCredentialsError'
  }
}

export class UserNotFoundError extends AppError {
  constructor() {
    super('User not found', 404, 'NOT_FOUND')
    this.name = 'UserNotFoundError'
  }
}

export class UserAlreadyExistsError extends AppError {
  constructor() {
    super('Email, CPF, CNPJ or Tenant Slug already exists', 409, 'CONFLICT')
    this.name = 'UserAlreadyExistsError'
  }
}

export class TenantAccessDeniedError extends AppError {
  constructor() {
    super('User does not belong to this tenant', 403, 'FORBIDDEN')
    this.name = 'TenantAccessDeniedError'
  }
}
