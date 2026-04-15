CREATE TABLE IF NOT EXISTS funcionarios_eventos (
    id_evento BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED NOT NULL,
    id_funcionario BIGINT UNSIGNED NOT NULL,
    tipo_evento VARCHAR(60) NOT NULL,
    data_evento DATE NOT NULL,
    descricao VARCHAR(500) NULL,
    valor_anterior JSON NULL,
    valor_novo JSON NULL,
    id_documento_registro BIGINT UNSIGNED NULL,
    id_usuario_criador BIGINT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_eventos_func (tenant_id, id_funcionario, data_evento),
    INDEX idx_eventos_tipo (tenant_id, tipo_evento),
    CONSTRAINT fk_evento_funcionario FOREIGN KEY (id_funcionario) REFERENCES funcionarios(id_funcionario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

