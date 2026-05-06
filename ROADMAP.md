# ATD Intelligence Platform — Roadmap & Plano Estratégico

> **Visão:** Transformar o ATD em uma plataforma de inteligência de negócios completa, usada por toda a Autoforce para prospecção, monitoramento, enriquecimento de dados e tomada de decisão sobre o mercado automotivo brasileiro.

---

## 📍 Estado Atual (Março 2026)

### O que já foi construído

| Área | Status | Detalhes |
|------|--------|----------|
| Base de Estabelecimentos RFB | ✅ Operacional | 206.702 CNPJs importados |
| Monitoramento de Websites | ✅ Operacional | Performance, SEO, Uptime (PageSpeed API) |
| Enriquecimento CNPJ | ✅ Operacional | BrasilAPI → Razão social, sócios (QSA), endereço |
| Descoberta de Lojas | ✅ Operacional | Google Places, CNAE, sites de marcas |
| Detecção de Plataformas | ✅ Operacional | Autoforce, MicroWork, Syonet, WordPress, etc |
| Scraping de Contatos | ✅ Operacional | E-mail, WhatsApp, redes sociais via regex |
| Tráfego Web | ✅ Operacional | Estimativa de visitas mensais |
| Processamento Assíncrono | ✅ Operacional | 9 workers BullMQ + Redis |
| Frontend | ✅ Operacional | Next.js 16, Tailwind, shadcn/ui |

### Stack técnico atual

```
Backend:   Node.js + TypeScript + Express + Prisma (PostgreSQL)
Filas:     BullMQ + Redis
Frontend:  Next.js 16 + React 19 + TailwindCSS 4 + React Query
Integrações: BrasilAPI · Google PageSpeed · Google Places · SerpAPI · Apify · Casa dos Dados
```

---

## 🎯 Visão da Plataforma

O ATD Intelligence Platform deve ser o **sistema central de inteligência de mercado** da Autoforce, cobrindo três grandes frentes:

```
┌─────────────────────────────────────────────────────────────────┐
│                   ATD INTELLIGENCE PLATFORM                      │
├─────────────────┬────────────────────┬──────────────────────────┤
│  CONHECER        │  MONITORAR         │  AGIR                    │
│                  │                    │                          │
│  Base RFB        │  Uptime / SEO      │  Prospecção              │
│  CNPJ / QSA      │  Performance       │  CRM Integration         │
│  Contatos        │  Tráfego           │  Alertas Automáticos     │
│  Financeiro      │  Concorrentes      │  Relatórios Executivos   │
│  Localização     │  Redes Sociais     │  Exportação de Dados     │
└─────────────────┴────────────────────┴──────────────────────────┘
```

---

## 🗺️ Fases do Roadmap

### FASE 1 — Consolidação e Qualidade de Dados (Abril 2026)

**Objetivo:** Garantir que os 206k registros tenham dados completos e confiáveis.

#### 1.1 Enriquecimento em Massa dos CNPJs

**Situação:** Temos o CNPJ de ~204k estabelecimentos mas a maioria não passou pelo enriquecimento via BrasilAPI.

**Ação:**
- Criar job em massa para enriquecer todos os CNPJs não enriquecidos (`cnpjEnrichedAt = null`)
- Priorizar CNPJs com `situacaoCadastral = ATIVA`
- Atualizar campo `tipo` (Matriz/Filial) a partir do identificador RFB
- Salvar `capital_social` e `porte` para scoring

```
Estimativa: ~200k CNPJs × BrasilAPI (free) → ~15-20 dias com rate limiting
```

#### 1.2 Campo Matriz/Filial (Migration)

**Ação:**
- Adicionar migration no Prisma: `tipo String? @map("tipo")`
- Já implementado no schema de filtros do backend

#### 1.3 Normalização de Dados

- Padronizar telefones para E.164 (`+55...`)
- Deduplicar CNPJs duplicados
- Vincular automaticamente matrizes com suas filiais (pelo CNPJ raiz — primeiros 8 dígitos)

---

### FASE 2 — Enriquecimento Avançado (Maio–Junho 2026)

**Objetivo:** Adicionar camadas de dados externas para tornar cada estabelecimento um perfil completo.

#### 2.1 Google My Business / Places API

**O que adiciona:**
- Avaliações e número de reviews atualizado
- Horário de funcionamento
- Fotos do estabelecimento
- Categorias Google
- Status (aberto/fechado permanentemente)

**Integração:** Google Places Details API (já temos `GOOGLE_API_KEY`)

```typescript
// Novo worker: googleMyBusinessWorker
// Trigger: stores com externalId (placeId) existente
```

#### 2.2 LinkedIn — Enriquecimento de Sócios (QSA)

