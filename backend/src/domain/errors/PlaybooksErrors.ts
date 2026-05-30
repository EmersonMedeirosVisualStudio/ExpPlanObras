import { AppError } from '@/shared/errors/AppError.js'

export class PlaybookNotFoundError extends AppError {
  constructor(id?: number) {
    super(id ? `Playbook ${id} não encontrado` : 'Playbook não encontrado', 404, 'NOT_FOUND')
    this.name = 'PlaybookNotFoundError'
  }
}

export class ExecucaoNotFoundError extends AppError {
  constructor(id?: number) {
    super(id ? `Execução ${id} não encontrada` : 'Execução não encontrada', 404, 'NOT_FOUND')
    this.name = 'ExecucaoNotFoundError'
  }
}

export class ExecucaoInvalidStatusError extends AppError {
  constructor(status: string) {
    super(`Status inválido para esta operação: ${status}`, 400, 'INVALID_STATUS')
    this.name = 'ExecucaoInvalidStatusError'
  }
}

export class ExecucaoQuatroOlhosError extends AppError {
  constructor() {
    super('Política quatro olhos: aprovador não pode ser o mesmo executor', 400, 'QUATRO_OLHOS')
    this.name = 'ExecucaoQuatroOlhosError'
  }
}

export class IncidenteNotFoundError extends AppError {
  constructor(id?: number) {
    super(id ? `Incidente ${id} não encontrado` : 'Incidente não encontrado', 404, 'NOT_FOUND')
    this.name = 'IncidenteNotFoundError'
  }
}

export class CasoComplianceNotFoundError extends AppError {
  constructor(id?: number) {
    super(id ? `Caso de compliance ${id} não encontrado` : 'Caso não encontrado', 404, 'NOT_FOUND')
    this.name = 'CasoComplianceNotFoundError'
  }
}
