Novo repositório (começar do zero)

Objetivo: criar um repositório novo no GitHub com a estrutura limpa deste projeto, para você conseguir continuar em casa e a equipe conseguir testar diariamente.

Antes de começar

- Não coloque DATABASE_URL, JWT_SECRET ou tokens em arquivos dentro do repositório.
- Use variáveis de ambiente no Render/Vercel e Secrets no GitHub.

Passo a passo (GitHub Web)

1) Criar repositório novo
- GitHub -> New repository
- Nome: expplanobras (ou outro)
- Private (recomendado)
- Não marque “Add a README” (vamos subir o nosso)
- Create repository

2) Subir o projeto usando GitHub Desktop (mais fácil)
- Instale GitHub Desktop
- File -> Add local repository
- Selecione a pasta do projeto
- Publish repository
- Escolha o repositório novo e publique

3) Subir o projeto usando Git (linha de comando)
- Instale Git for Windows
- Abra o PowerShell na pasta do projeto
- Rode:
  - git init
  - git add .
  - git commit -m "Initial commit"
  - git branch -M main
  - git remote add origin https://github.com/<seu-usuario>/<novo-repo>.git
  - git push -u origin main

Continuar em casa

Opção A (recomendado)
- Em casa, clone o repositório novo:
  - git clone https://github.com/<seu-usuario>/<novo-repo>.git
  - cd <novo-repo>

Opção B
- Copie a pasta inteira do projeto para um pendrive/OneDrive e abra em casa.

Como rodar localmente (em casa)

Backend:
- cd backend
- npm install
- npx prisma migrate dev
- npm run dev

Frontend:
- cd frontend
- npm install
- npm run dev

Arquivos importantes (deploy)

- render.yaml (raiz): blueprint do Render
- backend/prisma/postgres/*: schema e migrações do Postgres (produção)
- .github/workflows/*: CI e smoke tests

