// ============================================================================
// QuantEdits API - Assets Routes
// Asset library: fonts, music, stock photos/videos, icons, shapes, backgrounds
// ============================================================================

import type { Request, Response } from '../middleware';
import type { RouteDefinition, Asset, AssetCategory } from '../../src/types';

const ASSET_LIBRARY: Asset[] = [
  { id: 'asset_font_1', name: 'Inter', category: 'font', url: '/fonts/inter.woff2', thumbnail: '/assets/fonts/inter.png', metadata: { size: 120000, format: 'woff2' }, tags: ['sans-serif', 'modern', 'clean'], isPremium: false, license: 'free', createdAt: '2024-01-01' },
  { id: 'asset_font_2', name: 'Playfair Display', category: 'font', url: '/fonts/playfair.woff2', thumbnail: '/assets/fonts/playfair.png', metadata: { size: 145000, format: 'woff2' }, tags: ['serif', 'elegant', 'display'], isPremium: false, license: 'free', createdAt: '2024-01-01' },
  { id: 'asset_music_1', name: 'Upbeat Corporate', category: 'music', url: '/music/upbeat-corporate.mp3', thumbnail: '/assets/music/upbeat.png', metadata: { size: 4500000, format: 'mp3', duration: 120, sampleRate: 44100, bitrate: 320000 }, tags: ['corporate', 'upbeat', 'background'], isPremium: false, license: 'free', createdAt: '2024-01-15' },
  { id: 'asset_music_2', name: 'Cinematic Epic', category: 'music', url: '/music/cinematic.mp3', thumbnail: '/assets/music/cinematic.png', metadata: { size: 6200000, format: 'mp3', duration: 180, sampleRate: 48000, bitrate: 320000 }, tags: ['cinematic', 'epic', 'dramatic'], isPremium: true, license: 'premium', createdAt: '2024-01-20' },
  { id: 'asset_photo_1', name: 'Nature Landscape', category: 'stock-photo', url: '/stock/nature-1.jpg', thumbnail: '/assets/stock/nature-1-thumb.jpg', metadata: { size: 2400000, format: 'jpg', width: 4000, height: 2667 }, tags: ['nature', 'landscape', 'mountain'], isPremium: false, license: 'free', createdAt: '2024-02-01' },
  { id: 'asset_video_1', name: 'City Timelapse', category: 'stock-video', url: '/stock/city-timelapse.mp4', thumbnail: '/assets/stock/city-thumb.jpg', metadata: { size: 45000000, format: 'mp4', width: 3840, height: 2160, duration: 15 }, tags: ['city', 'timelapse', 'urban'], isPremium: true, license: 'premium', createdAt: '2024-02-10' },
  { id: 'asset_icon_1', name: 'Social Icons Pack', category: 'icon', url: '/icons/social-pack.svg', thumbnail: '/assets/icons/social-pack.png', metadata: { size: 25000, format: 'svg' }, tags: ['social', 'icons', 'pack'], isPremium: false, license: 'free', createdAt: '2024-01-05' },
  { id: 'asset_shape_1', name: 'Geometric Shapes', category: 'shape', url: '/shapes/geometric.svg', thumbnail: '/assets/shapes/geometric.png', metadata: { size: 15000, format: 'svg' }, tags: ['geometric', 'abstract', 'shapes'], isPremium: false, license: 'free', createdAt: '2024-01-05' },
  { id: 'asset_bg_1', name: 'Gradient Pack', category: 'background', url: '/backgrounds/gradient-pack.zip', thumbnail: '/assets/bg/gradient.png', metadata: { size: 500000, format: 'zip' }, tags: ['gradient', 'colorful', 'pack'], isPremium: false, license: 'free', createdAt: '2024-01-10' },
  { id: 'asset_sticker_1', name: 'Emoji Stickers', category: 'sticker', url: '/stickers/emoji-pack.zip', thumbnail: '/assets/stickers/emoji.png', metadata: { size: 2000000, format: 'zip' }, tags: ['emoji', 'stickers', 'fun'], isPremium: false, license: 'free', createdAt: '2024-02-15' },
];

const userAssets: Map<string, Asset[]> = new Map();

export const assetRoutes: RouteDefinition[] = [
  {
    method: 'GET',
    path: '/api/assets',
    handler: async (req: Request, res: Response) => {
      const { category, search, premium, page, limit } = req.query as any;
      let assets = [...ASSET_LIBRARY];
      if (category) assets = assets.filter(a => a.category === category);
      if (premium !== undefined) assets = assets.filter(a => a.isPremium === (premium === 'true'));
      if (search) {
        const q = search.toLowerCase();
        assets = assets.filter(a => a.name.toLowerCase().includes(q) || a.tags.some(t => t.includes(q)));
      }
      const total = assets.length;
      const p = Number(page) || 1;
      const l = Number(limit) || 20;
      assets = assets.slice((p - 1) * l, p * l);
      res.status(200).json({ success: true, data: assets, pagination: { total, page: p, limit: l } });
    },
    requiresAuth: false,
  },
  {
    method: 'GET',
    path: '/api/assets/categories',
    handler: async (_req: Request, res: Response) => {
      const categories: { category: AssetCategory; count: number }[] = [];
      const catMap = new Map<AssetCategory, number>();
      for (const a of ASSET_LIBRARY) catMap.set(a.category, (catMap.get(a.category) || 0) + 1);
      for (const [category, count] of catMap) categories.push({ category, count });
      res.status(200).json({ success: true, data: categories });
    },
    requiresAuth: false,
  },
  {
    method: 'GET',
    path: '/api/assets/:id',
    handler: async (req: Request, res: Response) => {
      const asset = ASSET_LIBRARY.find(a => a.id === req.params['id']);
      if (!asset) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Asset not found' } }); return; }
      res.status(200).json({ success: true, data: asset });
    },
    requiresAuth: false,
  },
  {
    method: 'POST',
    path: '/api/assets/upload',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      const asset: Asset = {
        id: `asset_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
        name: body.name || 'Uploaded Asset',
        category: body.category || 'stock-photo',
        url: `/uploads/${req.userId}/${Date.now()}.${body.format || 'png'}`,
        thumbnail: `/uploads/${req.userId}/thumb_${Date.now()}.jpg`,
        metadata: { size: body.size || 0, format: body.format || 'png', width: body.width, height: body.height, duration: body.duration },
        tags: body.tags || [],
        isPremium: false,
        license: 'free',
        uploadedBy: req.userId,
        createdAt: new Date().toISOString(),
      };
      const existing = userAssets.get(req.userId!) || [];
      existing.push(asset);
      userAssets.set(req.userId!, existing);
      res.status(201).json({ success: true, data: asset });
    },
  },
  {
    method: 'GET',
    path: '/api/assets/user/library',
    handler: async (req: Request, res: Response) => {
      const assets = userAssets.get(req.userId!) || [];
      res.status(200).json({ success: true, data: assets });
    },
  },
  {
    method: 'DELETE',
    path: '/api/assets/:id',
    handler: async (req: Request, res: Response) => {
      const assets = userAssets.get(req.userId!) || [];
      const idx = assets.findIndex(a => a.id === req.params['id']);
      if (idx === -1) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Asset not found' } }); return; }
      assets.splice(idx, 1);
      res.status(200).json({ success: true, message: 'Asset deleted' });
    },
  },
];
