/** Per-app brand configuration for the Quant ecosystem */

export interface AppBrandConfig {
  id: string;
  name: string;
  color: string;
  hue: number;
  description: string;
  iconRef: string;
}

export const quantmail: AppBrandConfig = {
  id: 'quantmail',
  name: 'QuantMail',
  color: '#3B82F6',
  hue: 217,
  description: 'Email reimagined with AI-powered organization',
  iconRef: 'quantmail',
};

export const quantchat: AppBrandConfig = {
  id: 'quantchat',
  name: 'QuantChat',
  color: '#10B981',
  hue: 160,
  description: 'Real-time messaging and collaboration',
  iconRef: 'quantchat',
};

export const quantai: AppBrandConfig = {
  id: 'quantai',
  name: 'QuantAI',
  color: '#8B5CF6',
  hue: 263,
  description: 'Intelligent assistant for the Quant ecosystem',
  iconRef: 'quantai',
};

export const quantcalendar: AppBrandConfig = {
  id: 'quantcalendar',
  name: 'QuantCalendar',
  color: '#F97316',
  hue: 25,
  description: 'Smart scheduling and time management',
  iconRef: 'quantcalendar',
};

export const quantdocs: AppBrandConfig = {
  id: 'quantdocs',
  name: 'QuantDocs',
  color: '#14B8A6',
  hue: 174,
  description: 'Collaborative document editing',
  iconRef: 'quantdocs',
};

export const quantdrive: AppBrandConfig = {
  id: 'quantdrive',
  name: 'QuantDrive',
  color: '#6366F1',
  hue: 239,
  description: 'Cloud storage and file management',
  iconRef: 'quantdrive',
};

export const quantmeet: AppBrandConfig = {
  id: 'quantmeet',
  name: 'QuantMeet',
  color: '#EF4444',
  hue: 0,
  description: 'Video conferencing and virtual meetings',
  iconRef: 'quantmeet',
};

export const quantneon: AppBrandConfig = {
  id: 'quantneon',
  name: 'QuantNeon',
  color: '#EC4899',
  hue: 330,
  description: 'Creative design and visual workspace',
  iconRef: 'quantneon',
};

export const quantsync: AppBrandConfig = {
  id: 'quantsync',
  name: 'QuantSync',
  color: '#06B6D4',
  hue: 188,
  description: 'Cross-device synchronization and backup',
  iconRef: 'quantsync',
};

export const quantube: AppBrandConfig = {
  id: 'quantube',
  name: 'QuanTube',
  color: '#F43F5E',
  hue: 350,
  description: 'Video hosting and streaming platform',
  iconRef: 'quantube',
};

export const quantmax: AppBrandConfig = {
  id: 'quantmax',
  name: 'QuantMax',
  color: '#F59E0B',
  hue: 38,
  description: 'Productivity optimization and automation',
  iconRef: 'quantmax',
};

export const quantedits: AppBrandConfig = {
  id: 'quantedits',
  name: 'QuantEdits',
  color: '#7C3AED',
  hue: 270,
  description: 'Photo and video editing suite',
  iconRef: 'quantedits',
};

export const quantads: AppBrandConfig = {
  id: 'quantads',
  name: 'QuantAds',
  color: '#059669',
  hue: 162,
  description: 'Advertising and marketing campaigns',
  iconRef: 'quantads',
};

export const marketing: AppBrandConfig = {
  id: 'marketing',
  name: 'Marketing',
  color: '#64748B',
  hue: 215,
  description: 'Marketing analytics and insights',
  iconRef: 'marketing',
};

export const apps: Record<string, AppBrandConfig> = {
  quantmail,
  quantchat,
  quantai,
  quantcalendar,
  quantdocs,
  quantdrive,
  quantmeet,
  quantneon,
  quantsync,
  quantube,
  quantmax,
  quantedits,
  quantads,
  marketing,
};
