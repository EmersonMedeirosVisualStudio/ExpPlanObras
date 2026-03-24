CREATE TABLE realtime_eventos (
  id_realtime_evento BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  topico VARCHAR(60) NOT NULL,
  nome_evento VARCHAR(80) NOT NULL,
  alvo_tipo VARCHAR(20) NOT NULL,
  alvo_valor VARCHAR(180) NULL,
  payload_json JSON NULL,
  referencia_tipo VARCHAR(60) NULL,
  referencia_id BIGINT NULL,
  expira_em DATETIME NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_realtime_tenant_id (tenant_id, id_realtime_evento),
  INDEX ix_realtime_target (tenant_id, alvo_tipo, alvo_valor, id_realtime_evento),
  INDEX ix_realtime_topic (tenant_id, topico, id_realtime_evento)
);

