'use client';

import { useEffect, useMemo, useState } from 'react';
import { TerceirizadosApi } from '@/lib/modules/terceirizados/api';
import type { TerceirizadoResumoDTO } from '@/lib/modules/terceirizados/types';

function classNames(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(' ');
}

function formatTerceirizadoRef(id: number, nome: string) {
  return `#T${id} - ${nome}`;
}

function alerta(terc: TerceirizadoResumoDTO) {
  const missingRequired: string[] = [];
  if (!String(terc.nomeCompleto || '').trim()) missingRequired.push('Nome');

  const missingOptional: string[] = [];
  if (!String(terc.funcao || '').trim()) missingOptional.push('Função');
  if (!String(terc.empresaParceira || '').trim()) missingOptional.push('Empresa');

  if (missingRequired.length > 0) return { level: 'RED' as const, title: `Faltando obrigatório: ${missingRequired.join(', ')}` };
  if (missingOptional.length > 0) return { level: 'AMBER' as const, title: `Faltando opcional: ${missingOptional.join(', ')}` };
  return { level: 'GREEN' as const, title: 'Cadastro completo' };
}

function AlertaPill({ level, title }: { level: 'RED' | 'AMBER' | 'GREEN'; title: string }) {
  const color =
    level === 'RED'
      ? 'bg-red-100 text-red-800'
      : level === 'AMBER'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-emerald-100 text-emerald-800';
  const label = level === 'RED' ? 'Obrig.' : level === 'AMBER' ? 'Opc.' : 'OK';
  return (
    <span title={title} className={classNames('inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold', color)}>
      {label}
    </span>
  );
}

function Modal({ open, title, children, onClose }: { open: boolean; title: string; children: React.ReactNode; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl rounded-xl bg-white text-slate-900 shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="text-slate-700" type="button">
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export default function TerceirizadosClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [lista, setLista] = useState<TerceirizadoResumoDTO[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({ nomeCompleto: '', funcao: '' });

  const totalAtivos = useMemo(() => lista.filter((x) => x.ativo).length, [lista]);

  async function carregar() {
    try {
      setLoading(true);
      setError(null);
      const rows = await TerceirizadosApi.listar(busca);
      setLista(rows);
    } catch (e: any) {
      setError(e?.message || 'Erro ao carregar terceirizados');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Terceirizados</h2>
          <div className="text-sm text-slate-600">{totalAtivos} ativos</div>
        </div>
        <div className="flex items-center gap-2">
          <input className="input w-64" placeholder="Buscar (nome, função, empresa)" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <button type="button" className="rounded-lg border bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50" onClick={carregar}>
            Buscar
          </button>
          <button type="button" className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" onClick={() => setModalOpen(true)}>
            Novo
          </button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border bg-white p-4 text-sm text-slate-600">Carregando...</div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">Alertas</th>
                <th className="px-3 py-2">Terceirizado</th>
                <th className="px-3 py-2">Função</th>
                <th className="px-3 py-2">Empresa</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((t) => (
                <tr key={t.id} className="border-t">
                  <td className="px-3 py-2">
                    <AlertaPill {...alerta(t)} />
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-900">{formatTerceirizadoRef(t.id, t.nomeCompleto)}</td>
                  <td className="px-3 py-2">{t.funcao || '-'}</td>
                  <td className="px-3 py-2">{t.empresaParceira || '-'}</td>
                  <td className="px-3 py-2">{t.ativo ? 'Ativo' : 'Inativo'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={modalOpen}
        title="Novo terceirizado (mínimo)"
        onClose={() => {
          if (!salvando) setModalOpen(false);
        }}
      >
        <div className="space-y-4">
          <input className="input" placeholder="Nome completo" value={form.nomeCompleto} onChange={(e) => setForm((p) => ({ ...p, nomeCompleto: e.target.value }))} />
          <input className="input" placeholder="Função (opcional)" value={form.funcao} onChange={(e) => setForm((p) => ({ ...p, funcao: e.target.value }))} />

          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded-lg border bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:text-slate-400"
              disabled={salvando}
              onClick={() => setModalOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-60"
              disabled={salvando}
              onClick={async () => {
                try {
                  setSalvando(true);
                  await TerceirizadosApi.criar({ nomeCompleto: form.nomeCompleto, funcao: form.funcao || null, ativo: true });
                  setForm({ nomeCompleto: '', funcao: '' });
                  setModalOpen(false);
                  await carregar();
                } catch (e: any) {
                  setError(e?.message || 'Erro ao criar terceirizado');
                } finally {
                  setSalvando(false);
                }
              }}
            >
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

