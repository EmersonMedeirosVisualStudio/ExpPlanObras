import type { SearchIndexProvider } from './types';
import { funcionariosSearchProvider } from './providers/funcionarios';
import { obrasSearchProvider } from './providers/obras';
import { contratosSearchProvider } from './providers/contratos';
import { solicitacoesSearchProvider } from './providers/solicitacoes';

export const SEARCH_INDEX_PROVIDERS: SearchIndexProvider[] = [
  funcionariosSearchProvider,
  obrasSearchProvider,
  contratosSearchProvider,
  solicitacoesSearchProvider,
];

export function getProviderByEntityType(entidadeTipo: string) {
  return SEARCH_INDEX_PROVIDERS.find((p) => p.entidadeTipo === entidadeTipo) || null;
}

