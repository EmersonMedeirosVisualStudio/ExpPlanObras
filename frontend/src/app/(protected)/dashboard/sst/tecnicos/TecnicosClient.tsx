'use client';

import { useEffect, useState } from 'react';
import { SstApi } from '@/lib/modules/sst/api';
import type { SstProfissionalDTO } from '@/lib/modules/sst/types';

export default function TecnicosClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lista, setLista] = useState<SstProfissionalDTO[]>([]);

  async function carregar() {
    try {
      setLoading(true);
      setError(null);
      const rows = await SstApi.listarTecnicos();
      setLista(Array.isArray(rows) ? rows : []);
    } catch (e: any) {
      setError(e?.message || 'Erro ao carregar técnicos.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function novo() {
    const idFuncionario = Number(prompt('ID do funcionário:') || '');
    if (!Number.isFinite(idFuncionario)) return;
    const tipoProfissional = (prompt('Tipo profissional (TECNICO_SEGURANCA/ENGENHEIRO_SEGURANCA/AUXILIAR_SST):') || '').trim();
    if (!tipoProfissional) return;
    const registroNumero = (prompt('Registro número (opcional):') || '').trim();
    const registroUf = (prompt('UF do registro (opcional):') || '').trim();
    const conselhoSigla = (prompt('Conselho (CREA/MTE etc) (opcional):') || '').trim();

    try {
      setError(null);
      await SstApi.criarTecnico({ idFuncionario, tipoProfissional, registroNumero: registroNumero || null, registroUf: registroUf || null, conselhoSigla: conselhoSigla || null });
      await carregar();
    } catch (e: any) {
      setError(e?.message || 'Erro ao criar.');
    }
  }

  async function editar(t: SstProfissionalDTO) {
    const tipoProfissional = (prompt('Tipo profissional:', t.tipoProfissional) || '').trim();
    if (!tipoProfissional) return;
    const registroNumero = (prompt('Registro número:', t.registroNumero || '') || '').trim();
    const registroUf = (prompt('UF:', t.registroUf || '') || '').trim();
    const conselhoSigla = (prompt('Conselho:', t.conselhoSigla || '') || '').trim();
    const ativo = (prompt('Ativo? (S/N)', t.ativo ? 'S' : 'N') || 'S').trim().toUpperCase() === 'S';

    try {
      setError(null);
      await SstApi.atualizarTecnico(t.id, { tipoProfissional, registroNumero: registroNumero || null, registroUf: registroUf || null, conselhoSigla: conselhoSigla || null, ativo });
      await carregar();
    } catch (e: any) {
      setError(e?.message || 'Erro ao atualizar.');
    }
  }

  async function alocar(t: SstProfissionalDTO) {
    const tipoLocal = (prompt('Tipo local (OBRA/UNIDADE):') || '').trim().toUpperCase();
    if (!tipoLocal) return;
    const idRef = Number(prompt(`ID da ${tipoLocal === 'OBRA' ? 'obra' : 'unidade'}:`) || '');
    if (!Number.isFinite(idRef)) return;
    const dataInicio = (prompt('Data início (YYYY-MM-DD):') || '').trim();
    if (!dataInicio) return;
    const principal = (prompt('Principal? (S/N):') || 'N').trim().toUpperCase() === 'S';
    const observacao = (prompt('Observação (opcional):') || '').trim();

    try {
      setError(null);
      await SstApi.adicionarAlocacaoTecnico(t.id, {
        tipoLocal,
        idObra: tipoLocal === 'OBRA' ? idRef : null,
        idUnidade: tipoLocal === 'UNIDADE' ? idRef : null,
        dataInicio,
        principal,
        observacao: observacao || null,
      });
    } catch (e: any) {
      setError(e?.message || 'Erro ao alocar.');
    }
  }

  if (loading) return <div className="rounded-xl border bg-white p-6">Carregando técnicos...</div>;

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Técnicos/Profissionais SST</h1>
          <p className="text-sm text-slate-600">Cadastro do profissional e alocação em obra/unidade.</p>
        </div>
        <button onClick={novo} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white" type="button">
          Novo
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="rounded-xl border bg-white p-4 shadow-sm overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-3 py-2">Funcionário</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Registro</th>
              <th className="px-3 py-2">Ativo</th>
              <th className="px-3 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((t) => (
              <tr key={t.id} className="border-t">
                <td className="px-3 py-2">
                  <div className="font-medium">{t.funcionarioNome}</div>
                  <div className="text-xs text-slate-500">ID funcionário {t.idFuncionario}</div>
                </td>
                <td className="px-3 py-2">{t.tipoProfissional}</td>
                <td className="px-3 py-2">
                  {(t.conselhoSigla || '-') + ' ' + (t.registroNumero || '-')}
                  {t.registroUf ? `/${t.registroUf}` : ''}
                </td>
                <td className="px-3 py-2">{t.ativo ? 'Sim' : 'Não'}</td>
                <td className="px-3 py-2 text-right space-x-2">
                  <button className="rounded-lg border px-3 py-1 text-xs" type="button" onClick={() => editar(t)}>
                    Editar
                  </button>
                  <button className="rounded-lg border px-3 py-1 text-xs" type="button" onClick={() => alocar(t)}>
                    Alocar
                  </button>
                </td>
              </tr>
            ))}
            {lista.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                  Nenhum profissional cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

