import type {
  RelatorioAgendadoDTO,
  RelatorioAgendadoDestinatarioDTO,
  RelatorioAgendadoExecucaoDTO,
  RelatorioAgendadoSaveDTO,
} from './types';

type ApiResponse<T> = { success: boolean; message?: string; data: T };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (!res.ok || !json?.success) throw new Error(json?.message || 'Erro na requisição');
  return json.data;
}

export const RelatoriosAgendadosApi = {
  listar: () => api<RelatorioAgendadoDTO[]>('/api/v1/relatorios/agendamentos'),
  obter: (id: number) =>
    api<{ agendamento: RelatorioAgendadoDTO & { assuntoEmailTemplate?: string | null; corpoEmailTemplate?: string | null }; destinatarios: RelatorioAgendadoDestinatarioDTO[] }>(
      `/api/v1/relatorios/agendamentos/${id}`
    ),
  criar: (body: RelatorioAgendadoSaveDTO) =>
    api<{ id: number }>('/api/v1/relatorios/agendamentos', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  atualizar: (id: number, body: RelatorioAgendadoSaveDTO) =>
    api<void>(`/api/v1/relatorios/agendamentos/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  alterarStatus: (id: number, acao: 'ATIVAR' | 'PAUSAR') =>
    api<void>(`/api/v1/relatorios/agendamentos/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ acao }),
    }),
  executarAgora: (id: number) =>
    api<void>(`/api/v1/relatorios/agendamentos/${id}/executar-agora`, {
      method: 'POST',
    }),
  listarExecucoes: (id: number) => api<RelatorioAgendadoExecucaoDTO[]>(`/api/v1/relatorios/agendamentos/${id}/execucoes`),
};