**O que adiciona:**
- LinkedIn URL dos sócios/diretores
- Cargo atual
- Empresa atual
- Contato profissional

**Integrações possíveis:**
- `Apollo.io API` — enriquecimento de pessoas por nome + empresa (plano pago ~$49/mês)
- `Hunter.io` — busca de e-mails corporativos por domínio
- `Clearbit Enrichment` — perfil completo de pessoa/empresa

```typescript
// Novo worker: partnerEnrichmentWorker
// Input: nome + razão social
// Output: linkedinUrl, email, cargo
```

#### 2.3 Receita Federal — Dados Complementares

Campos do arquivo RFB que ainda não importamos:

| Campo RFB | Descrição | Utilidade |
|-----------|-----------|-----------|
| `identificador_matriz_filial` | 1=Matriz, 2=Filial | Hierarquia |
| `natureza_juridica` | Código natureza jurídica | Classificação |
| `opcao_pelo_simples` | S/N | Porte fiscal |
| `data_opcao_simples` | Data entrada Simples | Contexto fiscal |
| `data_exclusao_simples` | Data saída Simples | Histórico |
| `opcao_pelo_mei` | MEI S/N | Porte |
| `situacao_especial` | Falência, liquidação | Risco |

**Ação:** Atualizar script `importar_rfb_completo.py` para importar esses campos.

#### 2.4 SimilarWeb API — Tráfego Detalhado

**O que adiciona:**
- Tráfego orgânico vs pago detalhado
- Ranking do site no Brasil
- Palavras-chave que geram tráfego
- Comparativo com concorrentes

**Custo:** A partir de $199/mês (plano básico)

#### 2.5 SEMrush / Ahrefs — Inteligência SEO

**O que adiciona:**
- Backlinks
- Palavras-chave ranqueadas
- Posição média no Google
- Tráfego orgânico estimado
- Comparativo de domínio com concorrentes

**Custo:** SEMrush API ~$119/mês

---

### FASE 3 — Inteligência de Negócios (Julho–Agosto 2026)

**Objetivo:** Transformar dados em insights acionáveis para toda a empresa.

#### 3.1 Score de Propensão (Lead Scoring)

Criar um score 0–100 para cada estabelecimento baseado em:

```
Score = f(
  situacaoCadastral,      // ATIVA = +30pts
  temWebsite,             // +20pts
  performanceScore,       // 0-20pts proporcional
  temContato,             // email/whatsapp = +10pts
  dataAbertura,           // > 2 anos = +10pts
  capitalSocial,          // > R$100k = +5pts
  reviews,                // > 50 = +5pts
)
```

**Uso:** Priorizar prospecção de clientes com menor score (mais oportunidade de melhoria).

#### 3.2 Análise de Mercado por Região

- Mapa de calor de estabelecimentos por estado/cidade
- Market share por plataforma (Autoforce vs concorrentes) por região
- Taxa de cobertura digital (% com website) por marca
- Evolução temporal da cobertura

**Visualizações no frontend:**
- Mapa do Brasil com filtros
- Gráficos de barras comparativos
- Tabelas de ranking por estado

#### 3.3 Identificação de Oportunidades

Detectar automaticamente:
- Estabelecimentos **ATIVOS** que **não têm website**
- Estabelecimentos com website em plataformas **concorrentes** (MicroWork, Syonet, etc)
- Estabelecimentos com website **fora do ar** (uptime crítico)
- Estabelecimentos com **performance ruim** (score < 50)
- Estabelecimentos **sem contato digital** (sem e-mail/WhatsApp)

```typescript
// GET /analytics/opportunities
// Retorna lista segmentada por tipo de oportunidade
```

#### 3.4 Alertas e Notificações

- Website caiu (uptime < 95%)
- Performance degradou > 20 pontos
- Novo concorrente detectado na região
- Estabelecimento mudou plataforma

**Canais:** E-mail, Slack Webhook, ou dashboard interno

---

### FASE 4 — Plataforma Colaborativa (Setembro–Outubro 2026)

**Objetivo:** Tornar a plataforma utilizável por toda a empresa.

#### 4.1 Autenticação e Controle de Acesso

```
Perfis:
  Admin       → acesso total
  Comercial   → visualização + exportação
  Marketing   → analytics + relatórios
  Técnico     → métricas de performance
```

**Tech:** NextAuth.js ou Clerk

#### 4.2 CRM Interno — Pipeline de Prospecção

Adicionar fluxo de vendas básico:
- Marcar estabelecimento como "prospectado"
- Adicionar notas/contatos realizados
- Status do pipeline: `Lead → Contato → Proposta → Cliente → Perdido`
- Responsável pelo lead

#### 4.3 Exportação de Dados

