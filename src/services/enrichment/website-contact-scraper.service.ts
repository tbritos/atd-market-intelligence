import axios from 'axios';

export interface ScrapedContacts {
  cnpj: string | null;
  email: string | null;
  whatsapp: string | null;
  facebook: string | null;
  instagram: string | null;
  youtube: string | null;
  linkedin: string | null;
}

const CNPJ_REGEX = /\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2}/g;
const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const WHATSAPP_REGEX = /(?:wa\.me\/|api\.whatsapp\.com\/send[?&]phone=|whatsapp\.com\/send[?&]phone=)(\d{10,15})/gi;
const PHONE_WHATSAPP_REGEX = /whatsapp[^\d]*?(\+?55[\s\-]?)?(\(?\d{2}\)?)[\s\-]?(9?\d{4})[\s\-]?(\d{4})/gi;

// Domains to exclude from email results
const EMAIL_BLACKLIST = ['exemplo.com', 'example.com', 'seusite.com', 'empresa.com', 'email.com'];

export class WebsiteContactScraperService {
  async scrape(url: string): Promise<ScrapedContacts> {
    const result: ScrapedContacts = {
      cnpj: null,
      email: null,
      whatsapp: null,
      facebook: null,
      instagram: null,
      youtube: null,
      linkedin: null,
    };

    try {
      const html = await this.fetchHtml(url);
      if (!html) return result;

      result.cnpj = this.extractCnpj(html);
      result.email = this.extractEmail(html);
      result.whatsapp = this.extractWhatsapp(html);
      result.facebook = this.extractSocialUrl(html, /facebook\.com\/(?!sharer|share|dialog|plugins)([a-zA-Z0-9._\-]{3,})/i, 'https://facebook.com/');
      result.instagram = this.extractSocialUrl(html, /instagram\.com\/([a-zA-Z0-9._]{2,})(?:\/|\?|"|'|$)/i, 'https://instagram.com/');
      result.youtube = this.extractSocialUrl(html, /youtube\.com\/(channel\/|c\/|@)?([a-zA-Z0-9_\-]{3,})/i, 'https://youtube.com/');
      result.linkedin = this.extractSocialUrl(html, /linkedin\.com\/(?:company|in)\/([a-zA-Z0-9_\-]{2,})/i, 'https://linkedin.com/company/');
    } catch (error) {
      console.error(`Contact scraping error for ${url}:`, error);
    }

    return result;
  }

  private async fetchHtml(url: string): Promise<string | null> {
    try {
      const { data } = await axios.get(url, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ATD-Monitor/1.0)',
          'Accept': 'text/html',
        },
        maxRedirects: 5,
      });
      return typeof data === 'string' ? data : null;
    } catch {
      return null;
    }
  }

  private extractCnpj(html: string): string | null {
    const matches = html.match(CNPJ_REGEX);
    if (!matches) return null;

    for (const match of matches) {
      const clean = match.replace(/\D/g, '');
      if (clean.length === 14 && this.isValidCnpj(clean)) {
        // Format: XX.XXX.XXX/XXXX-XX
        return `${clean.slice(0,2)}.${clean.slice(2,5)}.${clean.slice(5,8)}/${clean.slice(8,12)}-${clean.slice(12,14)}`;
      }
    }
    return null;
  }

  private extractEmail(html: string): string | null {
    // Remove script/style content first
    const cleaned = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    const matches = cleaned.match(EMAIL_REGEX);
    if (!matches) return null;

    for (const email of matches) {
      const domain = email.split('@')[1]?.toLowerCase();
      if (!domain) continue;
      if (EMAIL_BLACKLIST.some(b => domain.includes(b))) continue;
      if (domain.endsWith('.png') || domain.endsWith('.jpg') || domain.endsWith('.js')) continue;
      return email.toLowerCase();
    }
    return null;
  }

  private extractWhatsapp(html: string): string | null {
    // Try wa.me links first
    const waMatch = WHATSAPP_REGEX.exec(html);
    if (waMatch) {
      const number = waMatch[1].replace(/\D/g, '');
      return `+${number}`;
    }

    // Try text patterns near "whatsapp" keyword
    PHONE_WHATSAPP_REGEX.lastIndex = 0;
    const phoneMatch = PHONE_WHATSAPP_REGEX.exec(html);
    if (phoneMatch) {
      const raw = phoneMatch[0].replace(/\D/g, '');
      if (raw.length >= 10) return `+55${raw.slice(-11)}`;
    }

    return null;
  }

  private extractSocialUrl(html: string, regex: RegExp, base: string): string | null {
    const match = regex.exec(html);
    if (!match) return null;
    const handle = match[match.length - 1];
    if (!handle || handle.length < 2) return null;
    // Avoid generic/placeholder handles
    const skip = ['pages', 'home', 'groups', 'events', 'hashtag', 'sharer', 'share', 'watch', 'feed'];
    if (skip.includes(handle.toLowerCase())) return null;
    return `${base}${handle}`;
  }

  private isValidCnpj(cnpj: string): boolean {
    if (cnpj.length !== 14) return false;
    if (/^(\d)\1+$/.test(cnpj)) return false; // All same digit

    const calc = (cnpj: string, weights: number[]) => {
      let sum = 0;
      for (let i = 0; i < weights.length; i++) sum += parseInt(cnpj[i]) * weights[i];
      const rem = sum % 11;
      return rem < 2 ? 0 : 11 - rem;
    };

    const d1 = calc(cnpj, [5,4,3,2,9,8,7,6,5,4,3,2]);
    const d2 = calc(cnpj, [6,5,4,3,2,9,8,7,6,5,4,3,2]);
    return d1 === parseInt(cnpj[12]) && d2 === parseInt(cnpj[13]);
  }
}

export const websiteContactScraperService = new WebsiteContactScraperService();
