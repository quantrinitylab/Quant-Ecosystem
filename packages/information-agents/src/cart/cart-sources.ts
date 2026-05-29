import type { CartSource, CartItem } from '../types.js';

const defaultSources: CartSource[] = [
  {
    name: 'amazon',
    searchUrl: 'https://amazon.com/s?k=',
    apiEndpoint: 'https://api.amazon.com/search',
  },
  {
    name: 'ebay',
    searchUrl: 'https://ebay.com/sch/i.html?_nkw=',
    apiEndpoint: 'https://api.ebay.com/search',
  },
  {
    name: 'walmart',
    searchUrl: 'https://walmart.com/search?q=',
    apiEndpoint: 'https://api.walmart.com/search',
  },
  {
    name: 'target',
    searchUrl: 'https://target.com/s?searchTerm=',
    apiEndpoint: 'https://api.target.com/search',
  },
  {
    name: 'bestbuy',
    searchUrl: 'https://bestbuy.com/site/searchpage.jsp?st=',
    apiEndpoint: 'https://api.bestbuy.com/search',
  },
];

export function getAvailableSources(): CartSource[] {
  return [...defaultSources];
}

export function searchSource(source: CartSource, query: string): CartItem[] {
  const now = Date.now();
  const basePrice = (hashQuery(query) % 100) + 10;
  return [
    {
      id: `${source.name}-${query}-1`,
      name: `${query} (${source.name} listing 1)`,
      source: source.name,
      price: basePrice + Math.round(Math.random() * 20),
      url: `${source.searchUrl}${encodeURIComponent(query)}`,
      availability: 'in-stock',
      addedAt: now,
    },
    {
      id: `${source.name}-${query}-2`,
      name: `${query} (${source.name} listing 2)`,
      source: source.name,
      price: basePrice + Math.round(Math.random() * 30),
      url: `${source.searchUrl}${encodeURIComponent(query)}`,
      availability: 'in-stock',
      addedAt: now,
    },
  ];
}

function hashQuery(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
}
