import axios from 'axios';

// CNAEs for automotive dealerships in Brazil
export const DEALER_CNAES = [
  45111, // Comércio a varejo de automóveis, camionetas e utilitários novos
  45112, // Comércio a varejo de automóveis, camionetas e utilitários usados
  45129, // Representantes comerciais e agentes de veículos automotores
  45200, // Manutenção e reparação de veículos automotores
];

export interface CnaeDealerResult {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  situacao: string;
  dataAbertura: string | null;
  porte: string | null;
  capitalSocial: number | null;
  cnaeCode: number;
  cnaeDescricao: string | null;
  telefone: string | null;
  email: string | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  cep: string | null;
  municipio: string;
  uf: string;
}

interface CasaDadosResponse {
  data: {
    cnpj: string;
    razao_social: string;
    nome_fantasia: string;
    descricao_situacao_cadastral: string;
    data_inicio_atividade: string;
    porte: string;
    capital_social: number;
    cnae_fiscal: number;
    cnae_fiscal_descricao: string;
    ddd_telefone_1: string;
    email: string;
    logradouro: string;
    numero: string;
    bairro: string;
    cep: string;
    municipio: string;
    uf: string;
  }[];
  meta: { total_count: number; page: number; next: string | null };
}

const CASA_DADOS_URL = 'https://api.casadosdados.com.br/v2/public/cnpj/pesquisa';

export class CnaeDiscoveryService {
  async searchDealers(brandName: string, stateCode: string, municipio?: string): Promise<CnaeDealerResult[]> {
    const results: CnaeDealerResult[] = [];

    for (const cnae of [45111, 45112]) {
      let page = 1;
      let hasMore = true;

      while (hasMore && page <= 10) {
        try {
          const body = {
            query: {
              cnae_fiscal: [cnae],
              uf: [stateCode.toUpperCase()],
              situacao_cadastral: 'ATIVA',
              ...(municipio ? { municipio: [municipio.toUpperCase()] } : {}),
            },
            extras: { com_contato: true, somente_mei: false },
            page,
          };

          const { data } = await axios.post<CasaDadosResponse>(CASA_DADOS_URL, body, {
            timeout: 15000,
            headers: { 'Content-Type': 'application/json' },
          });

          const brandLower = brandName.toLowerCase();

          for (const item of data.data) {
            const nameMatch =
              item.razao_social?.toLowerCase().includes(brandLower) ||
              item.nome_fantasia?.toLowerCase().includes(brandLower);

            if (!nameMatch) continue;

            results.push({
              cnpj: item.cnpj,
              razaoSocial: item.razao_social,
              nomeFantasia: item.nome_fantasia || null,
              situacao: item.descricao_situacao_cadastral,
              dataAbertura: item.data_inicio_atividade || null,
              porte: item.porte || null,
              capitalSocial: item.capital_social || null,
              cnaeCode: item.cnae_fiscal,
              cnaeDescricao: item.cnae_fiscal_descricao || null,
              telefone: item.ddd_telefone_1 || null,
              email: item.email || null,
              logradouro: item.logradouro || null,
              numero: item.numero || null,
              bairro: item.bairro || null,
              cep: item.cep || null,
              municipio: item.municipio,
              uf: item.uf,
            });
          }

          hasMore = !!data.meta.next && data.data.length > 0;
          page++;

          // Rate limit: Casa dos Dados has ~1 req/s on free tier
          await new Promise((r) => setTimeout(r, 1100));

        } catch (err) {
          if (axios.isAxiosError(err) && err.response?.status === 429) {
            console.warn('Casa dos Dados rate limit, waiting 5s...');
            await new Promise((r) => setTimeout(r, 5000));
          } else if (axios.isAxiosError(err) && err.response?.status === 403) {
            console.warn(`CNAE: Casa dos Dados bloqueado (403 Cloudflare) — pulando fonte cnae`);
            return results;
          } else {
            console.error(`CNAE search error (CNAE ${cnae}, page ${page}):`, axios.isAxiosError(err) ? err.message : err);
            hasMore = false;
          }
        }
      }
    }

    console.log(`CNAE discovery: found ${results.length} dealers for ${brandName} in ${stateCode}`);
    return results;
  }
}

export const cnaeDiscoveryService = new CnaeDiscoveryService();
