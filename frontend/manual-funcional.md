# Manual Funcional do Sistema

## Plataforma Integrada de Gestão Empresarial com foco em Engenharia, Obras e Operação Corporativa

---

Manual complementar: `manual-permissoes-perfis.md`

---

## Sumário

- [1. Visão geral do sistema](#1-vis%C3%A3o-geral-do-sistema)
- [2. Objetivo do sistema](#2-objetivo-do-sistema)
- [3. Princípios do sistema](#3-princ%C3%ADpios-do-sistema)
- [4. Estrutura geral do sistema](#4-estrutura-geral-do-sistema)
- [5. Estrutura base dos dados do sistema](#5-estrutura-base-dos-dados-do-sistema)
- [6. Perfis de usuários e níveis de acesso](#6-perfis-de-usu%C3%A1rios-e-n%C3%ADveis-de-acesso)
- [7. Painéis por perfil](#7-pain%C3%A9is-por-perfil)
- [8. Procedimento inicial de implantação e uso do sistema](#8-procedimento-inicial-de-implanta%C3%A7%C3%A3o-e-uso-do-sistema)
- [9. Módulo RH](#9-m%C3%B3dulo-rh)
- [10. Módulo SST](#10-m%C3%B3dulo-sst)
- [11. Módulo Engenharia](#11-m%C3%B3dulo-engenharia)
- [12. Módulo Suprimentos](#12-m%C3%B3dulo-suprimentos)
- [13. Módulo de Controle Financeiro](#13-m%C3%B3dulo-de-controle-financeiro)
- [14. Painel de Fiscalização](#14-painel-de-fiscaliza%C3%A7%C3%A3o)
- [15. Módulo Administração do sistema](#15-m%C3%B3dulo-administra%C3%A7%C3%A3o-do-sistema)
- [16. Relações entre os módulos e os dados](#16-rela%C3%A7%C3%B5es-entre-os-m%C3%B3dulos-e-os-dados)
- [17. Filtros, escopos e visões por lotação](#17-filtros-escopos-e-vis%C3%B5es-por-lota%C3%A7%C3%A3o)
- [18. Importações e exportações](#18-importa%C3%A7%C3%B5es-e-exporta%C3%A7%C3%B5es)
- [19. Segurança das informações — regras mínimas da reconstrução](#19-seguran%C3%A7a-das-informa%C3%A7%C3%B5es--regras-m%C3%ADnimas-da-reconstru%C3%A7%C3%A3o)
- [20. Resumo final do funcionamento do sistema](#20-resumo-final-do-funcionamento-do-sistema)

## 1. Visão geral do sistema

Este sistema é uma plataforma integrada de gestão empresarial desenvolvida para organizar, controlar e acompanhar a operação da empresa com foco principal em **Engenharia**, suas ramificações operacionais e as áreas de suporte necessárias ao funcionamento das obras e unidades da empresa.

O sistema foi concebido para atender, de forma unificada e segura, as necessidades de:

- Engenharia
- Fiscalização
- RH
- SST
- Suprimentos
- Licitações
- Controle Financeiro
- Administração do sistema
- Gestão executiva e gerencial

A proposta do sistema é concentrar, em um único ambiente, as informações que hoje normalmente ficam espalhadas entre planilhas, documentos, mensagens, registros manuais e controles paralelos. Com isso, a empresa passa a ter uma visão operacional, gerencial e estratégica mais clara, com menor retrabalho, maior rastreabilidade e melhor capacidade de decisão.

O sistema foi desenhado para ser:

- **fácil de usar**
- **visualmente amigável**
- **de leitura rápida**
- **simples para o usuário operacional**
- **forte nas regras de negócio**
- **seguro quanto ao acesso à informação**
- **organizado por perfil, escopo e lotação**

O núcleo da **engenharia** está no **contrato**. Obras e serviços se organizam e se relacionam por contrato, incluindo orçamento, composições, materiais, suprimentos, fiscalização, medições, pagamentos, prazo, cronograma, pessoal, SST e resultados financeiros. Toda obra ou serviço deve estar vinculado a um número de contrato.

Além dos módulos operacionais, o sistema também oferece painéis e visões consolidadas por perfil, permitindo que cada usuário veja apenas o que é relevante para sua função.

### Módulo de Licitações

O sistema inclui um módulo específico de **Licitações**, voltado para gerenciar as licitações que a empresa poderá participar.

Menu (Licitações):

- Dashboard (visão geral e alertas)
- Gestão de Licitações (cadastro completo)
- Quadro de Licitações (Kanban por status)
- Fases e Situação (histórico/andamento)
- Exigências (Checklist)
- Análise de Atendimento (validação automática)
- Acervo Técnico da Empresa
- Documentos
- Dossiê da Licitação

Esse módulo permite:

- cadastrar licitações;
- controlar fases e situação;
- registrar documentação exigida;
- controlar as demandas de cada licitação;
- comparar as exigências da licitação com os recursos, documentos e capacidades existentes na empresa;
- cadastrar e organizar o acervo técnico da empresa;
- realizar upload de documentos de acervo;
- visualizar documentos;
- imprimir documentos;
- baixar documentos;
- verificar automaticamente se a empresa atende ou não às exigências de cada licitação.

O sistema deve informar claramente:

- o que está atendido;
- o que ainda falta;
- qual documento comprova cada exigência;
- quais capacidades técnicas e operacionais estão disponíveis;
- quais pontos impedem ou permitem a participação.

Também deve existir um **quadro de licitações**, com visualização por situação, como:

- previstas;
- em análise;
- em preparação;
- participando;
- aguardando resultado;
- encerradas;
- vencidas;
- desistidas.

### Módulo de Controle Financeiro

O sistema também inclui um módulo de **Controle Financeiro**, voltado ao acompanhamento da situação financeira da empresa, das obras e das unidades.

Esse módulo deve permitir:

- controle de pagamentos pendentes;
- controle de pagamentos realizados;
- acompanhamento por obra;
- acompanhamento por unidade;
- acompanhamento por tipo;
- visão geral consolidada;
- integração com medições pagas e pendentes;
- leitura do resultado financeiro por obra, unidade e total da empresa.

O painel financeiro deve ser rico em gráficos, porém de fácil entendimento, permitindo visualizar:

- entradas previstas;
- entradas realizadas;
- medições pagas;
- medições pendentes;
- despesas por obra;
- despesas por unidade;
- despesas por tipo;
- comparativo entre previsto e executado;
- leitura clara do resultado financeiro.

Nas visões específicas:

- o **dashboard da obra** mostra apenas os dados daquela obra;
- o **dashboard da unidade** mostra apenas os dados daquela unidade;
- a visão geral mostra o consolidado da empresa, respeitando o perfil do usuário.

---

## 2. Objetivo do sistema

O objetivo do sistema é permitir que a empresa gerencie sua operação de forma integrada, com controle real sobre:

- obras e unidades;
- contratos e licitações;
- orçamento e execução;
- medições e pagamentos;
- suprimentos e materiais;
- pessoal e necessidade operacional;
- SST por escritório, unidade e obra;
- fiscalização da execução;
- desempenho financeiro;
- estrutura organizacional e responsabilidades.

O sistema busca atender três grandes necessidades da empresa:

### 2.1 Organizar a operação

Centralizar informações e padronizar processos.

### 2.2 Dar visibilidade gerencial

Permitir acompanhamento por CEO, diretores, gerentes e responsáveis operacionais.

### 2.3 Proteger e qualificar a informação

Garantir acesso por escopo, consistência mínima dos dados e segurança operacional.

---

## 3. Princípios do sistema

O sistema foi definido com base nos seguintes princípios:

### 3.1 Simplicidade de uso

O usuário deve conseguir operar o sistema sem dificuldade excessiva. A interface precisa ser clara, direta e organizada por tarefa.

### 3.2 Robustez operacional

Mesmo sendo simples para o usuário, o sistema deve manter regras firmes de operação, consistência e escopo.

### 3.3 Visão por perfil

Cada usuário deve ter um painel e uma navegação condizentes com sua responsabilidade.

### 3.4 Foco em uso real

O sistema existe para ser usado no dia a dia. A prioridade é funcionalidade prática, não complexidade excessiva.

### 3.5 Dados confiáveis

Relatórios, painéis e decisões dependem de dados corretos e bem relacionados.

### 3.6 Segurança da informação

O acesso deve respeitar empresa, perfil, lotação, obra, unidade e responsabilidade.

Estado atual (produção):

- O Representante está com acesso total temporário para não travar implantação.
- O controle por escopo (obra/unidade) começou pelo módulo Obras e será expandido para os demais módulos.

### 3.7 Integração entre módulos

Os dados precisam conversar entre si. O sistema não é um conjunto de telas isoladas, mas uma estrutura conectada.

---

## 4. Estrutura geral do sistema

O sistema é formado pelos seguintes grandes blocos funcionais:

1. Painéis (por perfil e por responsabilidade)
2. Contratos
3. Engenharia (Obras, planejamento e execução)
4. Licitações
5. RH
6. SST
7. Suprimentos
8. Fiscalização
9. Administração do Sistema
10. Relatórios

### 4.1 Janelas principais do sistema

As janelas (telas) principais se organizam por perfil e por núcleo operacional:

- Painéis (Representante, CEO e Diretor)
- Contratos (gestão do ciclo: cadastro, documentos e acompanhamento)
- Engenharia/Obras (cadastro, orçamento, cronograma, centros de custo, execução, apropriação e medições)
- Licitações (cadastro, checklist, validação e kanban)
- RH e SST (cadastros e acompanhamento por unidade/obra)
- Documentos (conteúdo e evidências vinculadas a obras e contratos)
- Administração do Sistema (usuários, perfis, permissões, abrangências e configurações)

Implementação atual relevante:

- Contratos: cadastro de contrapartes com suporte a PJ e PF (criar, listar, editar e inativar).
- Obras: cadastro de responsáveis por obra com tipos "Responsável Técnico" e "Fiscal da Obra" (CRUD).
- Obra ativa: definida ao dar duplo clique numa obra em **Engenharia → Obras** (abre **Obra selecionada**) e fica ativa para navegação por contexto.
- Contrato da obra: não existe tela dedicada; o vínculo obra↔contrato é gerenciado pela lista de obras do contrato e pela tela **Obra selecionada**.

### 4.2 Barra superior (empresa e utilitários)

Na parte superior do sistema, a barra possui foco em simplicidade operacional:

- nome da empresa visível (lado esquerdo);
- busca global;
- notificações;
- menu do usuário (sessão e conta).

Regra atual:

- o acesso aos painéis e módulos é definido por permissões e menu liberado para o perfil, sem seletor manual de perfil/contexto na barra.

---

## 5. Estrutura base dos dados do sistema

Antes de entender os módulos, é importante compreender os principais elementos de ligação da plataforma.

### 5.1 Empresa

Representa a organização que utiliza o sistema. Toda informação pertence à empresa e é protegida dentro do seu ambiente.

### 5.2 Unidades

As unidades são as bases organizacionais e físicas da empresa. Para melhorar a nomenclatura, recomenda-se que as unidades sejam classificadas em tipos claros:

- **Sede Corporativa**  
  Unidade principal da empresa, de caráter institucional e administrativo.

- **Escritório Administrativo**  
  Unidade administrativa regional ou local.

- **Centro de Armazenagem / Almoxarifado**  
  Unidade destinada a estocagem, guarda, movimentação e distribuição de materiais.

- **Base Operacional**  
  Unidade de apoio operacional da empresa, quando existir.

As **obras** ficam vinculadas a uma unidade responsável ou de apoio, mas continuam sendo entidades próprias, com vida operacional independente.

### 5.3 Contratos

O **contrato** é a base da engenharia e da execução. Ele organiza a obra/serviço, a medição, o pagamento e o controle técnico-financeiro. Tipos de contrato:

1. Público — celebrado com empresa pública
2. Privado — celebrado com empresa privada ou pessoa física
3. Interno — para controle de serviços internos
4. Com terceiros — contratação de serviços com terceiros para compor parte ou todo o serviço contratado com uma empresa pública, privada ou pessoa física; deve constar o número do contrato principal

Regra operacional: **toda obra ou serviço deve ter um número de contrato** (chave de vínculo e rastreabilidade).

### 5.4 Obras

A **obra** é a unidade operacional vinculada a um contrato. A obra concentra planejamento, diário, calendário, progresso, medições e suprimentos, sempre referenciando seu contrato.

#### 5.4.1 Relação entre contratos e obras/serviços

- Um **contrato** pode estar vinculado a uma ou várias **obras/serviços**.
- Uma **obra** deve possuir apenas um **contrato principal**.
- Uma **obra** pode possuir múltiplos **contratos terceirizados** vinculados (para execução parcial ou total por terceiros).

Identificadores:

- idContrato → identificador único do contrato
- idObra → identificador único da obra

#### 5.4.2 Gestor da obra (responsável pela administração)

Uma obra pode ter vários engenheiros e líderes atuando, mas deve existir **1 (um) gestor da obra** responsável pela administração e condução do planejamento operacional.

No sistema:

- o gestor da obra é definido por obra e pode ser referenciado em alertas e rotinas (ex.: programação semanal).

### 5.5 Pessoas, funcionários e usuários

O sistema diferencia, funcionalmente:

- **Pessoa**: o indivíduo cadastrado;
- **Funcionário**: o vínculo empregatício ou funcional;
- **Usuário do sistema**: o acesso ao sistema, associado à pessoa e à sua função.

Isso é importante porque **um funcionário pode ser demitido e readmitido**.  
Nesse caso, a pessoa permanece no histórico da empresa, mas o vínculo funcional muda, preservando o histórico correto de admissões, desligamentos e readmissões.

### 5.6 Lotação

A lotação indica onde o funcionário atua e qual é seu escopo principal. Pode estar vinculada a:

- unidade;
- obra;
- escritório;
- diretoria;
- gerência;
- área específica.


### 5.7 Identificação dos registros

Os registros do sistema devem utilizar **identificadores internos numéricos inteiros sequenciais**, padronizando a organização dos dados e simplificando a gestão interna.

---

## 6. Perfis de usuários e níveis de acesso

O sistema opera com perfis de acesso organizados por função e por lotação.

### 6.1 Representante da Empresa

Perfil de governança máxima da empresa no sistema.

No primeiro acesso ao ambiente, o Representante é o usuário com maior nível de autoridade para estruturar a empresa e delegar funções estratégicas. Após a empresa estar estruturada, o Representante mantém autoridade permanente para redefinir os titulares das funções estratégicas, sem necessariamente operar os módulos no dia a dia.

### 6.2 CEO

Perfil com visão global da empresa, incluindo estrutura, resultados, desempenho consolidado e organograma.

### 6.3 Diretor

Perfil com visão consolidada da sua diretoria, região, área, unidade ou conjunto de obras sob sua responsabilidade.

### 6.4 Gerente

Perfil voltado à gestão operacional e tática do seu escopo.

### 6.5 Operador

Perfil de execução. Atua nas rotinas, lançamentos, registros, consultas e acompanhamentos do dia a dia.

### 6.6 Encarregado do Sistema (da empresa)

Perfil responsável pela configuração operacional do sistema, cadastro de perfis, parametrizações, vínculos de acesso e manutenção da estrutura funcional da plataforma.

### 6.7 Controle de acesso por perfil (resumo)

- **Gerente de Obra**: visualiza apenas os dados da(s) obra(s) sob sua responsabilidade, incluindo contratos, suprimentos, cronograma, RH e SST.
- **Diretor de Engenharia**: visualiza todas as informações relacionadas à engenharia, incluindo obras, contratos e indicadores técnicos.
- **CEO**: visão global da empresa; permissões de alteração restritas ao organograma e à definição de diretores e gerentes a partir da lista de funcionários.
- **Representante da Empresa**: define ou altera os titulares de CEO, Encarregado do Sistema (da empresa) e Gerente de RH.
- **Encarregado do Sistema (da empresa)**: define usuários, perfis e permissões dentro da empresa, conforme as funções formalmente atribuídas.

### 6.8 Papéis estratégicos (titulares)

O sistema possui papéis estratégicos com impacto direto em permissões e liberação de acesso:

- **CEO (Diretor Geral)**: define estrutura organizacional (organograma) e diretrizes de gestão.
- **Encarregado do Sistema (da empresa)**: configura o ambiente (usuários, perfis, permissões e parametrizações).
- **Gerente de RH**: completa cadastros funcionais e estrutura o quadro de colaboradores.

Regras:

- o acesso aos módulos é liberado conforme o papel formalmente atribuído;
- a alteração de titular atualiza automaticamente as permissões do usuário (ganha ou perde acesso conforme o novo papel);
- quando o mesmo usuário acumula papéis, os acessos aparecem por menus e submenus específicos liberados para esse usuário.

---

## 7. Painéis por perfil

### 7.1 Painel do Representante da Empresa

O painel do Representante é o painel de governança da empresa. Ele é voltado a garantir que o ambiente fique operável desde o primeiro acesso, com delegação de funções estratégicas e controle permanente.

#### Primeiro acesso (configuração inicial)

No primeiro acesso ao sistema, o Representante assume automaticamente, de forma provisória:

- **Representante da Empresa**
- **CEO (Diretor Geral)**
- **Encarregado do Sistema (da empresa)**

Esse comportamento existe para impedir que a empresa fique “travada” no início. As responsabilidades permanecem com o Representante até que ele designe outros usuários para ocupá-las.

#### Navegação por menu (papéis acumulados)

O painel utiliza navegação por menu/submenu para acessar as áreas gerenciais de:

- Representante da Empresa
- CEO
- Encarregado do Sistema (da empresa)

As telas são diferentes. Se a mesma pessoa acumular papéis, ela navega por entradas distintas do menu lateral.

#### Delegação de funções (dinâmica)

O Representante possui autonomia para definir ou alterar os titulares de:

- Gerente de RH
- CEO
- Encarregado do Sistema (da empresa)

Regras:

- qualquer uma ou todas as funções podem ser geridas pelo próprio Representante;
- após delegar um papel para outro funcionário, o Representante perde a autonomia de criação/alteração dentro das telas respectivas e passa a operar nelas em modo de visualização;
- o Representante mantém autoridade máxima para redefinir os titulares a qualquer momento.

#### Cadastro inicial de funcionários (mínimo viável)

Para viabilizar a delegação:

- o Representante pode cadastrar funcionários com dados mínimos (ex.: nome, e-mail, função inicial);
- o sistema deve gerar alertas de pendências cadastrais para o RH.

Após a nomeação do Gerente de RH:

- o RH assume a responsabilidade de completar os cadastros;
- o RH passa a estruturar o quadro funcional conforme o organograma da empresa.

### 7.2 Painel do CEO

O painel do CEO é o painel executivo máximo do sistema. Ele consolida as principais informações da empresa em uma visão ampla, comparativa e estratégica.

Esse painel deve apresentar:

- visão geral das obras em andamento;
- contratos ativos;
- obras em risco ou com atraso;
- valores previstos, medidos, pagos e pendentes;
- indicadores financeiros gerais;
- situação de RH por obra, unidade e escritório;
- situação de SST por local;
- visão consolidada de suprimentos;
- visão de licitações;
- resumo do desempenho por diretoria e unidade;
- ranking de obras por criticidade;
- alertas estratégicos;
- comparativos entre previsto e executado;
- visão geral do resultado por unidade, por obra e global.

A leitura do painel do CEO deve ser simples, rica em informação, mas de fácil entendimento. Os gráficos devem ser executivos, objetivos e diretamente acionáveis.
#### Implementação (no sistema - Backend)

Para que a exclusão não falhe por erro de banco de dados (constraints de chave estrangeira), o backend executa uma **sequência de exclusão (transação atômica)** de "baixo para cima", limpando primeiro os vínculos e tabelas "folha" antes de apagar a empresa.

A sequência exata executada pelo sistema é:

1. **Vínculos fracos (many-to-many e tabelas secundárias):**
   - Apaga vínculos de Responsável-Obra (`ResponsavelObra`);
   - Apaga Medições (`Medicao`);
   - Apaga Pagamentos (`Pagamento`);
2. **Tabelas RESTRICT (que bloqueiam a exclusão se tiverem dados):**
   - Apaga Responsáveis Técnicos (`ResponsavelTecnico`);
   - Apaga Tarefas (`Tarefa`);
   - Apaga Documentos (`Documento`);
   - Apaga Custos (`Custo`);
   - Apaga Etapas (`Etapa`);
3. **Nó Operacional Principal:**
   - Apaga as Obras (`Obra`);
4. **Exclusão Final (Tenant):**
   - Apaga a Empresa (`Tenant`). 
   - *Nota: ao apagar o Tenant, o banco de dados se encarrega de apagar automaticamente todas as outras dezenas de tabelas configuradas com `CASCADE` (Usuários, Módulos de Governança, Backups, etc).*

#### Implementação (no sistema - Frontend)
- Menu: Painéis → CEO
- Edição de organograma: Administração → Organograma (perfil CEO)
- Indicadores possuem links para módulos origem (Engenharia, RH, SST, Suprimentos)
#### Validação
- Ao trocar o titular de CEO, o novo usuário visualiza o painel e opções estratégicas imediatamente
- O titular anterior mantém visualização e perde edição

### 7.3 Painel do Organograma — exclusivo do CEO

O painel do Organograma é um painel estratégico exclusivo do CEO.

Sua função é permitir a visualização e a definição da estrutura organizacional da empresa, incluindo:

- diretorias;
- gerências;
- áreas;
- responsáveis;
- vínculos hierárquicos;
- titulares das funções;
- distribuição organizacional.

Os titulares das diretorias e gerências devem ser escolhidos a partir da base de funcionários cadastrados no sistema.

Esse painel deve permitir ao CEO:

- definir a estrutura organizacional formal da empresa;
- visualizar quem responde por qual diretoria e gerência;
- entender a cadeia de responsabilidade;
- manter a hierarquia clara e atualizada.
#### Implementação (no sistema)
- Menu: Administração → Organograma (perfil CEO)
- Editor visual com árvore, titulares por função e publicação de versão ativa
#### Validação
- Após publicar, titulares ganham seus perfis e painéis correspondentes automaticamente

#### Relação com o Encarregado do Sistema

Embora a **visão estratégica completa do organograma seja exclusiva do CEO**, o **Encarregado do Sistema** deve ter uma área operacional derivada dessa estrutura para:

- vincular perfis às funções definidas;
- ajustar ou expandir perfis de acesso;
- cadastrar novas funções;
- alterar configurações de permissões;
- manter os perfis pré-definidos da empresa.

#### Perfis e organograma pré-definidos

O sistema deve vir com:

- um organograma inicial padrão;
- perfis de acesso pré-definidos por função;
- estrutura básica editável.

Com isso, o Administrador da empresa poderá:

- alterar;
- incluir;
- excluir;
- adaptar a estrutura à realidade da empresa.

### 7.4 Painel do Diretor

O painel do Diretor é tático e gerencial. Ele consolida a operação do seu campo de responsabilidade.

Esse painel deve apresentar:

- desempenho das unidades e obras do seu escopo;
- obras com atraso;
- medições críticas;
- contratos sob acompanhamento;
- gastos principais;
- visão financeira resumida;
- necessidade de pessoal;
- situação de SST;
- andamento de suprimentos;
- licitações relevantes ao seu campo;
- comparativo entre planejado e executado;
- gráficos gerenciais simples e claros.

### 7.5 Painel do Operador

O painel do Operador deve ser o mais simples da plataforma.

Ele deve apresentar:

- o que precisa ser feito no dia;
- registros pendentes;
- itens sob sua responsabilidade;
- ações rápidas;
- filtros básicos;
- situação atual dos processos em que atua;
- atalhos para os módulos que ele realmente usa.

A ideia é evitar excesso de informação e oferecer um ambiente de trabalho direto, simples e eficiente.

### 7.7 Painel do Encarregado do Sistema

O painel do Encarregado do Sistema é voltado à sustentação da plataforma dentro da empresa.

Esse painel deve permitir:

- gestão de usuários;
- gestão de perfis;
- atribuição de lotações;
- parametrização do sistema;
- manutenção dos cadastros estruturais;
- configuração dos tipos de unidades;
- definição de acessos;
- manutenção dos perfis pré-definidos;
- acompanhamento de importações e exportações;
- apoio à operação e implantação.

Ele não substitui a visão estratégica do CEO, mas é o painel de manutenção funcional do ambiente.
#### Implementação (no sistema)
- Menu: Administração → Painel do Administrador
- Criar usuários, vincular a funcionários, atribuir perfis, configurar permissões, parametrizações
#### Validação
- Alterações de perfis refletem imediatamente em menus e módulos visíveis

---

## 8. Procedimento inicial de implantação e uso do sistema

### 8.1 Procedimento recomendado

#### Etapa 1 — cadastro (criação da empresa e do primeiro usuário)

O primeiro acesso ao sistema acontece por meio do **cadastro da empresa**, realizado pelo **Representante da Empresa**.

Esse cadastro cria automaticamente:

- o ambiente da empresa (empresa/tenant);
- o primeiro usuário do sistema (Representante), que passa a ser o usuário com maior autoridade para iniciar a implantação.

Como acessar:

- Acesse a tela **/login**
- Clique em **criar uma nova conta**

O que preencher (mínimo):

- Dados da Empresa: Nome, CNPJ, e-mail da empresa (e opcionalmente o slug)
- Endereço e localização (para cadastro da empresa e referência geográfica)
- Dados do Representante: nome, CPF, e-mail (login) e senha

Observação importante:

- o **e-mail da empresa** é usado como contato institucional (comunicações, avisos e assuntos de cadastro/financeiro) e **não é credencial de acesso**;
- a credencial de acesso é o **e-mail do usuário** (do Representante e dos demais usuários).

Padrão de endereço no sistema (como funciona):

- campos padronizados: rua/logradouro, número, bairro, cidade, UF, CEP, latitude, longitude e link do Google Maps;
- formas de preencher:
  - **Link Google Maps** (recomendado): o sistema extrai coordenadas e preenche o endereço automaticamente;
  - **CEP**: o sistema preenche endereço via base pública (e pode complementar coordenadas);
  - **manual**: o usuário digita e o sistema salva, mesmo sem coordenadas.
- status de implantação:
  - **Empresa (Tenant)**: implementado no cadastro inicial;
  - **Obra**: campos existem e a busca automática está em implantação contínua;
  - outros cadastros (ex.: Unidades): padronização será aplicada quando o endereço fizer sentido operacional.

Regras de senha:

- mínimo 8 caracteres;
- deve conter pelo menos 1 letra e 1 número;
- deve confirmar a senha.

Ao clicar em **Cadastrar**, o sistema cria a empresa e autentica o Representante.

#### Etapa 2 — primeiro login (o que o Representante vê e faz)

Após o cadastro, o Representante é direcionado para o **Dashboard**.

O que o Representante vê no primeiro acesso:

- acesso ao painel de governança (Representante);
- seletor de telas para alternar entre Representante / CEO / Encarregado do Sistema (provisórios);
- atalhos para Configuração da Empresa e definição de titulares.

O que o Representante pode fazer no primeiro acesso:

- parametrizar dados iniciais da empresa (configuração básica);
- cadastrar o mínimo de funcionários (para permitir delegação);
- definir os titulares de CEO, Encarregado do Sistema (da empresa) e Gerente de RH.

Regra operacional:

- no primeiro acesso, o Representante assume provisoriamente os papéis de CEO e Encarregado do Sistema (da empresa), para impedir que a empresa fique travada no início;
- ao delegar um papel para outro usuário, o Representante passa a ter visualização nas telas daquele papel, e o titular passa a ter edição.

Detalhe de nomenclatura (importante):

- Para simplificação operacional, o sistema usa apenas a nomenclatura **Encarregado do Sistema (da empresa)** para a função de administração do sistema.

#### Etapa 3 — definição dos responsáveis iniciais (titulares)

O Representante define inicialmente três papéis essenciais:

- CEO (Diretor Geral)
- Encarregado do Sistema (da empresa)
- Gerente de RH

Regras:

- por padrão, enquanto CEO / Encarregado do Sistema / Gerente de RH ainda não estiverem definidos, os seletores aparecem pré-preenchidos com o funcionário do Representante;
- no primeiro acesso, CEO / Encarregado do Sistema / Gerente de RH já nascem definidos como o Representante (evita empresa “sem titular”);
- no primeiro acesso, o Representante é cadastrado automaticamente como **Funcionário** para permitir essa pré-seleção;
- um mesmo funcionário pode assumir múltiplas funções (ex.: CEO e Gerente de RH), quando fizer sentido operacional.
- o padrão visual em listas e seletores de funcionário é: `#Id - Nome` (Id inteiro sequencial).

#### Implementação (no sistema)

- Painéis → Representante → Configuração da Empresa: definir titulares iniciais (CEO, Encarregado do Sistema, Gerente de RH).
- Cadastro mínimo de pessoas (se preciso): RH → Pessoas (Cadastros) → Funcionários → Novo (nome, e-mail, função inicial)
- Cadastro mínimo de terceirizados (se preciso): RH → Pessoas (Cadastros) → Terceirizados → Novo (nome e função)

#### Validação

- titulares recém-definidos acessam seus painéis imediatamente;
- o titular anterior perde edição e mantém visualização (quando aplicável);
- alertas de pendências para RH aparecem após cadastro mínimo de funcionários.

Regra:

- o acesso efetivo de cada papel acontece após a atribuição formal do titular;
- a alteração de titular atualiza automaticamente as permissões do usuário.

#### Etapa 4 — atuação do Gerente de RH (regularização do cadastro funcional)

O Gerente de RH passa a ser o responsável pelo cadastro funcional dos colaboradores, incluindo:

- dados completos do funcionário;
- lotação;
- situação funcional;
- vínculo;
- movimentações iniciais.

Indicador “Alertas” no CRUD de Funcionários:

- **bolinha vermelha**: faltam dados obrigatórios (ex.: matrícula, nome, CPF, admissão);
- **bolinha amarela**: dados obrigatórios ok, mas faltam dados não obrigatórios (ex.: cargo contratual, função principal);
- **bolinha verde**: cadastro completo.

#### Etapa 5 — atuação do Encarregado do Sistema (usuários e permissões)

O Encarregado do Sistema passa a ser responsável por:

- criar acessos;
- vincular usuários aos funcionários;
- atribuir perfis;
- configurar permissões;
- definir escopos operacionais.

#### Etapa 6 — acessos posteriores (entrar no dia a dia)

Depois que a empresa está configurada, o acesso padrão do usuário é:

- ir em **/login**
- informar e-mail e senha
- clicar em **Entrar**

Se o usuário esquecer a senha:

- na tela **/login**, clicar em **Esqueci minha senha**
- informar o e-mail
- seguir as instruções enviadas para o e-mail para redefinir a senha

Se um usuário tiver vínculo com múltiplas empresas, o sistema exibe uma tela de seleção para escolher qual empresa acessar.

### 8.2 Controle permanente do Representante

Mesmo após a empresa estar operando normalmente, o Representante mantém autoridade para:

- redefinir os titulares de CEO, Encarregado do Sistema (da empresa) e Gerente de RH;
- acompanhar as telas gerenciais (visualização), mesmo que não seja o titular;
- garantir que papéis-chave estejam corretamente atribuídos.

---

## 9. Módulo RH

O módulo RH é responsável pela gestão de pessoas da empresa, ligando a estrutura funcional à operação.
#### Implementação (no sistema)

- Menu: RH
- Cadastros-base: Pessoas, Funcionários, Lotação
- Gestão operacional: alocação por obra/unidade, presença diária, produção diária, produtividade
- Alertas: pendências cadastrais, vencimentos relevantes, necessidades por obra/unidade

#### Validação

- Após nomear o Gerente de RH, as pendências de cadastro devem aparecer para o RH automaticamente
- Lotação e alocação devem refletir em visões de obras, programação semanal e leitura gerencial

### 9.1 Cadastro de pessoas e funcionários

Tela principal: **RH → Pessoas**

#### Implementação (no sistema)

- Lista única de pessoas (funcionários e terceirizados) com coluna de ações para abrir a **Ficha**.
- Acesso rápido por botões:
  - Tipo: **Funcionários** / **Terceirizados** / **Todos**
  - Status: **Ativo** / **Inativo** / **Todos**
- Filtros adicionais: Obra (quando aplicável) e busca por nome/matrícula/CPF.
- Ações no topo (alinhadas ao título da tela): **Novo funcionário**, **Novo terceirizado**, **Presença da obra**, **Dashboard RH**.

#### Fichas (detalhamento)

- **Ficha do Funcionário**: exibe dados gerais, vínculo/obra, documentos e endereços (com botão para gerenciar endereços).
- **Ficha do Terceirizado**: exibe dados gerais, vínculo/obra, documentos e demais abas operacionais.

#### Navegação e rastreabilidade

- Botão **Voltar** nas fichas retorna para a tela de origem (mantida via parâmetro `returnTo`, com fallback para RH → Pessoas).
- Subtítulo/breadcrumb é dinâmico e reflete o caminho real até a tela (ex.: `Engenharia → Obras → Obra selecionada → RH → Pessoas → Ficha do Funcionário`).

### 9.2 Pessoas por escritório, unidade e obra

O RH deve apresentar a distribuição de pessoas por:

- escritório;
- unidade;
- obra;
- função;
- área;
- situação.

Isso permite visualizar onde a mão de obra está concentrada e onde há carência.

### 9.3 Necessidade por obra e por unidade

Esse recurso deve indicar:

- quantidade necessária de pessoas por obra;
- necessidade por unidade;
- comparação entre previsto e alocado;
- faltas de pessoal;
- excesso de alocação;
- apoio ao planejamento de mão de obra.

### 9.4 RH corporativo e calendário geral

O RH também deve ter um calendário geral contendo:

- admissões programadas;
- desligamentos;
- férias;
- movimentações;
- vencimentos relevantes;
- compromissos de pessoal;
- marcos administrativos.

### 9.5 Gestão total dos empregados

O sistema deve permitir a gestão completa dos empregados internos.  
Por opção da empresa, também pode permitir a gestão de terceirizados por obra ou unidade.

Quando habilitado, o sistema deve permitir:

- separação entre empregados próprios e terceirizados;
- acompanhamento por obra;
- acompanhamento por unidade;
- leitura por função;
- visão de necessidade operacional.

### 9.6 Relações do RH com os demais módulos

O RH se liga a:

- obras;
- unidades;
- SST;
- engenharia;
- necessidade operacional;
- centro de custo;
- lotação;
- cronograma de obras;
- planejamento de execução.

### 9.7 Gestão de RH e produtividade por obra

Objetivo: garantir gestão integrada de pessoas, produtividade e custo de mão de obra por obra/unidade, com rastreabilidade.

#### 9.7.1 Histórico do funcionário

Todo evento relacionado ao funcionário deve ser registrado e vinculado ao seu histórico, incluindo:

- alocações/desalocações em obra/unidade;
- registros de presença;
- registros de produção diária;
- ocorrências relevantes (segurança, disciplina e desempenho).

#### 9.7.2 Alocação por obra/unidade

Cada obra/unidade deve possuir uma lista atualizada de trabalhadores, com:

- registro de entrada (alocação);
- registro de saída (desalocação);
- histórico de movimentações.

#### 9.7.3 Presença diária

A lista de presença diária deve conter:

- funcionário;
- data;
- horário de entrada e saída;
- situação (presente, falta, afastado e outros).

Integrações:

- RH central;
- produção diária;
- diário de obra.

#### 9.7.4 Produção diária

Deve existir apontamento de produção por funcionário e por dia, contendo:

- funcionário;
- data;
- serviço(s) executado(s) por código (SER-0001), permitindo múltiplos serviços no mesmo dia;
- quantidade executada;
- unidade de medida.

Formato recomendado no lançamento (para permitir comparação planejado x executado):

- SER-0001:CC-001=10, SER-0002:CC-001=5

Onde:

- SER-0001 = código do serviço
- CC-001 = código do centro de custo
- 10 = quantidade executada

Quando a quantidade por serviço não é informada (apenas códigos), o sistema registra os códigos, mas a comparação por serviço fica limitada.

#### 9.7.5 Produtividade (LOB)

O sistema deve consolidar produtividade por obra e por período, com base em:

- quantidade executada (produção);
- horas trabalhadas (presença).

Tabela mínima:

Funcionário · Serviço · Período · Quantidade · Horas · Produtividade

#### 9.7.6 RH central (devolução e decisão)

Quando uma obra solicitar devolução de funcionário ao RH central, deve registrar:

- justificativa detalhada;
- motivo;
- relatos do engenheiro, mestre e encarregado;
- sugestão de providências (realocação, treinamento, advertência, desligamento).

A decisão final é competência do RH central, com registro e auditoria.

#### 9.7.7 PES — Programação de Execução de Serviços (planejado x executado)

Conceito final do sistema:

Serviço (contratual) → Centro de Custo (execução real) → Equipe (produção) → Recursos (MO, equipamentos, insumos)

Princípio central:

- a unidade de planejamento não é o serviço;
- a unidade de planejamento é o centro de custo (CC).

Diretrizes:

- serviço representa o contrato;
- CC representa a execução real;
- produção e cálculo são por equipe, dentro do CC;
- a PES é planejada por semana, com antecedência mínima de 1 semana (7 dias) em relação ao início da semana.

Tela PES (estrutura funcional):

Topo:

- Obra
- Semana
- Botões:
  - Adicionar Serviço
  - Serviço Não Previsto

Seleção de serviço (obrigatório):

- formato: [Código | Nome | Quantidade da planilha]
- exemplo: 205 | Pilar Concreto Armado | 10 m³

Tabela principal (núcleo do sistema): Programação por Centro de Custo (CC)

Colunas mínimas (CC):

- CC: código único
- Descrição: nome do CC
- Unidade: cada CC tem sua unidade própria
- Equipes: número de equipes
- Produção: h / unidade do CC
- Dependências: CC anterior (pode ser múltiplo)
- Latência: dias (cura/espera)
- Horas necessárias: calculado

Regras dos campos:

- unidade do CC: cada CC pode ter unidade diferente (ex.: fôrma = m²; concretagem = m³)
- produção: formato h/unidade (ex.: 2 h/m²)
- equipes: número inteiro; hover pode mostrar composição
- dependência: término do anterior; permitir múltiplas dependências
- latência: início = fim da dependência + latência

Ordenação:

- permitir reordenar CC manualmente (drag and drop)

Cálculos (definitivo):

- horas necessárias = quantidade × produção
- horas reais com equipes = horas necessárias ÷ número de equipes

Exemplo:

- fôrma: qtd 10 m²; produção 2 h/m² → 20h ÷ 2 equipes = 10h

Caminho crítico (automático):

- sistema calcula cadeia de dependências e maior duração;
- destacar graficamente o fluxo crítico.

Abas:

- mão de obra: CC | Função | Qtde | Horas
- equipamentos: CC | Equipamento | Qtde | Horas
- insumos: CC | Insumo | Quantidade total | Consumo/dia

Regras de recursos:

- mão de obra: total = equipes × composição
- equipamentos: total = equipamentos por equipe × número de equipes
- insumos: total = coeficiente × quantidade
- consumo/dia: produção diária × coeficiente

Alertas (obrigatório):

- falta de mão de obra
- falta de equipamento
- falta de insumo

Ações de alerta:

- solicitar RH
- solicitar equipamento
- requisitar suprimentos

Fluxo operacional:

1. selecionar serviço
2. criar CCs
3. definir produção (equipe)
4. definir dependências
5. sistema calcula horas
6. sistema monta cronograma
7. sistema calcula recursos
8. valida disponibilidade
9. gera alertas
10. usuário solicita recursos
11. execução
12. apropriação

Regras críticas:

- bloquear:
  - CC sem unidade
  - CC sem produção
  - CC sem quantidade
  - dependência inválida
  - horas inconsistentes
- alertar:
  - produção fora do padrão
  - latência alta
  - conflito de recurso

No sistema:

- Engenharia → PES (Programação de Execução de Serviços): criar/abrir semana, programar por CC, registrar recursos e comparar execução (presença/produção) com o planejado.

#### 9.7.7.1 Dashboard final integrado — PES (versão produto)

Layout (grid 12 colunas):

- KPIs gerais (12)
- Caminho crítico (12)
- Programação semanal (12)
- Mão de obra (4) | Equipamentos (4) | Insumos (4)
- Desempenho por CC (6) | Produtividade (6)
- Alertas (6) | Solicitações (6)
- Visão diária (12)

KPIs (semana selecionada):

- execução física (%): executado acumulado ÷ planejado acumulado
- prazo (dias): baseado no caminho crítico
- custo (variação %): comparação previsto × realizado (quando disponível)
- produtividade (índice): produção real ÷ produção prevista ou produção real ÷ horas reais (definir padrão por CC)

Caminho crítico (core):

- baseado em grafo de dependências (DAG)
- maior caminho em duração (critical path)
- destaque de etapa atual, atrasos e bloqueios

Programação semanal (grid):

- dia | CC | serviço | status | equipes/pessoas | produção planejada | execução (%)
- status por cores: concluído (verde), atrasado (vermelho), em risco (amarelo)
- interação: clique abre detalhe do CC

Recursos (integrado):

- mão de obra: necessário (equipes × composição), alocado (RH), déficit
- equipamentos: necessário (por equipe), disponível, déficit
- insumos: necessário (coeficiente × quantidade), estoque, déficit, consumo diário

Desempenho por CC:

- planejado (%) | executado (%) | desvio
- identificar gargalos e atrasos acumulados

Alertas inteligentes:

- falta de recurso (RH/equip/insumo)
- atraso no caminho crítico
- baixa produtividade
- consumo acima

Solicitações:

- RH, equipamentos e suprimentos com status (pendente, em atendimento, aprovado, negado)

Visão diária (campo):

- serviços do dia
- execução em tempo real
- paradas com motivo obrigatório (recurso, clima, dependência)

#### 9.7.7.2 Engine de dependências e auto-replanejamento (PES)

Regra fundamental:

- dependente nunca pode começar antes do predecessor;
- início do CC = max(fim das dependências + latência).

Estratégia de cálculo:

- não recalcular somente um CC;
- recalcular em cascata um subgrafo inteiro, com ordenação topológica.

Algoritmo:

1. ordenar topologicamente os CCs
2. recalcular início/fim respeitando dependências e latência
3. preservar ajuste manual apenas no CC alterado, sem violar predecessor
4. recalcular todos os dependentes automaticamente

Detecção de conflitos de recurso:

- conflito ocorre quando há sobreposição de período e consumo acima da capacidade;
- avaliar por slot de tempo (dia) e por tipo de recurso (MO, equipamento, insumo);
- gerar lista com tempo, recurso, uso, capacidade e CCs envolvidos.

Auto-replanejamento:

- resolver conflitos movendo o CC de menor prioridade (não crítico primeiro);
- aplicar deslocamentos incrementais e recalcular dependências a cada iteração;
- parar quando não houver conflitos ou ao atingir limite de iterações.

Gantt operacional:

- linha vertical de “Hoje”;
- barra planejada + progresso executado (%);
- setas de dependência entre CCs;
- marcação visual de conflito e caminho crítico.

#### 9.7.7.3 PES Workspace (telas do produto)

No sistema:

- Engenharia → Execução → PES (Workspace)

Abas:

- Dashboard
- Planejamento (PES)
- Gantt
- Recursos
- Alertas
- Cenários
- Otimização

Otimização (MVP):

- endpoint: `POST /api/v1/pes/optimize`
- objetivo: minimizar custo + (pesoPrazo × prazo)
- respeita dependências e capacidade (via auto-replanejamento)
- resultado retorna novo Gantt e métricas (prazo/custo/score)

#### 9.7.8 Avaliação do funcionário na apropriação (nota por dia/serviço)

A apropriação pode registrar uma avaliação por funcionário, por dia e por serviço, combinando:

- produtividade (automática): executado ÷ previsto;
- qualidade (manual): nota 0 a 10;
- empenho/comportamento (manual): nota 0 a 10.

Regra de cálculo sugerida:

- produtividade: 50%
- qualidade: 30%
- empenho: 20%

Nota final = (produtividade × 0,5) + (qualidade × 0,3) + (empenho × 0,2)

Regras para evitar distorções:

- não permitir nota sem apropriação vinculada (deve existir programação semanal para o funcionário/serviço/data);
- exigir justificativa quando nota final < 6 ou produtividade muito baixa;
- exigir que a produção esteja apropriada por serviço (SER-0001=...) antes de avaliar.

No sistema:

- Engenharia → PES → coluna “Avaliar” registra as notas e calcula automaticamente produtividade e nota final.

---

## 10. Módulo SST

O módulo SST deve operar com visão por:

- escritório;
- unidade;
- obra.

Seu papel é apoiar a gestão de segurança e saúde ocupacional.
#### Implementação (no sistema)

- Menu: SST
- Rotinas: checklists, não conformidades, treinamentos, acidentes, pendências e vencimentos
- Visões: por obra, por unidade, por escritório e consolidada

#### Validação

- Checklists reprovados devem gerar rastreabilidade e, quando definido, não conformidade automaticamente
- Treinamentos vinculados a serviços devem impactar alertas na PES (apto/não apto)

### 10.1 Funcionalidades principais

- acompanhamento de não conformidades;
- acidentes;
- treinamentos;
- checklists;
- pendências;
- vencimentos;
- alertas críticos;
- visão por local;
- indicadores de risco.

### 10.2 Visões operacionais

O SST deve permitir:

- visão por obra;
- visão por unidade;
- visão por escritório;
- visão consolidada;
- comparação entre locais;
- apoio à prevenção.

### 10.3 Relações do SST

O SST se conecta com:

- RH;
- obras;
- equipes;
- fiscalização;
- diário de obra;
- atividades de campo;
- operação real da empresa.

### 10.4 Checklists como motor de campo (reuso sem burocracia)

Para evitar criação de “fichas” redundantes, o sistema usa checklists como um motor simples de operação:

- modelos de checklist (templates) padronizam o que deve ser verificado;
- execuções por obra/unidade geram rastreabilidade, evidência e histórico;
- quando um item é reprovado (não conforme), o sistema pode gerar não conformidade automaticamente.

Além de SST, o mesmo mecanismo pode ser usado para:

- execução de obra (início, liberação de frente, conclusão, interferências);
- equipamentos (diário, pré-operação, preventiva);
- qualidade (inspeção e conformidade por serviço).

No sistema:

- SST → Checklists SST → “Modelos padrão” cria um conjunto inicial de modelos para Execução, Equipamentos e Qualidade (sem apagar nada e seguro repetir).
- SST → Checklists SST → “Programar padrões” cria programações recorrentes por obra/unidade (ex.: diários e semanais), que alimentam alertas e pendências.

### 10.5 Treinamentos vinculados a serviços (apto/não apto)

Para apoiar operação e desempenho, o módulo de treinamentos deve permitir vincular um treinamento a um ou mais serviços (por código, ex.: SER-0001). Assim, o sistema consegue responder:

- quais funcionários estão aptos para executar um serviço;
- quais funcionários precisam de treinamento;
- quais programações semanais estão com risco (funcionário programado sem aptidão).

No sistema:

- SST → Treinamentos SST → em “Modelos”, botão “Serviços” vincula códigos de serviço ao treinamento;
- SST → Treinamentos SST → “Aptos por serviço” lista os funcionários aptos para um serviço;
- Engenharia → PES indica pendência de treinamento quando o funcionário não possui registro apto para o serviço.

---

## 11. Módulo Engenharia

Este é o núcleo principal da plataforma.
#### Implementação (no sistema)

- Menu: Engenharia
- Acesso orientado por obra: obras, contratos, medições, pagamentos, planilhas e cronogramas
- Integrações: RH (pessoas), SST (segurança), Suprimentos (materiais), Financeiro (pagamentos)

#### Validação

- Toda obra deve estar vinculada a um contrato e possuir rastreabilidade por serviço (quando aplicável)
- Usuários devem enxergar apenas as obras/unidades do seu escopo (lotação)

### 11.1 Obras

A obra deve conter:

- identificação;
- unidade responsável;
- localização;
- responsáveis;
- situação;
- datas principais;
- vínculo com contratos;
- vínculo com orçamento;
- vínculo com cronograma;
- centro de custo;
- histórico operacional.

A obra é o principal ponto de ligação entre os módulos.

#### Regras

- toda obra deve estar vinculada a um contrato;
- toda obra deve ter pelo menos uma planilha contratada (serviços SER-0001) para liberar programação e apropriação;
- toda navegação operacional deve ser orientada pela obra selecionada.

#### Implementação (no sistema)

- Engenharia → Obras → dar duplo clique na obra para abrir a tela **Obra selecionada**
- Engenharia → Obras → também é possível clicar no botão **Selecionar obra**
- Na tela **Obra selecionada** ficam os acessos (botões): Dashboard, Documentos da obra, Planejamento e Execução

#### Validação

- sem contrato e sem planilha contratada, o sistema deve impedir programação e apropriação
- o usuário deve enxergar apenas as obras/unidades do seu escopo (lotação)

#### 11.1.1 Navegação por obra (janelas)

Para reduzir burocracia e aumentar eficiência, a navegação do módulo Engenharia é orientada por obra:

- Engenharia → Obras → selecionar a obra → abrir as janelas operacionais.

Estrutura das janelas (obra selecionada):

- **PES (Programação de Execução de Serviços)**
  - Mão de obra: planejamento por dia/funcionário/serviço, comparação com executado (presença/produção), avaliação e alertas.
  - Equipamentos: planejamento por dia/ativo/serviço (horas previstas e frente de trabalho).
  - Insumos: planejamento por dia/serviço/insumo (quantidade prevista e origem).
- **Apropriação**: registro mínimo do executado por serviço e centro de custo (base de produtividade e custos).
- **Presença digital (RH)**: presença/horas e produção por funcionário (com envio ao RH).
- **Cronograma (Físico-Financeiro)**: planejamento macro e coerência com o planejamento operacional.
- **Fiscalização e Medições**: diário, mídias, medições, impressão e exportações.
- **Equipamentos e Ferramentas**: cautelas, movimentações, horas, combustível, viagens, calendário e descartes.
- **Aquisições (Demandas)**: solicitações operacionais de compra/atendimento.
- **Consumos (Água/Energia/Esgoto)**: controle e consolidação gerencial.
- **Custos (Equipamentos)**: custos por serviço (SER-0001) a partir de horas, combustível e viagens.
- **Checklists (Campo)**: execução/equipamentos/qualidade via modelos e execuções.
- **Treinamentos**: histórico, validade e aptidão por serviço (apto/não apto).
- **Produtividade (Obra)**: consolidação por funcionário e por serviço.
- **Cadastros (Contrapartes/Contratos)**: parceiros e contratos de locação/serviço.

#### 11.1.2 Centros de custo (Serviço x Centro de custo)

Regra base:

- centro de custo nasce na composição do serviço, no nível do insumo (com etapa);
- um serviço (SER-0001) pode ter um ou mais centros de custo, derivados dos insumos/etapas da composição;
- apropriação e planejamento só podem usar centros de custo previstos na composição (ou ajustados na obra).

No sistema:

- Engenharia → Centros de Custo: cadastro dos centros;
- Engenharia → Composições: define os centros de custo por insumo (etapa + insumo + CC);
- Config. Apropriação: define se centro de custo é obrigatório, se exibe alerta ou se permite apropriar sem centro de custo;
- Apropriação/produção diária recomenda lançar por serviço e centro de custo no formato SER-0001:CC-001=10 (CC válido da composição).

Regras de permissão:

- ajustes de centro de custo no nível da obra (composição customizada) são permitidos somente para o gestor da obra;
- a apropriação não “inventa” centro de custo: o usuário escolhe apenas CC previstos.

Configuração (política de centro de custo):

- permitir apropriação sem centro de custo: salva, mas o custo fica alocado no serviço;
- exibir alerta: mostra avisos quando centro de custo não foi informado;
- bloquear salvamento: exige centro de custo obrigatório (não permite salvar).

#### 11.1.3 Planilha contratada da obra (pré-requisito)

Regra base:

- uma obra só pode iniciar a programação e a apropriação após cadastrar a planilha contratada (orçamentária) da obra;
- a planilha define quais serviços (SER-0001) pertencem à obra;
- a planilha vincula o serviço à composição e permite ajustar centros de custo por insumo (sem alterar a base corporativa).

No sistema:

- Engenharia → Obras → selecionar a obra → Planilha contratada.

Fluxo de uso (passo a passo):

1) cadastrar o(s) serviço(s) da obra (código, descrição, unidade, quantidade e preço, quando aplicável);
2) selecionar o serviço e ajustar a composição do serviço (centro de custo por insumo):
   - o sistema carrega a composição da base corporativa;
   - o gestor da obra ajusta o CC de cada insumo (por etapa) quando necessário;
   - a estrutura da composição corporativa não é alterada, apenas a versão da obra.
3) após existir pelo menos um serviço na planilha, a obra libera:
   - PES (mão de obra/equipamentos/insumos);
   - Apropriação (por serviço e centro de custo).

Regras atualizadas — Programação e Apropriação:

Programação:

- aceita serviços previstos na planilha da obra;
- aceita serviços não previstos, desde que sejam criados pelo engenheiro no momento da execução.

Para serviços não previstos, é obrigatório:

- informar justificativa;
- anexar fotos/evidências (por upload no sistema ou por URL);
- submeter para aprovação do fiscal (quando aplicável);
- em caso de rejeição, o fiscal deve informar o motivo (obrigatório);
- criar automaticamente o centro de custo vinculado ao novo serviço.

Apropriação:

- aceita apenas centros de custo da obra, independentemente de serem:
  - oriundos da planilha original; ou
  - criados durante a execução (via programação).

Endpoints de apoio (serviço não previsto):

- listar serviços criados na execução: `GET /api/v1/engenharia/obras/:id/servicos-execucao`
- aprovar/rejeitar serviço criado: `PUT /api/v1/engenharia/obras/:id/servicos-execucao` (body: `codigoServico`, `acao=APROVAR|REJEITAR`)

#### 11.1.4 Obra e Endereço (modelo definitivo)

Diretriz:

- toda obra deve estar vinculada a um contrato (obrigatório);
- obra não armazena endereço; endereço é uma entidade separada vinculada a `obra_id` + `tenant_id`;
- o backend é a única fonte da verdade (frontend apenas solicita ações por origem: LINK, CEP ou MANUAL).

Modelo (conceitual):

- Obra: `id`, `contrato_id`, `tenant_id`, `name`, `description`, `type`, `status`, `valorPrevisto`, `createdAt`, `updatedAt`.
- EnderecoObra: `id`, `tenant_id`, `obra_id`, `cep`, `logradouro`, `numero`, `complemento`, `bairro`, `cidade`, `uf`, `latitude`, `longitude`, `origemEndereco`, `origemCoordenada`, `criadoEm`, `atualizadoEm`.

Regras de origem:

- prioridade de qualidade: `LINK > CEP > MANUAL`;
- nunca sobrescrever automaticamente campos manualmente preenchidos;
- CEP no banco: somente números (8 dígitos). Na tela: máscara `00000-000`.

Endpoints (resumo):

- listar contratos: `GET /api/contratos`
- criar contrato: `POST /api/contratos`
- criar obra (contrato obrigatório): `POST /api/obras`
- salvar endereço: `PUT /api/obras/:id/endereco` (`origem=LINK|CEP|MANUAL`)
- criar planilha mínima (SER-0001): `POST /api/obras/:id/planilha/minima`

Fluxo recomendado:

1) criar contrato (número do contrato);
2) cadastrar obra escolhendo o contrato;
3) cadastrar endereço (LINK, CEP ou MANUAL);
4) cadastrar planilha contratada mínima com o serviço `SER-0001` para liberar programação e apropriação.

### 11.2 Contratos

O sistema deve permitir:

- cadastro de contratos;
- vínculo com obra/serviço;
- vigência;
- situação contratual;
- valor contratado;
- saldo;
- reajustes;
- aditivos;
- marcos relevantes;
- acompanhamento da execução contratual.

Os contratos se ligam diretamente a:

- obras;
- medições;
- pagamentos;
- cronograma;
- controle financeiro.

#### Implementação (no sistema)

- Engenharia → Contratos → Novo / Detalhe
- Vínculos obrigatórios: contrato ↔ obra/serviço
- Integrações: medições e pagamentos vinculados ao contrato

#### Validação

- obra/serviço sem número de contrato não deve ser aceito
- pagamentos e medições devem apontar sempre para um contrato válido

#### 11.2.1 Tipos de contrato

- Público (empresa pública)
- Privado (empresa privada ou pessoa física)
- Interno (serviços internos)
- Com terceiros (composição de parte ou todo; deve referenciar o contrato principal)

Regra: **obra/serviço sem número de contrato não é aceito no sistema**.

### 11.3 Medições

As medições são essenciais para a leitura técnica e financeira da obra.

O sistema deve permitir:

- medições por contrato;
- medições por obra;
- período de referência;
- valor medido;
- situação da medição;
- histórico da medição;
- vínculo com progresso;
- vínculo com contrato;
- vínculo com pagamento.

As medições também alimentam o módulo financeiro, pois representam uma das principais entradas ou expectativas de entrada de recursos.

#### Implementação (no sistema)

- Engenharia → Medições (por contrato e por obra)
- Fluxo: criar → anexar evidências → enviar → aprovar/ajustar → consolidar impacto no financeiro

#### Validação

- medição aprovada deve refletir automaticamente em avanço físico/financeiro e no módulo financeiro
- ajustes de fiscalização devem manter rastreabilidade (original do engenheiro e cópia ajustada do fiscal)

#### 11.3.1 Regras de execução e aprovação

- A medição é elaborada pela engenharia e aprovada pela fiscalização.
- O acompanhamento do cronograma deve refletir obrigatoriamente as medições realizadas.
- Não há execução sem medição registrada: o avanço executado (físico e financeiro) só é considerado quando a medição estiver aprovada.
- O avanço físico da obra deve ser baseado exclusivamente em medições aprovadas (quantidades/horas-homem vinculadas à medição).

#### 11.3.1.1 Fluxo de envio, ajuste e aprovação (rastreabilidade)

- Após o envio da medição pelo engenheiro, ela não pode mais ser editada pelo engenheiro.
- O fiscal não altera diretamente a medição original enviada pelo engenheiro.
- Para realizar ajustes, o fiscal deve duplicar a medição enviada, realizar as alterações na cópia e manter ambas registradas:
  - medição original (engenheiro)
  - medição ajustada (fiscal)
- O fiscal pode criar medições diretamente, mesmo que não exista medição prévia do engenheiro.
- A medição só é considerada válida/oficial para efeitos contratuais e financeiros após aprovação do fiscal.

#### 11.3.2 Anexos e vínculo com serviços

Em cada medição o responsável deve poder:

- anexar fotos e documentos;
- informar descrição, data e hora;
- vincular a um ou mais serviços.

#### 11.3.3 Consulta, impressão e download

O sistema deve permitir:

- visualizar medições por obra/contrato e por status;
- imprimir medições (formato de impressão);
- baixar medições para arquivo (download).

Exportações mínimas:

- CSV de medições por obra (com origem, vínculo com medição original, valor e status)

### 11.4 Pagamentos

O módulo de Engenharia, em conjunto com o Financeiro, deve permitir acompanhamento de:

- pagamentos esperados;
- pagamentos gerados a partir de medições;
- pagamentos pendentes;
- pagamentos realizados;
- valores por obra;
- valores por unidade;
- valores por contrato.

#### Implementação (no sistema)

- Engenharia → Pagamentos (por obra/contrato) e Financeiro → Pagamentos
- Pagamentos podem ser gerados a partir de medições e acompanhados por status

#### Validação

- todo pagamento deve ter vínculo com contrato e referência de origem (ex.: medição)
- status do pagamento deve ser consistente entre Engenharia e Financeiro

### 11.5 Planilha orçamentária

A planilha orçamentária deve permitir:

- estruturação do orçamento da obra;
- agrupamento por etapas;
- itens de serviço;
- materiais;
- composições;
- quantitativos;
- custos;
- projeção do valor previsto.

Ela é a base da leitura de custo, planejamento e comparação com o executado.

#### Implementação (no sistema)

- Engenharia → Obras → Planilha contratada / Planilha orçamentária
- Importação/edição: serviços, composições, insumos, quantitativos e custos
- Importação e criação de versões não são bloqueadas pelo status da obra; a edição é permitida apenas na versão atual

#### Validação

- a planilha define os serviços válidos (SER-0001) para programação e apropriação
- mudanças de planilha na obra não devem alterar a base corporativa

### 11.6 BDI, impostos e lucro

O sistema deve permitir compor e visualizar:

- BDI;
- impostos;
- lucro;
- impacto dos componentes sobre o preço;
- formação do orçamento.

Isso deve ficar claro para a gestão e para o controle técnico-econômico da obra.

#### Implementação (no sistema)

- Engenharia → Orçamentos → Parâmetros econômicos (por orçamento)
- BDI, impostos e encargos devem alimentar formação do preço e relatórios de orçamento

#### Validação

- alteração de parâmetros deve refletir no preço calculado e nos relatórios
- histórico de versões do orçamento deve preservar parâmetros anteriores

### 11.7 Previsto da obra

O conjunto “Previsto” reúne os elementos de planejamento e referência da execução.

Inclui:

- calendário;
- LOB;
- diários;
- cronograma;
- materiais previstos;
- valor previsto;
- cotações;
- controle de entrada e saída;
- centro de custo;
- apropriação.

#### Implementação (no sistema)

- Engenharia → Obras → abrir obra → Previsto
- Abas mínimas: Calendário, LOB, Diários, Cronograma, Materiais previstos, Valor previsto, Cotações, Centro de custo, Apropriação

#### Validação

- planejado x executado financeiro deve ser calculado a partir das medições aprovadas
- planejado x executado físico deve ser coerente com LOB/cronograma e com evidências de execução

#### Calendário

Exibe marcos, etapas, eventos, medições previstas, prazos e dias úteis.

#### LOB
Representa a visão da linha de planejamento da obra/serviço, permitindo comparação entre avanço planejado e avanço real.

Cada obra pode ter (não é obrigatório) um LOB associado. O LOB da obra pode ser atualizado ao longo do tempo conforme necessidade operacional.

Opção de medida:

- Quantitativo/Unidade de serviço (Qnt/Un Serv)
- Horas-homem

A LOB deve permitir a escolha do critério de avanço (Qnt/Un ou horas-homem) por obra, mantendo coerência com medições e cronograma.

#### Diários

Guardam a memória operacional da obra, integrando atividades, fatos, ocorrências e observações do dia.

#### Cronograma

Organiza as etapas previstas da obra e permite acompanhar atraso, adiantamento e execução.

Toda obra possui um cronograma inicial contratado. Alterações de cronograma devem ocorrer exclusivamente por meio de aditivos contratuais (com rastreabilidade do motivo, data e responsável).

Fluxo operacional:

1. Cronograma contratado: cadastro do cronograma inicial da obra (baseline).
2. Aditivo de cronograma: toda alteração cria um aditivo vinculado ao contrato e gera uma nova versão de cronograma da obra.
3. Consulta: o sistema sempre exibe o cronograma vigente mais recente, preservando histórico de versões.

---

## 12. Suprimentos (Arquitetura Funcional)

### 12.1 Estrutura de menus (implantação)

Administração:

- Suprimentos (Central)
  - Dashboard
  - Cadastros: Produtos, Categorias, Fornecedores, Unidades de medida, Tabela de preços
  - Estrutura: Almoxarifados, Tipos de almoxarifado
  - Planejamento e Controle: Parâmetros, Curva ABC, Controle de lotes
  - Compras (núcleo): Solicitações, Análise de estoque, Cotações, Pedido de compra, Aprovações
  - Monitoramento: Compras em andamento, Materiais críticos, Histórico de movimentações

Engenharia:

- Obras → Execução → Suprimentos (Obra)
  - Dashboard da obra
  - Solicitações (nova, minhas, status)
  - Estoque da obra (saldo, movimentações, inventário)
  - Recebimento (conferência de quantidade/lote)
  - Transferências (solicitar, enviar, receber)
  - Apropriação (essencial)
  - Programação de materiais (semanal/mensal/por serviço/por centro de custo)

Suprimentos:

- Unidades de Estoque (filiais, bases e centros de apoio)
- Unidades de Venda (PDV/loja)
- Logística (opcional avançado)

### 12.2 Quatro camadas operacionais (regra de desenho)

- Central: compra e governança de estoque.
- Obra: consumo, apropriação e programação.
- Unidade de estoque: apoio/logística e armazenagem.
- Unidade de venda: operação comercial (PDV).

Regra de ouro:

- o mesmo produto pode existir em todos os contextos;
- cada contexto tem comportamento e permissões diferentes;
- o backend deve separar regras por tipo de contexto para evitar mistura de processos.

### 12.3 Matriz de permissões (simplificada)

Perfis:

- Administrador
- Comprador
- Engenheiro (obra)
- Almoxarife (obra)
- Almoxarife (unidade)
- Vendedor (loja)
- Financeiro
- Diretor/Gestor

Diretrizes:

- engenheiro aprova solicitação técnica, mas não executa compra;
- comprador executa compra, mas não dá baixa de consumo técnico da obra;
- almoxarife movimenta estoque, mas não aprova financeiramente;
- financeiro aprova pagamento, sem alterar saldos de estoque diretamente;
- toda ação crítica deve ter trilha de auditoria (quem, quando, antes/depois).

### 12.4 Fluxo automático de suprimentos (status)

Fluxo alvo:

1. SOLICITAÇÃO
2. EM ANÁLISE
3. VERIFICANDO ESTOQUE
4. Se houver estoque: TRANSFERÊNCIA → RECEBIDO → FINALIZADO
5. Se não houver: EM COTAÇÃO → APROVADA → EM COMPRA → AGUARDANDO PAGAMENTO → PAGO → EM TRANSPORTE → RECEBIDO → DISPONÍVEL

Automações mínimas:

- ao aprovar solicitação, abrir cotação automaticamente;
- ao receber material, atualizar saldo de estoque automaticamente;
- ao registrar transporte, status muda para “em trânsito”;
- ao confirmar pagamento, pedido fica elegível para expedição;
- ao detectar estoque abaixo do mínimo, gerar sugestão de reposição.

### 12.5 Integração com obra e serviço (SER-0001)

Regras obrigatórias:

- obra deve possuir contrato válido;
- obra deve possuir planilha contratada com ao menos um serviço `SER-0001`;
- programação e apropriação só aceitam serviços previstos na planilha da obra;
- centros de custo permitidos devem vir da composição vinculada ao serviço.

### 12.6 Indicadores (KPIs) por domínio

Obra:

- Consumo real x previsto (%)
- Custo por m²
- Materiais em falta
- Tempo médio de atendimento

Estoque:

- Giro de estoque
- Cobertura (dias)
- Ruptura
- Valor total em estoque

Compras:

- Economia por cotação
- Lead time (solicitação até entrega)
- Prazo médio de compra
- Fornecedor mais utilizado

Venda (quando habilitada):

- Ticket médio
- Margem
- Volume vendido
- Produtos mais vendidos

#### Acompanhamento do cronograma (planejado x executado)

O acompanhamento do cronograma deve verificar, mês a mês, o avanço:

- **Físico**: conforme o critério da LOB da obra (Quantidades/Unidade de Serviço ou Horas-homem).
- **Financeiro**: conforme o valor medido nas medições do contrato (execução financeira medida).

Relação operacional:

Engenharia → Contratos → Obras → Cronograma → Execução financeira (medida)

Regras práticas:

- O sistema deve exibir percentuais **mensais** e **acumulados** (planejado x executado).
- O executado financeiro deve ser calculado a partir das **medições** (valor medido por mês) e do **valor contratado**.
- O executado físico deve ser registrado por mês (quantidade executada ou horas-homem) e comparado com o planejado do cronograma/LOB.

#### Materiais previstos

Mostra os insumos necessários ao planejamento da obra.

#### Valor previsto

Representa a expectativa econômica por etapa, serviço ou período.

#### Cotações

Apoiam o processo de aquisição e análise de preço.

#### Controle de entrada e saída

Organiza a movimentação dos materiais, integrando engenharia e suprimentos.

#### Centro de custo

Vincula a despesa ou alocação ao centro responsável.

#### Apropriação

Permite relacionar gastos, materiais, serviços ou recursos à obra, unidade, contrato, etapa ou centro de custo correspondente.

### 11.8 Serviços, composições, SINAPI e orçamento

O sistema possui o módulo **Engenharia → Orçamentos**, que centraliza a base corporativa e a criação de orçamentos independentes.

#### Regras

- base corporativa (serviços/insumos/composições) é compartilhada e mantida no nível corporativo;
- orçamentos são independentes, versionados e não alteram automaticamente outros orçamentos;
- importação por CSV deve respeitar ordem obrigatória para evitar inconsistências (insumos → composições → serviços);
- parâmetros econômicos (BDI/impostos/encargos) são por orçamento e influenciam diretamente o preço final.

#### 11.8.1 Base corporativa (Engenharia)

Regras:

- Serviços, insumos e composições são mantidos na base corporativa;
- centro de custo nasce na composição, no nível do insumo (etapa + insumo + CC);
- a composição pode repetir o mesmo insumo em etapas diferentes, com centros de custo diferentes.

Fluxo:

1) cadastrar serviços (código, descrição, unidade, referência SINAPI quando aplicável);
2) cadastrar insumos (código, descrição, unidade, custo base);
3) montar composições e definir centro de custo por insumo.

#### 11.8.2 Orçamentos (licitação/contrato privado)

Regras:

- cada orçamento é independente (não compartilha valores automaticamente com outros orçamentos);
- possui tipo (licitação/contrato privado), data base e parâmetros próprios;
- deve suportar versionamento.

Parâmetros econômicos (por orçamento):

- BDI (administração, riscos, margem, lucro);
- impostos e encargos por tipo (materiais/serviços/equipamentos);
- faixa de preço de insumos (compra/venda) com alertas.

#### Implementação (no sistema)

- Engenharia → Orçamentos
  - Aba Orçamentos: criar e listar orçamentos
  - Orçamento → Detalhe:
    - copiar base corporativa para uma versão do orçamento (serviços/insumos/composições)
    - importar CSV por ordem obrigatória (insumos → composições → serviços)
    - ajustar faixas de preço de insumos e preço atual
    - alertas visuais quando preço atual ficar abaixo do mínimo de compra

#### 11.8.3 Planilhas versionadas (obra/licitação/contrato privado)

Regras:

- planilha de obra é independente e versionada;
- planilha de licitação e de contrato privado também devem ser versionadas;
- nenhuma alteração na obra altera a base corporativa da engenharia.

#### Validação

- alterações em um orçamento não podem alterar a base corporativa
- importação fora da ordem obrigatória deve ser bloqueada com mensagem clara
- versionamento deve permitir comparar versões e voltar para uma versão anterior

### 11.9 Controle de licitações

O módulo de Licitações deve fazer parte da visão geral do sistema e ser tratado como uma área operacional própria.

Seu objetivo é gerenciar as licitações que a empresa poderá participar, desde a análise da oportunidade até o encerramento do processo.

#### Regras

- cada licitação deve possuir status e fase, com datas e prazos rastreáveis;
- o sistema deve comparar automaticamente demandas do edital com capacidades existentes (documentos, acervo, profissionais);
- pendências devem ser exibidas como checklist (atendido, pendente, vencido, a vencer, sem arquivo);
- uma licitação vencida pode originar um contrato e depois uma obra, mantendo rastreabilidade do vínculo.

#### Implementação (no sistema)

- Menu: Engenharia → Licitações
- Fluxo de uso:
  1) cadastrar Documentos da Empresa (biblioteca corporativa)
  2) cadastrar Acervo da Empresa (biblioteca corporativa)
  3) criar licitação e vincular documentos/acervo necessários
  4) validar pendências no checklist e gerar dossiê

#### Validação

- documentos vencidos ou a vencer devem gerar alerta e bloquear envio quando configurado como pendência crítica
- checklist deve refletir automaticamente: vinculado, sem arquivo, a vencer, vencido
- dossiê deve listar todos os itens com links de download do PDF final

#### 11.9.1 Funções principais do módulo de licitações

- cadastro da licitação;
- identificação do órgão ou contratante;
- objeto da licitação;
- prazo;
- situação;
- fase do processo;
- data de abertura;
- data de encerramento;
- documentos exigidos;
- requisitos técnicos;
- exigências de acervo;
- exigências de capacidade operacional;
- requisitos financeiros e documentais;
- histórico de participação.

#### 11.9.2 Quadro de licitações

O sistema deve apresentar um quadro claro de licitações, com agrupamentos como:

- previstas;
- em análise;
- em preparação;
- participando;
- aguardando resultado;
- vencidas;
- encerradas;
- desistidas.

#### 11.9.3 Controle de demanda da licitação

O sistema deve comparar automaticamente as exigências de cada licitação com a estrutura e capacidade existentes na empresa.

Isso inclui verificar:

- acervo técnico disponível;
- documentos obrigatórios;
- experiências compatíveis;
- profissionais vinculados;
- capacidades já atendidas;
- itens faltantes;
- pontos pendentes para participação.

#### 11.9.4 Acervo técnico

O módulo deve permitir:

- cadastro do acervo técnico da empresa;
- upload de documentos de acervo;
- classificação por tipo;
- visualização do documento;
- impressão;
- download;
- vinculação a licitações;
- consulta de validade e adequação ao edital.

Com isso, o sistema deve informar se todas as demandas da licitação estão sendo atendidas ou não, destacando:

- o que está atendido;
- o que está faltando;
- qual documento comprova cada exigência;
- o que precisa ser providenciado.

#### 11.9.5 Relação da licitação com os demais módulos

O módulo de Licitações se relaciona com:

- engenharia;
- contratos;
- documentos;
- acervo técnico;
- organograma funcional;
- quadro de profissionais;
- capacidade operacional;
- eventualmente orçamento e planejamento.

Uma licitação vencida pode dar origem a contrato e, posteriormente, à obra e aos demais controles de execução.

#### 11.9.6 Implementação no sistema

No menu:

- Engenharia → Licitações: cadastro e acompanhamento das licitações.

Regras:

- documentos e acervo devem ser cadastrados previamente na empresa (biblioteca corporativa);
- cada licitação vincula documentos e acervos a partir dessa biblioteca;
- o sistema deve sinalizar vencimento e pendências (ex.: documento vencido, documento a vencer).

Fluxo de uso (passo a passo):

1) cadastrar Documentos da Empresa:
   - Engenharia → Licitações → Documentos da Empresa;
   - criar o documento (categoria, nome, validade);
   - abrir o “Documento” e anexar o PDF.
2) cadastrar Acervo da Empresa:
   - Engenharia → Licitações → Acervo da Empresa;
   - criar o item de acervo (CAT/Atestado/Obra executada);
   - abrir o “Documento” e anexar o PDF.
3) vincular na licitação:
   - Engenharia → Licitações → abrir a licitação;
   - aba Documentos: vincular documentos necessários;
   - aba Acervo: vincular acervos compatíveis;
   - validar alertas (vencido/a vencer).

Checklist e dossiê:

- Checklist: lista itens obrigatórios e verifica automaticamente:
  - pendente (não vinculado),
  - sem arquivo (vinculado mas sem PDF anexado),
  - a vencer (validade em até 30 dias),
  - vencido.
- Dossiê: lista documentos e acervos vinculados com links de download do PDF final.

Controle de andamento, comunicações e recursos:

- Andamento:
  - mantém o status, fase, datas e responsável pela licitação;
  - registra eventos (prazos, publicações, reuniões, decisões) em linha do tempo.
- Documentos enviados e recebidos:
  - registra comunicações por data (enviado/recebido) e canal (portal, e-mail, ofício, etc.);
  - cada registro pode gerar um “Documento” para anexar PDF e manter histórico/versões.
- Recursos:
  - controla impugnações, pedidos de esclarecimento, recurso administrativo e contrarrazões;
  - registra datas, prazos, protocolo e status;
  - cada recurso gera um “Documento” para anexar o arquivo oficial.

Validação antes do envio:

- aba Validação:
  - consolida pendências críticas (checklist obrigatório pendente, documento vencido, comunicação sem arquivo, prazo vencido);
  - mostra alertas de prazo (configurável em dias);
  - fornece links diretos para corrigir (abrir documento, baixar PDF).

---

### 11.10 Controle de equipamentos

As obras e unidades devem realizar o controle completo de equipamentos, abrangendo ciclo de vida, utilização, movimentação, custos e relacionamento contratual. Deve contemplar:

- cautelas diárias (entrega e devolução);
- transferências entre obras e unidades;
- localização atual e histórico de movimentações;
- planejamento de uso (calendário mensal);
- gestão de equipamentos pesados com apontamento diário de horas produtivas e improdutivas;
- controle de viagens de caminhões (destino, tipo de carga e dados operacionais);
- controle de consumo de combustível por equipamento;
- controle de equipamentos alugados a terceiros (ativos);
- controle de equipamentos locados de terceiros (passivos);
- emissão de laudos de descarte, com aprovação do engenheiro responsável da obra.

Regra de apropriação:

- toda apropriação de utilização deve ser vinculada ao código do serviço (ex.: SER-0001);
- a apropriação é de responsabilidade do encarregado/apontador, garantindo rastreabilidade e correta alocação de custos.

#### 11.10.1 Movimentações e transferências

O sistema deve manter o histórico completo de movimentações do ativo, incluindo:

- transferência entre obra e unidade;
- entrada/saída;
- movimentação para terceiros;
- registros de manutenção;
- mudança de localização.

Toda movimentação deve atualizar a localização atual do ativo e permanecer registrada no histórico.

#### 11.10.2 Laudo de descarte e aprovação do engenheiro

O descarte deve ser formalizado por laudo, contendo:

- ativo;
- data;
- motivo do descarte;
- evidências (ex.: URL do documento/laudo).

Fluxo:

1. solicitação do laudo de descarte (pendente);
2. aprovação ou rejeição pelo engenheiro responsável da obra;
3. se aprovado, o ativo é marcado como descartado e a movimentação de descarte é registrada.

#### 11.10.3 Apropriação e custo por serviço

Os lançamentos operacionais do ativo devem gerar apropriação por código do serviço (SER-0001), incluindo:

- horas produtivas e improdutivas (equipamentos pesados);
- consumo de combustível;
- viagens (caminhões) e quilometragem.

O sistema deve consolidar mensalmente os custos por serviço, permitindo análise gerencial e rastreabilidade do custo operacional.

#### 11.10.4 Operação no sistema (como usar)

No módulo de Engenharia, a rotina operacional do controle de equipamentos ocorre em:

- Engenharia → Equipamentos e Ferramentas
  - Cadastro: registrar ativos próprios e de terceiros e vincular (opcionalmente) a contraparte/contrato de locação/serviço.
  - Cautelas: registrar entregas e devoluções diárias por obra/unidade e responsável.
  - Movimentações: registrar transferências e mudanças de localização, mantendo histórico e local atual.
  - Horas: apontamento diário de horas produtivas e improdutivas por ativo, sempre com código do serviço (SER-0001).
  - Combustível: consumo diário por ativo, sempre com código do serviço (SER-0001).
  - Viagens: viagens diárias por ativo (caminhões), com origem, destino, tipo de carga, km e código do serviço (SER-0001).
  - Calendário: planejamento mensal de utilização por ativo (competência).
  - Descartes: solicitação e decisão (aprovar/rejeitar) de laudos de descarte.

### 11.11 Controle de ferramentas de pequeno porte

Ferramentas de pequeno porte (não descartáveis) devem contemplar:

- controle de estoque por obra/unidade;
- registro de localização;
- controle de movimentações (entrada, saída e transferência);
- controle por cautela, com identificação do responsável;
- integração com demandas de materiais e solicitações operacionais.

#### 11.11.1 Cautelas diárias (ferramentas)

A cautela de ferramentas registra a entrega e devolução diária por obra/unidade, identificando o destinatário (funcionário) e garantindo rastreabilidade.

Regras operacionais:

- a entrega reduz a quantidade disponível em estoque do local;
- a devolução aumenta a quantidade disponível, sem ultrapassar a quantidade total do estoque do local;
- a entrega exige o código do serviço (SER-0001), para garantir apropriação e alocação de custo/uso quando aplicável.

### 11.12 Gestão de contratos e parceiros (contrapartes contratuais)

O sistema deve possuir um cadastro unificado de contrapartes contratuais, contemplando:

- pessoas jurídicas (empresas contratadas e contratantes);
- pessoas físicas (prestadores de serviço e contratantes).

Regras críticas do cadastro:

- **Documento (CPF/CNPJ) não pode repetir** dentro do Tenant (comparação por dígitos).
- O sistema **aceita com máscara**, mas armazena e valida por dígitos:
  - CPF: 11 dígitos
  - CNPJ: 14 dígitos
- Exclusão operacional:
  - ao “excluir”, a contraparte é **inativada** (status INATIVO);
  - só é permitido inativar/excluir se **não existir contrato vinculado** à contraparte (senão, o sistema bloqueia).

Funcionalidades associadas:

- registro de contratos simples de locação de equipamentos (ativos e passivos);
- registro de contratos simplificados para prestação de serviços por pessoa física ou jurídica, vinculados a serviços específicos por código (ex.: SER-0001);
- histórico por parceiro com contratos, comentários/avaliações e ocorrências relevantes (atrasos, qualidade, conformidades).

Uso da tela (UX padrão):

- Botão **Nova contraparte** fica no topo (lado direito, alinhado ao título).
- O card **Nova/Editar contraparte** inicia oculto e abre ao clicar em **Nova contraparte** ou no botão **Editar** da linha.
- Clique na linha da lista **seleciona** a contraparte e exibe apenas:
  - **Histórico do parceiro**
  - **Documentos do parceiro**
- Na lista, a primeira coluna é **Alerta** (pendências/erros de cadastro) e a segunda coluna é o **ID** da contraparte.
- A coluna **Ações** possui botões (ícones):
  - **Editar contraparte**
  - **Visualizar contratos com a contraparte** (abre a tela de Contratos já filtrada pela contraparte)
  - **Excluir** (respeitando o bloqueio por vínculo com contratos).
 - Filtro de status (classificação): por padrão vem marcado **todos exceto “Não recomendado”**.

#### 11.12.1 Histórico por parceiro (como usar)

Para cada contraparte, o sistema mantém histórico consolidado em:

- Engenharia → Contrapartes → selecionar o parceiro
  - Contratos: lista de contratos vinculados à contraparte (locação ativa/passiva e serviço).
  - Avaliações: registros de nota e/ou comentário por gestor responsável.
  - Ocorrências: registros de eventos relevantes (tipo, gravidade, data, descrição), opcionalmente vinculados a um contrato.
  - Documentos do parceiro: upload/lista/visualização e exclusão de arquivos anexados à contraparte.

### 11.13 Gestão de consumos por unidade/obra

O sistema deve permitir controle de custos operacionais, incluindo:

- energia elétrica por unidade e por obra;
- consumo de água;
- custos com esgoto;
- consolidação para análise gerencial e rateio.

### 11.14 Governança e acesso

Os controles devem estar disponíveis no nível central (Diretoria de Engenharia) e no nível das obras, com ambientes próprios e integrados, garantindo:

- autonomia operacional;
- padronização dos processos;
- rastreabilidade das informações;
- suporte à tomada de decisão gerencial e estratégica.

## 12. Módulo Suprimentos

O módulo de Suprimentos organiza a cadeia de materiais, aquisições e movimentações, garantindo que a engenharia receba os insumos no momento certo e com rastreabilidade de custos.

#### Regras

- toda movimentação de material deve registrar origem, destino, responsável e data/hora;
- o custo real do material (aquisição + frete + impostos) deve ser apropriado no centro de custo de destino;
- materiais podem ser adquiridos diretamente para a obra ou para estoque central (unidade de armazenagem).

#### Implementação (no sistema)

- Menu: Suprimentos
- Cadastros base: materiais/itens, fornecedores, unidades de armazenagem, destinos.
- Operação: solicitações de compra, cotações, aquisições, controle de entrada (NF), saídas e transferências.
- Visões: estoque em tempo real, itens críticos, rastreabilidade por obra/unidade e centro de custo.

#### Validação

- alterações no estoque devem refletir imediatamente no saldo do local (obra ou armazenagem);
- o custo das saídas deve compor o custo realizado da obra no módulo financeiro/engenharia;
- transferências entre obras devem debitar de uma e creditar na outra gerando histórico inalterável.

### 12.1 Aquisição e composição de custos

Quando um item for adquirido, o sistema deve registrar e ratear os componentes do custo real:

- valor de aquisição (nota fiscal);
- impostos recuperáveis e não recuperáveis;
- frete e transporte externo;
- transporte interno e custos acessórios.

Esses valores formam o custo médio do estoque e devem poder ser analisados por: obra, unidade, tipo de material, fornecedor e centro de custo.

### 12.2 Armazenagem, alocação e transferências

O material não precisa ser consumido imediatamente. O sistema deve permitir:

- **Entrada em estoque central**: aquisição para uma "unidade de armazenagem";
- **Alocação**: envio do estoque central para uma obra, unidade ou base operacional;
- **Transferência (Realocação)**: movimentação de um insumo que sobrou em uma obra para outra obra ou de volta para o estoque central.

Toda movimentação exige aprovação e mantém histórico completo de quem enviou, quem recebeu e quando.

### 12.3 Importação de base de dados (CSV)

Para facilitar a implantação, o módulo deve permitir a importação em massa via CSV de:

- materiais (insumos);
- serviços;
- composições.

O sistema deve fornecer o modelo (template) para download, validar os dados antes de gravar e exibir tela de conferência para evitar duplicações e inconsistências.

---

## 13. Módulo de Controle Financeiro

O módulo de Controle Financeiro atua de forma transversal, consolidando as informações econômicas geradas pela Engenharia, RH e Suprimentos. Seu papel é oferecer uma leitura clara da saúde financeira da operação.

#### Regras

- não existe "pagamento" sem origem justificada (medição aprovada, nota fiscal de suprimentos, folha de RH);
- a visão financeira é estritamente limitada pelo escopo (lotação) do usuário;
- o controle financeiro da obra é focado em "caixa da obra" (receitas de medição x custos de execução).

#### Implementação (no sistema)

- Menu: Financeiro
- Funcionalidades: contas a pagar, contas a receber, fluxo de caixa, DRE gerencial da obra.
- Visões: por obra, por unidade e consolidada (apenas para Diretoria/CEO).

#### Validação

- a aprovação de uma medição na Engenharia deve gerar automaticamente uma previsão de recebimento no Financeiro;
- a entrada de uma nota fiscal em Suprimentos deve gerar automaticamente uma previsão de pagamento;
- o gestor da obra não pode visualizar custos de outras obras ou da administração central.
- valores por obra;
- valores por unidade;
- valores por tipo;
- visão geral;
- visão consolidada;
- relacionamento com medições;
- leitura de resultado financeiro.

### 13.2 Integração com medições

O financeiro deve interagir com as medições, especialmente em relação a:

- medições pagas;
- medições pendentes;
- previsão de entrada de recursos;
- entradas já confirmadas;
- pendências financeiras vinculadas à execução contratual.

### 13.3 Painel financeiro

O painel financeiro deve ser rico em gráficos, mas de fácil entendimento.

Deve apresentar, no mínimo:

- pagamentos pendentes;
- pagamentos por obra;
- pagamentos por unidade;
- pagamentos por tipo;
- entradas previstas;
- entradas realizadas;
- comparativo entre previsto e realizado;
- resultado por obra;
- resultado por unidade;
- resultado geral da empresa;
- tendência de entrada e saída;
- distribuição por período;
- leitura clara de situação financeira.

### 13.4 Visão por escopo

- No **dashboard da obra**, o usuário só vê o resultado daquela obra.
- No **dashboard da unidade**, o usuário só vê o resultado da unidade.
- Na visão consolidada, perfis com maior nível de acesso conseguem ver o total geral.

### 13.5 Relações do módulo financeiro

O financeiro se conecta com:

- contratos;
- medições;
- pagamentos;
- suprimentos;
- aquisições;
- apropriações;
- custos por obra e unidade.

---

## 14. Painel de Fiscalização

O painel da Fiscalização é uma das áreas centrais do sistema, especialmente para o acompanhamento da obra no campo.
#### Implementação (no sistema)

- Menu: Fiscalização (por obra)
- Rotinas de campo: diário de obra, calendário, progresso, medições, prazos, anexos (fotos/documentos)
- Repositório central: evidências por obra com origem (diário, medição, relatórios, anexos)

#### Validação

- Todo registro de campo deve ficar vinculado à obra e aparecer no histórico e repositório de evidências
- Permissões por perfil e lotação devem limitar quais obras e rotinas o usuário enxerga

### 14.0 Gestão de conteúdo da obra (fotos e documentos)

Deve existir um repositório central com todas as fotos e documentos vinculados à obra.

Cada registro deve conter:

- descrição;
- data e hora;
- serviço(s) relacionado(s).

Origem dos registros:

- medições;
- diário de obra;
- relatórios;
- anexos avulsos.

Usuários que podem anexar:

- engenheiro;
- mestre de obras;
- encarregado;
- almoxarife;
- outros vinculados à obra.

#### Consulta, impressão e download

O sistema deve permitir:

- visualizar fotos e documentos por obra;
- imprimir listagem (formato de impressão);
- baixar listagem para arquivo (download).

Exportações mínimas:

- CSV do repositório de mídias da obra (fotos e documentos).

### 14.1 Diário de obra

O diário de obra deve permitir:

- registro diário da execução;
- consulta de dias anteriores;
- observações da fiscalização;
- atividades executadas;
- ocorrências;
- impedimentos;
- fatos relevantes;
- apontamentos do dia;
- relação com o avanço real.

#### Janela fiscal do diário

O preenchimento do diário deve respeitar uma janela fiscal definida por obra. Dentro dessa janela:

- cada usuário pode preencher o diário conforme sua responsabilidade na obra;
- fora da janela, o diário fica bloqueado para alteração (mantendo rastreabilidade).

#### Anexos no diário

Fotos e documentos podem ser anexados ao diário contendo:

- descrição;
- data e hora;
- associação a um ou mais serviços.

#### Consulta, impressão e download

O sistema deve permitir:

- visualizar o diário por data e obra;
- imprimir o diário (formato de impressão);
- baixar o diário para arquivo (download).

Exportações mínimas:

- CSV do diário por intervalo de datas

#### Edição restrita da fiscalização

A fiscalização deve editar apenas o que lhe cabe.  
Isso significa que o diário precisa separar claramente:

- informações da execução/contratada;
- informações da fiscalização;
- informações administrativas;
- observações técnicas.

### 14.2 Calendário da obra

O fiscal deve ter acesso ao calendário da obra com:

- eventos;
- marcos;
- datas previstas;
- etapas do cronograma;
- medições previstas;
- dias úteis;
- feriados;
- prazos relevantes.

### 14.3 Gráficos de progresso

O painel deve apresentar:

- progresso físico da obra;
- previsto versus executado;
- evolução por período;
- avanço por etapa;
- leitura de atraso/adiantamento;
- apoio à validação da execução.

### 14.4 Medições

O fiscal deve conseguir:

- consultar medições;
- relacionar medição com o executado;
- analisar períodos;
- entender o vínculo entre avanço real e medição.

### 14.5 Prazo e dias úteis

O painel deve mostrar:

- prazo total;
- dias corridos;
- dias úteis;
- tempo executado;
- tempo restante;
- desvio do cronograma.

### 14.6 Relações do painel de fiscalização

A fiscalização se conecta com:

- obra;
- contrato;
- cronograma;
- diário;
- medição;
- prazo;
- SST;
- engenharia.

---

## 15. Módulo Administração do sistema

Esse módulo sustenta o funcionamento do ambiente da empresa.
#### Implementação (no sistema)

- Menu: Administração
- Gestão de acesso: usuários, perfis, vinculação usuário↔funcionário, ativação/inativação
- Escopo: lotação por unidade/obra/diretoria/área e perfis padrão por função

#### Validação

- Alterações de perfil e lotação devem atualizar menus e módulos visíveis automaticamente
- Auditoria deve registrar quem alterou usuário/perfil/lotação e quando

### 15.1 Funções principais

- cadastro e gestão de usuários;
- vínculo entre funcionário e usuário;
- atribuição de perfis;
- lotação por unidade, obra, área ou diretoria;
- manutenção dos perfis padrão;
- criação de novos perfis;
- ativação e inativação de acessos;
- manutenção de tipos de unidades;
- apoio à estrutura organizacional.

### 15.2 Relação com o organograma

O responsável pelo sistema deve atribuir os perfis conforme as funções definidas no organograma.

Ou seja:

- o organograma define a estrutura e a função;
- o administrador operacionaliza o perfil e o acesso da pessoa correspondente.

### 15.3 Exclusão de empresa (remoção do ambiente) — exclusivo do Administrador do Sistema (plataforma)

A exclusão de uma empresa remove o **ambiente inteiro** daquela empresa dentro da plataforma.

Isso não é uma ação do “Encarregado do Sistema (da empresa)”. É uma ação do **Administrador do Sistema (da plataforma)**, usada apenas em casos especiais (ex.: empresa criada por engano em ambiente de teste).

#### O que a exclusão atinge

Ao excluir uma empresa, são removidos:

- a empresa (tenant) e seu cadastro (CNPJ, nome, endereço, localização e parâmetros);
- o vínculo dos usuários com essa empresa (a empresa deixa de existir para eles);
- todos os dados operacionais que pertencem a essa empresa, incluindo módulos e cadastros vinculados ao tenant (ex.: obras, unidades, funcionários, documentos, histórico e registros).

Impacto prático:

- qualquer usuário que tente acessar essa empresa não conseguirá mais, porque ela deixa de existir;
- a ação é **irreversível** no uso normal do sistema.

#### Tabelas afetadas (o que apaga e o que bloqueia)

O sistema é multiempresa. Quase tudo possui `tenantId` e fica “dentro” da empresa.

Existem dois comportamentos possíveis no banco:

- **RESTRICT (bloqueia exclusão)**: se existir qualquer registro nessas tabelas, o banco impede excluir a empresa até remover esses dados primeiro;
- **CASCADE (remove junto)**: ao excluir a empresa, o banco apaga automaticamente os registros dessas tabelas que pertencem a ela.

Tabelas que **bloqueiam a exclusão** (ON DELETE RESTRICT):

- Obra
- Etapa
- Custo
- Documento
- Tarefa
- ResponsavelTecnico

Tabelas que são **removidas junto** (ON DELETE CASCADE), quando a exclusão é permitida:

- AuditoriaEvento
- BackupExecucaoTenant
- BackupPoliticaTenant
- BackupRestauracaoTenant
- BcpPlano
- BcpPlanoAtivoCritico
- BcpPlanoRunbook
- BcpRunbook
- BcpRunbookPasso
- BcpTeste
- CriseComunicacao
- CriseRegistro
- CriseTimeline
- DocumentoAssinaturaArtefato
- DocumentoAssinaturaCallback
- DocumentoAssinaturaEvidencia
- DocumentoAssinaturaProvedor
- DocumentoAssinaturaSolicitacao
- DocumentoAssinaturaSolicitacaoSignatario
- DocumentoVersao
- EmpresaEncarregadoSistema
- EmpresaRepresentante
- Funcionario
- GovernancaClassificacaoSugestao
- GovernancaDadoAtivo
- GovernancaDadoDominio
- GovernancaDadoGlossario
- GovernancaDadoLineageRelacao
- GovernancaDadoQualidadeExecucao
- GovernancaDadoQualidadeIssue
- GovernancaDadoQualidadeRegra
- GovernancaDadosAuditoria
- GovernancaDescarteLote
- GovernancaDescarteLoteItem
- GovernancaPiiScan
- GovernancaPiiScanResultado
- OrganizacaoCargo
- OrganizacaoSetor
- OrganogramaPosicao
- Perfil
- Subscription
- TenantHistoryEntry
- TenantUser
- Unidade

#### Recomendação (boa prática)

Na maioria dos casos, não se deve excluir uma empresa. O recomendado é:

- **inativar** a empresa (bloqueia acesso e mantém dados para auditoria e recuperação);
- ou **revogar assinatura/liberação** (quando o objetivo é bloquear uso por inadimplência).

Exclusão deve ser usada apenas quando:

- a empresa foi cadastrada por engano;
- é um ambiente de teste que precisa ser removido;
- existe confirmação explícita de que não há dados a preservar.

#### Implementação (no sistema)

ETAPA 1 — Onde acessar
- Acesse o painel do Administrador do Sistema (plataforma) → Gestão de Empresas (lista de empresas)

ETAPA 2 — O que clicar
- Localize a empresa na lista
- Clique no ícone **Excluir**

ETAPA 3 — O que preencher
- Confirme a mensagem de exclusão

ETAPA 4 — O que esperar
- A empresa some da lista
- A empresa deixa de ser acessível para qualquer usuário

ETAPA 5 — Como validar
- Tente acessar a empresa com um usuário vinculado: ela não deve mais aparecer como opção
- A tela de “seleção de empresa” (quando existir) não deve listar mais essa empresa

#### Validação (regras)

- o sistema deve exigir confirmação explícita antes de excluir;
- a exclusão deve ser restrita ao Administrador do Sistema (plataforma);
- a exclusão deve ser tratada como “ação crítica” (com rastreabilidade/auditoria, quando aplicável).

---

## 16. Relações entre os módulos e os dados

Esta é uma das partes mais importantes do sistema.

### 16.0 Diretriz operacional (sem burocracia): OBRA → SERVIÇO → APROPRIAÇÃO

Para que a plataforma entregue eficiência real (e não burocracia), a regra é simples:

- tudo o que acontece em campo deve ser registrado como um evento objetivo, vinculado a uma obra/unidade e a um serviço (por código, ex.: SER-0001), quando houver apropriação;
- a partir desses registros, o sistema consegue gerar: custo real por serviço, produtividade, rastreabilidade e histórico.

Estrutura mínima recomendada para qualquer “ficha”/registro operacional:

- data de referência;
- obra (ou unidade);
- código do serviço (quando aplicável);
- responsável (quem registrou / encarregado / executor);
- status (rascunho, aberto, fechado, enviado, aprovado, etc., conforme o processo);
- anexos (fotos/documentos);
- histórico de alterações (auditoria).

Como isso já é suportado no sistema:

- apropriação por código do serviço: usada em apontamentos de horas, combustível, viagens, cautelas e contratos de serviço;
- anexos (fotos/documentos): centralizados em “Documentos e Fotos da Obra”, com origem e referência do registro;
- histórico: registrado por auditoria de eventos (rastreamento mínimo de criação/alteração).

### 16.1 Obra como centro operacional

A **obra** é o eixo principal da integração.

Ela se relaciona com:

- contratos;
- medições;
- pagamentos;
- fiscalização;
- cronograma;
- diário;
- orçamento;
- materiais;
- suprimentos;
- centro de custo;
- apropriação;
- RH;
- SST.

### 16.2 Unidade como centro organizacional

A **unidade** organiza a base administrativa, operacional e logística.

Ela se relaciona com:

- obras vinculadas;
- equipes;
- estoque;
- centro de armazenagem;
- financeiro por unidade;
- suprimentos;
- SST;
- RH;
- escritórios.

### 16.3 Contrato como eixo técnico-financeiro

O contrato se conecta a:

- obra;
- medições;
- pagamentos;
- cronograma;
- financeiro.

### 16.4 Planilha orçamentária como eixo econômico-técnico

A planilha orçamentária se conecta a:

- serviços;
- composições;
- materiais;
- BDI;
- impostos;
- lucro;
- orçamento previsto;
- medição;
- custo executado.

### 16.5 Suprimentos como eixo logístico

Suprimentos se conecta a:

- materiais;
- obras;
- unidades;
- almoxarifados;
- aquisições;
- centro de custo;
- entrada e saída;
- financeiro.

### 16.6 RH e SST como base de pessoas e segurança

RH e SST se conectam com:

- obras;
- unidades;
- equipes;
- lotações;
- necessidade operacional;
- fiscalização;
- atividades de campo.

### 16.7 Licitações como origem potencial de novos contratos

As licitações se conectam com:

- acervo técnico;
- documentos;
- profissionais;
- engenharia;
- orçamento;
- contratos futuros.

### 16.8 Financeiro como leitura consolidada da execução

O financeiro recebe e consolida informações de:

- medições;
- pagamentos;
- aquisições;
- suprimentos;
- apropriações;
- custos por obra e unidade.

---

## 17. Filtros, escopos e visões por lotação

O sistema deve usar filtros padronizados e simples.

### Filtros principais

- obra;
- unidade;
- escritório;
- contrato;
- período;
- centro de custo;
- tipo;
- situação;
- responsável.

### Regra de lotação

A lotação do usuário define o que ele vê e o que ele pode operar.

#### Exemplo

- usuário lotado em obra: vê a sua obra;
- usuário lotado em unidade: vê a unidade e o que estiver autorizado;
- usuário corporativo: vê consolidado, conforme permissão;
- fiscal: vê e opera o que cabe à sua fiscalização;
- gerente: vê o seu conjunto de operação;
- diretor: vê o escopo da diretoria;
- CEO: vê o total.

---

## 18. Importações e exportações

### 18.1 Exportações

O sistema deve permitir exportação de relatórios e consultas em:

- PDF;
- Excel;
- CSV.

Essas exportações servem para:

- acompanhamento;
- conferência;
- compartilhamento controlado;
- análises complementares.

### 18.2 Importações

O sistema deve permitir importação por CSV para:

- materiais;
- serviços;
- composições.

Com:

- modelo para baixar;
- conferência;
- validação;
- confirmação antes do processamento final.

### 18.3 Documentos e acervos

O sistema também deve permitir:

- upload;
- visualização;
- impressão;
- download;
- organização documental.

Especialmente no módulo de licitações e acervo técnico.

Organização recomendada (sem burocracia):

- usar categoria em formato TIPO:SUBTIPO (ex.: OBRA:ART, OBRA:PROJETO, CONTRATO:ADITIVO);
- usar o vínculo da entidade (OBRA/CONTRATO) para manter rastreabilidade;
- manter versões para revisões (revisão de projeto, atualização de laudo, etc.).

No sistema:

- Obras → Documentos: lista documentos por obra ou por contrato (com opção de incluir documentos das obras do contrato) e agrupa por categoria.
- Documentos: gestão central com versionamento, assinatura e verificação.

---

## 19. Segurança das informações — regras mínimas da reconstrução

A reconstrução do sistema deve priorizar funcionalidade e segurança mínima sólida.

### 19.1 Controle de acesso por escopo

Cada usuário acessa apenas o que sua função, perfil e lotação permitem.

### 19.2 Visão mínima necessária

Cada usuário vê somente o necessário para sua atividade.

### 19.3 Separação por empresa, unidade, obra e papel

A informação deve ser protegida por escopo organizacional e operacional.

### 19.4 Auditoria mínima

O sistema deve registrar, no mínimo, ações relevantes como:

- criação;
- edição;
- importação;
- exportação;
- alteração de registros críticos;
- movimentações sensíveis.

### 19.5 Importação segura

A importação deve:

- validar estrutura;
- evitar inconsistências;
- impedir gravação fora do escopo;
- preservar a qualidade dos dados.

### 19.6 Exportação segura

A exportação deve:

- respeitar perfil e escopo;
- mostrar apenas dados autorizados;
- manter rastreabilidade das exportações importantes.

### 19.7 Organização do menu e do acesso

O menu deve ser exibido conforme perfil, evitando exposição desnecessária de módulos que o usuário não precisa usar.

### 19.8 Integridade da informação

Os dados precisam manter coerência entre módulos, evitando divergências entre obra, contrato, medição, suprimento e financeiro.

---

## 20. Resumo final do funcionamento do sistema

Este sistema é uma plataforma integrada de gestão com foco principal em **Engenharia**, mas sustentada por módulos complementares essenciais para a operação da empresa.

Seu funcionamento se organiza da seguinte forma:

- a **obra** é o centro operacional;
- a **unidade** organiza a base administrativa, logística e gerencial;
- os **contratos** estruturam a relação técnica e financeira;
- as **medições** conectam execução, contrato e resultado financeiro;
- o **financeiro** demonstra o comportamento econômico da operação;
- o **suprimento** garante materiais, aquisições e movimentações;
- o **RH** organiza pessoas e necessidade de mão de obra;
- o **SST** protege e monitora a segurança operacional;
- a **fiscalização** acompanha a realidade da execução da obra;
- as **licitações** antecipam oportunidades e verificam a capacidade da empresa de participar de novos processos;
- o **organograma** define a estrutura corporativa e os responsáveis;
- o **administrador do sistema** operacionaliza acessos, perfis e estrutura funcional.

O sistema foi pensado para ser:

- simples na experiência;
- claro na apresentação;
- forte nas regras;
- seguro no acesso;
- útil na operação real;
- confiável para análise e decisão.

---

## 21. Implementações recentes (Contratos, Planejamento e Aditivos)

Esta seção documenta o que já está implementado no sistema, com foco em **Contratos**, **Planejamento (Gantt)**, **Aditivos** e como isso conversa com **Execução, Medição e Financeiro**.

### 21.0 Arquitetura (padrão do sistema)

Princípio:

- **Frontend (Vercel)**: interface (Next.js), experiência do usuário e navegação.
- **Backend (Render)**: regras de negócio e APIs.
- **Banco (Neon/Postgres)**: persistência principal do sistema (via Prisma no backend).

Observação importante:

- Algumas APIs legadas ainda podem rodar como **API do Next** (server runtime) enquanto o módulo não for migrado para o backend. Isso mantém o sistema funcionando sem “quebrar produção” e permite migração por etapas.

### 21.1 Contratos (módulo de Engenharia)

Regras-base (modelo correto de contrato de obra):

- **Número do contrato é único** dentro do Tenant (evita duplicidade e confusão em relatórios/medições).
- datas de controle: **assinatura**, **OS**, **prazo (dias)**, **vigência inicial** (não muda) e **vigência atual** (muda via aditivo).
- valores: suporta contrato **Público** (Concedente + Próprio) e **Privado/PF** (Valor total).
- o contrato pode existir sem obra; obras podem ser vinculadas depois.
- toda obra possui contrato (quando obra ainda não tem, usa-se contrato “PENDENTE” interno).

Natureza do contrato (papel) e impacto financeiro:

- **Somos CONTRATADOS** → natureza **Receita** (aparece no **Faturamento**).
- **Somos CONTRATANTES** → natureza **Despesa** (não aparece no **Faturamento**).
- Se o contrato estiver **vinculado** a um contrato principal (contrato vinculado), o papel obrigatório é **CONTRATANTES**.

Telas:

- Lista/Detalhe (contratos principais): `/dashboard/contratos`
- Novo contrato: `/dashboard/contratos/novo`

Navegação (padrão de usabilidade):

- Botões **Voltar** e subtítulos (breadcrumb) usam `returnTo` para retornar à tela chamadora e exibir o **caminho real**.
- Se `returnTo` não existir, o sistema volta para o padrão do módulo (ou usa `back()` do navegador quando aplicável).

Menu (padrão):

- Contratos → Dashboard Contratos
- Contratos → Novo Contrato (criação)
- Contratos → Contratos (gestão)
- Contratos → Planejamento (Gantt)
- Contratos → Documentos
- Contratos → Aditivos
- Contratos → Contrapartes (Empresas/Pessoas externas)

Colunas e inteligência (lista):

- **ALERTA**: ✔ OK (verde) / ⚠ Pendente (amarelo) / ✖ Crítico (vermelho) com tooltip das pendências.
- **STATUS** (calculado): 🟢 Em execução / 🔴 Parado / 🟠 Contrato rescindido / 🔵 Concluído / 🟡 Não iniciado / ⚫ Cancelado.

Filtros (lista de contratos):

- Busca: número/nome/empresa.
- Status: seleção por checkbox.
- **Contraparte**: select abaixo da Busca (lista `#id - nome - documento`) para filtrar contratos vinculados à contraparte.
- **Tipo de contrato (papel)**: Todos / Somos CONTRATADOS / Somos CONTRATANTES.
- **Tipo de contraparte**: Todos / Empresa pública / Empresa privada / Pessoa física.

Dashboard de contratos:

- `/dashboard/contratos/dashboard` (KPIs consolidados)
- Filtros: Status, Tipo de contrato (papel) e Tipo de contraparte.

Faturamento:

- `/dashboard/contratos/faturamento`
- Filtros: período (início/fim), Tipo de contrato (papel), Tipo de contraparte, contrato e empresa/cliente.

#### Contrapartes (empresas/pessoas externas) no contrato

Conceito importante (não confundir):

- **Tenant**: é “a nossa empresa dentro do sistema” (a empresa dona dos dados e dos usuários). O Tenant **não é** a empresa contratante nem a empresa contratada do contrato. É quem está usando o sistema.
- **Contrapartes**: são empresas/pessoas externas ao Tenant (clientes, órgãos públicos, fornecedores e subcontratadas). O cadastro delas fica no módulo **Contrapartes**.

Onde ficam as contrapartes (cadastro de empresas/pessoas externas):

- Tela de CRUD: `/dashboard/engenharia/contrapartes`
- API: `/api/v1/engenharia/contrapartes`
- Tabela do cadastro: `engenharia_contrapartes`

Navegação:

- A tela de contrapartes possui **Voltar** e breadcrumb dinâmico (via `returnTo`), para manter o contexto de onde você veio (ex.: Contrato #X → Contrapartes).
- Existe um campo de **seleção com busca (select + digitação)** para localizar rapidamente uma contraparte pelo formato `#id - nome - CPF/CNPJ`.

Como o contrato guarda a contraparte hoje:

- No contrato existem estes campos para a contraparte principal: `empresaParceiraNome` e `empresaParceiraDocumento`.
- O cadastro “oficial” da contraparte fica em **Contrapartes**, mas o contrato armazena **nome e documento** para registro e consulta.
- No formulário do contrato existe o botão **Gerenciar contrapartes** para abrir a tela de contrapartes e manter o cadastro.
- No Novo/Editar contrato, a seleção é via **selectext**:
  - **Nome**: selecionar pelo formato `#id - nome`.
  - **CNPJ/CPF**: preenchido automaticamente a partir da seleção.

O que significa “hoje o contrato guarda só uma empresaParceira”:

- No modelo atual do contrato existem apenas estes campos para empresa externa: `empresaParceiraNome` e `empresaParceiraDocumento`.
- Ou seja: o contrato guarda **apenas 1 contraparte “principal”** (um lado), e não guarda os dois papéis ao mesmo tempo.

Exemplos práticos:

1) Caso “a empresa que contrata a gente” (Cliente/Contratante)
   - Tenant (quem usa o sistema): **Engenharia360 Ltda** (nós)
   - Contratante (cliente): **Prefeitura de Exemplo (CNPJ XX.XXX.XXX/0001-XX)**
   - Nesse caso, `empresaParceira` normalmente seria a **Prefeitura** (porque é com ela que temos o contrato).

2) Caso “a empresa que contratamos” (Fornecedor/Subcontratada)
   - Tenant: **Engenharia360 Ltda** (nós)
   - Contratada por nós (fornecedor): **Construtora Alfa (CNPJ YY.YYY.YYY/0001-YY)**
   - Nesse caso, `empresaParceira` normalmente seria a **Construtora Alfa** (porque é a empresa que estamos contratando).

Por que isso pode confundir:

- Se você quiser registrar no mesmo contrato **os dois lados ao mesmo tempo** (Contratante e Contratada), o campo único `empresaParceira` não é suficiente.

Como fica a “próxima melhoria” (quando você pedir para implementar):

- Vamos separar em dois campos no contrato, por exemplo:
  - **Contratante**: `contratanteNome` + `contratanteDocumento` (quem contrata a gente)
  - **Contratada**: `contratadaNome` + `contratadaDocumento` (quem é contratado no contrato)
- Isso mantém o **Tenant separado** (não confunde “nossa empresa do sistema” com “empresas do contrato”).
- O autocompletar continua vindo do cadastro de **Contrapartes**, mas o contrato passa a armazenar os dois papéis com clareza.

#### Documentos no contrato (Novo/Editar)

Regras:

- Um contrato pode ter **vários documentos** anexados (ex.: contrato assinado, OS, aditivos, medições, comunicações).
- Cada documento possui:
  - **Tipo** (Contrato, OS, Aditivo, Medição, Comunicação, Termos e Outros)
  - **Descrição**
  - Ações: **Exibir** (preview) e **Excluir**
- A visualização possui botão **Fechar visualização** para voltar à lista.

#### Prazo e vigência (Novo/Editar contrato)

Comportamentos:

- Ao preencher o **Prazo**, o sistema calcula automaticamente o **fim da vigência**.
- Ao preencher o **fim da vigência**, o sistema calcula automaticamente o **Prazo** na unidade selecionada.
- Ao trocar a **unidade** (Dias/Semanas/Meses/Anos), o sistema converte o prazo mantendo o mesmo fim de vigência, evitando mudanças inesperadas de data.

#### Documentos (Obra/Contrato) — tela única

Objetivo:

- Centralizar documentos em uma única tela, com contexto **OBRA** ou **CONTRATO**, e navegação consistente.

Tela:

- Documentos (Obra/Contrato): `/dashboard/obras/documentos`

Comportamentos:

- Pode ser aberta por **Contrato** (contexto fixo) ou por **Obra** (contexto fixo). Quando chamada com `tipo` + `id`, o contexto fica travado para evitar anexar no lugar errado.
- Quando aberta sem contexto (sem `id`), permite selecionar **Obra** ou **Contrato** usando campo de texto com lista filtrável.
- Possui **Voltar** e breadcrumb dinâmico (via `returnTo`).
- Em “Documentos cadastrados”, permite filtrar por **Categoria prefixo**: **Todos / Contrato / Obra**.

Compatibilidade:

- A rota antiga `/dashboard/contratos/documentos` foi descontinuada e redireciona para a tela única de documentos.

### 21.2 Planejamento (Gantt) por contrato

Conceito:

Contrato → EAP (Serviços/WBS) → Cronograma (Gantt) → (próximo passo: Execução/Kanban) → Medição/Financeiro

Tela:

- Planejamento: `/dashboard/contratos/planejamento?id={ID_CONTRATO}`

Funcionalidades já implementadas:

- cadastro de **Serviços/EAP** do contrato
- gerar cronograma inicial (seed)
- **drag** para mover tarefas no tempo
- **resize** para alterar duração
- dependências (FS/SS/FF/SF) com **linhas visuais** (tipo MS Project)

### 21.3 Aditivos (fluxo obrigatório por contrato)

Princípio:

- aditivo é histórico (evento), e o “vigente” é o **contrato consolidado**
- aprovação do aditivo atualiza automaticamente: prazo atual, vigência atual, valores atuais

Fluxo de tela (novo padrão):

1) selecionar contrato
2) acessar abas: Dashboard / Aditivos / Novo aditivo

