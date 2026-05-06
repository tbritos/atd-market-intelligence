import axios from 'axios';

export interface BrasilApiCnpjData {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  data_inicio_atividade: string;
  porte: string;
  capital_social: number;
  descricao_situacao_cadastral: string;
  cnae_fiscal: number;
  cnae_fiscal_descricao: string;
  email: string | null;
  ddd_telefone_1: string | null;
  logradouro: string;
  numero: string;
  bairro: string;
  cep: string;
  municipio: string;
  uf: string;
  qsa: BrasilApiQsa[];
}

export interface BrasilApiQsa {
  nome_socio: string;
  cnpj_cpf_do_socio: string;
  qualificacao_socio: string;
  data_entrada_sociedade: string;
}

const BRASIL_API_BASE = 'https://brasilapi.com.br/api/cnpj/v1';

export class BrasilApiService {
  async fetchCnpj(cnpj: string): Promise<BrasilApiCnpjData | null> {
    const clean = cnpj.replace(/\D/g, '');
    if (clean.length !== 14) return null;

    try {
      const { data } = await axios.get<BrasilApiCnpjData>(`${BRASIL_API_BASE}/${clean}`, {
        timeout: 15000,
        headers: { 'Accept': 'application/json' },
      });
      return data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      console.error(`BrasilAPI error for CNPJ ${cnpj}:`, error);
      return null;
    }
  }
}

export const brasilApiService = new BrasilApiService();
