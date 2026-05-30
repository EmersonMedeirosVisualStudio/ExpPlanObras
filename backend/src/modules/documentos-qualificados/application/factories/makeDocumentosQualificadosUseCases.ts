import { PrismaDocumentosQualificadosRepository } from '@/modules/documentos-qualificados/infrastructure/persistence/PrismaDocumentosQualificadosRepository.js'
import { CheckAdminOrEncarregadoUseCase } from '@/modules/documentos-qualificados/application/use-cases/CheckAdminOrEncarregado.js'
import { ListProvedoresUseCase } from '@/modules/documentos-qualificados/application/use-cases/ListProvedores.js'
import { CreateProvedorUseCase } from '@/modules/documentos-qualificados/application/use-cases/CreateProvedor.js'
import { CreateSolicitacaoUseCase } from '@/modules/documentos-qualificados/application/use-cases/CreateSolicitacao.js'
import { ListSolicitacoesUseCase } from '@/modules/documentos-qualificados/application/use-cases/ListSolicitacoes.js'
import { GetSolicitacaoByIdUseCase } from '@/modules/documentos-qualificados/application/use-cases/GetSolicitacaoById.js'
import { EnviarSolicitacaoUseCase } from '@/modules/documentos-qualificados/application/use-cases/EnviarSolicitacao.js'
import { SincronizarSolicitacaoUseCase } from '@/modules/documentos-qualificados/application/use-cases/SincronizarSolicitacao.js'
import { CancelarSolicitacaoUseCase } from '@/modules/documentos-qualificados/application/use-cases/CancelarSolicitacao.js'
import { ListArtefatosUseCase } from '@/modules/documentos-qualificados/application/use-cases/ListArtefatos.js'
import { VerificarAssinaturaUseCase } from '@/modules/documentos-qualificados/application/use-cases/VerificarAssinatura.js'
import { CreateCallbackUseCase } from '@/modules/documentos-qualificados/application/use-cases/CreateCallback.js'

export function makeDocumentosQualificadosUseCases() {
  const repo = new PrismaDocumentosQualificadosRepository()

  return {
    checkAdminOrEncarregado: new CheckAdminOrEncarregadoUseCase(repo),
    listProvedores: new ListProvedoresUseCase(repo),
    createProvedor: new CreateProvedorUseCase(repo),
    createSolicitacao: new CreateSolicitacaoUseCase(repo),
    listSolicitacoes: new ListSolicitacoesUseCase(repo),
    getSolicitacaoById: new GetSolicitacaoByIdUseCase(repo),
    enviarSolicitacao: new EnviarSolicitacaoUseCase(repo),
    sincronizarSolicitacao: new SincronizarSolicitacaoUseCase(repo),
    cancelarSolicitacao: new CancelarSolicitacaoUseCase(repo),
    listArtefatos: new ListArtefatosUseCase(repo),
    verificarAssinatura: new VerificarAssinaturaUseCase(repo),
    createCallback: new CreateCallbackUseCase(repo),
  }
}