Tipos de aditivo (modelo do sistema):

1) Aditivo de **Prazo**
- altera: vigência atual do contrato (prazo)
- não altera: valor
- planilha: por padrão **Não** (pode ser Sim se você quiser registrar uma reprogramação junto, mas o sistema deixa opcional)

2) Aditivo de **Valor**
- altera: valor total do contrato (e, se for público, concedente/próprio)
- regra obrigatória: **sempre altera planilha**
- motivo: aumento/redução precisa estar distribuído nos itens

3) Aditivo de **Reprogramação de Planilha**
- altera: itens/quantidades/distribuição
- não altera necessariamente: valor total
- planilha: por padrão **Sim**

Regra de ouro:
- se alterar valor → obrigatoriamente alterar planilha
- se não alterar valor → planilha pode ou não ser alterada

Controle de versão da planilha (contrato):
- contrato original: Planilha v1
- ao aprovar um aditivo com “Alterou planilha = Sim”: incrementa automaticamente (v2, v3, ...)
- a versão aparece no cabeçalho do contrato e na tela de aditivos

Tela:

- Aditivos: `/dashboard/contratos/aditivos`
- Para abrir já com contrato selecionado: `/dashboard/contratos/aditivos?contratoId={ID_CONTRATO}`

Comportamentos:

