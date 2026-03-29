import { api } from '@/lib/api';
import type { ContinuidadePlanoDTO, ReadinessScoreDTO, DrExecucaoDTO, CriseDTO } from './types';

export const ContinuidadeApi = {
  async listarPlanos(params?: { pagina?: number; limite?: number; tipo?: string | null; ativo?: boolean | null }): Promise<ContinuidadePlanoDTO[]> {
    const q = new URLSearchParams();
    if (params?.pagina) q.set('pagina', String(params.pagina));
    if (params?.limite) q.set('limite', String(params.limite));
    if (params?.tipo) q.set('tipo', String(params.tipo));
    if (params?.ativo != null) q.set('ativo', params.ativo ? 'true' : 'false');
    const res = await api.get(`/api/v1/continuidade/planos?${q.toString()}`);
    return res.data?.data ?? res.data ?? [];
  },
  async criarPlano(body: any): Promise<{ id: number }> {
    const res = await api.post('/api/v1/continuidade/planos', body);
    return res.data?.data ?? res.data;
  },
  async obterPlano(id: number): Promise<ContinuidadePlanoDTO> {
    const res = await api.get(`/api/v1/continuidade/planos/${id}`);
    return res.data?.data ?? res.data;
  },
  async obterReadinessPlano(id: number): Promise<ReadinessScoreDTO> {
    const res = await api.get(`/api/v1/continuidade/planos/${id}/readiness`);
    return res.data?.data ?? res.data;
  },
  async listarExecucoesDr(params?: { pagina?: number; limite?: number; status?: string | null }): Promise<DrExecucaoDTO[]> {
    const q = new URLSearchParams();
    if (params?.pagina) q.set('pagina', String(params.pagina));
    if (params?.limite) q.set('limite', String(params.limite));
    if (params?.status) q.set('status', String(params.status));
    const res = await api.get(`/api/v1/continuidade/dr/execucoes?${q.toString()}`);
    return res.data?.data ?? res.data ?? [];
  },
  async iniciarExecucaoDr(body: any): Promise<{ id: number }> {
    const res = await api.post('/api/v1/continuidade/dr/execucoes', body);
    return res.data?.data ?? res.data;
  },
  async aprovarExecucaoDr(id: number): Promise<any> {
    const res = await api.post(`/api/v1/continuidade/dr/execucoes/${id}/aprovar`);
    return res.data?.data ?? res.data;
  },
  async concluirExecucaoDr(id: number, body?: any): Promise<any> {
    const res = await api.post(`/api/v1/continuidade/dr/execucoes/${id}/concluir`, body || {});
    return res.data?.data ?? res.data;
  },
  async listarCrises(params?: { pagina?: number; limite?: number; status?: string | null }): Promise<CriseDTO[]> {
    const q = new URLSearchParams();
    if (params?.pagina) q.set('pagina', String(params.pagina));
    if (params?.limite) q.set('limite', String(params.limite));
    if (params?.status) q.set('status', String(params.status));
    const res = await api.get(`/api/v1/continuidade/crises?${q.toString()}`);
    return res.data?.data ?? res.data ?? [];
  },
  async abrirCrise(body: any): Promise<{ id: number }> {
    const res = await api.post('/api/v1/continuidade/crises', body);
    return res.data?.data ?? res.data;
  },
};
