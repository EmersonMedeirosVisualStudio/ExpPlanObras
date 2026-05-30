import type { IDocumentosQualificadosRepository, ProvedorRow } from '@/modules/documentos-qualificados/domain/ports/IDocumentosQualificadosRepository.js'
import {
  SecretsKeyNotConfiguredError,
  SecretEncryptionError,
} from '@/modules/documentos-qualificados/domain/errors/DocumentosQualificadosErrors.js'
import { encryptSecret, hasSecretsKey } from '@/modules/documentos-qualificados/crypto.js'

export interface CreateProvedorUseCaseInput {
  nome: string
  codigo: string
  tipo: string
  ambiente: string
  baseUrl: string
  clientId?: string | null
  clientSecret?: string | null
  apiKey?: string | null
  configuracaoJson?: unknown
  ativo: boolean
}

export interface CreateProvedorResult {
  id: number
  hasSecretsKey: boolean
}

export class CreateProvedorUseCase {
  constructor(private readonly repo: IDocumentosQualificadosRepository) {}

  async execute(tenantId: number, input: CreateProvedorUseCaseInput): Promise<CreateProvedorResult> {
    let clientSecretEnc: string | null = null
    let apiKeyEnc: string | null = null

    try {
      if (input.clientSecret) clientSecretEnc = encryptSecret(String(input.clientSecret))
      if (input.apiKey) apiKeyEnc = encryptSecret(String(input.apiKey))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('APP_SECRETS_KEY_MISSING') && (input.clientSecret || input.apiKey)) {
        throw new SecretsKeyNotConfiguredError()
      }
      throw new SecretEncryptionError()
    }

    const created: ProvedorRow = await this.repo.createProvedor(tenantId, {
      nome: String(input.nome),
      codigo: String(input.codigo).trim().toUpperCase(),
      tipo: String(input.tipo),
      ambiente: String(input.ambiente),
      baseUrl: String(input.baseUrl),
      clientId: input.clientId ? String(input.clientId) : null,
      clientSecretCriptografado: clientSecretEnc,
      apiKeyCriptografada: apiKeyEnc,
      configuracaoJson: input.configuracaoJson ?? null,
      ativo: input.ativo !== false,
    })

    return { id: created.id, hasSecretsKey: hasSecretsKey() }
  }
}
