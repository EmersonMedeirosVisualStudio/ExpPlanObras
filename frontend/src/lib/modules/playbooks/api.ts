import { api } from '@/lib/api';
import type { PlaybookDTO, PlaybookExecutionDTO, PlaybookSimulationDTO } from './types';

export const PlaybooksApi = {
  async listarPlaybooks(params?: { pagina?: number; limite?: number; ativo?: boolean | null }): Promise<PlaybookDTO[]> {
    const q = new URLSearchParams();
    if (params?.pagina) q.set('pagina', String(params.pagina));
    if (params?.limite) q.set('limite', String(params.limite));
    if (params?.ativo != null) q.set('ativo', params.ativo ? 'true' : 'false');
    const res = await api.get(`/api/v1/observabilidade/playbooks?${q.toString()}`);
    return res.data?.data ?? res.data ?? [];
  },
  async obterPlaybook(id: number): Promise<PlaybookDTO> {
    const res = await api.get(`/api/v1/observabilidade/playbooks/${id}`);
    return res.data?.data ?? res.data;
  },
  async criarPlaybook(body: any): Promise<{ id: number }> {
    const res = await api.post('/api/v1/observabilidade/playbooks', body);
    return res.data?.data ?? res.data;
  },
  async atualizarPlaybook(id: number, body: any): Promise<{ ok: true }> {
    const res = await api.put(`/api/v1/observabilidade/playbooks/${id}`, body);
    return res.data?.data ?? res.data;
  },
  async simularPlaybook(id: number): Promise<PlaybookSimulationDTO> {
    const res = await api.post(`/api/v1/observabilidade/playbooks/${id}/simular`);
    return res.data?.data ?? res.data;
  },
  async executarPlaybook(id: number, body?: { alertaId?: number | null; incidenteId?: number | null; eventoOrigemId?: number | null; modoExecucao?: string | null }) {
    const res = await api.post(`/api/v1/observabilidade/playbooks/${id}/executar`, body || {});
    return res.data?.data ?? res.data;
  },
  async listarExecucoes(params?: { pagina?: number; limite?: number; status?: string | null }): Promise<PlaybookExecutionDTO[]> {
    const q = new URLSearchParams();
    if (params?.pagina) q.set('pagina', String(params.pagina));
    if (params?.limite) q.set('limite', String(params.limite));
    if (params?.status) q.set('status', String(params.status));
    const res = await api.get(`/api/v1/observabilidade/playbooks/execucoes?${q.toString()}`);
    return res.data?.data ?? res.data ?? [];
  },
  async aprovarExecucao(id: number): Promise<any> {
    const res = await api.post(`/api/v1/observabilidade/playbooks/execucoes/${id}/aprovar`);
    return res.data?.data ?? res.data;
  },
  async cancelarExecucao(id: number, body?: { motivo?: string | null }): Promise<any> {
    const res = await api.post(`/api/v1/observabilidade/playbooks/execucoes/${id}/cancelar`, body || {});
    return res.data?.data ?? res.data;
  },
  async listarCasosCompliance(params?: { pagina?: number; limite?: number; status?: string | null }): Promise<any[]> {
    const q = new URLSearchParams();
    if (params?.pagina) q.set('pagina', String(params.pagina));
    if (params?.limite) q.set('limite', String(params.limite));
    if (params?.status) q.set('status', String(params.status));
    const res = await api.get(`/api/v1/observabilidade/compliance/casos?${q.toString()}`);
    return res.data?.data ?? res.data ?? [];
  },
};

