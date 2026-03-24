ALTER TABLE notificacoes_email_fila
  ADD COLUMN categoria_email VARCHAR(20) NOT NULL DEFAULT 'NOTIFICACAO',
  ADD COLUMN origem_tipo VARCHAR(30) NULL,
  ADD COLUMN origem_id BIGINT NULL,
  ADD COLUMN anexos_json JSON NULL;

CREATE TABLE relatorios_agendamentos (
  id_relatorio_agendamento BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  nome_agendamento VARCHAR(150) NOT NULL,
  contexto_dashboard VARCHAR(30) NOT NULL,
  formato_envio VARCHAR(20) NOT NULL,
  recorrencia VARCHAR(20) NOT NULL,
  horario_execucao TIME NOT NULL,
  timezone VARCHAR(60) NOT NULL DEFAULT 'America/Sao_Paulo',
  dia_semana TINYINT NULL,
  dia_mes TINYINT NULL,
  filtros_json JSON NULL,
  widgets_json JSON NULL,
  assunto_email_template VARCHAR(255) NULL,
  corpo_email_template TEXT NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  status_agendamento VARCHAR(20) NOT NULL DEFAULT 'ATIVO',
  id_usuario_criador BIGINT NOT NULL,
  id_usuario_proprietario BIGINT NOT NULL,
  proxima_execucao_em DATETIME NULL,
  ultima_execucao_em DATETIME NULL,
  ultima_execucao_status VARCHAR(20) NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE relatorios_agendamentos_destinatarios (
  id_relatorio_agendamento_destinatario BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  id_relatorio_agendamento BIGINT NOT NULL,
  tipo_destinatario VARCHAR(20) NOT NULL,
  id_usuario BIGINT NULL,
  email_destino VARCHAR(180) NULL,
  nome_destinatario VARCHAR(120) NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_rel_ag_dest (tenant_id, id_relatorio_agendamento)
);

CREATE TABLE relatorios_agendamentos_execucoes (
  id_relatorio_agendamento_execucao BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  id_relatorio_agendamento BIGINT NOT NULL,
  status_execucao VARCHAR(30) NOT NULL DEFAULT 'PENDENTE',
  iniciado_em DATETIME NULL,
  finalizado_em DATETIME NULL,
  mensagem_resultado TEXT NULL,
  total_destinatarios INT NOT NULL DEFAULT 0,
  total_emails_enfileirados INT NOT NULL DEFAULT 0,
  total_arquivos INT NOT NULL DEFAULT 0,
  id_usuario_executor_manual BIGINT NULL,
  execucao_manual TINYINT(1) NOT NULL DEFAULT 0,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_rel_exec_status (tenant_id, status_execucao, criado_em)
);

CREATE TABLE relatorios_agendamentos_execucoes_arquivos (
  id_relatorio_execucao_arquivo BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  id_relatorio_agendamento_execucao BIGINT NOT NULL,
  formato_arquivo VARCHAR(10) NOT NULL,
  nome_arquivo VARCHAR(255) NOT NULL,
  storage_path VARCHAR(500) NOT NULL,
  tamanho_bytes BIGINT NULL,
  hash_arquivo VARCHAR(128) NULL,
  conteudo_blob LONGBLOB NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_rel_exec_arq (tenant_id, id_relatorio_agendamento_execucao)
);

