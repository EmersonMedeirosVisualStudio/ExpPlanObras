export type UsuarioDTO = {
  id: number;
  nome: string;
  idFuncionario: number;
  login: string;
  emailLogin: string;
  ativo: boolean;
  bloqueado: boolean;
  ultimoAcesso?: string | null;
  perfis: string[];
  abrangencias: string[];
};

export type PermissaoDTO = {
  modulo: string;
  janela: string;
  acao: string;
};

export type PerfilDTO = {
  id: number;
  tenantId?: number | null;
  tipo: 'BASE' | 'EMPRESA';
  codigo: string;
  nome: string;
  ativo: boolean;
  permissoes: PermissaoDTO[];
};

export type AbrangenciaDTO = {
  id_usuario_abrangencia?: number;
  idUsuario: number;
  tipoAbrangencia: 'EMPRESA' | 'DIRETORIA' | 'OBRA' | 'UNIDADE';
  idSetorDiretoria?: number | null;
  idObra?: number | null;
  idUnidade?: number | null;
  ativo?: boolean;
};
