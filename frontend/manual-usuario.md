## Manual do Usuário — ExpPlanObras

Este manual explica, de forma simples, como usar o sistema no dia a dia.

---

## 1. Conceito principal: Obra Ativa

O sistema funciona por contexto. Isso significa:

1. Você entra no sistema
2. Seleciona uma obra (vira a sua **Obra Ativa**)
3. O sistema passa a mostrar e filtrar as telas e dados para essa obra

---

## 2. Como selecionar ou trocar a obra

### ETAPA 1 — Onde acessar
- No menu lateral, acesse **Engenharia → Obras → Selecionar Obra**

### ETAPA 2 — O que clicar
- Clique na obra desejada para definir como **Obra Ativa**

### ETAPA 3 — O que esperar
- O sistema passa a operar no modo daquela obra
- Você será direcionado para a página da obra (janelas da obra)

### ETAPA 4 — Como validar
- A URL e o título da página indicam a obra (ex.: **Obra #ID**)
- As telas da obra ativa passam a abrir diretamente para a obra selecionada

Observação:

- Ao entrar em **/dashboard**, se não houver Obra Ativa definida, o sistema direciona automaticamente para a tela de **seleção de obra**.

---

## 2.1 Como cadastrar uma obra (regra: contrato obrigatório)

Para cadastrar uma obra, primeiro você precisa ter um **contrato** cadastrado.

### ETAPA 1 — Onde acessar
- Menu lateral → **Engenharia → Cadastro de Obra**

### ETAPA 2 — O que clicar
- Em **Contrato**, selecione um contrato existente
- Se não existir, preencha **Novo contrato** e clique em **Criar**

### ETAPA 3 — O que preencher
- Nome da obra
- Tipo e Status
- Endereço (Rua, Número, Bairro, Cidade, UF) ou cole um link/CEP quando disponível

### ETAPA 4 — O que esperar
- A obra será criada e aparecerá na lista
- O sistema cria a **planilha mínima** com o serviço `SER-0001` para liberar Programação e Apropriação

### ETAPA 5 — Como validar
- Vá em **Engenharia → Obras → Selecionar Obra** e confirme que a obra nova aparece

---

## 3. Menu da obra (Planejamento e Execução)

Depois que você define a obra ativa, o menu de **Engenharia → Obras** passa a ter atalhos para:

- **Dashboard da Obra**
- **Resumo do Contrato**
- **Documentos da Obra**
- **Eventos / Observações (do contrato)**
- **Planilha orçamentária**
- **Planejamento**
- **Execução**

Isso evita bagunça e garante que você está trabalhando na obra certa.

---

## 3.1 Planilha orçamentária (importar CSV com prévia)

Use esta tela para cadastrar/atualizar o orçamento da obra por versões (itens, subitens e serviços).

### ETAPA 1 — Onde acessar
- Abra **Obra #ID** → clique em **Planilha orçamentária**

### ETAPA 2 — O que clicar
- Clique em **Importar CSV**
- O sistema abre uma **prévia** com uma grade de conferência

### ETAPA 3 — O que preencher
- O CSV deve ter estas colunas (nesta ordem ou com estes nomes):
  - `item`
  - `codigo`
  - `fonte`
  - `servicos`
  - `und`
  - `quant`
  - `valor_unitario`

### ETAPA 4 — O que esperar
- A grade mostra as linhas do CSV antes de gravar
- Campos com erro ficam destacados (ex.: item vazio, serviço sem código, quant inválida)
- O sistema calcula o **valor parcial** automaticamente (quant × valor_unitario)
- Itens e subitens ficam em **negrito** para facilitar leitura
- Você pode ajustar o **tamanho da fonte** e as **cores de fundo** de Item/Subitem (essas preferências ficam salvas no seu usuário)
- A tela mostra o **Valor total** da planilha
- A tela mostra o **valor parcial consolidado** de cada **Item** e **Subitem**
- Na **prévia**, o sistema mostra o **total consolidado** antes de confirmar a importação

### ETAPA 5 — Como validar
- Clique em **Confirmar importação**
- A nova versão aparece na lista de versões e pode ser selecionada

---

## 3.2 SINAPI (Excel) — Importar composições para a obra (com prévia)

Use esta tela quando você precisa trazer a composição de um serviço do SINAPI para a planilha da obra.

### ETAPA 1 — Onde acessar
- Engenharia → Obras → (abra a obra) → **Planilha orçamentária** → **Sinapi**

### ETAPA 2 — O que clicar
- Se o serviço já estiver na lista “Serviços SINAPI importados”, clique no **ícone de seta** (Aplicar na planilha)
- Se não estiver, clique em **Importar**

### ETAPA 3 — O que preencher
- Data-base (SINAPI)
- Aba (Relatório Analítico de Composições): normalmente “Analítico”
- UF
- Preços de insumos: ISD / ICD / ISE
- Arquivo XLSX (SINAPI)

### ETAPA 4 — O que esperar
- O topo da tela mostra:
  - **Obra: #id - nome da obra**
  - **Contrato: #id - número do contrato - objeto**
- O topo da tela também mostra:
  - **Planilha: #id - vN - nome da versão**
  - **SINAPI (planilha): data-base e UF** (usados como padrão para filtros/importação)
- Clique em **Configurar tela** para abrir o card **Configuração de tela** (fica oculto por padrão) e ajustar colunas (exibir/ocultar) e larguras (isso fica gravado).
- Dê **duplo clique** em um serviço na lista “Serviços SINAPI importados” para abrir o card **Composição do serviço** com o detalhamento dos itens.
- Ao clicar em **Prévia**, o sistema abre um modal “Prévia” com:
  - tabela “Serviços na prévia” (com status “Já importado” quando for o caso)
  - itens do serviço selecionado para conferência

### ETAPA 5 — Como validar
- Marque (selecione) o serviço na tabela “Serviços na prévia”
- Clique em **Importar selecionado**
- Volte para a lista “Serviços SINAPI importados” e confirme que o serviço aparece (ou atualiza)

## 4. Contrato da obra (ver detalhes)

O contrato é uma informação associada à obra. Para ver:

### ETAPA 1 — Onde acessar
- Abra **Obra #ID** (janelas da obra)

### ETAPA 2 — O que clicar
- No bloco **Dados principais da obra**, clique em **Abrir contrato**

### ETAPA 3 — O que esperar
- Você verá:
  - Número do contrato
  - Status
  - Valores (contratado, executado, pago e saldo)

### ETAPA 4 — Como validar
- Confirme se o número do contrato exibido confere com o contrato principal da obra

---

## 4.2 Eventos / Observações do contrato (a partir da obra)

Use quando você está “dentro” de uma obra e quer registrar/consultar histórico do contrato sem precisar procurar o contrato na lista.

### ETAPA 1 — Onde acessar
- Abra **Obra #ID** (janelas da obra)

### ETAPA 2 — O que clicar
- Na seção **Cadastro**, clique em **Eventos / Observações**

### ETAPA 3 — O que esperar
- Abre a aba **Eventos / Observações** do contrato vinculado à obra
- Você consegue registrar observações e anexar evidências (PDF/imagem)

### ETAPA 4 — Como validar
- Salve uma observação e confira se ela aparece na linha do tempo

## 4.1 Documentos (Obra e Contrato)

Você pode gerenciar documentos tanto da **Obra** quanto do **Contrato** na mesma tela.

### ETAPA 1 — Onde acessar
- Para **Obra**: no menu lateral, acesse **Engenharia → Obras → Documentos**
- Para **Contrato**: abra o contrato e clique em **Documentos do contrato**

### ETAPA 2 — O que clicar
- Use o seletor **Obra / Contrato** quando você não entrou por um item específico
- No campo de ID, digite parte do texto para filtrar a lista (ex.: `#1`, nome da obra ou número do contrato)

### ETAPA 3 — O que preencher
- Para criar um documento:
  - Categoria
  - Título
  - (Opcional) Descrição
  - (Opcional) Arquivo (PDF/imagem)

### ETAPA 4 — O que esperar
- Se você entrou por uma obra/contrato específico, o contexto fica travado para evitar anexar no lugar errado
- O topo da tela mostra o caminho (breadcrumb) e existe botão **Voltar**

### ETAPA 5 — Como validar
- Na seção “Documentos cadastrados”, filtre por **Categoria prefixo** (Todos / Contrato / Obra) e confirme que os documentos aparecem

## 5. Responsável técnico e fiscal (por obra)

Esses dados são cadastrados por obra e aparecem nos dados principais.

### ETAPA 1 — Onde acessar
- Abra **Obra #ID**

### ETAPA 2 — O que clicar
- Se faltar cadastro, clique em **Cadastrar agora**

### ETAPA 3 — O que preencher
- Tipo: **Responsável Técnico** ou **Fiscal da Obra**
- Nome, registro (CREA/CAU) e contato

### ETAPA 4 — Como validar
- Volte para **Obra #ID** e confira se aparece no bloco “Dados principais da obra”

---

## 6. Dica de segurança (evite erros)

Antes de lançar diário, medição ou apropriação:
- Confirme se você selecionou a obra correta em **Engenharia → Obras → Selecionar Obra**.

Isso evita lançar dados na obra errada.

---

## 7. Suprimentos (como navegar)

O sistema separa suprimentos em contextos diferentes para evitar mistura de processos:

- **Suprimentos (Central)**: compras, parâmetros, fornecedores, monitoramento.
- **Suprimentos (Obra)**: solicitações, recebimento, transferências e apropriação.
- **Unidades de Estoque**: apoio logístico e armazenagem.
- **Unidades de Venda**: PDV e histórico de vendas.

### ETAPA 1 — Onde acessar
- Menu lateral → **Suprimentos**
- Para obra ativa: **Engenharia → Obras → Execução → Suprimentos (Obra)**

### ETAPA 2 — O que clicar
- Use **Dashboard** para ver KPIs e alertas
- Use **Solicitações** para pedir material
- Use **Recebimento/Transferências** para movimentar estoque

### ETAPA 3 — O que esperar
- O painel mostra indicadores de estoque, compras e consumo
- Cada contexto mostra apenas as ações permitidas para aquele tipo de operação

### ETAPA 4 — Como validar
- Crie uma solicitação e acompanhe o status
- Verifique se o saldo atualiza após recebimento
- Em obra, valide se a apropriação aceita apenas serviços válidos da planilha

---

## 8. Contratos (Engenharia) — como consultar e criar

Os contratos concentram as informações oficiais de prazo e valores.

### ETAPA 1 — Onde acessar
- Menu lateral → **Contratos (Engenharia) → Contratos → Lista**

### ETAPA 2 — O que clicar
- Clique em um contrato para ver o detalhe
- Para criar: **Contratos (Engenharia) → Contratos → Novo contrato**

### ETAPA 3 — O que esperar
- A lista mostra **ALERTA** (OK/Pendente/Crítico) e **STATUS** (Em andamento / A vencer / Vencido / etc.)
- No detalhe, você verá datas e valores do contrato (e botões de ação, como **Aditivos**)
- Em **Editar contrato**, existe botão **Voltar** e um subtítulo no topo que mostra o caminho real (breadcrumb)
- Em **Editar contrato**, ao preencher **Prazo** o sistema calcula a **Vigência (fim)**; ao preencher a **Vigência (fim)** o sistema calcula o **Prazo**; ao trocar a unidade (dias/semanas/meses/anos) o prazo é convertido automaticamente.

### ETAPA 4 — Como validar
- Volte para a lista e confirme se o contrato aparece e se o status/alerta fazem sentido

---

## 9. Aditivos do contrato — como atualizar prazo/valor

O aditivo é o histórico de mudanças. O contrato “vigente” é sempre o consolidado.

### ETAPA 1 — Onde acessar
- Menu lateral → **Contratos (Engenharia) → Contratos → Aditivos (selecionar contrato)**

### ETAPA 2 — O que clicar
- Primeiro selecione o contrato
- No topo da tela (à direita do título), clique em **Aditivos**
- Dentro de **Aditivos**, clique em **Novo aditivo**

### ETAPA 3 — O que preencher
- Em **Novo aditivo**, preencha o que mudou (ex.: dias adicionados, **valor total após o aditivo**, motivo/observação do aditivo)
- Salve como **rascunho**
- Quando estiver certo, clique em **aprovar**

### ETAPA 4 — O que esperar
- Ao aprovar, o sistema atualiza automaticamente o contrato (vigência atual e valores atuais)
- Se existir aditivo em rascunho, o contrato pode ficar com pendência “Aditivo em aberto” na coluna **ALERTA**

### ETAPA 5 — Como validar
- Volte em **Contratos (Engenharia) → Contratos → Lista** e confira se o contrato mudou (datas/valores e alerta/status)

---

## 10. Histórico (Eventos / Observações) + Anexos (PDF/imagem)

Use esta área para registrar justificativas do dia a dia e guardar evidências (PDFs e imagens) dentro do sistema.

### ETAPA 1 — Onde acessar
- Menu lateral → **Contratos (Engenharia) → Contratos → Aditivos (selecionar contrato)**
- Selecione o contrato e, no topo da tela (à direita do título), clique em **Eventos**

### ETAPA 2 — O que clicar
- Use os filtros (Contrato/Aditivos/Obras/Documentos/Observações) para “enxergar só o que interessa”
- Em **Adicionar observação**, selecione o nível (Normal/Alerta/Crítico)

### ETAPA 3 — O que preencher
- Digite sua observação
- Se quiser, selecione um ou mais arquivos (PDF/imagem)
- Clique em **Salvar**

### ETAPA 4 — O que esperar
- A observação aparece na **Linha do tempo**
- Os anexos aparecem como links (📎) e você consegue abrir/baixar
- Para arquivos selecionados antes de salvar, você pode clicar em **Preview** para ver PDF/imagem dentro do sistema

### ETAPA 5 — Como validar
- Reabra a aba **Eventos / Observações** e confirme se a observação e os anexos continuam listados
