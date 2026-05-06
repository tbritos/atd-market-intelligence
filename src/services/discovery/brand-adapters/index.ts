import axios from 'axios';

export interface BrandDealerResult {
  name: string;
  address: string | null;
  city: string | null;
  stateCode: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  lat: number | null;
  lng: number | null;
  services: { hasSales?: boolean; hasService?: boolean; hasParts?: boolean } | null;
  openingHours: { day: string; hours: string }[] | null;
  externalId: string | null;
}

export interface BrandAdapter {
  brandSlug: string;
  fetch(stateCode?: string): Promise<BrandDealerResult[]>;
}

// ─── Toyota Brazil ─────────────────────────────────────────────────────────────
class ToyotaAdapter implements BrandAdapter {
  brandSlug = 'toyota';

  async fetch(stateCode?: string): Promise<BrandDealerResult[]> {
    try {
      const { data } = await axios.get(
        'https://www.toyota.com.br/wp-json/api/dealers',
        { timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } }
      );
      const dealers: any[] = Array.isArray(data) ? data : data?.dealers ?? data?.data ?? [];
      return dealers
        .filter((d: any) => !stateCode || d.state === stateCode || d.uf === stateCode)
        .map((d: any) => ({
          name: d.name || d.title || d.dealerName,
          address: d.address || d.endereco || null,
          city: d.city || d.cidade || null,
          stateCode: (d.state || d.uf || '').toUpperCase() || null,
          phone: d.phone || d.telefone || null,
          email: d.email || null,
          website: d.website || d.url || null,
          lat: parseFloat(d.lat || d.latitude) || null,
          lng: parseFloat(d.lng || d.longitude) || null,
          services: null,
          openingHours: null,
          externalId: d.id ? `toyota-${d.id}` : null,
        }));
    } catch (err) {
      console.error('Toyota adapter error:', err);
      return [];
    }
  }
}

// ─── Volkswagen Brazil ─────────────────────────────────────────────────────────
class VolkswagenAdapter implements BrandAdapter {
  brandSlug = 'volkswagen';

  async fetch(stateCode?: string): Promise<BrandDealerResult[]> {
    try {
      const { data } = await axios.get(
        'https://www.volkswagen.com.br/pt/dealer-locator.html',
        { timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } }
      );
      // VW uses a different internal API, try alternate endpoint
      const { data: dealers } = await axios.get(
        'https://www.vw-partnerportal.de/api/dealers?country=BR',
        { timeout: 15000 }
      );
      const list: any[] = Array.isArray(dealers) ? dealers : dealers?.dealers ?? [];
      return list
        .filter((d: any) => !stateCode || (d.state || d.region)?.includes(stateCode))
        .map((d: any) => ({
          name: d.name || d.dealerName,
          address: d.address?.street || d.address || null,
          city: d.address?.city || d.city || null,
          stateCode: stateCode || null,
          phone: d.phone || d.contact?.phone || null,
          email: d.email || d.contact?.email || null,
          website: d.website || null,
          lat: d.location?.lat ?? d.latitude ?? null,
          lng: d.location?.lng ?? d.longitude ?? null,
          services: null,
          openingHours: null,
          externalId: d.id ? `vw-${d.id}` : null,
        }));
    } catch {
      return []; // VW API may not be publicly accessible
    }
  }
}

// ─── Fiat / Stellantis Brazil ──────────────────────────────────────────────────
class FiatAdapter implements BrandAdapter {
  brandSlug = 'fiat';

