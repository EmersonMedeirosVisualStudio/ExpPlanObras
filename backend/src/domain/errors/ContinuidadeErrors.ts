import { AppError } from '@/shared/errors/AppError.js'

export class BcpPlanoNotFoundError extends AppError {
  constructor(id?: number) {
    super(id ? `BCP plan ${id} not found` : 'BCP plan not found', 404, 'NOT_FOUND')
    this.name = 'BcpPlanoNotFoundError'
  }
}

export class DrExecucaoNotFoundError extends AppError {
  constructor(id?: number) {
    super(id ? `DR execution ${id} not found` : 'DR execution not found', 404, 'NOT_FOUND')
    this.name = 'DrExecucaoNotFoundError'
  }
}

export class DrExecucaoInvalidStatusError extends AppError {
  constructor(current: string) {
    super(`Cannot transition from status "${current}"`, 400, 'UNPROCESSABLE')
    this.name = 'DrExecucaoInvalidStatusError'
  }
}

export class CriseRegistroNotFoundError extends AppError {
  constructor(id?: number) {
    super(id ? `Crisis record ${id} not found` : 'Crisis record not found', 404, 'NOT_FOUND')
    this.name = 'CriseRegistroNotFoundError'
  }
}
