import { api } from '@/lib/api';
import type { ObservabilityAlertDTO, ObservabilityEventDTO, ObservabilityIncidentDTO, ObservabilityRuleDTO } from './types';

export const ObservabilidadeApi = {
  async listarEventos(params?: {
    pagina?: number;
    limite?: number;
    categoria?: string | null;
    severidade?: string | null;
    resultado?: string | null;
    origemTipo?: string | null;
    texto?: string | null;
    desde?: string | null;
    ate?: string | null;
  }): Promise<ObservabilityEventDTO[]> {
    const q = new URLSearchParams();
    if (params?.pagina) q.set('pagina', String(params.pagina));
    if (params?.limite) q.set('limite', String(params.limite));
    if (params?.categoria) q.set('categoria', String(params.categoria));
    if (params?.severidade) q.set('severidade', String(params.severidade));
    if (params?.resultado) q.set('resultado', String(params.resultado));
    if (params?.origemTipo) q.set('origemTipo', String(params.origemTipo));
    if (params?.texto) q.set('texto', String(params.texto));
    if (params?.desde) q.set('desde', String(params.desde));
    if (params?.ate) q.set('ate', String(params.ate));
    const res = await api.get(`/api/v1/observabilidade/eventos?${q.toString()}`);
    return res.data?.data ?? res.data ?? [];
  },
  async obterEvento(id: number): Promise<ObservabilityEventDTO> {
    const res = await api.get(`/api/v1/observabilidade/eventos/${id}`);
    return res.data?.data ?? res.data;
  },
  async listarAlertas(params?: { pagina?: number; limite?: number; status?: string | null }): Promise<ObservabilityAlertDTO[]> {
    const q = new URLSearchParams();
    if (params?.pagina) q.set('pagina', String(params.pagina));
    if (params?.limite) q.set('limite', String(params.limite));
    if (params?.status) q.set('status', String(params.status));
    const res = await api.get(`/api/v1/observabilidade/alertas?${q.toString()}`);
    return res.data?.data ?? res.data ?? [];
  },
  async listarIncidentes(params?: { pagina?: number; limite?: number; status?: string | null }): Promise<ObservabilityIncidentDTO[]> {
    const q = new URLSearchParams();
    if (params?.pagina) q.set('pagina', String(params.pagina));
    if (params?.limite) q.set('limite', String(params.limite));
    if (params?.status) q.set('status', String(params.status));
    const res = await api.get(`/api/v1/observabilidade/incidentes?${q.toString()}`);
    return res.data?.data ?? res.data ?? [];
  },
  async listarRegras(params?: { pagina?: number; limite?: number; ativo?: boolean | null }): Promise<ObservabilityRuleDTO[]> {
    const q = new URLSearchParams();
    if (params?.pagina) q.set('pagina', String(params.pagina));
    if (params?.limite) q.set('limite', String(params.limite));
    if (params?.ativo != null) q.set('ativo', params.ativo ? 'true' : 'false');
    const res = await api.get(`/api/v1/observabilidade/regras?${q.toString()}`);
    return res.data?.data ?? res.data ?? [];
  },
};
