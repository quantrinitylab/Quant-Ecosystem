export type AgentType = 'news-monitor' | 'price-watcher' | 'event-suggester' | 'cart-aggregator';

export interface InformationAgent {
  id: string;
  type: AgentType;
  config: MonitorConfig | WatchTarget[] | EventConfig;
  status: 'idle' | 'running' | 'error';
  lastRun: number | null;
}

export interface MonitorConfig {
  topics: string[];
  sources: string[];
  frequency: number;
  filters: Record<string, string>;
}

export interface WatchTarget {
  id: string;
  name: string;
  url: string;
  targetPrice?: number;
  condition: 'below' | 'above' | 'equals';
}

export interface PriceAlert {
  targetId: string;
  currentPrice: number;
  targetPrice: number;
  triggered: boolean;
  timestamp: number;
}

export interface EventConfig {
  interests: string[];
  location: string;
}

export interface EventSuggestion {
  eventId: string;
  title: string;
  reason: string;
  relevanceScore: number;
  suggestedAction: string;
}

export interface CartItem {
  id: string;
  name: string;
  source: string;
  price: number;
  url: string;
  availability: 'in-stock' | 'out-of-stock' | 'limited';
  addedAt: number;
}

export interface UniversalCartData {
  id: string;
  userId: string;
  items: CartItem[];
  totalEstimate: number;
  sources: string[];
}

export interface CartSource {
  name: string;
  searchUrl: string;
  apiEndpoint: string;
}

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  topic: string;
  timestamp: number;
  url: string;
}

export interface NewsDigest {
  since: number;
  generatedAt: number;
  groups: Record<string, NewsItem[]>;
  totalItems: number;
}
