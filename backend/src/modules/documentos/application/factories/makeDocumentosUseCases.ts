import { PrismaDocumentosRepository } from '@/modules/documentos/infrastructure/persistence/PrismaDocumentosRepository.js'
import { CancelarDocumentoUseCase } from '@/modules/documentos/application/use-cases/commands/CancelarDocumento.js'
import { CreateDocumentoUseCase } from '@/modules/documentos/application/use-cases/commands/CreateDocumento.js'
import { CreateVersaoUseCase } from '@/modules/documentos/application/use-cases/commands/CreateVersao.js'
import { ExecutarAcaoUseCase } from '@/modules/documentos/application/use-cases/commands/ExecutarAcao.js'
import { UpdateDocumentoUseCase } from '@/modules/documentos/application/use-cases/commands/UpdateDocumento.js'
import { UpdateFluxoUseCase } from '@/modules/documentos/application/use-cases/commands/UpdateFluxo.js'
import { DownloadVersaoUseCase } from '@/modules/documentos/application/use-cases/queries/DownloadVersao.js'
import { GetDocumentoByIdUseCase } from '@/modules/documentos/application/use-cases/queries/GetDocumentoById.js'
import { GetVersaoByIdUseCase } from '@/modules/documentos/application/use-cases/queries/GetVersaoById.js'
import { ListDocumentosUseCase } from '@/modules/documentos/application/use-cases/queries/ListDocumentos.js'
import { VerificarByTokenUseCase } from '@/modules/documentos/application/use-cases/queries/VerificarByToken.js'
import { VerificarVersaoUseCase } from '@/modules/documentos/application/use-cases/queries/VerificarVersao.js'

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