- Exportar lista filtrada em `.csv` / `.xlsx`
- Gerar relatório PDF de um estabelecimento (perfil completo)
- API pública para integração com outros sistemas (Salesforce, HubSpot, etc)

#### 4.4 Relatórios Executivos

- Relatório semanal por e-mail com métricas gerais
- Dashboard de cobertura de mercado
- Comparativo mensal de performance dos clientes Autoforce

---

## 🔌 Mapa de Integrações

### Integrações Já Existentes

| Serviço | Finalidade | Custo |
|---------|-----------|-------|
| BrasilAPI | CNPJ lookup + QSA | Free |
| Google PageSpeed Insights | Performance + SEO | Free (quotas) |
| Google Places / Apify | Descoberta de lojas | Apify ~$5/mês |
| SerpAPI | Busca de websites | Pago |
| Casa dos Dados | CNAE search | Pago |

### Próximas Integrações (priorizadas)

| Serviço | Finalidade | Custo Est. | Prioridade |
|---------|-----------|-----------|-----------|
| Google Places Details | Ratings, horários atualizados | Free (quotas) | 🔴 Alta |
| Hunter.io | E-mails por domínio | $49/mês | 🔴 Alta |
| Apollo.io | Enriquecimento de sócios | $49/mês | 🟡 Média |
| SimilarWeb | Tráfego detalhado | $199/mês | 🟡 Média |
| SEMrush | SEO competitivo | $119/mês | 🟡 Média |
| Clearbit | Enriquecimento empresa | $99/mês | 🟢 Baixa |
| Slack API | Alertas em tempo real | Free | 🔴 Alta |
| SendGrid | E-mails transacionais | Free (100/dia) | 🟡 Média |
| Google Maps Embed | Mapa de lojas no frontend | Free | 🔴 Alta |

---

## 🏗️ Arquitetura Alvo

```
┌─────────────────────────────────────────────────────────┐
│                    FONTES DE DADOS                       │
├──────────┬──────────┬──────────┬──────────┬─────────────┤
│  RFB     │  Google  │BrasilAPI │ SerpAPI  │  Scraping   │
│  (CSV)   │  Places  │  CNPJ    │          │  Sites      │
└────┬─────┴────┬─────┴────┬─────┴────┬─────┴──────┬──────┘
     │          │          │          │             │
     ▼          ▼          ▼          ▼             ▼
┌─────────────────────────────────────────────────────────┐
│                  WORKERS (BullMQ)                        │
│  dealerDiscovery · cnpjEnrichment · performanceCollector │
│  uptimeMonitor · trafficCollection · websiteProvider     │
│  [NOVO] partnerEnrichment · [NOVO] googleMyBusiness      │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              PostgreSQL (via Prisma)                     │
│  Brands · Stores · StorePartners · Websites             │
│  Metrics · Providers · States · Cities · Groups         │
│  [NOVO] Opportunities · [NOVO] LeadPipeline             │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                   API REST (Express)                     │
│  /brands · /stores · /websites · /providers             │
│  /estabelecimentos · /dashboard · /search-sites         │
│  [NOVO] /analytics · /opportunities · /export           │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                  FRONTEND (Next.js)                      │
│  Dashboard · Estabelecimentos · Lojas · Websites        │
│  [NOVO] Mapa · Oportunidades · Pipeline · Relatórios    │
└─────────────────────────────────────────────────────────┘
```

---

## 📊 Modelo de Dados — Próximas Adições

### Campos a adicionar no model `Store`

```prisma
// Receita Federal — campos pendentes
tipoEstabelecimento     String?   // "MATRIZ" | "FILIAL"
naturezaJuridica        String?
opcaoSimples            Boolean?
opcaoMei                Boolean?
situacaoEspecial        String?

// Lead Scoring
leadScore               Int?      // 0-100
leadScoreUpdatedAt      DateTime?

// CRM
pipelineStatus          String?   // "lead" | "contato" | "proposta" | "cliente" | "perdido"
assignedTo              String?   // email do responsável
lastContactAt           DateTime?
notes                   String?
```

### Novo model `Opportunity`

```prisma
model Opportunity {
  id          String   @id @default(uuid())
  storeId     String
  type        String   // "sem_website" | "plataforma_concorrente" | "uptime_critico" | "sem_contato"
  severity    String   // "alta" | "media" | "baixa"
  description String
  resolvedAt  DateTime?
  createdAt   DateTime @default(now())

  store       Store    @relation(fields: [storeId], references: [id])
}
```

---

## 📋 Backlog Priorizado

### 🔴 Urgente (próximas 2 semanas)

- [ ] Migration: campo `tipo` (Matriz/Filial) no schema Prisma
- [ ] Job em massa: enriquecer todos CNPJs pendentes
- [ ] Endpoint: `GET /analytics/opportunities`
- [ ] Frontend: página Oportunidades com filtros
- [ ] Frontend: contador de oportunidades no dashboard

