import { ApiError } from '@/lib/api/http';
import type { DashboardScope } from '@/lib/dashboard/scope';
import type { PortalGestorTipoLocal } from './types';

function todayIsoDate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export type PortalGestorFiltros = {
  tipoLocal: PortalGestorTipoLocal;
  idObra: number | null;
  idUnidade: number | null;
  dataReferencia: string;
};

export function resolvePortalGestorFiltrosFromSearchParams(
  scope: DashboardScope,
  searchParams: URLSearchParams
): { filtros: PortalGestorFiltros; precisaSelecionarLocal: boolean } {
  const tipoLocalRaw = String(searchParams.get('tipoLocal') || '').trim().toUpperCase();
  const idObra = searchParams.get('idObra') ? Number(searchParams.get('idObra')) : null;
  const idUnidade = searchParams.get('idUnidade') ? Number(searchParams.get('idUnidade')) : null;
  const dataReferencia = String(searchParams.get('dataReferencia') || todayIsoDate()).trim();

  let tipoLocal: PortalGestorTipoLocal | null = tipoLocalRaw === 'OBRA' || tipoLocalRaw === 'UNIDADE' ? (tipoLocalRaw as PortalGestorTipoLocal) : null;

  if (!tipoLocal) {
    const obras = scope.obras || [];
    const unidades = scope.unidades || [];
    if (obras.length === 1 && unidades.length === 0) tipoLocal = 'OBRA';
    if (unidades.length === 1 && obras.length === 0) tipoLocal = 'UNIDADE';
    if (!tipoLocal) {
      return {
        filtros: { tipoLocal: 'OBRA', idObra: null, idUnidade: null, dataReferencia },
        precisaSelecionarLocal: true,
      };
    }
  }

  const filtros: PortalGestorFiltros = {
    tipoLocal,
    idObra: tipoLocal === 'OBRA' ? (idObra ? idObra : null) : null,
    idUnidade: tipoLocal === 'UNIDADE' ? (idUnidade ? idUnidade : null) : null,
    dataReferencia,
  };

  if (tipoLocal === 'OBRA' && !filtros.idObra && !(scope.obras || []).length) {
    return { filtros, precisaSelecionarLocal: true };
  }
  if (tipoLocal === 'UNIDADE' && !filtros.idUnidade && !(scope.unidades || []).length) {
    return { filtros, precisaSelecionarLocal: true };
  }

  if (!scope.empresaTotal) {
    if (filtros.idObra && !scope.obras.includes(filtros.idObra)) throw new ApiError(403, 'Obra fora da abrangência');
    if (filtros.idUnidade && !scope.unidades.includes(filtros.idUnidade)) throw new ApiError(403, 'Unidade fora da abrangência');
  }

  if (tipoLocal === 'OBRA' && !filtros.idObra) throw new ApiError(422, 'Informe idObra');
  if (tipoLocal === 'UNIDADE' && !filtros.idUnidade) throw new ApiError(422, 'Informe idUnidade');

  if (!/^\d{4}-\d{2}-\d{2}$/.test(filtros.dataReferencia)) throw new ApiError(422, 'dataReferencia inválida (YYYY-MM-DD)');

  return { filtros, precisaSelecionarLocal: false };
}