- aditivo inicia como **RASCUNHO**
- ao **aprovar**, aplica no contrato e registra snapshot (antes/depois)
- enquanto existir aditivo em rascunho, o contrato apresenta pendência “Aditivo em aberto” (ALERTA)

### 21.4 Integração com Centro de Custo (CC) e Suprimentos

Diretriz do sistema:

- Serviço (contratual) conecta com **Centro de Custo (execução real)**.
- CC é a unidade operacional para produção, apropriação e análise de custo.

Importante:

- Contratos/Planejamento/Aditivos formam o “topo” (prazo e valor contratual).
- Execução/Medição/Pagamento/CC/Suprimentos formam a “base real” (o que aconteceu).
- O dashboard deve consolidar sempre o **real vs contratado**.

### 21.5 Histórico do contrato (Eventos, Observações e Anexos)

Objetivo:

- manter uma trilha única do que aconteceu no contrato (mudanças, decisões e justificativas), com anexos e consulta rápida.

Onde fica:

- dentro de **Aditivos** (`/dashboard/contratos/aditivos`) após selecionar o contrato, na aba **Eventos**.

Como funciona:

- aprovar/cancelar aditivo gera evento automaticamente no histórico do contrato.
- o usuário pode registrar **Observações** (evento do tipo “OBSERVACAO”) com texto e nível (informativo/atenção/crítico).
- cada evento pode ter **Anexos** (PDF/imagem) com download e preview dentro do sistema.

