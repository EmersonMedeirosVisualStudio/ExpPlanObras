CREATE TABLE notificacoes_eventos (
  id_notificacao_evento BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  modulo VARCHAR(30) NOT NULL,
  chave_evento VARCHAR(120) NOT NULL,
  chave_deduplicacao VARCHAR(180) NOT NULL,
  severidade VARCHAR(20) NOT NULL,
  titulo VARCHAR(180) NOT NULL,
  mensagem TEXT NOT NULL,
  rota VARCHAR(255) NULL,
  entidade_tipo VARCHAR(60) NULL,
  entidade_id BIGINT NULL,
  referencia_data DATETIME NULL,
  expira_em DATETIME NULL,
  resolvida_em DATETIME NULL,
  metadata_json JSON NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_notificacoes_evento_dedupe (tenant_id, chave_deduplicacao)
);

CREATE TABLE notificacoes_destinatarios (
  id_notificacao_destinatario BIGINT PRIMARY KEY AUTO_INCREMENT,
  id_notificacao_evento BIGINT NOT NULL,
  tenant_id BIGINT NOT NULL,
  id_usuario BIGINT NOT NULL,
  status_leitura VARCHAR(20) NOT NULL DEFAULT 'NAO_LIDA',
  entregue_no_app TINYINT(1) NOT NULL DEFAULT 1,
  entregue_email TINYINT(1) NOT NULL DEFAULT 0,
  entregue_push TINYINT(1) NOT NULL DEFAULT 0,
  lida_em DATETIME NULL,
  arquivada_em DATETIME NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_notificacao_destinatario (id_notificacao_evento, id_usuario),
  KEY idx_notif_dest_tenant_usuario (tenant_id, id_usuario),
  KEY idx_notif_dest_evento (id_notificacao_evento)
);

CREATE TABLE notificacoes_preferencias_usuario (
  id_notificacao_preferencia BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  id_usuario BIGINT NOT NULL,
  modulo VARCHAR(30) NOT NULL,
  recebe_no_app TINYINT(1) NOT NULL DEFAULT 1,
  recebe_email TINYINT(1) NOT NULL DEFAULT 0,
  somente_criticas_email TINYINT(1) NOT NULL DEFAULT 1,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_notificacao_preferencia_usuario (tenant_id, id_usuario, modulo)
);

