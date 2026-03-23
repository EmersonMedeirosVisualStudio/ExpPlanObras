'use client';

import { useEffect, useMemo, useState } from 'react';
import { OrganogramaApi } from '@/lib/modules/organograma/api';
import type { CargoDTO, FuncionarioSelectDTO, OrganogramaEstruturaDTO, PosicaoDTO, SetorDTO, VinculoDTO } from '@/lib/modules/organograma/types';

type TabKey = 'ESTRUTURA' | 'OCUPACOES';

function formatarData(valor?: string | null) {
  if (!valor) return '-';
  return new Date(valor).toLocaleDateString('pt-BR');
}

export default function OrganogramaClient() {
  const [tab, setTab] = useState<TabKey>('ESTRUTURA');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [estrutura, setEstrutura] = useState<OrganogramaEstruturaDTO>({ setores: [], cargos: [], posicoes: [], vinculos: [], ocupacoes: [] });
  const [funcionarios, setFuncionarios] = useState<FuncionarioSelectDTO[]>([]);

  const [modalSetor, setModalSetor] = useState(false);
  const [setorEdit, setSetorEdit] = useState<SetorDTO | null>(null);
  const [setorForm, setSetorForm] = useState({ nomeSetor: '', tipoSetor: '', idSetorPai: '', ativo: true });
  const [setorFormError, setSetorFormError] = useState('');

  const [modalCargo, setModalCargo] = useState(false);
  const [cargoEdit, setCargoEdit] = useState<CargoDTO | null>(null);
  const [cargoForm, setCargoForm] = useState({ nomeCargo: '', ativo: true });
  const [cargoFormError, setCargoFormError] = useState('');

  const [modalPosicao, setModalPosicao] = useState(false);
  const [posicaoEdit, setPosicaoEdit] = useState<PosicaoDTO | null>(null);
  const [posicaoForm, setPosicaoForm] = useState({ idSetor: '', idCargo: '', tituloExibicao: '', ordemExibicao: '0', ativo: true });
  const [posicaoFormError, setPosicaoFormError] = useState('');

  const [modalVinculo, setModalVinculo] = useState(false);
  const [vinculoForm, setVinculoForm] = useState({ idPosicaoSuperior: '', idPosicaoSubordinada: '' });
  const [vinculoFormError, setVinculoFormError] = useState('');

  const [modalOcupacao, setModalOcupacao] = useState(false);
  const [ocupacaoForm, setOcupacaoForm] = useState({ idFuncionario: '', idPosicao: '', dataInicio: new Date().toISOString().slice(0, 10) });
  const [ocupacaoFormError, setOcupacaoFormError] = useState('');

  async function carregar() {
    try {
      setLoading(true);
      setError(null);
      const [estr, funcs] = await Promise.all([OrganogramaApi.obterEstrutura(), OrganogramaApi.listarFuncionariosSelect()]);
      setEstrutura({
        setores: Array.isArray(estr.setores) ? estr.setores : [],
        cargos: Array.isArray(estr.cargos) ? estr.cargos : [],
        posicoes: Array.isArray(estr.posicoes) ? estr.posicoes : [],
        vinculos: Array.isArray(estr.vinculos) ? estr.vinculos : [],
        ocupacoes: Array.isArray(estr.ocupacoes) ? estr.ocupacoes : [],
      });
      setFuncionarios(Array.isArray(funcs) ? funcs : []);
    } catch (e: any) {
      setError(e?.message || 'Erro ao carregar organograma.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  const posicoesById = useMemo(() => new Map(estrutura.posicoes.map((p) => [p.id, p])), [estrutura.posicoes]);

  const vinculosExibicao = useMemo(() => {
    return estrutura.vinculos
      .map((v) => {
        const sup = posicoesById.get(v.idPosicaoSuperior);
        const sub = posicoesById.get(v.idPosicaoSubordinada);
        return {
          id: v.id,
          superior: sup ? `${sup.tituloExibicao}` : String(v.idPosicaoSuperior),
          subordinada: sub ? `${sub.tituloExibicao}` : String(v.idPosicaoSubordinada),
        };
      })
      .sort((a, b) => a.superior.localeCompare(b.superior));
  }, [estrutura.vinculos, posicoesById]);

  const openNovoSetor = () => {
    setSetorEdit(null);
    setSetorForm({ nomeSetor: '', tipoSetor: '', idSetorPai: '', ativo: true });
    setSetorFormError('');
    setModalSetor(true);
  };

  const openEditarSetor = (s: SetorDTO) => {
    setSetorEdit(s);
    setSetorForm({
      nomeSetor: s.nomeSetor,
      tipoSetor: s.tipoSetor ?? '',
      idSetorPai: s.idSetorPai ? String(s.idSetorPai) : '',
      ativo: s.ativo,
    });
    setSetorFormError('');
    setModalSetor(true);
  };

  const salvarSetor = async () => {
    setSetorFormError('');
    const nomeSetor = setorForm.nomeSetor.trim();
    if (!nomeSetor) return setSetorFormError('Nome do setor é obrigatório.');
    const tipoSetor = setorForm.tipoSetor.trim() || null;
    const idSetorPai = setorForm.idSetorPai ? Number(setorForm.idSetorPai) : null;

    try {
      if (setorEdit) {
        await OrganogramaApi.atualizarSetor(setorEdit.id, { nomeSetor, tipoSetor, idSetorPai, ativo: setorForm.ativo });
      } else {
        await OrganogramaApi.criarSetor({ nomeSetor, tipoSetor, idSetorPai });
      }
      setModalSetor(false);
      await carregar();
    } catch (e: any) {
      setSetorFormError(e?.message || 'Erro ao salvar setor.');
    }
  };

  const openNovoCargo = () => {
    setCargoEdit(null);
    setCargoForm({ nomeCargo: '', ativo: true });
    setCargoFormError('');
    setModalCargo(true);
  };

  const openEditarCargo = (c: CargoDTO) => {
    setCargoEdit(c);
    setCargoForm({ nomeCargo: c.nomeCargo, ativo: c.ativo });
    setCargoFormError('');
    setModalCargo(true);
  };

  const salvarCargo = async () => {
    setCargoFormError('');
    const nomeCargo = cargoForm.nomeCargo.trim();
    if (!nomeCargo) return setCargoFormError('Nome do cargo é obrigatório.');

    try {
      if (cargoEdit) {
        await OrganogramaApi.atualizarCargo(cargoEdit.id, { nomeCargo, ativo: cargoForm.ativo });
      } else {
        await OrganogramaApi.criarCargo({ nomeCargo });
      }
      setModalCargo(false);
      await carregar();
    } catch (e: any) {
      setCargoFormError(e?.message || 'Erro ao salvar cargo.');
    }
  };

  const openNovaPosicao = () => {
    setPosicaoEdit(null);
    setPosicaoForm({
      idSetor: estrutura.setores[0]?.id ? String(estrutura.setores[0].id) : '',
      idCargo: estrutura.cargos[0]?.id ? String(estrutura.cargos[0].id) : '',
      tituloExibicao: '',
      ordemExibicao: '0',
      ativo: true,
    });
    setPosicaoFormError('');
    setModalPosicao(true);
  };

  const openEditarPosicao = (p: PosicaoDTO) => {
    setPosicaoEdit(p);
    setPosicaoForm({
      idSetor: String(p.idSetor),
      idCargo: String(p.idCargo),
      tituloExibicao: p.tituloExibicao,
      ordemExibicao: String(p.ordemExibicao ?? 0),
      ativo: p.ativo,
    });
    setPosicaoFormError('');
    setModalPosicao(true);
  };

  const salvarPosicao = async () => {
    setPosicaoFormError('');
    const idSetor = Number(posicaoForm.idSetor);
    const idCargo = Number(posicaoForm.idCargo);
    const tituloExibicao = posicaoForm.tituloExibicao.trim();
    const ordemExibicao = Number(posicaoForm.ordemExibicao || 0);

    if (!Number.isFinite(idSetor) || !Number.isFinite(idCargo) || !tituloExibicao) return setPosicaoFormError('Informe setor, cargo e título.');

    try {
      if (posicaoEdit) {
        await OrganogramaApi.atualizarPosicao(posicaoEdit.id, { idSetor, idCargo, tituloExibicao, ordemExibicao, ativo: posicaoForm.ativo });
      } else {
        await OrganogramaApi.criarPosicao({ idSetor, idCargo, tituloExibicao, ordemExibicao });
      }
      setModalPosicao(false);
      await carregar();
    } catch (e: any) {
      setPosicaoFormError(e?.message || 'Erro ao salvar posição.');
    }
  };

  const openNovoVinculo = () => {
    setVinculoForm({ idPosicaoSuperior: '', idPosicaoSubordinada: '' });
    setVinculoFormError('');
    setModalVinculo(true);
  };

  const salvarVinculo = async () => {
    setVinculoFormError('');
    const idPosicaoSuperior = Number(vinculoForm.idPosicaoSuperior);
    const idPosicaoSubordinada = Number(vinculoForm.idPosicaoSubordinada);
    if (!Number.isFinite(idPosicaoSuperior) || !Number.isFinite(idPosicaoSubordinada)) return setVinculoFormError('Selecione as posições.');
    if (idPosicaoSuperior === idPosicaoSubordinada) return setVinculoFormError('Uma posição não pode ser subordinada a ela mesma.');

    try {
      await OrganogramaApi.criarVinculo({ idPosicaoSuperior, idPosicaoSubordinada });
      setModalVinculo(false);
      await carregar();
    } catch (e: any) {
      setVinculoFormError(e?.message || 'Erro ao criar vínculo.');
    }
  };

  const removerVinculo = async (v: VinculoDTO) => {
    if (!confirm('Remover vínculo?')) return;
    try {
      await OrganogramaApi.removerVinculo(v.id);
      await carregar();
    } catch (e: any) {
      setError(e?.message || 'Erro ao remover vínculo.');
    }
  };

  const openNovaOcupacao = () => {
    setOcupacaoForm({
      idFuncionario: funcionarios[0]?.id ? String(funcionarios[0].id) : '',
      idPosicao: estrutura.posicoes[0]?.id ? String(estrutura.posicoes[0].id) : '',
      dataInicio: new Date().toISOString().slice(0, 10),
    });
    setOcupacaoFormError('');
    setModalOcupacao(true);
  };

  const salvarOcupacao = async () => {
    setOcupacaoFormError('');
    const idFuncionario = Number(ocupacaoForm.idFuncionario);
    const idPosicao = Number(ocupacaoForm.idPosicao);
    const dataInicio = ocupacaoForm.dataInicio;
    if (!Number.isFinite(idFuncionario) || !Number.isFinite(idPosicao) || !dataInicio) return setOcupacaoFormError('Informe funcionário, posição e data.');

    try {
      await OrganogramaApi.ocuparPosicao({ idFuncionario, idPosicao, dataInicio });
      setModalOcupacao(false);
      await carregar();
    } catch (e: any) {
      setOcupacaoFormError(e?.message || 'Erro ao ocupar posição.');
    }
  };

  if (loading) return <div className="rounded-xl border bg-white p-6">Carregando organograma...</div>;
  if (error) return <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">{error}</div>;

  return (
    <div className="max-w-7xl space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Organograma</h1>
          <p className="text-sm text-slate-500">Estrutura (setores, cargos, posições, vínculos) e ocupações.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button type="button" onClick={openNovoSetor} className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50">
            Novo setor
          </button>
          <button type="button" onClick={openNovoCargo} className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50">
            Novo cargo
          </button>
          <button type="button" onClick={openNovaPosicao} className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50">
            Nova posição
          </button>
          <button type="button" onClick={openNovoVinculo} className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50">
            Novo vínculo
          </button>
          <button type="button" onClick={openNovaOcupacao} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">
            Ocupar posição
          </button>
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        <Tab ativo={tab === 'ESTRUTURA'} onClick={() => setTab('ESTRUTURA')}>
          Estrutura
        </Tab>
        <Tab ativo={tab === 'OCUPACOES'} onClick={() => setTab('OCUPACOES')}>
          Ocupações
        </Tab>
      </div>

      {tab === 'ESTRUTURA' && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Section title="Setores">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2">Nome</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Pai</th>
                  <th className="px-3 py-2">Ativo</th>
                  <th className="px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {estrutura.setores.map((s) => (
                  <tr key={s.id} className="border-t">
                    <td className="px-3 py-2">{s.nomeSetor}</td>
                    <td className="px-3 py-2">{s.tipoSetor ?? '-'}</td>
                    <td className="px-3 py-2">{s.idSetorPai ?? '-'}</td>
                    <td className="px-3 py-2">{s.ativo ? 'Sim' : 'Não'}</td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" className="text-blue-700 hover:underline" onClick={() => openEditarSetor(s)}>
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
                {estrutura.setores.length === 0 && (
                  <tr>
                    <td className="px-3 py-6 text-center text-slate-500" colSpan={5}>
                      Nenhum setor cadastrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Section>

          <Section title="Cargos">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2">Nome</th>
                  <th className="px-3 py-2">Ativo</th>
                  <th className="px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {estrutura.cargos.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="px-3 py-2">{c.nomeCargo}</td>
                    <td className="px-3 py-2">{c.ativo ? 'Sim' : 'Não'}</td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" className="text-blue-700 hover:underline" onClick={() => openEditarCargo(c)}>
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
                {estrutura.cargos.length === 0 && (
                  <tr>
                    <td className="px-3 py-6 text-center text-slate-500" colSpan={3}>
                      Nenhum cargo cadastrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Section>

          <Section title="Posições">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2">Título</th>
                  <th className="px-3 py-2">Setor</th>
                  <th className="px-3 py-2">Cargo</th>
                  <th className="px-3 py-2">Ordem</th>
                  <th className="px-3 py-2">Ativo</th>
                  <th className="px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {estrutura.posicoes.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="px-3 py-2">{p.tituloExibicao}</td>
                    <td className="px-3 py-2">{p.setorNome ?? p.idSetor}</td>
                    <td className="px-3 py-2">{p.cargoNome ?? p.idCargo}</td>
                    <td className="px-3 py-2">{p.ordemExibicao}</td>
                    <td className="px-3 py-2">{p.ativo ? 'Sim' : 'Não'}</td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" className="text-blue-700 hover:underline" onClick={() => openEditarPosicao(p)}>
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
                {estrutura.posicoes.length === 0 && (
                  <tr>
                    <td className="px-3 py-6 text-center text-slate-500" colSpan={6}>
                      Nenhuma posição cadastrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Section>

          <Section title="Vínculos">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2">Superior</th>
                  <th className="px-3 py-2">Subordinada</th>
                  <th className="px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {estrutura.vinculos.map((v) => {
                  const sup = posicoesById.get(v.idPosicaoSuperior);
                  const sub = posicoesById.get(v.idPosicaoSubordinada);
                  return (
                    <tr key={v.id} className="border-t">
                      <td className="px-3 py-2">{sup?.tituloExibicao ?? v.idPosicaoSuperior}</td>
                      <td className="px-3 py-2">{sub?.tituloExibicao ?? v.idPosicaoSubordinada}</td>
                      <td className="px-3 py-2 text-right">
                        <button type="button" className="text-red-700 hover:underline" onClick={() => removerVinculo(v)}>
                          Remover
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {estrutura.vinculos.length === 0 && (
                  <tr>
                    <td className="px-3 py-6 text-center text-slate-500" colSpan={3}>
                      Nenhum vínculo cadastrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              {vinculosExibicao.length ? `Total: ${vinculosExibicao.length}` : 'Sem vínculos'}
            </div>
          </Section>
        </div>
      )}

      {tab === 'OCUPACOES' && (
        <Section title="Ocupações (Histórico)">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">Funcionário</th>
                <th className="px-3 py-2">Posição</th>
                <th className="px-3 py-2">Início</th>
                <th className="px-3 py-2">Fim</th>
                <th className="px-3 py-2">Vigente</th>
              </tr>
            </thead>
            <tbody>
              {estrutura.ocupacoes.map((o) => (
                <tr key={o.id} className="border-t">
                  <td className="px-3 py-2">{o.funcionarioNome}</td>
                  <td className="px-3 py-2">{posicoesById.get(o.idPosicao)?.tituloExibicao ?? o.idPosicao}</td>
                  <td className="px-3 py-2">{formatarData(o.dataInicio)}</td>
                  <td className="px-3 py-2">{formatarData(o.dataFim)}</td>
                  <td className="px-3 py-2">{o.vigente ? 'Sim' : 'Não'}</td>
                </tr>
              ))}
              {estrutura.ocupacoes.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-center text-slate-500" colSpan={5}>
                    Nenhuma ocupação registrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Section>
      )}

      {modalSetor && (
        <Modal title={setorEdit ? 'Editar setor' : 'Novo setor'} onClose={() => setModalSetor(false)}>
          <div className="space-y-3">
            <div>
              <div className="text-sm text-slate-600">Nome</div>
              <input className="input" value={setorForm.nomeSetor} onChange={(e) => setSetorForm((p) => ({ ...p, nomeSetor: e.target.value }))} />
            </div>
            <div>
              <div className="text-sm text-slate-600">Tipo</div>
              <input className="input" value={setorForm.tipoSetor} onChange={(e) => setSetorForm((p) => ({ ...p, tipoSetor: e.target.value }))} />
            </div>
            <div>
              <div className="text-sm text-slate-600">Setor pai</div>
              <select className="input" value={setorForm.idSetorPai} onChange={(e) => setSetorForm((p) => ({ ...p, idSetorPai: e.target.value }))}>
                <option value="">(nenhum)</option>
                {estrutura.setores
                  .filter((s) => !setorEdit || s.id !== setorEdit.id)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nomeSetor}
                    </option>
                  ))}
              </select>
            </div>
            {setorEdit && (
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={setorForm.ativo} onChange={(e) => setSetorForm((p) => ({ ...p, ativo: e.target.checked }))} />
                Ativo
              </label>
            )}
            {setorFormError && <div className="text-sm text-red-700">{setorFormError}</div>}
            <div className="flex justify-end gap-2">
              <button type="button" className="rounded-lg border px-4 py-2 text-sm" onClick={() => setModalSetor(false)}>
                Cancelar
              </button>
              <button type="button" className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" onClick={salvarSetor}>
                Salvar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {modalCargo && (
        <Modal title={cargoEdit ? 'Editar cargo' : 'Novo cargo'} onClose={() => setModalCargo(false)}>
          <div className="space-y-3">
            <div>
              <div className="text-sm text-slate-600">Nome</div>
              <input className="input" value={cargoForm.nomeCargo} onChange={(e) => setCargoForm((p) => ({ ...p, nomeCargo: e.target.value }))} />
            </div>
            {cargoEdit && (
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={cargoForm.ativo} onChange={(e) => setCargoForm((p) => ({ ...p, ativo: e.target.checked }))} />
                Ativo
              </label>
            )}
            {cargoFormError && <div className="text-sm text-red-700">{cargoFormError}</div>}
            <div className="flex justify-end gap-2">
              <button type="button" className="rounded-lg border px-4 py-2 text-sm" onClick={() => setModalCargo(false)}>
                Cancelar
              </button>
              <button type="button" className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" onClick={salvarCargo}>
                Salvar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {modalPosicao && (
        <Modal title={posicaoEdit ? 'Editar posição' : 'Nova posição'} onClose={() => setModalPosicao(false)}>
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <div className="text-sm text-slate-600">Setor</div>
                <select className="input" value={posicaoForm.idSetor} onChange={(e) => setPosicaoForm((p) => ({ ...p, idSetor: e.target.value }))}>
                  <option value="">Selecione</option>
                  {estrutura.setores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nomeSetor}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="text-sm text-slate-600">Cargo</div>
                <select className="input" value={posicaoForm.idCargo} onChange={(e) => setPosicaoForm((p) => ({ ...p, idCargo: e.target.value }))}>
                  <option value="">Selecione</option>
                  {estrutura.cargos.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nomeCargo}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <div className="text-sm text-slate-600">Título</div>
              <input className="input" value={posicaoForm.tituloExibicao} onChange={(e) => setPosicaoForm((p) => ({ ...p, tituloExibicao: e.target.value }))} />
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <div className="text-sm text-slate-600">Ordem</div>
                <input className="input" type="number" value={posicaoForm.ordemExibicao} onChange={(e) => setPosicaoForm((p) => ({ ...p, ordemExibicao: e.target.value }))} />
              </div>
              {posicaoEdit && (
                <label className="flex items-center gap-2 text-sm text-slate-700 mt-6">
                  <input type="checkbox" checked={posicaoForm.ativo} onChange={(e) => setPosicaoForm((p) => ({ ...p, ativo: e.target.checked }))} />
                  Ativo
                </label>
              )}
            </div>
            {posicaoFormError && <div className="text-sm text-red-700">{posicaoFormError}</div>}
            <div className="flex justify-end gap-2">
              <button type="button" className="rounded-lg border px-4 py-2 text-sm" onClick={() => setModalPosicao(false)}>
                Cancelar
              </button>
              <button type="button" className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" onClick={salvarPosicao}>
                Salvar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {modalVinculo && (
        <Modal title="Novo vínculo" onClose={() => setModalVinculo(false)}>
          <div className="space-y-3">
            <div>
              <div className="text-sm text-slate-600">Posição superior</div>
              <select
                className="input"
                value={vinculoForm.idPosicaoSuperior}
                onChange={(e) => setVinculoForm((p) => ({ ...p, idPosicaoSuperior: e.target.value }))}
              >
                <option value="">Selecione</option>
                {estrutura.posicoes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.tituloExibicao}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-sm text-slate-600">Posição subordinada</div>
              <select
                className="input"
                value={vinculoForm.idPosicaoSubordinada}
                onChange={(e) => setVinculoForm((p) => ({ ...p, idPosicaoSubordinada: e.target.value }))}
              >
                <option value="">Selecione</option>
                {estrutura.posicoes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.tituloExibicao}
                  </option>
                ))}
              </select>
            </div>
            {vinculoFormError && <div className="text-sm text-red-700">{vinculoFormError}</div>}
            <div className="flex justify-end gap-2">
              <button type="button" className="rounded-lg border px-4 py-2 text-sm" onClick={() => setModalVinculo(false)}>
                Cancelar
              </button>
              <button type="button" className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" onClick={salvarVinculo}>
                Salvar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {modalOcupacao && (
        <Modal title="Ocupar posição" onClose={() => setModalOcupacao(false)}>
          <div className="space-y-3">
            <div>
              <div className="text-sm text-slate-600">Funcionário</div>
              <select className="input" value={ocupacaoForm.idFuncionario} onChange={(e) => setOcupacaoForm((p) => ({ ...p, idFuncionario: e.target.value }))}>
                <option value="">Selecione</option>
                {funcionarios.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome} — {f.cargo || 'Sem cargo'}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-sm text-slate-600">Posição</div>
              <select className="input" value={ocupacaoForm.idPosicao} onChange={(e) => setOcupacaoForm((p) => ({ ...p, idPosicao: e.target.value }))}>
                <option value="">Selecione</option>
                {estrutura.posicoes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.tituloExibicao}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-sm text-slate-600">Data de início</div>
              <input className="input" type="date" value={ocupacaoForm.dataInicio} onChange={(e) => setOcupacaoForm((p) => ({ ...p, dataInicio: e.target.value }))} />
            </div>
            {ocupacaoFormError && <div className="text-sm text-red-700">{ocupacaoFormError}</div>}
            <div className="flex justify-end gap-2">
              <button type="button" className="rounded-lg border px-4 py-2 text-sm" onClick={() => setModalOcupacao(false)}>
                Cancelar
              </button>
              <button type="button" className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" onClick={salvarOcupacao}>
                Salvar
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Tab({ ativo, onClick, children }: any) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-t-lg px-4 py-2 text-sm font-medium ${
        ativo ? 'border border-b-white border-slate-200 bg-white text-blue-700' : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 overflow-auto">
      <h2 className="mb-4 text-lg font-semibold text-slate-800">{title}</h2>
      {children}
    </section>
  );
}

function Modal({ title, children, onClose }: any) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} type="button">
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
