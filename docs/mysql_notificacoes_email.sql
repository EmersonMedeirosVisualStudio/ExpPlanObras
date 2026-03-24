ALTER TABLE notificacoes_preferencias_usuario
  ADD COLUMN modo_email VARCHAR(20) NOT NULL DEFAULT 'IMEDIATO',
  ADD COLUMN horario_digesto TIME NULL,
  ADD COLUMN timezone VARCHAR(60) NULL,
  ADD COLUMN recebe_email_critico_forcado TINYINT(1) NOT NULL DEFAULT 0;

CREATE TABLE notificacoes_email_fila (
  id_notificacao_email BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  id_notificacao_evento BIGINT NULL,
  id_notificacao_destinatario BIGINT NULL,
  id_usuario_destinatario BIGINT NOT NULL,
  email_destino VARCHAR(180) NOT NULL,
  template_key VARCHAR(80) NOT NULL,
  assunto VARCHAR(255) NOT NULL,
  payload_json JSON NOT NULL,
  status_envio VARCHAR(20) NOT NULL DEFAULT 'PENDENTE',
  tentativas INT NOT NULL DEFAULT 0,
  proxima_tentativa_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processando_desde DATETIME NULL,
  enviado_em DATETIME NULL,
  erro_em DATETIME NULL,
  provider_message_id VARCHAR(180) NULL,
  ultimo_erro TEXT NULL,
  chave_deduplicacao VARCHAR(180) NOT NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_notificacao_email_dedupe (tenant_id, chave_deduplicacao),
  KEY idx_notif_email_status (tenant_id, status_envio, proxima_tentativa_em)
);

CREATE TABLE notificacoes_templates_tenant (
  id_notificacao_template BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  template_key VARCHAR(80) NOT NULL,
  assunto_template TEXT NOT NULL,
  html_template LONGTEXT NULL,
  text_template LONGTEXT NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  versao INT NOT NULL DEFAULT 1,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_notificacao_template_tenant (tenant_id, template_key)
);