Filtros (aba Eventos):

- é possível filtrar o histórico por origem: **Contrato**, **Aditivos**, **Obras**, **Documentos** e **Observações**.

### 21.6 Tempo real (atualização automática sem recarregar)

Objetivo:

- evitar inconsistência de tela (usuário aprova um aditivo/lança uma observação e o dashboard/lista ainda mostra dados antigos).

Comportamento:

- quando ocorrer um evento relevante (ex.: aditivo aprovado/cancelado, observação criada, anexo criado), o sistema atualiza automaticamente:
  - a lista/detalhe de contratos (`/dashboard/contratos`)
  - o dashboard de contratos (`/dashboard/contratos/dashboard`)
  - a tela de aditivos (dashboard/eventos) quando o contrato estiver selecionado.

Observação (escala):

- o tempo real atual é baseado em SSE (stream) no backend; no estado atual, ele é ótimo para MVP e ambiente padrão, mas em múltiplas instâncias pode exigir pub/sub (ex.: Redis) para garantir entrega consistente.

### 21.7 Contratos vinculados (contrato principal x contrato vinculado)

Conceito:

- **Contrato principal**: ex.: Prefeitura contrata a nossa empresa (Tenant).
- **Contrato vinculado**: quando a nossa empresa contrata uma empresa/PF (Contraparte) para executar parte ou todo o contrato principal.

