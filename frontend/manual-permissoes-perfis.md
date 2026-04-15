# Manual de Permissões e Perfis

## 1. Objetivo

Este manual define como o acesso funciona no sistema:

- `usuário` = conta que entra no sistema;
- `perfil` = papel organizacional (ex.: Representante, CEO, Encarregado do Sistema);
- `permissões` = ações permitidas (ex.: `obras.view`, `rh.funcionarios.crud`);
- `abrangência` = escopo de dados permitido (`empresa`, `obra`, `unidade`, `diretoria`).

---

## 2. Regra de segurança (modelo aplicado)

O acesso é decidido em 3 camadas:

1. **Permissão funcional**: página/ação só abre se a permissão existir.
2. **Abrangência**: o dado é filtrado pelo escopo liberado do usuário.
3. **Menu dinâmico**: o item só aparece se a permissão necessária existir.

Exemplo:

- Usuário: João
- Perfil: Engenheiro
- Permissões: `obras.view`, `obras.edit`, `fiscalizacao.medicoes.edit`, `suprimentos.solicitacoes.crud`
- Abrangência: obras `10` e `12`
- Resultado: João enxerga e edita apenas nas obras 10 e 12.

---

## 3. Auditoria do implementado (estado atual)

### 3.1 Já implementado no código

- Catálogo central de permissões em `src/lib/auth/permissions.ts`.
- Guardas de acesso por página (`requirePermission` e `requireAnyPermission`).
- Menu lateral filtrado por permissão e escopo (`src/lib/navigation/build.ts`).
- Perfis base operacionais no login:
  - `REPRESENTANTE_EMPRESA`
  - `CEO`
  - `ENCARREGADO_SISTEMA_EMPRESA`
  - `DIRETOR`
  - `DIRETOR_ADMINISTRATIVO`
  - `DIRETOR_FINANCEIRO`
  - `ENGENHEIRO`
  - `MESTRE_OBRA`
  - `ENCARREGADO_OBRA`
  - `APONTADOR`
  - `ALMOXARIFE`
  - `FISCAL_OBRA`
  - `TST`
  - `GERENTE_RH`
  - `ADMIN_RH`
  - `SST_TECNICO`

### 3.2 Ajustes aplicados nesta revisão

- Header simplificado: sem seletor de perfil/contexto.
- Navegação do Representante reorganizada por submenu:
  - `Painel do Representante > Dashboard`
  - `Painel do Representante > Configurações`
- Menu de Administração reorganizado com foco no Encarregado do Sistema:
  - Usuários/Perfis/Permissões
  - Backup e Segurança
  - Automações
  - Aprovações (Modelos)
  - Workflows (Modelos/Designer)
  - Fila/Template de notificações
- Perfil `CEO` reduzido para visão/aprovação (menos permissões CRUD operacionais).
- Perfil `ENCARREGADO_SISTEMA_EMPRESA` focado em governança e configuração.

### 3.3 Gap identificado (planejado)

Os perfis acima já existem e liberam painéis/menu conforme permissões.

O que ainda é planejado (para completar o modelo por função) é a criação/amadurecimento de módulos específicos (ex.: financeiro, estoque detalhado, apontamentos completos), com permissões finas por ação.

---

## 4. Matriz funcional recomendada

### 4.1 Representante

- Visão ampla da empresa.
- Configuração inicial de titulares e parâmetros corporativos.
- Sem foco em operação diária.

### 4.2 CEO

- Visualização consolidada dos painéis e relatórios.
- Aprovações estratégicas.
- Sem CRUD operacional do dia a dia.

### 4.3 Encarregado do Sistema (Admin TI da empresa)

- Gestão de usuários, perfis e permissões.
- Configuração e governança técnica.
- Modelos de automação/workflow/aprovação.
- Sem editar dados operacionais de obra/RH/suprimentos.

### 4.4 Diretor Administrativo

- RH completo.
- Contratos/documentos administrativos.
- Relatórios administrativos consolidados.

### 4.5 Diretor Financeiro

- Financeiro completo.
- Aprovação de pagamentos.
- Fluxo de caixa e relatórios financeiros.

### 4.6 Engenheiro

- Obras: criar/editar dentro da abrangência.
- Medições e cronograma.
- Solicitação de materiais.

### 4.7 Mestre de Obra / Encarregado de Obra / Apontador

- Execução diária, produção, apontamentos, horas/equipamentos.
- Sem governança administrativa.

### 4.8 Almoxarife

- Entrada/saída de materiais.
- Controle de estoque e movimentações.

### 4.9 Fiscal de Obra

- Visualização operacional completa no escopo da obra.
- Registro de inspeções e não conformidades.

### 4.10 TST

- SST, ocorrências, EPI e relatórios de segurança.

---

## 5. Diretriz final

Cada painel deve ser liberado por perfil e permissão, sem seletor manual de contexto na barra superior.

Navegação e segurança devem seguir:

- menu dinâmico por permissão;
- dados filtrados por abrangência;
- trilha de auditoria para ações críticas.
