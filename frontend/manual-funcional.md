# Manual Funcional do Sistema

## Plataforma Integrada de Gestão Empresarial com foco em Engenharia, Obras e Operação Corporativa

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

### 3.7 Integração entre módulos

Os dados precisam conversar entre si. O sistema não é um conjunto de telas isoladas, mas uma estrutura conectada.

---

## 4. Estrutura geral do sistema

O sistema é formado pelos seguintes grandes blocos funcionais:

1. Painéis por perfil
2. Organograma
3. Administração do sistema
4. RH
5. SST
6. Engenharia
7. Fiscalização
8. Suprimentos
9. Licitações
10. Controle Financeiro
11. Importações e exportações
12. Segurança das informações

### 4.1 Janelas principais do sistema

As janelas (telas) principais se organizam por perfil e por núcleo operacional:

- Painéis por perfil (CEO, Diretor, Gerente, Representante)
- Engenharia (Contratos → Obras/Serviços → Cronograma/LOB → Medições → Pagamentos)
- Fiscalização (Painel Fiscalização, Diário de obra, Medições da fiscalização, Calendário e acompanhamento)
- Suprimentos (solicitação/aprovação, apropriação e controle por serviço/centro de custo)
- RH e SST (cadastros e acompanhamento por unidade/obra)
- Documentos e conteúdo da obra (fotos/documentos vinculados)
- Administração do sistema (usuários, perfis, permissões e parametrizações)

### 4.2 Barra superior (Perfil e Contexto)

Na parte superior do sistema existe uma barra que define duas coisas importantes:

- **Perfil**: determina qual conjunto de permissões e menus você está usando no momento (ex.: Representante, CEO, Encarregado do Sistema). É útil quando a mesma pessoa acumula funções na empresa.
- **Contexto**: define o foco do sistema para navegação e filtros. Ele aparece como guias:
  - **Empresa**: visão mais geral da empresa
  - **Obra**: visão focada em uma obra
  - **Unidade**: visão focada em uma unidade

Regras:

- o Perfil e o Contexto ficam salvos no navegador e permanecem após atualizar a página;
- algumas telas usam o Contexto apenas como “foco” visual (não muda o conteúdo) e serão refinadas para aplicar filtros automáticos conforme o sistema evolui.

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
- quando o mesmo usuário acumula papéis, ele não “mistura” painéis: alterna entre telas específicas de cada papel.

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

#### Seletor de telas (papéis acumulados)

O painel deve possuir um seletor de telas para alternar entre as áreas gerenciais de:

- Representante da Empresa
- CEO
- Encarregado do Sistema (da empresa)

As telas são diferentes. Se a mesma pessoa acumular papéis, ela alterna entre telas distintas.

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

### 7.5 Painel do Gerente

O painel do Gerente é orientado à operação com visão gerencial.

Ele deve mostrar:

- tarefas e pendências da equipe;
- obras do seu escopo;
- medições em andamento;
- cronogramas;
- solicitações pendentes;
- materiais críticos;
- contratos em análise;
- desvios de prazo;
- itens vencendo;
- alertas relevantes por obra, unidade ou área.

Seu objetivo é ajudar a conduzir a operação diariamente.

### 7.6 Painel do Operador

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
- no primeiro acesso, o Representante é cadastrado automaticamente como **Funcionário** para permitir essa pré-seleção;
- um mesmo funcionário pode assumir múltiplas funções (ex.: CEO e Gerente de RH), quando fizer sentido operacional.
- o padrão visual em listas e seletores de funcionário é: `#Id - Nome` (Id inteiro sequencial).

#### Implementação (no sistema)

- Painéis → Representante → Configuração da Empresa: definir titulares iniciais (CEO, Encarregado do Sistema, Gerente de RH).
- Cadastro mínimo de funcionários (se preciso): RH → Funcionários → Novo (nome, e-mail, função inicial)

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

O módulo deve permitir:

- cadastro de pessoas;
- cadastro de funcionários;
- vínculo funcional;
- lotação;
- situação funcional;
- histórico de movimentações;
- admissões;
- desligamentos;
- readmissões;
- função;
- unidade e obra vinculadas.

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

#### 9.7.7 Programação semanal da obra (planejado x executado)

A programação semanal é o planejamento operacional da obra e serve como base para o apontamento real (apropriação), mantendo a diretriz:

OBRA → SERVIÇO → APROPRIAÇÃO

Regras principais:

- a programação é planejada por semana, com antecedência mínima de 1 semana (7 dias) em relação ao início da semana;
- é permitido programar em feriados e finais de semana, desde que:
  - exista previsão de hora extra (HE) ou banco de horas com anuência do funcionário;
  - haja aprovação prévia do Diretor (quando aplicável);
