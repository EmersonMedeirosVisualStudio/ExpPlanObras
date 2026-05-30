import { PrismaDocumentosRepository } from '@/infra/database/repositories/PrismaDocumentosRepository.js'
import { CancelarDocumentoUseCase } from '@/application/use-cases/documentos/commands/CancelarDocumento.js'
import { CreateDocumentoUseCase } from '@/application/use-cases/documentos/commands/CreateDocumento.js'
import { CreateVersaoUseCase } from '@/application/use-cases/documentos/commands/CreateVersao.js'
import { ExecutarAcaoUseCase } from '@/application/use-cases/documentos/commands/ExecutarAcao.js'
import { UpdateDocumentoUseCase } from '@/application/use-cases/documentos/commands/UpdateDocumento.js'
import { UpdateFluxoUseCase } from '@/application/use-cases/documentos/commands/UpdateFluxo.js'
import { DownloadVersaoUseCase } from '@/application/use-cases/documentos/queries/DownloadVersao.js'
import { GetDocumentoByIdUseCase } from '@/application/use-cases/documentos/queries/GetDocumentoById.js'
import { GetVersaoByIdUseCase } from '@/application/use-cases/documentos/queries/GetVersaoById.js'
import { ListDocumentosUseCase } from '@/application/use-cases/documentos/queries/ListDocumentos.js'
import { VerificarByTokenUseCase } from '@/application/use-cases/documentos/queries/VerificarByToken.js'
import { VerificarVersaoUseCase } from '@/application/use-cases/documentos/queries/VerificarVersao.js'

export function makeDocumentosUseCases() {
  const repo = new PrismaDocumentosRepository()

  return {
    // commands
    cancelarDocumento: new CancelarDocumentoUseCase(repo),
    createDocumento: new CreateDocumentoUseCase(repo),
    createVersao: new CreateVersaoUseCase(repo),
    executarAcao: new ExecutarAcaoUseCase(repo),
    updateDocumento: new UpdateDocumentoUseCase(repo),
    updateFluxo: new UpdateFluxoUseCase(repo),

    // queries
    downloadVersao: new DownloadVersaoUseCase(repo),
    getDocumentoById: new GetDocumentoByIdUseCase(repo),
    getVersaoById: new GetVersaoByIdUseCase(repo),
    listDocumentos: new ListDocumentosUseCase(repo),
    verificarByToken: new VerificarByTokenUseCase(repo),
    verificarVersao: new VerificarVersaoUseCase(repo),

    // repo exposed for direct port access when needed
    repo,
  }
}
