/** App icon set generation for all platform sizes */
import { apps } from '../apps';

export interface AppIconSet {
  favicon16: string;
  favicon32: string;
  pwa192: string;
  pwa512: string;
  ios180: string;
  android192: string;
  maskable512: string;
}

function wrapIconAtSize(iconSvg: string, size: number, maskable?: boolean): string {
  const innerContent = iconSvg.replace(/<svg[^>]*>/, '').replace(/<\/svg>/, '');

  const padding = maskable ? size * 0.1 : size * 0.15;
  const iconSize = size - padding * 2;
  const scale = iconSize / 24;

  const bgCircle = maskable
    ? `<circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.4}" fill="currentBackground"/>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  ${bgCircle}
  <g transform="translate(${padding}, ${padding}) scale(${scale})">
    ${innerContent}
  </g>
</svg>`;
}

export function generateAppIconSet(appId: string): AppIconSet {
  const app = apps[appId];
  if (!app) {
    throw new Error(`Unknown app: ${appId}`);
  }

  const iconBase = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
  <circle cx="12" cy="12" r="10" fill="${app.color}"/>
  <text x="12" y="16" font-size="10" fill="white" text-anchor="middle" font-family="Inter, sans-serif" font-weight="700">${app.name.charAt(0)}</text>
</svg>`;

  return {
    favicon16: wrapIconAtSize(iconBase, 16),
    favicon32: wrapIconAtSize(iconBase, 32),
    pwa192: wrapIconAtSize(iconBase, 192),
    pwa512: wrapIconAtSize(iconBase, 512),
    ios180: wrapIconAtSize(iconBase, 180),
    android192: wrapIconAtSize(iconBase, 192),
    maskable512: wrapIconAtSize(iconBase, 512, true),
  };
}

export function generateFaviconSvg(appId: string): string {
  const app = apps[appId];
  if (!app) {
    throw new Error(`Unknown app: ${appId}`);
  }
  const initial = app.name.replace('Quant', '').charAt(0) || 'Q';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <circle cx="16" cy="16" r="14" fill="${app.color}"/>
  <text x="16" y="22" font-size="16" fill="white" text-anchor="middle" font-family="Inter, sans-serif" font-weight="700">${initial}</text>
</svg>`;
}
