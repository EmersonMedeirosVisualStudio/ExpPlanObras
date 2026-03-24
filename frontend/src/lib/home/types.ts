export type HomeModoInicio = 'HOME' | 'PRIMEIRO_MODULO' | 'ULTIMA_ROTA' | 'ROTA_FIXA';

export type FavoritoMenuDTO = {
  menuKey: string;
  ordem: number;
};

export type AtalhoRapidoDTO = {
  id: number;
  tipo: 'MENU' | 'ROTA' | 'ACAO';
  titulo: string;
  href: string | null;
  menuKey: string | null;
  icone: string | null;
  cor: string | null;
  ordem: number;
  ativo: boolean;
};

export type HomePreferenciasDTO = {
  modoInicio: HomeModoInicio;
  rotaFixa: string | null;
  exibirFavoritosMenu: boolean;
  exibirRecentes: boolean;
};

export type HomeRecenteDTO = {
  href: string;
  titulo: string;
  ultimaVisitaEm: string;
};

export type HomeWidgetKey =
  | 'BEM_VINDO'
  | 'ATALHOS_RAPIDOS'
  | 'FAVORITOS'
  | 'RECENTES'
  | 'NOTIFICACOES'
  | 'PENDENCIAS_MODULOS'
  | 'RESUMO_RH'
  | 'RESUMO_SST'
  | 'RESUMO_SUPRIMENTOS'
  | 'RESUMO_ENGENHARIA';

export type HomeWidgetDTO = {
  widgetKey: HomeWidgetKey;
  titulo: string;
  dados: unknown;
};

export type DashboardHomeDTO = {
  preferencias: HomePreferenciasDTO;
  favoritos: FavoritoMenuDTO[];
  atalhos: AtalhoRapidoDTO[];
  recentes: HomeRecenteDTO[];
  widgets: HomeWidgetDTO[];
};

