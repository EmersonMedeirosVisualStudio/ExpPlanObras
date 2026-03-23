import type { DiaSemana, ExecucaoBackupDTO, PoliticaBackupDTO, SolicitacaoRestauracaoDTO, StatusExecucaoBackup, StatusRestauracao } from './types';

type ApiResponse<T> = {
  success: boolean;
  message?: string;
  data: T;
  meta?: Record<string, unknown>;
};

async function api<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  });

  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;

  if (!res.ok || !json?.success) {
    throw new Error(json?.message || 'Erro na requisição');
  }

  return json.data;
}

const DIA_TO_INT: Record<DiaSemana, number> = {
  DOMINGO: 0,
  SEGUNDA: 1,
  TERCA: 2,
  QUARTA: 3,
  QUINTA: 4,
  SEXTA: 5,
  SABADO: 6,
};

const INT_TO_DIA: Record<number, DiaSemana> = {
  0: 'DOMINGO',
  1: 'SEGUNDA',
  2: 'TERCA',
  3: 'QUARTA',
  4: 'QUINTA',
  5: 'SEXTA',
  6: 'SABADO',
};

function normalizeDiaSemana(raw: unknown): DiaSemana | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return INT_TO_DIA[raw] ?? null;
  const s = String(raw).toUpperCase();
  if (s === 'DOMINGO' || s === 'SEGUNDA' || s === 'TERCA' || s === 'QUARTA' || s === 'QUINTA' || s === 'SEXTA' || s === 'SABADO') return s;
  return null;
}

function normalizePolitica(raw: any): PoliticaBackupDTO {
  return {
    id: raw.id ?? raw.id_backup_politica ?? undefined,
    periodicidade: raw.periodicidade,
    horaExecucao: raw.horaExecucao ?? raw.hora_execucao ?? '00:00',
    diaSemana: normalizeDiaSemana(raw.diaSemana ?? raw.dia_semana ?? null),
    retencaoDias: Number(raw.retencaoDias ?? raw.retencao_dias ?? 30),
    ativo: Boolean(raw.ativo),
  };
}

function normalizeExecucao(raw: any): ExecucaoBackupDTO {
  return {
    id: raw.id ?? raw.id_backup_execucao,
    dataHoraInicio: raw.dataHoraInicio ?? raw.data_hora_inicio ?? raw.inicio,
    dataHoraFim: raw.dataHoraFim ?? raw.data_hora_fim ?? raw.fim ?? null,
    status: raw.status as StatusExecucaoBackup,
    referenciaArquivo: raw.referenciaArquivo ?? raw.referencia_arquivo ?? null,
    hashArquivo: raw.hashArquivo ?? raw.hash_arquivo ?? null,
    tamanhoMb: raw.tamanhoMb != null ? Number(raw.tamanhoMb) : raw.tamanho_mb != null ? Number(raw.tamanho_mb) : null,
    observacao: raw.observacao ?? null,
  };
}

function normalizeRestauracao(raw: any): SolicitacaoRestauracaoDTO {
  return {
    id: raw.id ?? raw.id_backup_restauracao,
    pontoReferencia: raw.pontoReferencia ?? raw.ponto_referencia,
    motivo: raw.motivo,
    status: raw.status as StatusRestauracao,
    solicitadoEm: raw.solicitadoEm ?? raw.solicitado_em,
  };
}

export const BackupApi = {
  async obterPolitica(): Promise<PoliticaBackupDTO | null> {
    const data = await api<any | null>('/api/v1/admin/backup/politica');
    return data ? normalizePolitica(data) : null;
  },

  async salvarPolitica(payload: PoliticaBackupDTO): Promise<void> {
    const body = {
      ...payload,
      diaSemana: payload.periodicidade === 'SEMANAL' && payload.diaSemana ? DIA_TO_INT[payload.diaSemana] : null,
    };

    await api('/api/v1/admin/backup/politica', {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  },

  async listarExecucoes(limite = 20): Promise<ExecucaoBackupDTO[]> {
    const data = await api<any[]>(`/api/v1/admin/backup/execucoes?limite=${limite}`);
    return data.map(normalizeExecucao);
  },

  async executarAgora(): Promise<void> {
    await api('/api/v1/admin/backup/executar', {
      method: 'POST',
    });
  },

  async listarRestauracoes(): Promise<SolicitacaoRestauracaoDTO[]> {
    const data = await api<any[]>('/api/v1/admin/backup/restauracoes');
    return data.map(normalizeRestauracao);
  },

  async solicitarRestauracao(payload: { pontoReferencia: string; motivo: string }): Promise<void> {
    await api('/api/v1/admin/backup/restauracoes', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};
