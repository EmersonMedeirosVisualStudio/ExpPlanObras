CREATE TABLE busca_global_documentos (
  id_busca_documento BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  modulo VARCHAR(40) NOT NULL,
  entidade_tipo VARCHAR(60) NOT NULL,
  entidade_id BIGINT NOT NULL,
  titulo VARCHAR(255) NOT NULL,
  subtitulo VARCHAR(255) NULL,
  codigo_referencia VARCHAR(120) NULL,
  status_referencia VARCHAR(40) NULL,
  rota VARCHAR(255) NOT NULL,
  resumo_texto TEXT NULL,
  termos_busca LONGTEXT NULL,
  palavras_chave VARCHAR(500) NULL,
  permissao_view VARCHAR(120) NULL,
  id_diretoria BIGINT NULL,
  id_obra BIGINT NULL,
  id_unidade BIGINT NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  atualizado_em_origem DATETIME NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_busca_documento_entidade (tenant_id, entidade_tipo, entidade_id),
  INDEX ix_busca_tenant_modulo (tenant_id, modulo, ativo),
  INDEX ix_busca_scope (tenant_id, id_diretoria, id_obra, id_unidade, ativo),
  FULLTEXT KEY ft_busca_documentos (titulo, subtitulo, codigo_referencia, resumo_texto, termos_busca, palavras_chave)
);

CREATE TABLE usuarios_busca_recente (
  id_usuario_busca_recente BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  id_usuario BIGINT NOT NULL,
  query_texto VARCHAR(180) NOT NULL,
  ultima_busca_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  contador_uso INT NOT NULL DEFAULT 1,
  UNIQUE KEY uq_usuario_busca_recente (tenant_id, id_usuario, query_texto)
);

CREATE TABLE usuarios_busca_resultados_recentes (
  id_usuario_busca_resultado_recente BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  id_usuario BIGINT NOT NULL,
  entidade_tipo VARCHAR(60) NOT NULL,
  entidade_id BIGINT NOT NULL,
  titulo VARCHAR(255) NOT NULL,
  rota VARCHAR(255) NOT NULL,
  modulo VARCHAR(40) NOT NULL,
  ultima_abertura_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  contador_aberturas INT NOT NULL DEFAULT 1,
  UNIQUE KEY uq_usuario_busca_resultado (tenant_id, id_usuario, entidade_tipo, entidade_id)
);

