SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- =========================
-- 1. UNIDADES
-- =========================
CREATE TABLE IF NOT EXISTS unidades (
    id_unidade BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED NOT NULL,
    codigo VARCHAR(50) NOT NULL,
    nome VARCHAR(150) NOT NULL,
    tipo_unidade VARCHAR(30) NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_unidade_tenant_codigo (tenant_id, codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================
-- 2. FUNCIONÁRIOS
-- =========================
CREATE TABLE IF NOT EXISTS funcionarios (
    id_funcionario BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED NOT NULL,
    matricula VARCHAR(50) NOT NULL,
    nome_completo VARCHAR(200) NOT NULL,
    cpf VARCHAR(14) NOT NULL,
    email VARCHAR(150) NULL,
    telefone VARCHAR(30) NULL,
    cargo VARCHAR(120) NULL,
    funcao_principal VARCHAR(120) NULL,
    status_funcional VARCHAR(30) NOT NULL DEFAULT 'ATIVO',
    data_admissao DATE NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_funcionario_tenant_matricula (tenant_id, matricula),
    UNIQUE KEY uk_funcionario_tenant_cpf (tenant_id, cpf)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS funcionarios_lotacoes (
    id_lotacao BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_funcionario BIGINT UNSIGNED NOT NULL,
    tipo_lotacao VARCHAR(20) NOT NULL,
    id_obra BIGINT UNSIGNED NULL,
    id_unidade BIGINT UNSIGNED NULL,
    data_inicio DATE NOT NULL,
    data_fim DATE NULL,
    atual BOOLEAN NOT NULL DEFAULT TRUE,
    observacao VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_lotacao_funcionario FOREIGN KEY (id_funcionario) REFERENCES funcionarios(id_funcionario),
    CONSTRAINT fk_lotacao_unidade FOREIGN KEY (id_unidade) REFERENCES unidades(id_unidade)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================
-- 2.1 RH - EXTENSÕES (MIGRAÇÕES RECOMENDADAS)
-- =========================
-- OBS: esta seção é uma evolução do schema. Se as colunas já existirem, adapte/remova os ALTERs.
ALTER TABLE funcionarios
  ADD COLUMN nome_social VARCHAR(160) NULL,
  ADD COLUMN rg VARCHAR(30) NULL,
  ADD COLUMN orgao_emissor_rg VARCHAR(20) NULL,
  ADD COLUMN data_nascimento DATE NULL,
  ADD COLUMN sexo VARCHAR(20) NULL,
  ADD COLUMN estado_civil VARCHAR(30) NULL,
  ADD COLUMN pis_pasep VARCHAR(20) NULL,
  ADD COLUMN ctps_numero VARCHAR(30) NULL,
  ADD COLUMN ctps_serie VARCHAR(20) NULL,
  ADD COLUMN ctps_uf CHAR(2) NULL,
  ADD COLUMN cnh_numero VARCHAR(20) NULL,
  ADD COLUMN cnh_categoria VARCHAR(10) NULL,
  ADD COLUMN cbo_codigo VARCHAR(10) NULL,
  ADD COLUMN cargo_contratual VARCHAR(120) NULL,
  ADD COLUMN tipo_vinculo VARCHAR(30) NOT NULL DEFAULT 'CLT',
  ADD COLUMN data_desligamento DATE NULL,
  ADD COLUMN salario_base DECIMAL(14,2) NULL,
  ADD COLUMN email_pessoal VARCHAR(160) NULL,
  ADD COLUMN telefone_principal VARCHAR(30) NULL,
  ADD COLUMN contato_emergencia_nome VARCHAR(160) NULL,
  ADD COLUMN contato_emergencia_telefone VARCHAR(30) NULL,
  ADD COLUMN status_cadastro_rh VARCHAR(30) NOT NULL DEFAULT 'PENDENTE_ENDOSSO',
  ADD COLUMN id_usuario_endosso_rh BIGINT NULL,
  ADD COLUMN data_endosso_rh DATETIME NULL,
  ADD COLUMN motivo_rejeicao_endosso TEXT NULL;

CREATE TABLE IF NOT EXISTS funcionarios_supervisao (
    id_supervisao BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_funcionario BIGINT UNSIGNED NOT NULL,
    id_supervisor_funcionario BIGINT UNSIGNED NOT NULL,
    data_inicio DATE NOT NULL,
    data_fim DATE NULL,
    atual TINYINT(1) NOT NULL DEFAULT 1,
    observacao TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_supervisao_funcionario FOREIGN KEY (id_funcionario) REFERENCES funcionarios(id_funcionario),
    CONSTRAINT fk_supervisao_supervisor FOREIGN KEY (id_supervisor_funcionario) REFERENCES funcionarios(id_funcionario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS funcionarios_jornadas (
    id_jornada BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_funcionario BIGINT UNSIGNED NOT NULL,
    tipo_jornada VARCHAR(30) NOT NULL,
    horas_semanais DECIMAL(5,2) NOT NULL,
    hora_entrada TIME NULL,
    hora_saida TIME NULL,
    intervalo_minutos INT NOT NULL DEFAULT 60,
    banco_horas_ativo TINYINT(1) NOT NULL DEFAULT 0,
    data_inicio DATE NOT NULL,
    data_fim DATE NULL,
    atual TINYINT(1) NOT NULL DEFAULT 1,
    observacao TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_jornada_funcionario FOREIGN KEY (id_funcionario) REFERENCES funcionarios(id_funcionario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS funcionarios_horas_extras (
    id_hora_extra BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED NOT NULL,
    id_funcionario BIGINT UNSIGNED NOT NULL,
    data_referencia DATE NOT NULL,
    quantidade_minutos INT NOT NULL,
    tipo_hora_extra VARCHAR(30) NOT NULL,
    motivo TEXT NULL,
    status_he VARCHAR(30) NOT NULL DEFAULT 'SOLICITADA',
    id_obra BIGINT UNSIGNED NULL,
    id_unidade BIGINT UNSIGNED NULL,
    id_aprovador_supervisor BIGINT UNSIGNED NULL,
    data_aprovacao_supervisor DATETIME NULL,
    id_aprovador_rh BIGINT UNSIGNED NULL,
    data_processamento_rh DATETIME NULL,
    observacao TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_he_funcionario FOREIGN KEY (id_funcionario) REFERENCES funcionarios(id_funcionario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================
-- 2.2 RH - ASSINATURAS E PRESENÇAS
-- =========================
CREATE TABLE IF NOT EXISTS funcionarios_assinatura_habilitacoes (
    id_habilitacao BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED NOT NULL,
    id_funcionario BIGINT UNSIGNED NOT NULL,
    tipo_assinatura VARCHAR(30) NOT NULL,
    pin_hash VARCHAR(255) NULL,
    ativo TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_func_ass_tipo (tenant_id, id_funcionario, tipo_assinatura),
    CONSTRAINT fk_hab_funcionario FOREIGN KEY (id_funcionario) REFERENCES funcionarios(id_funcionario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS assinaturas_registros (
    id_assinatura BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED NOT NULL,
    entidade_tipo VARCHAR(40) NOT NULL,
    entidade_id BIGINT UNSIGNED NOT NULL,
    id_funcionario_signatario BIGINT UNSIGNED NOT NULL,
    id_usuario_captura BIGINT UNSIGNED NULL,
    tipo_assinatura VARCHAR(30) NOT NULL,
    data_hora_assinatura DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ip_origem VARCHAR(64) NULL,
    user_agent TEXT NULL,
    latitude DECIMAL(10,7) NULL,
    longitude DECIMAL(10,7) NULL,
    hash_documento VARCHAR(255) NULL,
    arquivo_assinatura_url TEXT NULL,
    observacao TEXT NULL,
    metadata_json JSON NULL,
    CONSTRAINT fk_assinatura_funcionario FOREIGN KEY (id_funcionario_signatario) REFERENCES funcionarios(id_funcionario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS presencas_cabecalho (
    id_presenca BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED NOT NULL,
    tipo_local VARCHAR(20) NOT NULL,
    id_obra BIGINT UNSIGNED NULL,
    id_unidade BIGINT UNSIGNED NULL,
    data_referencia DATE NOT NULL,
    turno VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
    status_presenca VARCHAR(30) NOT NULL DEFAULT 'EM_PREENCHIMENTO',
    id_supervisor_lancamento BIGINT UNSIGNED NOT NULL,
    observacao TEXT NULL,
    data_fechamento DATETIME NULL,
    id_usuario_fechamento BIGINT UNSIGNED NULL,
    data_envio_rh DATETIME NULL,
    id_usuario_envio_rh BIGINT UNSIGNED NULL,
    data_recebimento_rh DATETIME NULL,
    id_usuario_recebimento_rh BIGINT UNSIGNED NULL,
    motivo_rejeicao_rh TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_presenca_supervisor FOREIGN KEY (id_supervisor_lancamento) REFERENCES funcionarios(id_funcionario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS presencas_itens (
    id_presenca_item BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_presenca BIGINT UNSIGNED NOT NULL,
    id_funcionario BIGINT UNSIGNED NOT NULL,
    situacao_presenca VARCHAR(30) NOT NULL,
    hora_entrada TIME NULL,
    hora_saida TIME NULL,
    minutos_atraso INT NOT NULL DEFAULT 0,
    minutos_hora_extra INT NOT NULL DEFAULT 0,
    id_tarefa_planejamento BIGINT UNSIGNED NULL,
    id_subitem_orcamentario BIGINT UNSIGNED NULL,
    descricao_tarefa_dia VARCHAR(255) NULL,
    requer_assinatura_funcionario TINYINT(1) NOT NULL DEFAULT 1,
    assinado_funcionario TINYINT(1) NOT NULL DEFAULT 0,
    id_assinatura_registro BIGINT UNSIGNED NULL,
    motivo_sem_assinatura TEXT NULL,
    observacao TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_presenca_item_func (id_presenca, id_funcionario),
    CONSTRAINT fk_presenca_item_presenca FOREIGN KEY (id_presenca) REFERENCES presencas_cabecalho(id_presenca),
    CONSTRAINT fk_presenca_item_funcionario FOREIGN KEY (id_funcionario) REFERENCES funcionarios(id_funcionario),
    CONSTRAINT fk_presenca_item_assinatura FOREIGN KEY (id_assinatura_registro) REFERENCES assinaturas_registros(id_assinatura)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================
-- 2.3 SST - TERCEIRIZADOS E EPI
-- =========================
CREATE TABLE IF NOT EXISTS terceirizados_empresas_parceiras (
    id_empresa_parceira BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED NOT NULL,
    razao_social VARCHAR(200) NOT NULL,
    cnpj VARCHAR(18) NULL,
    telefone VARCHAR(30) NULL,
    email VARCHAR(150) NULL,
    ativo TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_terc_emp_tenant_cnpj (tenant_id, cnpj)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS terceirizados_trabalhadores (
    id_terceirizado_trabalhador BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED NOT NULL,
    id_empresa_parceira BIGINT UNSIGNED NOT NULL,
    nome_completo VARCHAR(160) NOT NULL,
    cpf VARCHAR(14) NULL,
    funcao VARCHAR(120) NULL,
    cbo_codigo VARCHAR(10) NULL,
    telefone VARCHAR(30) NULL,
    ativo TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_terc_trab_empresa FOREIGN KEY (id_empresa_parceira) REFERENCES terceirizados_empresas_parceiras(id_empresa_parceira)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS terceirizados_alocacoes (
    id_alocacao BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_terceirizado_trabalhador BIGINT UNSIGNED NOT NULL,
    tipo_local VARCHAR(20) NOT NULL,
    id_obra BIGINT UNSIGNED NULL,
    id_unidade BIGINT UNSIGNED NULL,
    data_inicio DATE NOT NULL,
    data_fim DATE NULL,
    atual TINYINT(1) NOT NULL DEFAULT 1,
    observacao TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_terc_aloc_trab FOREIGN KEY (id_terceirizado_trabalhador) REFERENCES terceirizados_trabalhadores(id_terceirizado_trabalhador)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS terceirizados_assinatura_habilitacoes (
    id_habilitacao BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED NOT NULL,
    id_terceirizado_trabalhador BIGINT UNSIGNED NOT NULL,
    tipo_assinatura VARCHAR(30) NOT NULL,
    pin_hash VARCHAR(255) NULL,
    ativo TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_terc_ass_tipo (tenant_id, id_terceirizado_trabalhador, tipo_assinatura),
    CONSTRAINT fk_terc_hab_trab FOREIGN KEY (id_terceirizado_trabalhador) REFERENCES terceirizados_trabalhadores(id_terceirizado_trabalhador)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE assinaturas_registros
  ADD COLUMN tipo_signatario VARCHAR(20) NOT NULL DEFAULT 'FUNCIONARIO' AFTER entidade_id,
  MODIFY COLUMN id_funcionario_signatario BIGINT UNSIGNED NULL,
  ADD COLUMN id_terceirizado_trabalhador BIGINT UNSIGNED NULL AFTER id_funcionario_signatario,
  ADD CONSTRAINT fk_assinatura_terceirizado FOREIGN KEY (id_terceirizado_trabalhador) REFERENCES terceirizados_trabalhadores(id_terceirizado_trabalhador);

CREATE TABLE IF NOT EXISTS sst_epi_catalogo (
    id_epi BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED NOT NULL,
    codigo VARCHAR(40) NULL,
    nome_epi VARCHAR(160) NOT NULL,
    categoria_epi VARCHAR(80) NOT NULL,
    ca_numero VARCHAR(40) NULL,
    ca_validade DATE NULL,
    fabricante VARCHAR(120) NULL,
    tamanho_controlado TINYINT(1) NOT NULL DEFAULT 0,
    vida_util_dias INT NULL,
    periodicidade_inspecao_dias INT NULL,
    ativo TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_sst_epi_catalogo_tenant_codigo (tenant_id, codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sst_epi_fichas (
    id_ficha_epi BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED NOT NULL,
    tipo_destinatario VARCHAR(20) NOT NULL,
    id_funcionario BIGINT UNSIGNED NULL,
    id_terceirizado_trabalhador BIGINT UNSIGNED NULL,
    tipo_local VARCHAR(20) NOT NULL,
    id_obra BIGINT UNSIGNED NULL,
    id_unidade BIGINT UNSIGNED NULL,
    status_ficha VARCHAR(30) NOT NULL DEFAULT 'EM_PREENCHIMENTO',
    data_emissao DATE NOT NULL,
    entrega_orientada TINYINT(1) NOT NULL DEFAULT 1,
    assinatura_destinatario_obrigatoria TINYINT(1) NOT NULL DEFAULT 1,
    id_assinatura_destinatario BIGINT UNSIGNED NULL,
    id_responsavel_lancamento_usuario BIGINT UNSIGNED NOT NULL,
    observacao TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_epi_ficha_funcionario FOREIGN KEY (id_funcionario) REFERENCES funcionarios(id_funcionario),
    CONSTRAINT fk_epi_ficha_terceirizado FOREIGN KEY (id_terceirizado_trabalhador) REFERENCES terceirizados_trabalhadores(id_terceirizado_trabalhador),
    CONSTRAINT fk_epi_ficha_assinatura_dest FOREIGN KEY (id_assinatura_destinatario) REFERENCES assinaturas_registros(id_assinatura)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sst_epi_fichas_itens (
    id_ficha_epi_item BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_ficha_epi BIGINT UNSIGNED NOT NULL,
    id_epi BIGINT UNSIGNED NOT NULL,
    quantidade_entregue DECIMAL(10,2) NOT NULL DEFAULT 1,
    tamanho VARCHAR(30) NULL,
    data_entrega DATE NOT NULL,
    data_prevista_troca DATE NULL,
    status_item VARCHAR(30) NOT NULL DEFAULT 'ENTREGUE',
    data_devolucao DATE NULL,
    quantidade_devolvida DECIMAL(10,2) NULL,
    condicao_devolucao VARCHAR(30) NULL,
    higienizado TINYINT(1) NOT NULL DEFAULT 0,
    motivo_movimentacao TEXT NULL,
    id_assinatura_entrega BIGINT UNSIGNED NULL,
    id_assinatura_devolucao BIGINT UNSIGNED NULL,
    observacao TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_epi_item_ficha FOREIGN KEY (id_ficha_epi) REFERENCES sst_epi_fichas(id_ficha_epi),
    CONSTRAINT fk_epi_item_catalogo FOREIGN KEY (id_epi) REFERENCES sst_epi_catalogo(id_epi),
    CONSTRAINT fk_epi_item_assinatura_entrega FOREIGN KEY (id_assinatura_entrega) REFERENCES assinaturas_registros(id_assinatura),
    CONSTRAINT fk_epi_item_assinatura_devolucao FOREIGN KEY (id_assinatura_devolucao) REFERENCES assinaturas_registros(id_assinatura)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sst_epi_inspecoes (
    id_inspecao BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_ficha_epi_item BIGINT UNSIGNED NOT NULL,
    data_inspecao DATE NOT NULL,
    resultado VARCHAR(20) NOT NULL,
    observacao TEXT NULL,
    id_usuario_responsavel BIGINT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_epi_inspecao_item FOREIGN KEY (id_ficha_epi_item) REFERENCES sst_epi_fichas_itens(id_ficha_epi_item)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================
-- 2.4 SST - PROFISSIONAIS E CHECKLISTS
-- =========================
CREATE TABLE IF NOT EXISTS sst_profissionais (
    id_sst_profissional BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED NOT NULL,
    id_funcionario BIGINT UNSIGNED NOT NULL,
    tipo_profissional VARCHAR(40) NOT NULL,
    registro_numero VARCHAR(40) NULL,
    registro_uf CHAR(2) NULL,
    conselho_sigla VARCHAR(20) NULL,
    ativo TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_sst_prof_func (tenant_id, id_funcionario),
    CONSTRAINT fk_sst_prof_funcionario FOREIGN KEY (id_funcionario) REFERENCES funcionarios(id_funcionario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sst_profissionais_alocacoes (
    id_sst_alocacao BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_sst_profissional BIGINT UNSIGNED NOT NULL,
    tipo_local VARCHAR(20) NOT NULL,
    id_obra BIGINT UNSIGNED NULL,
    id_unidade BIGINT UNSIGNED NULL,
    data_inicio DATE NOT NULL,
    data_fim DATE NULL,
    atual TINYINT(1) NOT NULL DEFAULT 1,
    principal TINYINT(1) NOT NULL DEFAULT 0,
    observacao TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_sst_aloc_prof FOREIGN KEY (id_sst_profissional) REFERENCES sst_profissionais(id_sst_profissional)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sst_checklists_modelos (
    id_modelo_checklist BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED NOT NULL,
    codigo VARCHAR(40) NULL,
    nome_modelo VARCHAR(160) NOT NULL,
    tipo_local_permitido VARCHAR(20) NOT NULL DEFAULT 'AMBOS',
    periodicidade VARCHAR(20) NOT NULL,
    abrange_terceirizados TINYINT(1) NOT NULL DEFAULT 1,
    exige_assinatura_executor TINYINT(1) NOT NULL DEFAULT 1,
    exige_ciencia_responsavel TINYINT(1) NOT NULL DEFAULT 0,
    ativo TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sst_checklists_modelos_itens (
    id_modelo_item BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_modelo_checklist BIGINT UNSIGNED NOT NULL,
    ordem_item INT NOT NULL DEFAULT 0,
    grupo_item VARCHAR(100) NULL,
    descricao_item VARCHAR(255) NOT NULL,
    tipo_resposta VARCHAR(30) NOT NULL DEFAULT 'OK_NOK_NA',
    obrigatorio TINYINT(1) NOT NULL DEFAULT 1,
    gera_nc_quando_reprovado TINYINT(1) NOT NULL DEFAULT 1,
    ativo TINYINT(1) NOT NULL DEFAULT 1,
    CONSTRAINT fk_sst_modelo_item FOREIGN KEY (id_modelo_checklist) REFERENCES sst_checklists_modelos(id_modelo_checklist)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sst_checklists_execucoes (
    id_execucao_checklist BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED NOT NULL,
    id_modelo_checklist BIGINT UNSIGNED NOT NULL,
    tipo_local VARCHAR(20) NOT NULL,
    id_obra BIGINT UNSIGNED NULL,
    id_unidade BIGINT UNSIGNED NULL,
    data_referencia DATE NOT NULL,
    status_execucao VARCHAR(30) NOT NULL DEFAULT 'EM_PREENCHIMENTO',
    id_sst_profissional_executor BIGINT UNSIGNED NOT NULL,
    id_usuario_executor BIGINT UNSIGNED NOT NULL,
    abrange_terceirizados TINYINT(1) NOT NULL DEFAULT 1,
    id_assinatura_executor BIGINT UNSIGNED NULL,
    id_funcionario_responsavel_ciencia BIGINT UNSIGNED NULL,
    id_assinatura_responsavel_ciencia BIGINT UNSIGNED NULL,
    observacao TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_sst_exec_modelo FOREIGN KEY (id_modelo_checklist) REFERENCES sst_checklists_modelos(id_modelo_checklist),
    CONSTRAINT fk_sst_exec_executor FOREIGN KEY (id_sst_profissional_executor) REFERENCES sst_profissionais(id_sst_profissional),
    CONSTRAINT fk_sst_exec_ass_exec FOREIGN KEY (id_assinatura_executor) REFERENCES assinaturas_registros(id_assinatura),
    CONSTRAINT fk_sst_exec_resp_ciencia FOREIGN KEY (id_funcionario_responsavel_ciencia) REFERENCES funcionarios(id_funcionario),
    CONSTRAINT fk_sst_exec_ass_ciencia FOREIGN KEY (id_assinatura_responsavel_ciencia) REFERENCES assinaturas_registros(id_assinatura)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sst_checklists_execucoes_itens (
    id_execucao_item BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_execucao_checklist BIGINT UNSIGNED NOT NULL,
    id_modelo_item BIGINT UNSIGNED NOT NULL,
    resposta_valor VARCHAR(255) NULL,
    conforme_flag TINYINT(1) NULL,
    observacao TEXT NULL,
    gera_nc TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_execucao_item_modelo (id_execucao_checklist, id_modelo_item),
    CONSTRAINT fk_sst_exec_item_exec FOREIGN KEY (id_execucao_checklist) REFERENCES sst_checklists_execucoes(id_execucao_checklist),
    CONSTRAINT fk_sst_exec_item_modelo FOREIGN KEY (id_modelo_item) REFERENCES sst_checklists_modelos_itens(id_modelo_item)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sst_checklists_programacoes (
    id_programacao_checklist BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED NOT NULL,
    id_modelo_checklist BIGINT UNSIGNED NOT NULL,
    tipo_local VARCHAR(20) NOT NULL,
    id_obra BIGINT UNSIGNED NULL,
    id_unidade BIGINT UNSIGNED NULL,
    periodicidade_override VARCHAR(20) NULL,
    dia_semana INT NULL,
    dia_mes INT NULL,
    data_inicio_vigencia DATE NOT NULL,
    data_fim_vigencia DATE NULL,
    ativo TINYINT(1) NOT NULL DEFAULT 1,
    observacao TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_sst_prog_modelo FOREIGN KEY (id_modelo_checklist) REFERENCES sst_checklists_modelos(id_modelo_checklist)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sst_checklists_ocorrencias (
    id_ocorrencia BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED NOT NULL,
    id_execucao_checklist BIGINT UNSIGNED NOT NULL,
    id_execucao_item BIGINT UNSIGNED NULL,
    tipo_ocorrencia VARCHAR(30) NOT NULL,
    severidade VARCHAR(20) NULL,
    descricao TEXT NOT NULL,
    id_empresa_parceira BIGINT UNSIGNED NULL,
    prazo_correcao DATE NULL,
    status_ocorrencia VARCHAR(30) NOT NULL DEFAULT 'ABERTA',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_sst_oc_exec FOREIGN KEY (id_execucao_checklist) REFERENCES sst_checklists_execucoes(id_execucao_checklist)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE obra_fotos
  ADD COLUMN id_checklist_sst_execucao BIGINT NULL;

ALTER TABLE obra_documentos
  ADD COLUMN id_checklist_sst_execucao BIGINT NULL;

CREATE TABLE IF NOT EXISTS sst_nao_conformidades (
    id_nc BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED NOT NULL,
    codigo_nc VARCHAR(40) NULL,
    tipo_local VARCHAR(20) NOT NULL,
    id_obra BIGINT UNSIGNED NULL,
    id_unidade BIGINT UNSIGNED NULL,
    origem_tipo VARCHAR(30) NOT NULL DEFAULT 'AVULSA',
    id_execucao_checklist_origem BIGINT UNSIGNED NULL,
    id_execucao_item_origem BIGINT UNSIGNED NULL,
    id_ocorrencia_origem BIGINT UNSIGNED NULL,
    titulo VARCHAR(200) NOT NULL,
    descricao TEXT NOT NULL,
    severidade VARCHAR(20) NOT NULL,
    risco_potencial VARCHAR(30) NULL,
    status_nc VARCHAR(30) NOT NULL DEFAULT 'ABERTA',
    exige_interdicao TINYINT(1) NOT NULL DEFAULT 0,
    interdicao_aplicada TINYINT(1) NOT NULL DEFAULT 0,
    envolve_terceirizada TINYINT(1) NOT NULL DEFAULT 0,
    id_empresa_parceira BIGINT UNSIGNED NULL,
    data_identificacao DATE NOT NULL,
    prazo_correcao DATE NULL,
    id_sst_profissional_abertura BIGINT UNSIGNED NOT NULL,
    id_usuario_abertura BIGINT UNSIGNED NOT NULL,
    data_validacao DATETIME NULL,
    id_usuario_validacao BIGINT UNSIGNED NULL,
    parecer_validacao TEXT NULL,
    data_encerramento DATETIME NULL,
    id_usuario_encerramento BIGINT UNSIGNED NULL,
    observacao TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_nc_origem_execucao_item (id_execucao_item_origem),
    CONSTRAINT fk_nc_sst_prof FOREIGN KEY (id_sst_profissional_abertura) REFERENCES sst_profissionais(id_sst_profissional),
    CONSTRAINT fk_nc_ocorrencia FOREIGN KEY (id_ocorrencia_origem) REFERENCES sst_checklists_ocorrencias(id_ocorrencia)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sst_nao_conformidades_acoes (
    id_nc_acao BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_nc BIGINT UNSIGNED NOT NULL,
    ordem_acao INT NOT NULL DEFAULT 0,
    descricao_acao TEXT NOT NULL,
    tipo_responsavel VARCHAR(30) NOT NULL,
    id_responsavel_funcionario BIGINT UNSIGNED NULL,
    id_empresa_parceira BIGINT UNSIGNED NULL,
    id_terceirizado_trabalhador BIGINT UNSIGNED NULL,
    prazo_acao DATE NULL,
    status_acao VARCHAR(30) NOT NULL DEFAULT 'PENDENTE',
    data_conclusao DATETIME NULL,
    observacao_execucao TEXT NULL,
    id_usuario_cadastro BIGINT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_nc_acao_nc FOREIGN KEY (id_nc) REFERENCES sst_nao_conformidades(id_nc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE obra_fotos
  ADD COLUMN id_sst_nc BIGINT NULL,
  ADD COLUMN id_sst_nc_acao BIGINT NULL;

ALTER TABLE obra_documentos
  ADD COLUMN id_sst_nc BIGINT NULL,
  ADD COLUMN id_sst_nc_acao BIGINT NULL;

CREATE TABLE IF NOT EXISTS sst_treinamentos_modelos (
    id_treinamento_modelo BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED NOT NULL,
    codigo VARCHAR(40) NULL,
    nome_treinamento VARCHAR(180) NOT NULL,
    tipo_treinamento VARCHAR(30) NOT NULL,
    norma_referencia VARCHAR(60) NULL,
    carga_horaria_horas DECIMAL(6,2) NOT NULL DEFAULT 0,
    validade_meses INT NULL,
    antecedencia_alerta_dias INT NOT NULL DEFAULT 30,
    exige_assinatura_participante TINYINT(1) NOT NULL DEFAULT 1,
    exige_assinatura_instrutor TINYINT(1) NOT NULL DEFAULT 1,
    exige_aprovacao TINYINT(1) NOT NULL DEFAULT 0,
    ativo TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sst_treinamentos_turmas (
    id_treinamento_turma BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED NOT NULL,
    id_treinamento_modelo BIGINT UNSIGNED NOT NULL,
    tipo_local VARCHAR(20) NOT NULL,
    id_obra BIGINT UNSIGNED NULL,
    id_unidade BIGINT UNSIGNED NULL,
    data_inicio DATETIME NOT NULL,
    data_fim DATETIME NULL,
    status_turma VARCHAR(30) NOT NULL DEFAULT 'EM_ELABORACAO',
    tipo_instrutor VARCHAR(20) NOT NULL,
    id_instrutor_funcionario BIGINT UNSIGNED NULL,
    id_empresa_parceira_instrutora BIGINT UNSIGNED NULL,
    nome_instrutor_externo VARCHAR(160) NULL,
    id_usuario_responsavel BIGINT UNSIGNED NOT NULL,
    id_assinatura_instrutor BIGINT UNSIGNED NULL,
    conteudo_resumido TEXT NULL,
    observacao TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_trein_turma_modelo FOREIGN KEY (id_treinamento_modelo) REFERENCES sst_treinamentos_modelos(id_treinamento_modelo),
    CONSTRAINT fk_trein_turma_ass_instr FOREIGN KEY (id_assinatura_instrutor) REFERENCES assinaturas_registros(id_assinatura)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sst_treinamentos_participantes (
    id_treinamento_participante BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_treinamento_turma BIGINT UNSIGNED NOT NULL,
    tipo_participante VARCHAR(20) NOT NULL,
    id_funcionario BIGINT UNSIGNED NULL,
    id_terceirizado_trabalhador BIGINT UNSIGNED NULL,
    status_participacao VARCHAR(30) NOT NULL DEFAULT 'INSCRITO',
    presenca_percentual DECIMAL(5,2) NULL,
    nota DECIMAL(6,2) NULL,
    id_assinatura_participante BIGINT UNSIGNED NULL,
    assinatura_obrigatoria TINYINT(1) NOT NULL DEFAULT 1,
    data_conclusao DATE NULL,
    validade_ate DATE NULL,
    data_alerta_reciclagem DATE NULL,
    codigo_certificado VARCHAR(60) NULL,
    certificado_emitido_em DATETIME NULL,
    observacao TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_trein_part_dest (id_treinamento_turma, tipo_participante, id_funcionario, id_terceirizado_trabalhador),
    CONSTRAINT fk_trein_part_turma FOREIGN KEY (id_treinamento_turma) REFERENCES sst_treinamentos_turmas(id_treinamento_turma),
    CONSTRAINT fk_trein_part_func FOREIGN KEY (id_funcionario) REFERENCES funcionarios(id_funcionario),
    CONSTRAINT fk_trein_part_terc FOREIGN KEY (id_terceirizado_trabalhador) REFERENCES terceirizados_trabalhadores(id_terceirizado_trabalhador),
    CONSTRAINT fk_trein_part_ass FOREIGN KEY (id_assinatura_participante) REFERENCES assinaturas_registros(id_assinatura)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sst_treinamentos_requisitos (
    id_requisito BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED NOT NULL,
    id_treinamento_modelo BIGINT UNSIGNED NOT NULL,
    tipo_regra VARCHAR(30) NOT NULL,
    valor_regra VARCHAR(120) NULL,
    obrigatorio TINYINT(1) NOT NULL DEFAULT 1,
    ativo TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_trein_req_modelo FOREIGN KEY (id_treinamento_modelo) REFERENCES sst_treinamentos_modelos(id_treinamento_modelo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sst_acidentes (
    id_acidente BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED NOT NULL,
    codigo_ocorrencia VARCHAR(40) NULL,
    tipo_local VARCHAR(20) NOT NULL,
    id_obra BIGINT UNSIGNED NULL,
    id_unidade BIGINT UNSIGNED NULL,
    tipo_ocorrencia VARCHAR(40) NOT NULL,
    severidade VARCHAR(20) NOT NULL,
    data_hora_ocorrencia DATETIME NOT NULL,
    local_detalhado VARCHAR(255) NULL,
    descricao_ocorrencia TEXT NOT NULL,
    atendimento_imediato TEXT NULL,
    houve_remocao_medica TINYINT(1) NOT NULL DEFAULT 0,
    houve_internacao TINYINT(1) NOT NULL DEFAULT 0,
    houve_afastamento TINYINT(1) NOT NULL DEFAULT 0,
    fatalidade TINYINT(1) NOT NULL DEFAULT 0,
    cat_aplicavel TINYINT(1) NOT NULL DEFAULT 1,
    cat_registrada TINYINT(1) NOT NULL DEFAULT 0,
    justificativa_sem_cat TEXT NULL,
    status_acidente VARCHAR(30) NOT NULL DEFAULT 'ABERTO',
    id_sst_profissional_abertura BIGINT UNSIGNED NOT NULL,
    id_usuario_abertura BIGINT UNSIGNED NOT NULL,
    id_sst_profissional_responsavel_investigacao BIGINT UNSIGNED NULL,
    data_inicio_investigacao DATETIME NULL,
    data_conclusao_investigacao DATETIME NULL,
    data_validacao DATETIME NULL,
    id_usuario_validacao BIGINT UNSIGNED NULL,
    parecer_validacao TEXT NULL,
    gerou_nc TINYINT(1) NOT NULL DEFAULT 0,
    id_nc_gerada BIGINT UNSIGNED NULL,
    observacao TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_acidente_sst_abertura FOREIGN KEY (id_sst_profissional_abertura) REFERENCES sst_profissionais(id_sst_profissional),
    CONSTRAINT fk_acidente_sst_invest FOREIGN KEY (id_sst_profissional_responsavel_investigacao) REFERENCES sst_profissionais(id_sst_profissional),
    CONSTRAINT fk_acidente_nc FOREIGN KEY (id_nc_gerada) REFERENCES sst_nao_conformidades(id_nc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sst_acidentes_envolvidos (
    id_acidente_envolvido BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_acidente BIGINT UNSIGNED NOT NULL,
    tipo_envolvido VARCHAR(20) NOT NULL,
    id_funcionario BIGINT UNSIGNED NULL,
    id_terceirizado_trabalhador BIGINT UNSIGNED NULL,
    nome_externo VARCHAR(160) NULL,
    empresa_externa VARCHAR(160) NULL,
    principal_envolvido TINYINT(1) NOT NULL DEFAULT 0,
    funcao_informada VARCHAR(120) NULL,
    tipo_lesao VARCHAR(120) NULL,
    parte_corpo VARCHAR(120) NULL,
    descricao_lesao TEXT NULL,
    epi_em_uso TINYINT(1) NOT NULL DEFAULT 0,
    epi_adequado TINYINT(1) NULL,
    atendimento_medico TINYINT(1) NOT NULL DEFAULT 0,
    nome_unidade_saude VARCHAR(160) NULL,
    afastamento_dias_previstos INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_acidente_env_acidente FOREIGN KEY (id_acidente) REFERENCES sst_acidentes(id_acidente),
    CONSTRAINT fk_acidente_env_func FOREIGN KEY (id_funcionario) REFERENCES funcionarios(id_funcionario),
    CONSTRAINT fk_acidente_env_terc FOREIGN KEY (id_terceirizado_trabalhador) REFERENCES terceirizados_trabalhadores(id_terceirizado_trabalhador)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sst_acidentes_testemunhas (
    id_testemunha BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_acidente BIGINT UNSIGNED NOT NULL,
    tipo_testemunha VARCHAR(20) NOT NULL,
    id_funcionario BIGINT UNSIGNED NULL,
    id_terceirizado_trabalhador BIGINT UNSIGNED NULL,
    nome_externo VARCHAR(160) NULL,
    contato VARCHAR(80) NULL,
    relato_resumido TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_acidente_test_acidente FOREIGN KEY (id_acidente) REFERENCES sst_acidentes(id_acidente),
    CONSTRAINT fk_acidente_test_func FOREIGN KEY (id_funcionario) REFERENCES funcionarios(id_funcionario),
    CONSTRAINT fk_acidente_test_terc FOREIGN KEY (id_terceirizado_trabalhador) REFERENCES terceirizados_trabalhadores(id_terceirizado_trabalhador)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sst_acidentes_investigacoes (
    id_investigacao BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_acidente BIGINT UNSIGNED NOT NULL,
    metodologia VARCHAR(40) NOT NULL DEFAULT '5_PORQUES',
    causas_imediatas TEXT NULL,
    causas_raiz TEXT NULL,
    fatores_contribuintes TEXT NULL,
    medidas_imediatas TEXT NULL,
    recomendacoes TEXT NULL,
    conclusao TEXT NULL,
    data_inicio DATETIME NULL,
    data_conclusao DATETIME NULL,
    id_usuario_responsavel BIGINT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_investigacao_acidente (id_acidente),
    CONSTRAINT fk_acidente_invest_acidente FOREIGN KEY (id_acidente) REFERENCES sst_acidentes(id_acidente)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sst_acidentes_cat (
    id_cat BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_acidente BIGINT UNSIGNED NOT NULL,
    tipo_cat VARCHAR(30) NOT NULL,
    numero_cat VARCHAR(60) NULL,
    data_emissao DATETIME NOT NULL,
    emitida_por_tipo VARCHAR(30) NOT NULL,
    id_empresa_parceira BIGINT UNSIGNED NULL,
    protocolo VARCHAR(100) NULL,
    arquivo_pdf_url TEXT NULL,
    observacao TEXT NULL,
    status_cat VARCHAR(30) NOT NULL DEFAULT 'EMITIDA',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_acidente_cat_acidente FOREIGN KEY (id_acidente) REFERENCES sst_acidentes(id_acidente),
    CONSTRAINT fk_acidente_cat_emp FOREIGN KEY (id_empresa_parceira) REFERENCES terceirizados_empresas_parceiras(id_empresa_parceira)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE obra_fotos
  ADD COLUMN id_acidente BIGINT NULL;

ALTER TABLE obra_documentos
  ADD COLUMN id_acidente BIGINT NULL;

ALTER TABLE unidades
  ADD COLUMN id_setor_diretoria BIGINT NULL;

ALTER TABLE contratos
  ADD COLUMN id_setor_diretoria BIGINT NULL;

ALTER TABLE obras
  ADD COLUMN status_obra VARCHAR(30) NOT NULL DEFAULT 'ATIVA';

-- =========================
-- 3. ORGANOGRAMA
-- =========================
CREATE TABLE IF NOT EXISTS organizacao_setores (
    id_setor BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED NOT NULL,
    nome_setor VARCHAR(150) NOT NULL,
    tipo_setor VARCHAR(30) NOT NULL,
    id_setor_pai BIGINT UNSIGNED NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT fk_setor_pai FOREIGN KEY (id_setor_pai) REFERENCES organizacao_setores(id_setor)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS organizacao_cargos (
    id_cargo BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED NOT NULL,
    nome_cargo VARCHAR(150) NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE KEY uk_cargo_tenant_nome (tenant_id, nome_cargo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS organograma_posicoes (
    id_posicao BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED NOT NULL,
    id_setor BIGINT UNSIGNED NOT NULL,
    id_cargo BIGINT UNSIGNED NOT NULL,
    titulo_exibicao VARCHAR(150) NOT NULL,
    ordem_exibicao INT NOT NULL DEFAULT 0,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT fk_posicao_setor FOREIGN KEY (id_setor) REFERENCES organizacao_setores(id_setor),
    CONSTRAINT fk_posicao_cargo FOREIGN KEY (id_cargo) REFERENCES organizacao_cargos(id_cargo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS organograma_vinculos (
    id_vinculo BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_posicao_superior BIGINT UNSIGNED NOT NULL,
    id_posicao_subordinada BIGINT UNSIGNED NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE KEY uq_organograma_vinculo (id_posicao_superior, id_posicao_subordinada),
    CONSTRAINT fk_vinculo_superior FOREIGN KEY (id_posicao_superior) REFERENCES organograma_posicoes(id_posicao),
    CONSTRAINT fk_vinculo_subordinada FOREIGN KEY (id_posicao_subordinada) REFERENCES organograma_posicoes(id_posicao)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS funcionarios_posicoes (
    id_funcionario_posicao BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_funcionario BIGINT UNSIGNED NOT NULL,
    id_posicao BIGINT UNSIGNED NOT NULL,
    data_inicio DATE NOT NULL,
    data_fim DATE NULL,
    vigente BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT fk_func_pos_funcionario FOREIGN KEY (id_funcionario) REFERENCES funcionarios(id_funcionario),
    CONSTRAINT fk_func_pos_posicao FOREIGN KEY (id_posicao) REFERENCES organograma_posicoes(id_posicao)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================
-- 4. REPRESENTANTE E ENCARREGADO DO SISTEMA
-- =========================
CREATE TABLE IF NOT EXISTS empresa_representantes (
    id_empresa_representante BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED NOT NULL,
    id_funcionario BIGINT UNSIGNED NULL,
    nome_representante VARCHAR(200) NOT NULL,
    cpf VARCHAR(14) NOT NULL,
    email VARCHAR(150) NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_inicio DATE NOT NULL,
    data_fim DATE NULL,
    CONSTRAINT fk_representante_funcionario FOREIGN KEY (id_funcionario) REFERENCES funcionarios(id_funcionario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS empresa_encarregado_sistema (
    id_empresa_encarregado_sistema BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED NOT NULL,
    id_funcionario BIGINT UNSIGNED NOT NULL,
    id_usuario BIGINT UNSIGNED NULL,
    id_empresa_representante BIGINT UNSIGNED NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_inicio DATE NOT NULL,
    data_fim DATE NULL,
    solicitou_saida BOOLEAN NOT NULL DEFAULT FALSE,
    data_solicitacao_saida DATETIME NULL,
    motivo_solicitacao_saida VARCHAR(255) NULL,
    CONSTRAINT fk_encarregado_funcionario FOREIGN KEY (id_funcionario) REFERENCES funcionarios(id_funcionario),
    CONSTRAINT fk_encarregado_representante FOREIGN KEY (id_empresa_representante) REFERENCES empresa_representantes(id_empresa_representante)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================
-- 5. PERFIS, PERMISSÕES E ABRANGÊNCIA (UNIFICADO)
-- =========================
CREATE TABLE IF NOT EXISTS perfis (
    id_perfil BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED NULL,
    tipo_perfil VARCHAR(20) NOT NULL,
    codigo VARCHAR(80) NOT NULL,
    nome VARCHAR(120) NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE KEY uk_perfil_codigo (tenant_id, codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS perfil_permissoes (
    id_perfil_permissao BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_perfil BIGINT UNSIGNED NOT NULL,
    modulo VARCHAR(80) NOT NULL,
    janela VARCHAR(120) NOT NULL,
    acao VARCHAR(50) NOT NULL,
    permitido BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT fk_permissao_perfil FOREIGN KEY (id_perfil) REFERENCES perfis(id_perfil)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS usuario_perfis (
    id_usuario_perfil BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_usuario BIGINT UNSIGNED NOT NULL,
    id_perfil BIGINT UNSIGNED NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE KEY uk_usuario_perfil (id_usuario, id_perfil)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS usuario_abrangencias (
    id_usuario_abrangencia BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_usuario BIGINT UNSIGNED NOT NULL,
    tipo_abrangencia VARCHAR(20) NOT NULL,
    id_obra BIGINT UNSIGNED NULL,
    id_unidade BIGINT UNSIGNED NULL,
    id_setor_diretoria BIGINT UNSIGNED NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT fk_abrangencia_unidade FOREIGN KEY (id_unidade) REFERENCES unidades(id_unidade)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================
-- 6. BACKUP E SEGURANÇA
-- =========================
CREATE TABLE IF NOT EXISTS backup_politicas_tenant (
    id_backup_politica BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED NOT NULL,
    periodicidade VARCHAR(20) NOT NULL,
    hora_execucao TIME NOT NULL,
    dia_semana TINYINT NULL,
    retencao_dias INT NOT NULL DEFAULT 30,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    configurado_por BIGINT UNSIGNED NOT NULL,
    configurado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS backup_execucoes_tenant (
    id_backup_execucao BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_backup_politica BIGINT UNSIGNED NOT NULL,
    tenant_id BIGINT UNSIGNED NOT NULL,
    data_hora_inicio DATETIME NOT NULL,
    data_hora_fim DATETIME NULL,
    status VARCHAR(20) NOT NULL,
    referencia_arquivo VARCHAR(255) NULL,
    hash_arquivo VARCHAR(128) NULL,
    observacao VARCHAR(255) NULL,
    CONSTRAINT fk_backup_exec_politica FOREIGN KEY (id_backup_politica) REFERENCES backup_politicas_tenant(id_backup_politica)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS backup_restauracao_solicitacoes (
    id_backup_restauracao BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED NOT NULL,
    solicitado_por BIGINT UNSIGNED NOT NULL,
    ponto_referencia VARCHAR(255) NOT NULL,
    motivo VARCHAR(500) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'SOLICITADA',
    solicitado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    confirmado_por BIGINT UNSIGNED NULL,
    confirmado_em DATETIME NULL,
    observacao VARCHAR(500) NULL,
    CONSTRAINT fk_backup_rest_solicitado_por FOREIGN KEY (solicitado_por) REFERENCES usuarios(id_usuario),
    CONSTRAINT fk_backup_rest_confirmado_por FOREIGN KEY (confirmado_por) REFERENCES usuarios(id_usuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================
-- 7. DASHBOARD PERSONALIZADO
-- =========================
CREATE TABLE IF NOT EXISTS dashboard_layouts_usuario (
    id_dashboard_layout BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED NOT NULL,
    id_usuario BIGINT UNSIGNED NOT NULL,
    dashboard_codigo VARCHAR(40) NOT NULL,
    nome_layout VARCHAR(120) NOT NULL DEFAULT 'Padrão',
    padrao TINYINT(1) NOT NULL DEFAULT 1,
    ativo TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_dashboard_layout_usuario (tenant_id, id_usuario, dashboard_codigo, ativo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dashboard_widgets_usuario (
    id_dashboard_widget BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_dashboard_layout BIGINT UNSIGNED NOT NULL,
    widget_codigo VARCHAR(60) NOT NULL,
    ordem_exibicao INT NOT NULL DEFAULT 0,
    pos_linha INT NOT NULL DEFAULT 1,
    pos_coluna INT NOT NULL DEFAULT 1,
    largura INT NOT NULL DEFAULT 6,
    altura INT NOT NULL DEFAULT 1,
    visivel TINYINT(1) NOT NULL DEFAULT 1,
    configuracao_json JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_widget_layout FOREIGN KEY (id_dashboard_layout) REFERENCES dashboard_layouts_usuario(id_dashboard_layout)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================
-- 8. AUDITORIA BASE
-- =========================
CREATE TABLE IF NOT EXISTS auditoria_eventos (
    id_auditoria BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED NOT NULL,
    id_usuario BIGINT UNSIGNED NULL,
    entidade VARCHAR(100) NOT NULL,
    id_registro VARCHAR(100) NOT NULL,
    acao VARCHAR(30) NOT NULL,
    dados_anteriores JSON NULL,
    dados_novos JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;

INSERT INTO perfis (tenant_id, tipo_perfil, codigo, nome) VALUES
(NULL, 'BASE', 'CEO', 'CEO / Diretor Geral'),
(NULL, 'BASE', 'REPRESENTANTE_EMPRESA', 'Representante da Empresa'),
(NULL, 'BASE', 'ENCARREGADO_SISTEMA_EMPRESA', 'Encarregado do Sistema da Empresa');
