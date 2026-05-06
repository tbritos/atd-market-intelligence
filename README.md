# ATD Workspace Monitor API

API para monitoramento de workspace ATD desenvolvida com Node.js, TypeScript, Express e Prisma.

## 🚀 Stack Tecnológica

- **Runtime:** Node.js + TypeScript
- **Framework:** Express.js
- **ORM:** Prisma (PostgreSQL)
- **Validação:** Zod
- **Testes:** Vitest
- **Autenticação:** AWS Cognito (customizável)
- **Queue:** BullMQ + Redis
- **Middlewares:** cors, helmet, morgan, cookie-parser

## 📁 Estrutura do Projeto

```
src/
├── config/                 # Configurações (AWS, BullMQ, etc)
├── modules/                # Módulos de negócio
│   └── [feature]/
│       ├── [feature].controller.ts
│       ├── [feature].router.ts
│       ├── [feature].service.ts
│       ├── [feature].schema.ts
│       └── [feature].test.ts
├── utils/                  # Utilitários compartilhados
│   ├── middlewares/        # Middlewares customizados
│   ├── errors/            # Classes de erro
│   ├── query/             # Schemas de query padrão
│   └── files/             # Manipulação de arquivos
├── workers/               # Workers para processamento assíncrono
├── api.ts                 # Configuração do Express
└── server.ts              # Entry point da aplicação
```

## 🛠️ Setup de Desenvolvimento

### Pré-requisitos

- Node.js (versão 18 ou superior)
- PostgreSQL
- npm ou yarn
- Git

### Instalação

1. **Clone o repositório**
   ```bash
   git clone <repository-url>
   cd atd-workspace-monitor-api
   ```

2. **Instale as dependências**
   ```bash
   npm install
   ```

3. **Configure as variáveis de ambiente**
   ```bash
   cp .env.example .env
   ```
   
   Edite o arquivo `.env` com suas configurações:
   ```env
   DATABASE_URL="postgresql://user:password@localhost:5432/atd_workspace_monitor"
   PORT=3000
   NODE_ENV=development
   ```

4. **Configure o banco de dados**
   ```bash
   # Gerar o cliente Prisma
   npx prisma generate
   
   # Executar migrações (quando disponíveis)
   npx prisma migrate dev
   ```

5. **Inicie o servidor de desenvolvimento**
   ```bash
   npm run dev
   ```

O servidor estará rodando em `http://localhost:3000`

### Verificação da Instalação

Acesse `http://localhost:3000/health` para verificar se a API está funcionando. Você deve receber:

```json
{
  "status": "UP",
  "timestamp": "2025-08-18T16:18:12.428Z"
}
```

## 🏗️ Padrões Arquiteturais

### Controller-Service Pattern

Este projeto segue o padrão Controller-Service-Schema:

- **Controller:** Manipula requisições HTTP e respostas
- **Service:** Contém a lógica de negócio
- **Schema:** Define validação com Zod

### Exemplo de Implementação

#### 1. Schema (Validação)
```typescript
// src/modules/user/user.schema.ts
import { z } from 'zod';

export const createUserSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Nome é obrigatório"),
    email: z.string().email("Email inválido"),
  }),
  params: z.object({}),
  query: z.object({})
});
```

#### 2. Service (Lógica de Negócio)
```typescript
// src/modules/user/user.service.ts
import prisma from "../../utils/prisma";

export class UserService {
  async createUser(data: { name: string; email: string }) {
    return prisma.user.create({ data });
  }

  async getUsers() {
    return prisma.user.findMany();
  }
}
```

#### 3. Controller (HTTP Handler)
```typescript
// src/modules/user/user.controller.ts
import { Request, Response } from "express";
import { UserService } from "./user.service";
import { handleError } from "../../utils/responseHandler";

export class UserController {
  private userService: UserService;

  constructor() {
    this.userService = new UserService();
  }

  async create(req: Request, res: Response) {
    try {
      const user = await this.userService.createUser(req.body);
      res.status(201).json(user);
    } catch (error) {
      if (error instanceof Error) {
        handleError(res, error.message);
      }
    }
  }
}
```

#### 4. Router (Rotas)
```typescript
// src/modules/user/user.router.ts
import { Router } from 'express';
import { UserController } from './user.controller';
import { validate } from '../../utils/middlewares/validate.middleware';
import { createUserSchema } from './user.schema';

const userRouter = Router();
const userController = new UserController();

userRouter.post('/', 
  validate(createUserSchema),
  (req, res) => userController.create(req, res)
);

export default userRouter;
```

#### 5. Integração no app principal
```typescript
// src/api.ts (adicionar ao final)
import userRouter from "./modules/user/user.router";

// ... configurações existentes ...

api.use("/users", userRouter);
```

## 🧪 Testes

### Executar testes
```bash
# Executar todos os testes
npm test

# Executar testes com coverage
npm run test-ci

# Executar testes em modo watch
npm test -- --watch
```

### Estrutura de Teste
```typescript
// src/modules/user/user.test.ts
import { describe, it, expect } from 'vitest';
import { UserService } from './user.service';

describe('UserService', () => {
  it('should create a user', async () => {
    const userService = new UserService();
    // Implementar teste
  });
});
```

## 🚀 Comandos Disponíveis

```bash
# Desenvolvimento
npm run dev          # Inicia servidor com hot-reload
npm start           # Inicia servidor de produção
npm run build       # Compila TypeScript

# Testes
npm test            # Executa testes
npm run test-ci     # Executa testes com coverage

# Database
npm run migrate     # Executa migrações
npx prisma studio   # Interface visual do banco
npx prisma generate # Gera cliente Prisma
```

## 🔧 Utilitários Disponíveis

