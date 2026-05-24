// ============================================================================
// QuantMax API - Profiles Routes
// Dating/social profiles, verification, prompts, photos
// ============================================================================

import type { Request, Response } from '../middleware';
import type { RouteDefinition, UserProfile, ProfilePrompt } from '../../src/types';
import { matchingService } from '../services/matching-service';

const profiles: Map<string, UserProfile> = new Map();

const DEFAULT_PROMPTS = [
  "Two truths and a lie...",
  "My perfect Sunday looks like...",
  "I'm looking for someone who...",
  "Best travel story...",
  "I'll know it's love when...",
  "The way to my heart is...",
  "A life goal of mine...",
  "My most controversial opinion...",
];

export const profileRoutes: RouteDefinition[] = [
  {
    method: 'GET',
    path: '/api/profiles/me',
    handler: async (req: Request, res: Response) => {
      const profile = profiles.get(req.userId!);
      if (!profile) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Profile not found' } }); return; }
      res.status(200).json({ success: true, data: profile });
    },
  },
  {
    method: 'POST',
    path: '/api/profiles',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      const profile: UserProfile = {
        id: req.userId!,
        username: body.username || `user_${Date.now().toString(36)}`,
        displayName: body.displayName || 'New User',
        avatarUrl: body.avatarUrl || '/default-avatar.png',
        bio: body.bio || '',
        age: body.age || 18,
        gender: body.gender || 'prefer-not-to-say',
        location: body.location || { city: 'Unknown', country: 'Unknown', lat: 0, lng: 0 },
        photos: body.photos || [],
        videos: [],
        prompts: body.prompts || [],
        interests: body.interests || [],
        verified: 'unverified',
        relationshipGoal: body.relationshipGoal || 'casual',
        height: body.height,
        education: body.education,
        job: body.job,
        company: body.company,
        followers: 0,
        following: 0,
        likes: 0,
        eloScore: 1000,
        lastActive: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        preferences: body.preferences || { ageRange: { min: 18, max: 40 }, distance: 50, genders: [], relationshipGoals: [], showMe: true, dealbreakers: [] },
        badges: [],
      };
      profiles.set(req.userId!, profile);
      matchingService.registerProfile(profile);
      res.status(201).json({ success: true, data: profile });
    },
  },
  {
    method: 'PUT',
    path: '/api/profiles/me',
    handler: async (req: Request, res: Response) => {
      const profile = profiles.get(req.userId!);
      if (!profile) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Profile not found' } }); return; }
      Object.assign(profile, req.body, { lastActive: new Date().toISOString() });
      res.status(200).json({ success: true, data: profile });
    },
  },
  {
    method: 'GET',
    path: '/api/profiles/:userId',
    handler: async (req: Request, res: Response) => {
      const profile = profiles.get(req.params['userId']);
      if (!profile) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Profile not found' } }); return; }
      res.status(200).json({ success: true, data: profile });
    },
  },
  {
    method: 'PUT',
    path: '/api/profiles/me/preferences',
    handler: async (req: Request, res: Response) => {
      const profile = profiles.get(req.userId!);
      if (!profile) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Profile not found' } }); return; }
      profile.preferences = { ...profile.preferences, ...(req.body as any) };
      res.status(200).json({ success: true, data: profile.preferences });
    },
  },
  {
    method: 'POST',
    path: '/api/profiles/me/photos',
    handler: async (req: Request, res: Response) => {
      const profile = profiles.get(req.userId!);
      if (!profile) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Profile not found' } }); return; }
      const body = req.body as any;
      const photo = { id: `photo_${Date.now().toString(36)}`, url: body.url, isMain: profile.photos.length === 0, isVerified: false, order: profile.photos.length };
      profile.photos.push(photo);
      res.status(201).json({ success: true, data: photo });
    },
  },
  {
    method: 'POST',
    path: '/api/profiles/me/prompts',
    handler: async (req: Request, res: Response) => {
      const profile = profiles.get(req.userId!);
      if (!profile) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Profile not found' } }); return; }
      const body = req.body as any;
      const prompt: ProfilePrompt = { id: `prompt_${Date.now().toString(36)}`, question: body.question, answer: body.answer };
      profile.prompts.push(prompt);
      res.status(201).json({ success: true, data: prompt });
    },
  },
  {
    method: 'GET',
    path: '/api/profiles/prompts/suggestions',
    handler: async (_req: Request, res: Response) => {
      res.status(200).json({ success: true, data: DEFAULT_PROMPTS });
    },
    requiresAuth: false,
  },
];
