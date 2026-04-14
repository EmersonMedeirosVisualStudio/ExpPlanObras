'use client';

import { useEffect, useState } from 'react';
import { EmpresaConfigApi } from '@/lib/modules/empresa-config/api';
import type { ConfiguracaoEmpresaDTO, FuncionarioSelectDTO } from '@/lib/modules/empresa-config/types';

type Aba = 'representante' | 'encarregado';

function formatFuncionarioRef(id: number | string, nome: string) {
  return `#${id} - ${nome}`;
}

export default function ConfiguracaoEmpresaClient({ abaInicial }: { abaInicial: Aba }) {
  const [aba, setAba] = useState<Aba>(abaInicial);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [savingRole, setSavingRole] = useState<null | 'CEO' | 'ENCARREGADO' | 'GERENTE_RH'>(null);
  const [error, setError] = useState<string | null>(null);

  const [config, setConfig] = useState<ConfiguracaoEmpresaDTO>({
    representante: null,
    encarregadoSistema: null,
    ceo: null,
    gerenteRh: null,
  });
  const [funcionarios, setFuncionarios] = useState<FuncionarioSelectDTO[]>([]);

  const [modalRep, setModalRep] = useState(false);
  const [modalEnc, setModalEnc] = useState(false);
  const [modalFuncionario, setModalFuncionario] = useState<null | { target: 'CEO' | 'ENCARREGADO' | 'GERENTE_RH' }>(null);

  const [ceoFuncionarioId, setCeoFuncionarioId] = useState<number>(0);
  const [gerenteRhFuncionarioId, setGerenteRhFuncionarioId] = useState<number>(0);
  const [encarregadoFuncionarioId, setEncarregadoFuncionarioId] = useState<number>(0);

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

  useEffect(() => {
    const repId = typeof config.representante?.idFuncionario === 'number' ? config.representante.idFuncionario : 0;
    const ceoId = typeof config.ceo?.idFuncionario === 'number' ? config.ceo.idFuncionario : repId;
    const rhId = typeof config.gerenteRh?.idFuncionario === 'number' ? config.gerenteRh.idFuncionario : repId;
    const encId = typeof config.encarregadoSistema?.idFuncionario === 'number' ? config.encarregadoSistema.idFuncionario : repId;
    setCeoFuncionarioId(ceoId);
    setGerenteRhFuncionarioId(rhId);
    setEncarregadoFuncionarioId(encId);
  }, [config.representante?.idFuncionario, config.ceo?.idFuncionario, config.encarregadoSistema?.idFuncionario, config.gerenteRh?.idFuncionario]);

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
      setSavingRole('ENCARREGADO');
      await EmpresaConfigApi.definirEncarregado({ idFuncionario: funcionarioId });
      setModalEnc(false);
      await carregar();
    } catch (e: any) {
      alert(e.message || 'Erro ao definir encarregado.');
    } finally {
      setSavingRole(null);
    }
  }

  async function salvarTitular(roleCode: 'CEO' | 'GERENTE_RH', funcionarioId: number) {
    try {
      setSavingRole(roleCode);
      await EmpresaConfigApi.definirTitular({ roleCode, idFuncionario: funcionarioId });
      await carregar();
    } catch (e: any) {
      alert(e.message || 'Erro ao definir titular.');
    } finally {
      setSavingRole(null);
    }
  }

  async function definirRepresentanteComoEncarregado() {
    if (!config.representante?.idFuncionario) {
      alert('O representante atual precisa estar vinculado a um funcionário para assumir esta função.');
      return;
    }
    await salvarEncarregado(config.representante.idFuncionario);
  }

  async function criarFuncionarioSimples(payload: { nomeCompleto: string; email?: string | null; cargo?: string | null }) {
    const created = await EmpresaConfigApi.criarFuncionarioSimples(payload);
    await carregar();
    return created;
  }

  if (loading) {
    return <div className="rounded-xl border bg-white p-6">Carregando configuração...</div>;
  }

  if (error) {
    return <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">{error}</div>;
  }

  const rep = config.representante;
  const enc = config.encarregadoSistema;
  const ceo = config.ceo;
  const gerenteRh = config.gerenteRh;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">Configuração da Empresa</h1>
        <p className="text-sm text-slate-500">Definição de titulares (CEO, Administrador/Encarregado do Sistema e RH) e governança da empresa.</p>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        <Tab ativo={aba === 'representante'} onClick={() => setAba('representante')}>
          Representante da Empresa
        </Tab>
        <Tab ativo={aba === 'encarregado'} onClick={() => setAba('encarregado')}>
          Administrador do Sistema da Empresa
        </Tab>
      </div>

      {aba === 'representante' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Titulares iniciais</h2>
              <div className="text-sm text-slate-500">Defina quem ocupará as funções-chave da empresa.</div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-800">CEO</div>
                <div className="mt-1 text-xs text-slate-500">Visão executiva e tomada de decisão.</div>
                <div className="mt-3 flex gap-2">
                  <select className="input" value={ceoFuncionarioId || ''} onChange={(e) => setCeoFuncionarioId(e.target.value ? Number(e.target.value) : 0)}>
                    <option value="">Selecionar funcionário</option>
                    {funcionarios.map((f) => (
                      <option key={f.id} value={f.id}>
                        {formatFuncionarioRef(f.id, f.nome)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <button className="rounded-lg border bg-white px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 disabled:text-slate-400" type="button" onClick={() => setModalFuncionario({ target: 'CEO' })}>
                    Cadastrar funcionário
                  </button>
                  <button
                    className="rounded-lg bg-blue-600 px-3 py-2 text-xs text-white disabled:opacity-60"
                    disabled={Boolean(savingRole) || !ceoFuncionarioId}
                    type="button"
                    onClick={() => salvarTitular('CEO', ceoFuncionarioId)}
                  >
                    {savingRole === 'CEO' ? 'Salvando...' : 'Definir'}
                  </button>
                </div>
                <div className="mt-2 text-xs text-slate-600">{ceo?.idFuncionario ? `Atual: ${formatFuncionarioRef(ceo.idFuncionario, ceo.nome)}` : 'Atual: não definido'}</div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-800">Administrador / Encarregado do Sistema</div>
                <div className="mt-1 text-xs text-slate-500">Usuários, perfis e permissões.</div>
                <div className="mt-3 flex gap-2">
                  <select
                    className="input"
                    value={encarregadoFuncionarioId || ''}
                    onChange={(e) => setEncarregadoFuncionarioId(e.target.value ? Number(e.target.value) : 0)}
                  >
                    <option value="">Selecionar funcionário</option>
                    {funcionarios.map((f) => (
                      <option key={f.id} value={f.id}>
                        {formatFuncionarioRef(f.id, f.nome)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <button className="rounded-lg border bg-white px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 disabled:text-slate-400" type="button" onClick={() => setModalFuncionario({ target: 'ENCARREGADO' })}>
                    Cadastrar funcionário
                  </button>
                  <button
                    className="rounded-lg bg-blue-600 px-3 py-2 text-xs text-white disabled:opacity-60"
                    disabled={Boolean(savingRole) || !encarregadoFuncionarioId}
                    type="button"
                    onClick={() => salvarEncarregado(encarregadoFuncionarioId)}
                  >
                    {savingRole === 'ENCARREGADO' ? 'Salvando...' : 'Definir'}
                  </button>
                </div>
                <div className="mt-2 text-xs text-slate-600">{enc?.idFuncionario ? `Atual: ${formatFuncionarioRef(enc.idFuncionario, enc.nome)}` : 'Atual: não definido'}</div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-800">Gerente de RH</div>
                <div className="mt-1 text-xs text-slate-500">Cadastro funcional e gestão de pessoas.</div>
                <div className="mt-3 flex gap-2">
                  <select
                    className="input"
                    value={gerenteRhFuncionarioId || ''}
                    onChange={(e) => setGerenteRhFuncionarioId(e.target.value ? Number(e.target.value) : 0)}
                  >
                    <option value="">Selecionar funcionário</option>
                    {funcionarios.map((f) => (
                      <option key={f.id} value={f.id}>
                        {formatFuncionarioRef(f.id, f.nome)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <button className="rounded-lg border bg-white px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 disabled:text-slate-400" type="button" onClick={() => setModalFuncionario({ target: 'GERENTE_RH' })}>
                    Cadastrar funcionário
                  </button>
                  <button
                    className="rounded-lg bg-blue-600 px-3 py-2 text-xs text-white disabled:opacity-60"
                    disabled={Boolean(savingRole) || !gerenteRhFuncionarioId}
                    type="button"
                    onClick={() => salvarTitular('GERENTE_RH', gerenteRhFuncionarioId)}
                  >
                    {savingRole === 'GERENTE_RH' ? 'Salvando...' : 'Definir'}
                  </button>
                </div>
                <div className="mt-2 text-xs text-slate-600">
                  {gerenteRh?.idFuncionario ? `Atual: ${formatFuncionarioRef(gerenteRh.idFuncionario, gerenteRh.nome)}` : 'Atual: não definido'}
                </div>
              </div>
            </div>
          </div>

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
                <Info label="Funcionário vinculado" valor={rep.idFuncionario ? formatFuncionarioRef(rep.idFuncionario, rep.nome) : '-'} />
                <Info label="Início" valor={rep.dataInicio} />
              </div>
            ) : (
              <div className="text-sm text-slate-500">Nenhum representante definido.</div>
            )}
          </div>
        </div>
      )}

      {aba === 'encarregado' && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Administrador / Encarregado atual</h2>
            <div className="flex gap-2">
              <button onClick={definirRepresentanteComoEncarregado} className="rounded-lg border bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:text-slate-400" type="button">
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
        <Modal titulo="Definir Administrador / Encarregado do Sistema" onClose={() => setModalEnc(false)}>
          <EncarregadoForm funcionarios={funcionarios} salvando={salvando} onCancel={() => setModalEnc(false)} onSave={salvarEncarregado} />
        </Modal>
      )}

      {modalFuncionario && (
        <Modal titulo="Cadastrar funcionário (mínimo)" onClose={() => setModalFuncionario(null)}>
          <FuncionarioMinimoForm
            salvando={salvando}
            onCancel={() => setModalFuncionario(null)}
            onSave={async (payload: { nomeCompleto: string; email?: string | null; cargo?: string | null }) => {
              try {
                setSalvando(true);
                const created = await criarFuncionarioSimples(payload);
                const newId = Number((created as any)?.id || 0);
                if (modalFuncionario.target === 'CEO') setCeoFuncionarioId(newId);
                if (modalFuncionario.target === 'ENCARREGADO') setEncarregadoFuncionarioId(newId);
                if (modalFuncionario.target === 'GERENTE_RH') setGerenteRhFuncionarioId(newId);
                setModalFuncionario(null);
              } catch (e: any) {
                alert(e.message || 'Erro ao cadastrar funcionário.');
              } finally {
                setSalvando(false);
              }
            }}
          />
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
            {formatFuncionarioRef(f.id, f.nome)}
          </option>
        ))}
      </select>

      <input className="input" placeholder="Nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
      <input className="input" placeholder="CPF" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} />
      <input className="input" placeholder="E-mail" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      <input className="input" placeholder="Telefone" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg border bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:text-slate-400" type="button">
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
            {formatFuncionarioRef(f.id, f.nome)}
          </option>
        ))}
      </select>

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg border bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:text-slate-400" type="button">
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

function FuncionarioMinimoForm({
  onCancel,
  onSave,
  salvando,
}: {
  onCancel: () => void;
  onSave: (payload: { nomeCompleto: string; email?: string | null; cargo?: string | null }) => void;
  salvando: boolean;
}) {
  const [form, setForm] = useState({ nomeCompleto: '', email: '', cargo: '' });

  return (
    <div className="space-y-4">
      <input
        className="input"
        placeholder="Nome completo"
        value={form.nomeCompleto}
        onChange={(e) => setForm((p) => ({ ...p, nomeCompleto: e.target.value }))}
      />
      <input className="input" placeholder="E-mail (opcional)" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
      <input className="input" placeholder="Função / cargo (opcional)" value={form.cargo} onChange={(e) => setForm((p) => ({ ...p, cargo: e.target.value }))} />

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg border bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:text-slate-400" type="button">
          Cancelar
        </button>
        <button
          disabled={salvando}
          onClick={() => onSave({ nomeCompleto: form.nomeCompleto, email: form.email || null, cargo: form.cargo || null })}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-60"
          type="button"
        >
          {salvando ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  );
}