### Middleware de Validação
```typescript
import { validate } from '../../utils/middlewares/validate.middleware';
```

### Tratamento de Erros
```typescript
import { handleError } from '../../utils/responseHandler';
import { CustomError } from '../../utils/errors/CustomError';
```

### Cliente Prisma
```typescript
import prisma from '../../utils/prisma';
```

## 🌟 Boas Práticas

### 1. Nomenclatura
- Arquivos: `kebab-case` (ex: `user-profile.service.ts`)
- Classes: `PascalCase` (ex: `UserProfileService`)
- Variáveis/funções: `camelCase` (ex: `getUserProfile`)

### 2. Organização de Módulos
Cada feature deve ter sua própria pasta em `src/modules/` com:
- Controller
- Service
- Schema
- Router
- Testes

### 3. Tratamento de Erros
Sempre use o `handleError` para respostas de erro consistentes:
```typescript
catch (error) {
  if (error instanceof Error) {
    handleError(res, error.message, 400);
  }
}
```

### 4. Validação
Sempre valide entrada de dados usando Zod schemas:
```typescript
router.post('/', validate(schema), controller.method);
```

## 🚦 Middleware Padrão

A aplicação inclui os seguintes middlewares configurados:

- **morgan:** Logging de requisições
- **cors:** Controle de CORS
- **helmet:** Segurança HTTP
- **express.json():** Parse de JSON
- **cookie-parser:** Parse de cookies

## 📅 Scripts Automatizados

Este projeto inclui scripts automatizados que devem ser executados em horários específicos para manter os dados atualizados e consolidados.

### 🕐 PageSpeed Script (15h diário)

**Arquivo:** `src/scripts/pagespeedScript.ts`

**Descrição:** Agenda jobs para coleta de métricas de performance de todos os websites ativos usando a API do Google PageSpeed Insights.

**Funcionalidade:**
- Busca todos os websites ativos no banco
- Agenda jobs na fila `performanceCollectorQueue`
- Respeita limite de 200 requisições/minuto da API do PageSpeed
- Distribui automaticamente as requisições ao longo do tempo

**Execução manual:**
```bash
# Via npm script (se configurado)
npm run pagespeed

# Via Node.js diretamente
npx ts-node src/scripts/pagespeedScript.ts
```

**Agendamento:** Execute diariamente às **15h**

**Configuração de Cron:**
```bash
# Adicionar ao crontab
0 15 * * * cd /path/to/project && npm run pagespeed
```

### 🌙 Consolidação de Métricas - Websites (Madrugada diária)

**Arquivo:** `src/scripts/consolidateMetricsScript.ts`

**Descrição:** Consolida todas as métricas coletadas, calculando médias e atualizando os campos consolidados na tabela `websites`.

**Funcionalidade:**
- Calcula performance score médio (últimas 10 medições)
- Calcula SEO score médio (últimas 10 medições)
- Calcula tempo de resposta médio (últimas 10 medições)
- Calcula downtime das últimas 24h
- Calcula visitas mensais médias (últimas 5 medições)
- Atualiza campos consolidados: `avgPerformanceScore`, `seoScore`, `avgResponseTime`, `downtimeSeconds`, `avgMonthlyVisits`

**Execução manual:**
```bash
# Via Node.js diretamente
npx ts-node src/scripts/consolidateMetricsScript.ts
```

**Agendamento:** Execute diariamente de **madrugada (02h)**

**Configuração de Cron:**
```bash
# Adicionar ao crontab
0 2 * * * cd /path/to/project && npx ts-node src/scripts/consolidateMetricsScript.ts
```

### 🏢 Consolidação de Métricas - Marcas (Madrugada diária)

**Arquivo:** `src/scripts/consolidateBrandMetricsScript.ts`

**Descrição:** Consolida métricas de performance, SEO e tempo de resposta agrupadas por marca, calculando médias de todos os websites ativos da marca.

**Funcionalidade:**
- Calcula performance score médio por marca (apenas websites ativos)
- Calcula SEO score médio por marca (apenas websites ativos)
- Calcula tempo de resposta médio por marca (apenas websites ativos)
- Conta total de websites e websites ativos por marca
- Atualiza campos consolidados na tabela `brands`: `avgPerformanceScore`, `avgSeoScore`, `avgResponseTime`, `totalWebsites`, `activeWebsites`, `metricsUpdatedAt`

**Execução manual:**
```bash
# Via Node.js diretamente
npx ts-node src/scripts/consolidateBrandMetricsScript.ts
```

**Agendamento:** Execute diariamente de **madrugada (02h30)** - após consolidação dos websites

**Configuração de Cron:**
```bash
# Adicionar ao crontab (30 minutos após consolidação de websites)
30 2 * * * cd /path/to/project && npx ts-node src/scripts/consolidateBrandMetricsScript.ts
```

### 🔄 Benefícios da Consolidação

**Performance de Consulta:**
- Ordenação rápida por métricas (sem joins complexos)
- Consultas diretas aos campos consolidados
- Melhor performance na API de listagem de websites

**Consistência dos Dados:**
- Médias calculadas de forma padronizada
- Dados atualizados uma vez por dia
- Reduz carga no banco durante consultas da API

### ⚠️ Importante

1. **Dependências:** Os scripts dependem das filas do BullMQ e Redis estarem funcionando
2. **Backup:** Sempre faça backup antes de executar scripts de consolidação
3. **Monitoramento:** Monitore logs dos scripts para identificar falhas
4. **Recursos:** O script de PageSpeed pode ser intensivo - monitore limites da API Google
5. **APIs Otimizadas:** Os endpoints `/brands` e `/websites` retornam dados pré-calculados pelos scripts de consolidação, garantindo performance otimizada
