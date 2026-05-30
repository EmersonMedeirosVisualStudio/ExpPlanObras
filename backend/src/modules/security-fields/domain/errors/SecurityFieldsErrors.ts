import { AppError } from '@/shared/errors/AppError.js'

export class PolicyNotFoundError extends AppError {
  constructor(id?: number) {
    super(id ? `Policy ${id} not found` : 'Policy not found', 404, 'NOT_FOUND')
    this.name = 'PolicyNotFoundError'
  }
}

export class SecurityFieldsForbiddenError extends AppError {
  constructor(message = 'Acesso negado') {
    super(message, 403, 'FORBIDDEN')
    this.name = 'SecurityFieldsForbiddenError'
  }
}