### 🟡 Curto Prazo (1–2 meses)

- [ ] Integração Hunter.io — e-mails por domínio
- [ ] Google Places Details — atualizar ratings
- [ ] Mapa interativo dos estabelecimentos no frontend
- [ ] Exportação CSV/XLSX com filtros aplicados
- [ ] Lead Score automático
- [ ] Alertas de uptime via Slack

### 🟢 Médio Prazo (3–6 meses)

- [ ] Autenticação e perfis de acesso (NextAuth.js)
- [ ] Integração Apollo.io — sócios enriquecidos
- [ ] CRM interno — pipeline de prospecção
- [ ] Relatórios executivos automáticos por e-mail
- [ ] Análise de market share por plataforma/região
- [ ] Integração SimilarWeb — tráfego detalhado

### 🔵 Longo Prazo (6–12 meses)

- [ ] API pública com autenticação (para integrar com outros sistemas Autoforce)
- [ ] Integração com CRM/ERP da Autoforce
- [ ] Módulo de análise competitiva (SEMrush/Ahrefs)
- [ ] Machine Learning para previsão de churn
- [ ] App mobile para time comercial

---

## 📁 Estrutura de Pastas — Alvo

```
src/
├── modules/
│   ├── brands/
│   ├── stores/
│   ├── websites/
│   ├── providers/
│   ├── dashboard/
│   ├── search-sites/
│   ├── analytics/          ← NOVO (oportunidades, market share)
│   ├── export/             ← NOVO (CSV, XLSX, PDF)
│   └── pipeline/           ← NOVO (CRM interno)
│
├── services/
│   ├── discovery/
│   ├── enrichment/
│   │   ├── brasil-api.service.ts
│   │   ├── website-contact-scraper.ts
│   │   ├── hunter-io.service.ts         ← NOVO
│   │   ├── apollo-io.service.ts         ← NOVO
│   │   └── google-places-details.ts     ← NOVO
│   ├── performance/
│   ├── aggregators/
│   ├── scoring/                          ← NOVO (lead score)
│   └── scheduling/
│
└── workers/
    ├── (existentes)
    ├── partnerEnrichmentWorker.ts        ← NOVO
    ├── googleMyBusinessWorker.ts         ← NOVO
    └── leadScoringWorker.ts             ← NOVO

frontend/
└── app/
    ├── (existentes)
    ├── oportunidades/                    ← NOVO
    ├── mapa/                             ← NOVO
    ├── pipeline/                         ← NOVO
    └── relatorios/                       ← NOVO
```

---

## 🔑 Variáveis de Ambiente — Alvo

```env
# Existentes
GOOGLE_API_KEY=""
SERP_API_KEY=""
APIFY_TOKEN=""

# Próximas integrações
HUNTER_IO_API_KEY=""          # Hunter.io — e-mails
APOLLO_IO_API_KEY=""          # Apollo.io — pessoas
SIMILARWEB_API_KEY=""         # SimilarWeb — tráfego
SEMRUSH_API_KEY=""            # SEMrush — SEO
SLACK_WEBHOOK_URL=""          # Alertas Slack
SENDGRID_API_KEY=""           # E-mails transacionais

# Autenticação (Fase 4)
NEXTAUTH_SECRET=""
NEXTAUTH_URL=""
```

---

## 📈 Métricas de Sucesso

| Métrica | Hoje | Meta 3 meses | Meta 6 meses |
|---------|------|--------------|--------------|
| Estabelecimentos com CNPJ enriquecido | ~2k | 100k | 206k |
| Estabelecimentos com e-mail | ~5k | 50k | 120k |
| Estabelecimentos com website identificado | ~3k | 10k | 30k |
| Websites monitorados ativamente | ~500 | 2k | 5k |
| Usuários ativos na plataforma | 1 | 10 | 30 |
| Oportunidades mapeadas | 0 | 50k | 150k |

---

## 👥 Casos de Uso por Perfil

### Time Comercial
> "Quero ver todas as concessionárias Toyota em São Paulo sem website, com e-mail de contato, ativas na Receita Federal, ordenadas por capital social."

### Marketing
> "Qual é o market share da Autoforce vs MicroWork vs Syonet por estado? Onde temos mais oportunidade de crescer?"

### Diretoria
> "Como está a cobertura digital do mercado automotivo brasileiro? Quantos dealers ainda não têm presença online?"

### Time Técnico
> "Quais websites de clientes estão com performance abaixo de 50? Quais cairam essa semana?"

---

*Documento mantido em: `ROADMAP.md` na raiz do projeto*
*Última atualização: Março 2026*
