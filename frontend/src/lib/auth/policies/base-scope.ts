import type { ResourceContext, SubjectContext } from './types';

export function passesBaseScope(subject: SubjectContext, resource: ResourceContext): boolean {
  if (subject.scope.empresaTotal) return true;

  const diretoriaId = resource.diretoriaId !== undefined && resource.diretoriaId !== null ? Number(resource.diretoriaId) : null;
  if (diretoriaId && subject.scope.diretorias.includes(diretoriaId)) return true;

  const idObra = resource.idObra !== undefined && resource.idObra !== null ? Number(resource.idObra) : null;
  if (idObra && subject.scope.obras.includes(idObra)) return true;

  const idUnidade = resource.idUnidade !== undefined && resource.idUnidade !== null ? Number(resource.idUnidade) : null;
  if (idUnidade && subject.scope.unidades.includes(idUnidade)) return true;

  return false;
}