  async fetch(stateCode?: string): Promise<BrandDealerResult[]> {
    try {
      const stateParam = stateCode ? `&state=${stateCode}` : '';
      const { data } = await axios.get(
        `https://www.fiat.com.br/concessionarias.html${stateParam}`,
        {
          timeout: 20000,
          headers: {
            'User-Agent': 'Mozilla/5.0',
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
        }
      );
      const dealers: any[] = Array.isArray(data) ? data : data?.dealers ?? data?.data ?? [];
      return dealers.map((d: any) => ({
        name: d.name || d.dealerName || d.nomeFantasia,
        address: d.address || d.endereco || null,
        city: d.city || d.cidade || null,
        stateCode: (d.state || d.uf || stateCode || '').toUpperCase() || null,
        phone: d.phone || d.telefone || null,
        email: d.email || null,
        website: d.website || d.url || null,
        lat: parseFloat(d.lat || d.latitude) || null,
        lng: parseFloat(d.lng || d.longitude) || null,
        services: {
          hasSales: d.services?.includes('sales') ?? true,
          hasService: d.services?.includes('service') ?? false,
          hasParts: d.services?.includes('parts') ?? false,
        },
        openingHours: null,
        externalId: d.id ? `fiat-${d.id}` : null,
      }));
    } catch {
      return [];
    }
  }
}

// ─── Honda Brazil ──────────────────────────────────────────────────────────────
class HondaAdapter implements BrandAdapter {
  brandSlug = 'honda';

  async fetch(stateCode?: string): Promise<BrandDealerResult[]> {
    try {
      const { data } = await axios.get(
        `https://www.honda.com.br/automoveis/concessionarias${stateCode ? `?uf=${stateCode}` : ''}`,
        { timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } }
      );
      const dealers: any[] = Array.isArray(data) ? data : data?.dealers ?? data?.concessionarias ?? [];
      return dealers.map((d: any) => ({
        name: d.name || d.nome || d.razaoSocial,
        address: d.address || d.endereco || null,
        city: d.city || d.cidade || null,
        stateCode: (d.state || d.uf || stateCode || '').toUpperCase() || null,
        phone: d.phone || d.telefone || null,
        email: d.email || null,
        website: d.website || d.url || null,
        lat: parseFloat(d.lat || d.latitude) || null,
        lng: parseFloat(d.lng || d.longitude) || null,
        services: null,
        openingHours: null,
        externalId: d.id ? `honda-${d.id}` : null,
      }));
    } catch {
      return [];
    }
  }
}

// ─── Chevrolet / GM Brazil ────────────────────────────────────────────────────
class ChevroletAdapter implements BrandAdapter {
  brandSlug = 'chevrolet';

  async fetch(stateCode?: string): Promise<BrandDealerResult[]> {
    try {
      const body = {
        country: 'BR',
        language: 'pt',
        ...(stateCode ? { state: stateCode } : {}),
        type: 'DEALER',
      };
      const { data } = await axios.post(
        'https://www.chevrolet.com.br/content/dam/web/br/dealer-locator.json',
        body,
        { timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0' } }
      );
      const dealers: any[] = Array.isArray(data) ? data : data?.dealers ?? [];
      return dealers.map((d: any) => ({
        name: d.name || d.dealerName,
        address: d.address || null,
        city: d.city || null,
        stateCode: (d.state || stateCode || '').toUpperCase() || null,
        phone: d.phone || null,
        email: d.email || null,
        website: d.website || null,
        lat: d.lat ?? null,
        lng: d.lng ?? null,
        services: null,
        openingHours: null,
        externalId: d.id ? `chevrolet-${d.id}` : null,
      }));
    } catch {
      return [];
    }
  }
}

// ─── Registry ─────────────────────────────────────────────────────────────────
export const BRAND_ADAPTERS: Record<string, BrandAdapter> = {
  toyota: new ToyotaAdapter(),
  volkswagen: new VolkswagenAdapter(),
  vw: new VolkswagenAdapter(),
  fiat: new FiatAdapter(),
  honda: new HondaAdapter(),
  chevrolet: new ChevroletAdapter(),
};

export function getAdapterForBrand(slug: string): BrandAdapter | null {
  const key = slug.toLowerCase().replace(/\s+/g, '');
  return BRAND_ADAPTERS[key] ?? null;
}
