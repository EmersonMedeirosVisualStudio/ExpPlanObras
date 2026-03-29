import { api } from '@/lib/api';
import type { GrcActionPlanDTO, GrcAuditDTO, GrcControlDTO, GrcFindingDTO, GrcRiskDTO } from './types';

export const GrcApi = {
  async listarRiscos(params?: { pagina?: number; limite?: number; status?: string | null; categoria?: string | null }): Promise<GrcRiskDTO[]> {
    const q = new URLSearchParams();
    if (params?.pagina) q.set('pagina', String(params.pagina));
    if (params?.limite) q.set('limite', String(params.limite));
    if (params?.status) q.set('status', String(params.status));
    if (params?.categoria) q.set('categoria', String(params.categoria));
    const res = await api.get(`/api/v1/grc/riscos?${q.toString()}`);
    return res.data?.data ?? res.data ?? [];
  },
  async criarRisco(body: any): Promise<{ id: number }> {
    const res = await api.post('/api/v1/grc/riscos', body);
    return res.data?.data ?? res.data;
  },
  async avaliarRisco(id: number, body: any): Promise<any> {
    const res = await api.post(`/api/v1/grc/riscos/${id}/avaliacoes`, body);
    return res.data?.data ?? res.data;
  },
  async recalcularRisco(id: number): Promise<any> {
    const res = await api.post(`/api/v1/grc/riscos/${id}/recalcular`);
    return res.data?.data ?? res.data;
  },
  async listarControles(params?: { pagina?: number; limite?: number; ativo?: boolean | null }): Promise<GrcControlDTO[]> {
    const q = new URLSearchParams();
    if (params?.pagina) q.set('pagina', String(params.pagina));
    if (params?.limite) q.set('limite', String(params.limite));
    if (params?.ativo != null) q.set('ativo', params.ativo ? 'true' : 'false');
    const res = await api.get(`/api/v1/grc/controles?${q.toString()}`);
    return res.data?.data ?? res.data ?? [];
  },
  async criarControle(body: any): Promise<{ id: number }> {
    const res = await api.post('/api/v1/grc/controles', body);
    return res.data?.data ?? res.data;
  },
  async listarAuditorias(params?: { pagina?: number; limite?: number; status?: string | null }): Promise<GrcAuditDTO[]> {
    const q = new URLSearchParams();
    if (params?.pagina) q.set('pagina', String(params.pagina));
    if (params?.limite) q.set('limite', String(params.limite));
    if (params?.status) q.set('status', String(params.status));
    const res = await api.get(`/api/v1/grc/auditorias?${q.toString()}`);
    return res.data?.data ?? res.data ?? [];
  },
  async criarAuditoria(body: any): Promise<{ id: number }> {
    const res = await api.post('/api/v1/grc/auditorias', body);
    return res.data?.data ?? res.data;
  },
  async listarAchados(params?: { pagina?: number; limite?: number; status?: string | null; gravidade?: string | null }): Promise<GrcFindingDTO[]> {
    const q = new URLSearchParams();
    if (params?.pagina) q.set('pagina', String(params.pagina));
    if (params?.limite) q.set('limite', String(params.limite));
    if (params?.status) q.set('status', String(params.status));
    if (params?.gravidade) q.set('gravidade', String(params.gravidade));
    const res = await api.get(`/api/v1/grc/achados?${q.toString()}`);
    return res.data?.data ?? res.data ?? [];
  },
  async criarAchado(body: any): Promise<{ id: number }> {
    const res = await api.post('/api/v1/grc/achados', body);
    return res.data?.data ?? res.data;
  },
  async listarPlanosAcao(params?: { pagina?: number; limite?: number; status?: string | null }): Promise<GrcActionPlanDTO[]> {
    const q = new URLSearchParams();
    if (params?.pagina) q.set('pagina', String(params.pagina));
    if (params?.limite) q.set('limite', String(params.limite));
    if (params?.status) q.set('status', String(params.status));
    const res = await api.get(`/api/v1/grc/planos-acao?${q.toString()}`);
    return res.data?.data ?? res.data ?? [];
  },
  async criarPlanoAcao(body: any): Promise<{ id: number }> {
    const res = await api.post('/api/v1/grc/planos-acao', body);
    return res.data?.data ?? res.data;
  },
  async aprovarPlanoAcao(id: number): Promise<any> {
    const res = await api.post(`/api/v1/grc/planos-acao/${id}/aprovar`);
    return res.data?.data ?? res.data;
  },
  async concluirPlanoAcao(id: number): Promise<any> {
    const res = await api.post(`/api/v1/grc/planos-acao/${id}/concluir`);
    return res.data?.data ?? res.data;
  },
};

