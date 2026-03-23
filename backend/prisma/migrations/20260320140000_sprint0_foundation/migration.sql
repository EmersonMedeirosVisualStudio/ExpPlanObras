CREATE TABLE "Unidade" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipoUnidade" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Unidade_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Funcionario" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL,
    "matricula" TEXT NOT NULL,
    "nomeCompleto" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "email" TEXT,
    "telefone" TEXT,
    "cargo" TEXT,
    "funcaoPrincipal" TEXT,
    "statusFuncional" TEXT NOT NULL DEFAULT 'ATIVO',
    "dataAdmissao" DATETIME,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Funcionario_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "FuncionarioLotacao" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "funcionarioId" INTEGER NOT NULL,
    "tipoLotacao" TEXT NOT NULL,
    "obraId" INTEGER,
    "unidadeId" INTEGER,
    "dataInicio" DATETIME NOT NULL,
    "dataFim" DATETIME,
    "atual" BOOLEAN NOT NULL DEFAULT true,
    "observacao" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FuncionarioLotacao_funcionarioId_fkey" FOREIGN KEY ("funcionarioId") REFERENCES "Funcionario" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FuncionarioLotacao_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FuncionarioLotacao_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "Unidade" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "OrganizacaoSetor" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL,
    "nomeSetor" TEXT NOT NULL,
    "tipoSetor" TEXT NOT NULL,
    "setorPaiId" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "OrganizacaoSetor_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrganizacaoSetor_setorPaiId_fkey" FOREIGN KEY ("setorPaiId") REFERENCES "OrganizacaoSetor" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "OrganizacaoCargo" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL,
    "nomeCargo" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "OrganizacaoCargo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "OrganogramaPosicao" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL,
    "setorId" INTEGER NOT NULL,
    "cargoId" INTEGER NOT NULL,
    "tituloExibicao" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "OrganogramaPosicao_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrganogramaPosicao_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "OrganizacaoSetor" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrganogramaPosicao_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "OrganizacaoCargo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "OrganogramaVinculo" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "posicaoSuperiorId" INTEGER NOT NULL,
    "posicaoSubordinadaId" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "OrganogramaVinculo_posicaoSuperiorId_fkey" FOREIGN KEY ("posicaoSuperiorId") REFERENCES "OrganogramaPosicao" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrganogramaVinculo_posicaoSubordinadaId_fkey" FOREIGN KEY ("posicaoSubordinadaId") REFERENCES "OrganogramaPosicao" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "FuncionarioPosicao" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "funcionarioId" INTEGER NOT NULL,
    "posicaoId" INTEGER NOT NULL,
    "dataInicio" DATETIME NOT NULL,
    "dataFim" DATETIME,
    "vigente" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "FuncionarioPosicao_funcionarioId_fkey" FOREIGN KEY ("funcionarioId") REFERENCES "Funcionario" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FuncionarioPosicao_posicaoId_fkey" FOREIGN KEY ("posicaoId") REFERENCES "OrganogramaPosicao" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "EmpresaRepresentante" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL,
    "funcionarioId" INTEGER,
    "nomeRepresentante" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "email" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "dataInicio" DATETIME NOT NULL,
    "dataFim" DATETIME,
    CONSTRAINT "EmpresaRepresentante_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EmpresaRepresentante_funcionarioId_fkey" FOREIGN KEY ("funcionarioId") REFERENCES "Funcionario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "EmpresaEncarregadoSistema" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL,
    "funcionarioId" INTEGER NOT NULL,
    "userId" INTEGER,
    "definidoPorRepresentanteId" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "dataInicio" DATETIME NOT NULL,
    "dataFim" DATETIME,
    "solicitouSaida" BOOLEAN NOT NULL DEFAULT false,
    "dataSolicitacaoSaida" DATETIME,
    "motivoSolicitacaoSaida" TEXT,
    CONSTRAINT "EmpresaEncarregadoSistema_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EmpresaEncarregadoSistema_funcionarioId_fkey" FOREIGN KEY ("funcionarioId") REFERENCES "Funcionario" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EmpresaEncarregadoSistema_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "EmpresaEncarregadoSistema_definidoPorRepresentanteId_fkey" FOREIGN KEY ("definidoPorRepresentanteId") REFERENCES "EmpresaRepresentante" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Perfil" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER,
    "tenantScope" TEXT NOT NULL,
    "tipoPerfil" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Perfil_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "PerfilPermissao" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "perfilId" INTEGER NOT NULL,
    "modulo" TEXT NOT NULL,
    "janela" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "permitido" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "PerfilPermissao_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "Perfil" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "UsuarioPerfil" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "perfilId" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "UsuarioPerfil_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UsuarioPerfil_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "Perfil" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "UsuarioAbrangencia" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "tipoAbrangencia" TEXT NOT NULL,
    "obraId" INTEGER,
    "unidadeId" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "UsuarioAbrangencia_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UsuarioAbrangencia_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "UsuarioAbrangencia_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "Unidade" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "BackupPoliticaTenant" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL,
    "periodicidade" TEXT NOT NULL,
    "horaExecucao" TEXT NOT NULL,
    "diaSemana" INTEGER,
    "retencaoDias" INTEGER NOT NULL DEFAULT 30,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "configuradoPorUserId" INTEGER NOT NULL,
    "configuradoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BackupPoliticaTenant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BackupPoliticaTenant_configuradoPorUserId_fkey" FOREIGN KEY ("configuradoPorUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "BackupExecucaoTenant" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "politicaId" INTEGER NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "dataHoraInicio" DATETIME NOT NULL,
    "dataHoraFim" DATETIME,
    "status" TEXT NOT NULL,
    "referenciaArquivo" TEXT,
    "hashArquivo" TEXT,
    "observacao" TEXT,
    CONSTRAINT "BackupExecucaoTenant_politicaId_fkey" FOREIGN KEY ("politicaId") REFERENCES "BackupPoliticaTenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BackupExecucaoTenant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "BackupRestauracaoTenant" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL,
    "pontoReferencia" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "solicitadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "solicitadoPorUserId" INTEGER,
    CONSTRAINT "BackupRestauracaoTenant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BackupRestauracaoTenant_solicitadoPorUserId_fkey" FOREIGN KEY ("solicitadoPorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "DashboardLayoutUsuario" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "nomeLayout" TEXT NOT NULL DEFAULT 'PADRAO',
    "tipoDashboard" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "DashboardLayoutUsuario_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "DashboardWidgetUsuario" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "layoutId" INTEGER NOT NULL,
    "codigoWidget" TEXT NOT NULL,
    "posicaoX" INTEGER NOT NULL DEFAULT 0,
    "posicaoY" INTEGER NOT NULL DEFAULT 0,
    "largura" INTEGER NOT NULL DEFAULT 4,
    "altura" INTEGER NOT NULL DEFAULT 2,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "DashboardWidgetUsuario_layoutId_fkey" FOREIGN KEY ("layoutId") REFERENCES "DashboardLayoutUsuario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "AuditoriaEvento" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL,
    "userId" INTEGER,
    "entidade" TEXT NOT NULL,
    "idRegistro" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "dadosAnteriores" TEXT,
    "dadosNovos" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditoriaEvento_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuditoriaEvento_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

ALTER TABLE "TenantUser" ADD COLUMN "login" TEXT;
ALTER TABLE "TenantUser" ADD COLUMN "ativo" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "TenantUser" ADD COLUMN "bloqueado" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TenantUser" ADD COLUMN "ultimoAcesso" DATETIME;
ALTER TABLE "TenantUser" ADD COLUMN "funcionarioId" INTEGER;

CREATE UNIQUE INDEX "Unidade_tenantId_codigo_key" ON "Unidade"("tenantId", "codigo");
CREATE INDEX "Unidade_tenantId_idx" ON "Unidade"("tenantId");

CREATE UNIQUE INDEX "Funcionario_tenantId_matricula_key" ON "Funcionario"("tenantId", "matricula");
CREATE UNIQUE INDEX "Funcionario_tenantId_cpf_key" ON "Funcionario"("tenantId", "cpf");
CREATE INDEX "Funcionario_tenantId_idx" ON "Funcionario"("tenantId");

CREATE INDEX "FuncionarioLotacao_funcionarioId_idx" ON "FuncionarioLotacao"("funcionarioId");
CREATE INDEX "FuncionarioLotacao_obraId_idx" ON "FuncionarioLotacao"("obraId");
CREATE INDEX "FuncionarioLotacao_unidadeId_idx" ON "FuncionarioLotacao"("unidadeId");

CREATE INDEX "OrganizacaoSetor_tenantId_idx" ON "OrganizacaoSetor"("tenantId");
CREATE INDEX "OrganizacaoSetor_setorPaiId_idx" ON "OrganizacaoSetor"("setorPaiId");

CREATE UNIQUE INDEX "OrganizacaoCargo_tenantId_nomeCargo_key" ON "OrganizacaoCargo"("tenantId", "nomeCargo");
CREATE INDEX "OrganizacaoCargo_tenantId_idx" ON "OrganizacaoCargo"("tenantId");

CREATE INDEX "OrganogramaPosicao_tenantId_idx" ON "OrganogramaPosicao"("tenantId");
CREATE INDEX "OrganogramaPosicao_setorId_idx" ON "OrganogramaPosicao"("setorId");
CREATE INDEX "OrganogramaPosicao_cargoId_idx" ON "OrganogramaPosicao"("cargoId");

CREATE UNIQUE INDEX "OrganogramaVinculo_posicaoSuperiorId_posicaoSubordinadaId_key" ON "OrganogramaVinculo"("posicaoSuperiorId", "posicaoSubordinadaId");
CREATE INDEX "OrganogramaVinculo_posicaoSuperiorId_idx" ON "OrganogramaVinculo"("posicaoSuperiorId");
CREATE INDEX "OrganogramaVinculo_posicaoSubordinadaId_idx" ON "OrganogramaVinculo"("posicaoSubordinadaId");

CREATE INDEX "FuncionarioPosicao_funcionarioId_idx" ON "FuncionarioPosicao"("funcionarioId");
CREATE INDEX "FuncionarioPosicao_posicaoId_idx" ON "FuncionarioPosicao"("posicaoId");

CREATE INDEX "EmpresaRepresentante_tenantId_idx" ON "EmpresaRepresentante"("tenantId");
CREATE INDEX "EmpresaRepresentante_funcionarioId_idx" ON "EmpresaRepresentante"("funcionarioId");
CREATE INDEX "EmpresaRepresentante_cpf_idx" ON "EmpresaRepresentante"("cpf");

CREATE INDEX "EmpresaEncarregadoSistema_tenantId_idx" ON "EmpresaEncarregadoSistema"("tenantId");
CREATE INDEX "EmpresaEncarregadoSistema_funcionarioId_idx" ON "EmpresaEncarregadoSistema"("funcionarioId");
CREATE INDEX "EmpresaEncarregadoSistema_userId_idx" ON "EmpresaEncarregadoSistema"("userId");
CREATE INDEX "EmpresaEncarregadoSistema_definidoPorRepresentanteId_idx" ON "EmpresaEncarregadoSistema"("definidoPorRepresentanteId");

CREATE UNIQUE INDEX "Perfil_tenantScope_codigo_key" ON "Perfil"("tenantScope", "codigo");
CREATE INDEX "Perfil_tenantId_idx" ON "Perfil"("tenantId");
CREATE INDEX "Perfil_tipoPerfil_idx" ON "Perfil"("tipoPerfil");

CREATE INDEX "PerfilPermissao_perfilId_idx" ON "PerfilPermissao"("perfilId");
CREATE INDEX "PerfilPermissao_modulo_idx" ON "PerfilPermissao"("modulo");

CREATE UNIQUE INDEX "UsuarioPerfil_userId_perfilId_key" ON "UsuarioPerfil"("userId", "perfilId");
CREATE INDEX "UsuarioPerfil_userId_idx" ON "UsuarioPerfil"("userId");
CREATE INDEX "UsuarioPerfil_perfilId_idx" ON "UsuarioPerfil"("perfilId");

CREATE INDEX "UsuarioAbrangencia_userId_idx" ON "UsuarioAbrangencia"("userId");
CREATE INDEX "UsuarioAbrangencia_obraId_idx" ON "UsuarioAbrangencia"("obraId");
CREATE INDEX "UsuarioAbrangencia_unidadeId_idx" ON "UsuarioAbrangencia"("unidadeId");

CREATE INDEX "BackupPoliticaTenant_tenantId_idx" ON "BackupPoliticaTenant"("tenantId");
CREATE INDEX "BackupPoliticaTenant_configuradoPorUserId_idx" ON "BackupPoliticaTenant"("configuradoPorUserId");

CREATE INDEX "BackupExecucaoTenant_tenantId_idx" ON "BackupExecucaoTenant"("tenantId");
CREATE INDEX "BackupExecucaoTenant_politicaId_idx" ON "BackupExecucaoTenant"("politicaId");

CREATE INDEX "BackupRestauracaoTenant_tenantId_idx" ON "BackupRestauracaoTenant"("tenantId");
CREATE INDEX "BackupRestauracaoTenant_solicitadoPorUserId_idx" ON "BackupRestauracaoTenant"("solicitadoPorUserId");
CREATE INDEX "BackupRestauracaoTenant_status_idx" ON "BackupRestauracaoTenant"("status");

CREATE INDEX "DashboardLayoutUsuario_userId_idx" ON "DashboardLayoutUsuario"("userId");
CREATE INDEX "DashboardLayoutUsuario_tipoDashboard_idx" ON "DashboardLayoutUsuario"("tipoDashboard");

CREATE INDEX "DashboardWidgetUsuario_layoutId_idx" ON "DashboardWidgetUsuario"("layoutId");
CREATE INDEX "DashboardWidgetUsuario_codigoWidget_idx" ON "DashboardWidgetUsuario"("codigoWidget");

CREATE INDEX "AuditoriaEvento_tenantId_idx" ON "AuditoriaEvento"("tenantId");
CREATE INDEX "AuditoriaEvento_userId_idx" ON "AuditoriaEvento"("userId");
CREATE INDEX "AuditoriaEvento_entidade_idx" ON "AuditoriaEvento"("entidade");

CREATE UNIQUE INDEX "TenantUser_tenantId_login_key" ON "TenantUser"("tenantId", "login");
CREATE INDEX "TenantUser_funcionarioId_idx" ON "TenantUser"("funcionarioId");