Modelo de empresas (regra):

- **Tenant (sua empresa)**: não fica na tabela de contrapartes, é a empresa “dona do sistema”.
- **Contraparte**: tabela externa de empresas e PF (cadastro em `/dashboard/engenharia/contrapartes`).

Papéis (regra):

- Contrato principal:
  - contratante = contraparte
  - contratada = tenant
- Contrato vinculado:
  - contratante = tenant
  - contratada = contraparte

Vínculo obrigatório:

- Todo contrato vinculado deve referenciar o contrato principal (`contratoPrincipalId`).
- Fluxo de tela: abrir contrato principal → ver lista de **Contratos vinculados** (lado a lado com Aditivos e Medições) → clicar em um contrato vinculado para abrir o detalhe.

Controle financeiro (regra obrigatória):

- `SOMA(contratos_vinculados.valor_total) <= contrato_principal.valor_total`
- Se a soma ultrapassar o contrato principal: o sistema bloqueia o cadastro/edição (para evitar estouro financeiro).

Medições por contrato (vinculado ou principal):

- Medição pertence a um contrato (principal ou vinculado).
- `SOMA(medicoes PENDENTE+APROVADO) <= valor do contrato`
- Status da medição: PENDENTE, APROVADO, REJEITADO.

Pagamentos por contrato:

- Pagamento pode estar vinculado a uma medição (opcional).
- `SOMA(pagamentos) <= SOMA(medicoes APROVADAS)`
- Se estiver vinculado a uma medição: não pode pagar mais que o valor dessa medição.

Controle de vigência (regra crítica):

- `contrato_vinculado.data_fim <= contrato_principal.data_fim`
- Se violar: não bloqueia automaticamente, mas o sistema gera alerta forte no contrato vinculado.

Regras de exclusão:

- Se existir medição ou pagamento, não pode excluir o contrato vinculado.

Status padrão do contrato vinculado:

- Planejado
- Em execução
- Aguardando
- Concluído
- Bloqueado

Onde consultar:

- Dentro do contrato selecionado (`/dashboard/contratos?id={ID}`), na seção **Contratos vinculados**.
