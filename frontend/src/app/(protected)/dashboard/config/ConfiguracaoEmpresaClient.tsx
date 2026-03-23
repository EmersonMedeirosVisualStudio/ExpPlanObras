'use client';

import { useEffect, useState } from 'react';
import { EmpresaConfigApi } from '@/lib/modules/empresa-config/api';
import type { ConfiguracaoEmpresaDTO, FuncionarioSelectDTO } from '@/lib/modules/empresa-config/types';

type Aba = 'representante' | 'encarregado';

export default function ConfiguracaoEmpresaClient({ abaInicial }: { abaInicial: Aba }) {
  const [aba, setAba] = useState<Aba>(abaInicial);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [config, setConfig] = useState<ConfiguracaoEmpresaDTO>({
    representante: null,
    encarregadoSistema: null,
  });
  const [funcionarios, setFuncionarios] = useState<FuncionarioSelectDTO[]>([]);

  const [modalRep, setModalRep] = useState(false);
  const [modalEnc, setModalEnc] = useState(false);

  async function carregar() {
    try {
      setLoading(true);
      setError(null);

      const [cfg, funcs] = await Promise.all([EmpresaConfigApi.obterConfiguracao(), EmpresaConfigApi.listarFuncionariosSelect()]);

      setConfig(cfg);
      setFuncionarios(funcs);
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar configuração.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function salvarRepresentante(payload: {
    nome: string;
    cpf: string;
    email?: string | null;
    telefone?: string | null;
    idFuncionario?: number | null;
  }) {
    try {
      setSalvando(true);
      await EmpresaConfigApi.atualizarRepresentante(payload);
      setModalRep(false);
      await carregar();
    } catch (e: any) {
      alert(e.message || 'Erro ao salvar representante.');
    } finally {
      setSalvando(false);
    }
  }

  async function salvarEncarregado(funcionarioId: number) {
    try {
      setSalvando(true);
      await EmpresaConfigApi.definirEncarregado({ idFuncionario: funcionarioId });
      setModalEnc(false);
      await carregar();
    } catch (e: any) {
      alert(e.message || 'Erro ao definir encarregado.');
    } finally {
      setSalvando(false);
    }
  }

  async function definirRepresentanteComoEncarregado() {
    if (!config.representante?.idFuncionario) {
      alert('O representante atual precisa estar vinculado a um funcionário para assumir esta função.');
      return;
    }
    await salvarEncarregado(config.representante.idFuncionario);
  }

  if (loading) {
    return <div className="rounded-xl border bg-white p-6">Carregando configuração...</div>;
  }

  if (error) {
    return <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">{error}</div>;
  }

  const rep = config.representante;
  const enc = config.encarregadoSistema;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">Configuração da Empresa</h1>
        <p className="text-sm text-slate-500">Definição do Representante da Empresa e do Encarregado do Sistema.</p>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        <Tab ativo={aba === 'representante'} onClick={() => setAba('representante')}>
          Representante da Empresa
        </Tab>
        <Tab ativo={aba === 'encarregado'} onClick={() => setAba('encarregado')}>
          Encarregado do Sistema da Empresa
        </Tab>
      </div>

      {aba === 'representante' && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Representante atual</h2>
            <button onClick={() => setModalRep(true)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" type="button">
              Editar Representante
            </button>
          </div>

          {rep ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Info label="Nome" valor={rep.nome} />
              <Info label="CPF" valor={rep.cpf} />
              <Info label="E-mail" valor={rep.email || '-'} />
              <Info label="Telefone" valor={rep.telefone || '-'} />
              <Info label="Funcionário vinculado" valor={String(rep.idFuncionario ?? '-')} />
              <Info label="Início" valor={rep.dataInicio} />
            </div>
          ) : (
            <div className="text-sm text-slate-500">Nenhum representante definido.</div>
          )}
        </div>
      )}

      {aba === 'encarregado' && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Encarregado atual</h2>
            <div className="flex gap-2">
              <button onClick={definirRepresentanteComoEncarregado} className="rounded-lg border px-4 py-2 text-sm" type="button">
                Definir a mim mesmo
              </button>
              <button onClick={() => setModalEnc(true)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" type="button">
                Definir/Substituir
              </button>
            </div>
          </div>

          {enc ? (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Info label="Nome" valor={enc.nome} />
                <Info label="Usuário" valor={enc.usuario || '-'} />
                <Info label="Data de início" valor={enc.dataInicio} />
                <Info label="Status" valor={enc.ativo ? 'Ativo' : 'Inativo'} />
              </div>

              {enc.solicitouSaida && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                  O encarregado atual solicitou deixar a função.
                  {enc.motivoSolicitacaoSaida ? ` Motivo: ${enc.motivoSolicitacaoSaida}` : ''}
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-slate-500">Nenhum encarregado definido.</div>
          )}
        </div>
      )}

      {modalRep && (
        <Modal titulo="Editar Representante" onClose={() => setModalRep(false)}>
          <RepresentanteForm
            initial={{
              nome: rep?.nome || '',
              cpf: rep?.cpf || '',
              email: rep?.email || '',
              telefone: rep?.telefone || '',
              idFuncionario: rep?.idFuncionario || null,
            }}
            funcionarios={funcionarios}
            salvando={salvando}
            onCancel={() => setModalRep(false)}
            onSave={salvarRepresentante}
          />
        </Modal>
      )}

      {modalEnc && (
        <Modal titulo="Definir Encarregado do Sistema" onClose={() => setModalEnc(false)}>
          <EncarregadoForm funcionarios={funcionarios} salvando={salvando} onCancel={() => setModalEnc(false)} onSave={salvarEncarregado} />
        </Modal>
      )}
    </div>
  );
}

function Tab({ ativo, onClick, children }: any) {
  return (
    <button
      onClick={onClick}
      className={`rounded-t-lg px-4 py-2 text-sm font-medium ${
        ativo ? 'border border-b-white border-slate-200 bg-white text-blue-700' : 'text-slate-500'
      }`}
      type="button"
    >
      {children}
    </button>
  );
}

function Info({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <div className="text-sm text-slate-500">{label}</div>
      <div className="font-medium text-slate-800">{valor}</div>
    </div>
  );
}

function Modal({ titulo, children, onClose }: any) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-lg font-semibold">{titulo}</h2>
          <button onClick={onClose} type="button">
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function RepresentanteForm({ initial, funcionarios, onCancel, onSave, salvando }: any) {
  const [form, setForm] = useState(initial);

  return (
    <div className="space-y-4">
      <select
        className="input"
        value={form.idFuncionario ?? ''}
        onChange={(e) => setForm({ ...form, idFuncionario: e.target.value ? Number(e.target.value) : null })}
      >
        <option value="">Sem vínculo com funcionário</option>
        {funcionarios.map((f: any) => (
          <option key={f.id} value={f.id}>
            {f.nome} — {f.cargo || 'Sem cargo'}
          </option>
        ))}
      </select>

      <input className="input" placeholder="Nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
      <input className="input" placeholder="CPF" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} />
      <input className="input" placeholder="E-mail" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      <input className="input" placeholder="Telefone" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg border px-4 py-2 text-sm" type="button">
          Cancelar
        </button>
        <button
          disabled={salvando}
          onClick={() => onSave(form)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-60"
          type="button"
        >
          {salvando ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  );
}

function EncarregadoForm({ funcionarios, onCancel, onSave, salvando }: any) {
  const [funcionarioId, setFuncionarioId] = useState<number>(funcionarios[0]?.id ?? 0);

  return (
    <div className="space-y-4">
      <select className="input" value={funcionarioId} onChange={(e) => setFuncionarioId(Number(e.target.value))}>
        {funcionarios.map((f: any) => (
          <option key={f.id} value={f.id}>
            {f.nome} — {f.cargo || 'Sem cargo'}
          </option>
        ))}
      </select>

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg border px-4 py-2 text-sm" type="button">
          Cancelar
        </button>
        <button
          disabled={salvando}
          onClick={() => onSave(funcionarioId)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-60"
          type="button"
        >
          {salvando ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  );
}
