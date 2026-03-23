export const PERMISSIONS = {
  DASHBOARD_VIEW: 'dashboard.view',
  DASHBOARD_CEO_VIEW: 'dashboard.ceo.view',
  DASHBOARD_EXECUTIVO_VIEW: 'dashboard.executivo.view',
  DASHBOARD_DIRETOR_VIEW: 'dashboard.diretor.view',
  DASHBOARD_GERENTE_VIEW: 'dashboard.gerente.view',
  DASHBOARD_USUARIO_PERSONALIZAR: 'dashboard.usuario.personalizar',

  OBRAS_VIEW: 'obras.view',
  MAPA_OBRAS_VIEW: 'obras.mapa.view',

  CONFIG_EMPRESA_VIEW: 'config.empresa.view',
  CONFIG_EMPRESA_EDIT: 'config.empresa.edit',

  REPRESENTANTE_VIEW: 'config.representante.view',
  REPRESENTANTE_EDIT: 'config.representante.edit',

  ENCARREGADO_SISTEMA_VIEW: 'config.encarregado.view',
  ENCARREGADO_SISTEMA_EDIT: 'config.encarregado.edit',
  ENCARREGADO_SISTEMA_SOLICITAR_SAIDA: 'config.encarregado.solicitar_saida',

  GOVERNANCA_VIEW: 'admin.governanca.view',
  GOVERNANCA_USUARIOS_CRUD: 'admin.governanca.usuarios.crud',
  GOVERNANCA_PERFIS_CRUD: 'admin.governanca.perfis.crud',
  GOVERNANCA_ABRANGENCIA_CRUD: 'admin.governanca.abrangencia.crud',

  BACKUP_VIEW: 'admin.backup.view',
  BACKUP_EDIT: 'admin.backup.edit',
  BACKUP_RESTORE_REQUEST: 'admin.backup.restore.request',

  ORGANOGRAMA_VIEW: 'organograma.estrutura.view',
  ORGANOGRAMA_CRUD: 'organograma.estrutura.crud',

  RH_FUNCIONARIOS_VIEW: 'rh.funcionarios.view',
  RH_FUNCIONARIOS_CRUD: 'rh.funcionarios.crud',
  RH_FUNCIONARIOS_ENDOSSAR: 'rh.funcionarios.endossar',

  RH_HORAS_EXTRAS_VIEW: 'rh.horas_extras.view',
  RH_HORAS_EXTRAS_CRUD: 'rh.horas_extras.crud',
  RH_HORAS_EXTRAS_PROCESSAR: 'rh.horas_extras.processar',

  RH_PRESENCAS_VIEW: 'rh.presencas.view',
  RH_PRESENCAS_CRUD: 'rh.presencas.crud',
  RH_PRESENCAS_FECHAR: 'rh.presencas.fechar',
  RH_PRESENCAS_ENVIAR: 'rh.presencas.enviar_rh',
  RH_PRESENCAS_RECEBER: 'rh.presencas.receber_rh',

  RH_ASSINATURAS_EXECUTAR: 'rh.assinaturas.executar',

  SST_EPI_VIEW: 'sst.epi.view',
  SST_EPI_CRUD: 'sst.epi.crud',
  SST_EPI_ENTREGA: 'sst.epi.entrega',
  SST_EPI_DEVOLUCAO: 'sst.epi.devolucao',
  SST_EPI_INSPECAO: 'sst.epi.inspecao',
  SST_EPI_ASSINAR: 'sst.epi.assinar',
  SST_TECNICOS_VIEW: 'sst.tecnicos.view',
  SST_TECNICOS_CRUD: 'sst.tecnicos.crud',

  SST_CHECKLISTS_VIEW: 'sst.checklists.view',
  SST_CHECKLISTS_CRUD: 'sst.checklists.crud',
  SST_CHECKLISTS_EXECUTAR: 'sst.checklists.executar',
  SST_CHECKLISTS_FINALIZAR: 'sst.checklists.finalizar',
  SST_CHECKLISTS_ASSINAR: 'sst.checklists.assinar',

  SST_NC_VIEW: 'sst.nao_conformidades.view',
  SST_NC_CRUD: 'sst.nao_conformidades.crud',
  SST_NC_TRATAR: 'sst.nao_conformidades.tratar',
  SST_NC_VALIDAR: 'sst.nao_conformidades.validar',
  SST_NC_ENCERRAR: 'sst.nao_conformidades.encerrar',

  SST_TREINAMENTOS_VIEW: 'sst.treinamentos.view',
  SST_TREINAMENTOS_CRUD: 'sst.treinamentos.crud',
  SST_TREINAMENTOS_EXECUTAR: 'sst.treinamentos.executar',
  SST_TREINAMENTOS_ASSINAR: 'sst.treinamentos.assinar',
  SST_TREINAMENTOS_FINALIZAR: 'sst.treinamentos.finalizar',
  SST_TREINAMENTOS_CERTIFICAR: 'sst.treinamentos.certificar',

  SST_ACIDENTES_VIEW: 'sst.acidentes.view',
  SST_ACIDENTES_CRUD: 'sst.acidentes.crud',
  SST_ACIDENTES_INVESTIGAR: 'sst.acidentes.investigar',
  SST_ACIDENTES_VALIDAR: 'sst.acidentes.validar',
  SST_ACIDENTES_ENCERRAR: 'sst.acidentes.encerrar',
  SST_ACIDENTES_CAT: 'sst.acidentes.cat',

  SST_PAINEL_VIEW: 'sst.painel.view',
  SST_PAINEL_EXECUTIVO_VIEW: 'sst.painel.executivo.view',

  FUNCIONARIOS_VIEW: 'rh.funcionarios.view',
  FUNCIONARIOS_CRUD: 'rh.funcionarios.crud',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PROFILE_CODES = {
  CEO: 'CEO',
  REPRESENTANTE_EMPRESA: 'REPRESENTANTE_EMPRESA',
  ENCARREGADO_SISTEMA_EMPRESA: 'ENCARREGADO_SISTEMA_EMPRESA',
  DIRETOR: 'DIRETOR',
  GERENTE_RH: 'GERENTE_RH',
  ADMIN_RH: 'ADMIN_RH',
  SST_TECNICO: 'SST_TECNICO',
} as const;

export type ProfileCode = (typeof PROFILE_CODES)[keyof typeof PROFILE_CODES];
