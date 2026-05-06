export function buildPageSpeedQuery(params: {
  url: string;
  apiKey: string;
  strategy: 'mobile' | 'desktop';
  categories: string[];
  locale?: string;
}): string {
  const baseUrl = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

  const searchParams = new URLSearchParams({
    url: params.url,
    key: params.apiKey,
    strategy: params.strategy
  });

  if (params.locale) {
    searchParams.append('locale', params.locale);
  }

  params.categories.forEach(category => {
    searchParams.append('category', category);
  });

  return `${baseUrl}?${searchParams.toString()}`;
}