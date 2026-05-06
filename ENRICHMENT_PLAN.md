# Plano de Enriquecimento de Leads

## Objetivo
Enriquecer uma amostra de leads com o máximo de informações úteis para o time comercial (SDR), usando as melhores APIs disponíveis dentro das cotas gratuitas.

---

## Tamanho da Amostra
- **50 leads** na primeira rodada (respeita cotas gratuitas)
- Fonte: a definir (clientes, RD Station, concessionárias)

---

## APIs Disponíveis

| API | O que faz | Cota gratuita | Chave no .env |
|-----|-----------|---------------|---------------|
| SerpAPI | Busca Google → encontra site pelo nome da empresa | 100/mês | ✅ |
| Apify | Raspa site → email, telefone, redes sociais | ~$5 crédito | ✅ |
| Apollo.io | Contato do decisor por domínio → email, cargo, LinkedIn, telefone | 50 exports/mês | ❓ |     
| Hunter.io | Valida/encontra email pelo domínio | 25/mês | ❓ |

---

## Fluxo de Enriquecimento por Lead

```
Lead (nome + empresa)
        │
        ▼
1. SerpAPI
   Busca: "{nome empresa} site oficial"
   → URL do site oficial
        │
        ▼
2. Apollo.io
   Busca por domínio ou nome da empresa
   → Email do decisor (verificado)
   → Cargo / Título
   → LinkedIn
   → Telefone direto
   → Tamanho da empresa
   → Tecnologias que usam
        │
        ▼
3. Apify (scraper do site)
   → Telefone de contato
   → Email genérico
   → Instagram / Facebook / LinkedIn
        │
        ▼
4. Hunter.io
   Busca pelo domínio
   → Valida email encontrado
   → Sugere outros emails do domínio
        │
        ▼
Lead enriquecido ✅
```

---

## Dados Finais por Lead (colunas da planilha SDR)

### Empresa
- [ ] Nome fantasia
- [ ] Razão social
- [ ] CNPJ
- [ ] Situação (apenas ATIVA)
- [ ] Porte
- [ ] Capital social
- [ ] Ano de abertura
- [ ] CNAE
- [ ] Cidade / UF

### Contato do Decisor
- [ ] Nome
- [ ] Cargo / Título
- [ ] Email (verificado)
- [ ] Telefone direto
- [ ] LinkedIn

### Presença Digital
- [ ] Site
- [ ] Provedor do site
- [ ] PageSpeed
- [ ] SEO Score
- [ ] Instagram
- [ ] Facebook
- [ ] LinkedIn da empresa

### Inteligência Comercial
- [ ] Tecnologias que usam (ex: usa Salesforce? usa HubSpot?)
- [ ] Rating Google
- [ ] Número de avaliações Google
- [ ] CS Responsável Autoforce (se já for cliente)
- [ ] É cliente Autoforce? (excluir da prospecção)

---

## Estratégia de Uso das Cotas

- Priorizar leads **sem email verificado** para Hunter.io
- Priorizar leads **sem site** para SerpAPI
- Usar Apollo apenas para leads com **maior potencial** (porte maior, capital social alto)
- Apify só se Apollo não trouxer redes sociais

---

## Próximos Passos

1. [ ] Definir fonte da amostra (qual base usar)
2. [ ] Confirmar quais chaves de API estão disponíveis no .env
3. [ ] Definir critérios de priorização dos 50 leads
4. [ ] Implementar pipeline de enriquecimento
5. [ ] Criar tela de acompanhamento do enriquecimento
6. [ ] Exportar planilha final para o time SDR

---

## Decisões Pendentes

- Fonte dos leads: clientes Autoforce / RD Station / concessionárias?
- Apollo.io: temos chave? É trial ou conta ativa?
- Critério de seleção dos 50: maior capital social? com email? com site?