- um mesmo trabalhador pode ser alocado em múltiplos serviços no mesmo dia;
- a apropriação registra o executado e permite comparação com o planejado (por serviço).

Estrutura do item de programação (mínimo):

- data;
- funcionário;
- função exercida;
- serviço (código);
- hora de início/fim prevista;
- tipo do dia (útil/fim de semana/feriado);
- HE prevista e/ou banco de horas com anuência (quando aplicável);
- produção mínima por hora (quando houver histórico);
- produção prevista (calculada).

No sistema:

- Engenharia → Programação Semanal: criar/abrir semana, registrar itens, enviar para aprovação e comparar execução (presença/produção) com o planejado.

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

- Engenharia → Programação Semanal → coluna “Avaliar” registra as notas e calcula automaticamente produtividade e nota final.

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
- Treinamentos vinculados a serviços devem impactar alertas na Programação Semanal (apto/não apto)

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
- Engenharia → Programação Semanal indica pendência de treinamento quando o funcionário não possui registro apto para o serviço.

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

- Engenharia → Obras → selecionar obra
- Janelas por obra: Programação Semanal, Apropriação, Cronograma, Fiscalização e Medições, Suprimentos e Consumos

#### Validação

- sem contrato e sem planilha contratada, o sistema deve impedir programação e apropriação
- o usuário deve enxergar apenas as obras/unidades do seu escopo (lotação)

#### 11.1.1 Navegação por obra (janelas)

Para reduzir burocracia e aumentar eficiência, a navegação do módulo Engenharia é orientada por obra:

- Engenharia → Obras → selecionar a obra → abrir as janelas operacionais.

Estrutura das janelas (obra selecionada):

- **Programação Semanal**
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
   - Programação semanal (mão de obra/equipamentos/insumos);
   - Apropriação (por serviço e centro de custo).

Impactos:

- Programação semanal passa a oferecer apenas serviços da planilha da obra e apenas centros de custo derivados da composição do serviço;
- Apropriação passa a oferecer apenas serviços da planilha e apenas centros de custo válidos, evitando erro de lançamento.

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

Funcionalidades associadas:

- registro de contratos simples de locação de equipamentos (ativos e passivos);
- registro de contratos simplificados para prestação de serviços por pessoa física ou jurídica, vinculados a serviços específicos por código (ex.: SER-0001);
- histórico por parceiro com contratos, comentários/avaliações e ocorrências relevantes (atrasos, qualidade, conformidades).

#### 11.12.1 Histórico por parceiro (como usar)

Para cada contraparte, o sistema mantém histórico consolidado em:

- Engenharia → Contrapartes → selecionar o parceiro
  - Contratos: lista de contratos vinculados à contraparte (locação ativa/passiva e serviço).
  - Avaliações: registros de nota e/ou comentário por gestor responsável.
  - Ocorrências: registros de eventos relevantes (tipo, gravidade, data, descrição), opcionalmente vinculados a um contrato.

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
- CriseWarRoomParticipante
- DocumentoAssinaturaArtefato
- DocumentoAssinaturaCallback
- DocumentoAssinaturaEvidencia
- DocumentoAssinaturaProvedor
- DocumentoAssinaturaSolicitacao
- DocumentoAssinaturaSolicitacaoSignatario
- DocumentoVersao
- DrExecucaoRecuperacao
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
- GovernancaLegalHold
- GovernancaLegalHoldItem
- GovernancaPiiScan
- GovernancaPiiScanResultado
- GovernancaRetencaoAuditoria
- GovernancaRetencaoItem
- GovernancaRetencaoPolitica
- GrcAchado
- GrcAuditoria
- GrcAuditoriaItemEscopo
- GrcControle
- GrcControleMetrica
- GrcControleTeste
- GrcEvidencia
- GrcMatrizRiscoSnapshot
- GrcPlanoAcao
- GrcPlanoAcaoItem
- GrcRisco
- GrcRiscoAvaliacao
- GrcRiscoControle
- ObservabilidadeAlerta
- ObservabilidadeAlertaEvento
- ObservabilidadeCasoCompliance
- ObservabilidadeCasoComplianceEvidencia
- ObservabilidadeEvento
- ObservabilidadeIncidente
- ObservabilidadeIncidenteEvento
- ObservabilidadeIncidenteTimeline
- ObservabilidadePlaybook
- ObservabilidadePlaybookExecucao
- ObservabilidadePlaybookExecucaoPasso
- ObservabilidadePlaybookPasso
- ObservabilidadeRegra
- OrganizacaoCargo
- OrganizacaoSetor
- OrganogramaPosicao
- Perfil
- SecurityFieldPolicy
- SecuritySensitiveDataAudit
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
