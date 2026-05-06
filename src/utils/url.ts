/**
 * Clean and validate URL utility functions
 */

export function cleanUrl(url: string): string {
  if (!url) return '';
  
  let cleanUrl = url.trim();
  
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    cleanUrl = `https://${cleanUrl}`;
  }
  
  return cleanUrl;
}

export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function normalizeUrl(url: string): string {
  const cleaned = cleanUrl(url);
  
  if (!isValidUrl(cleaned)) {
    throw new Error(`Invalid URL: ${url}`);
  }
  
  return cleaned.toLowerCase();
}