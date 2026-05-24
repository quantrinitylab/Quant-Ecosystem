// ============================================================================
// QuantMax API - Create Routes
// Create short videos, effects, duets, stitch, green screen
// ============================================================================

import type { Request, Response } from '../middleware';
import type { RouteDefinition, ShortVideo } from '../../src/types';
import { feedService } from '../services/feed-service';

export const createRoutes: RouteDefinition[] = [
  {
    method: 'POST',
    path: '/api/create/video',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      const video: ShortVideo = {
        id: `vid_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`,
        creatorId: req.userId!,
        creator: body.creator || { id: req.userId!, username: 'user', displayName: 'User' } as any,
        videoUrl: body.videoUrl || `/videos/${req.userId}/${Date.now()}.mp4`,
        thumbnailUrl: body.thumbnailUrl || '/thumbnails/default.jpg',
        caption: body.caption || '',
        sound: body.sound || { id: 'original', name: 'Original Sound', artistName: 'Creator', audioUrl: '', duration: 0, usageCount: 0, isOriginal: true },
        hashtags: body.hashtags || [],
        effects: body.effects || [],
        duration: body.duration || 15,
        likes: 0, comments: 0, shares: 0, views: 0,
        isLiked: false, isBookmarked: false,
        isDuet: body.isDuet || false,
        isStitch: body.isStitch || false,
        parentVideoId: body.parentVideoId,
        createdAt: new Date().toISOString(),
        visibility: body.visibility || 'public',
      };
      feedService.addVideo(video);
      res.status(201).json({ success: true, data: video });
    },
  },
  {
    method: 'POST',
    path: '/api/create/duet',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      const video: ShortVideo = {
        id: `vid_${Date.now().toString(36)}_duet`,
        creatorId: req.userId!,
        creator: body.creator || { id: req.userId! } as any,
        videoUrl: body.videoUrl || `/videos/${req.userId}/duet_${Date.now()}.mp4`,
        thumbnailUrl: body.thumbnailUrl || '/thumbnails/default.jpg',
        caption: body.caption || '',
        sound: body.sound || { id: 'original', name: 'Duet Sound', artistName: 'Creator', audioUrl: '', duration: 0, usageCount: 0, isOriginal: false },
        hashtags: [...(body.hashtags || []), 'duet'],
        effects: body.effects || [],
        duration: body.duration || 15,
        likes: 0, comments: 0, shares: 0, views: 0,
        isLiked: false, isBookmarked: false,
        isDuet: true, isStitch: false,
        parentVideoId: body.parentVideoId,
        createdAt: new Date().toISOString(),
        visibility: body.visibility || 'public',
      };
      feedService.addVideo(video);
      res.status(201).json({ success: true, data: video });
    },
  },
  {
    method: 'POST',
    path: '/api/create/stitch',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      const video: ShortVideo = {
        id: `vid_${Date.now().toString(36)}_stitch`,
        creatorId: req.userId!,
        creator: body.creator || { id: req.userId! } as any,
        videoUrl: body.videoUrl || `/videos/${req.userId}/stitch_${Date.now()}.mp4`,
        thumbnailUrl: '/thumbnails/default.jpg',
        caption: body.caption || '',
        sound: body.sound || { id: 'original', name: 'Stitch Sound', artistName: 'Creator', audioUrl: '', duration: 0, usageCount: 0, isOriginal: false },
        hashtags: [...(body.hashtags || []), 'stitch'],
        effects: body.effects || [],
        duration: body.duration || 30,
        likes: 0, comments: 0, shares: 0, views: 0,
        isLiked: false, isBookmarked: false,
        isDuet: false, isStitch: true,
        parentVideoId: body.parentVideoId,
        createdAt: new Date().toISOString(),
        visibility: body.visibility || 'public',
      };
      feedService.addVideo(video);
      res.status(201).json({ success: true, data: video });
    },
  },
  {
    method: 'GET',
    path: '/api/create/effects',
    handler: async (_req: Request, res: Response) => {
      const effects = [
        { id: 'eff_beauty', name: 'Beauty Mode', type: 'beauty', thumbnailUrl: '/effects/beauty.png' },
        { id: 'eff_green', name: 'Green Screen', type: 'green-screen', thumbnailUrl: '/effects/green.png' },
        { id: 'eff_slow', name: 'Slow Motion', type: 'time', thumbnailUrl: '/effects/slow.png' },
        { id: 'eff_fast', name: 'Fast Forward', type: 'time', thumbnailUrl: '/effects/fast.png' },
        { id: 'eff_ar_face', name: 'AR Face Filter', type: 'ar', thumbnailUrl: '/effects/ar-face.png' },
        { id: 'eff_vintage', name: 'Vintage', type: 'filter', thumbnailUrl: '/effects/vintage.png' },
        { id: 'eff_glitch', name: 'Glitch', type: 'filter', thumbnailUrl: '/effects/glitch.png' },
        { id: 'eff_neon', name: 'Neon', type: 'filter', thumbnailUrl: '/effects/neon.png' },
      ];
      res.status(200).json({ success: true, data: effects });
    },
    requiresAuth: false,
  },
  {
    method: 'GET',
    path: '/api/create/templates',
    handler: async (_req: Request, res: Response) => {
      const templates = [
        { id: 'tmpl_intro', name: 'Introduction', description: 'Introduce yourself in style' },
        { id: 'tmpl_transition', name: 'Outfit Transition', description: 'Smooth outfit change' },
        { id: 'tmpl_dance', name: 'Dance Challenge', description: 'Join the latest dance trend' },
        { id: 'tmpl_lip_sync', name: 'Lip Sync', description: 'Lip sync to trending audio' },
      ];
      res.status(200).json({ success: true, data: templates });
    },
    requiresAuth: false,
  },
];
