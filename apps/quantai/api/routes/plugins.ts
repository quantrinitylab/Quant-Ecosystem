// ============================================================================
// QuantAI API - Plugins Routes
// AI plugin system, third-party integrations, API marketplace
// ============================================================================

import type { Request, Response } from '../middleware';
import type { RouteDefinition, Plugin } from '../../src/types';

const plugins: Map<string, Plugin> = new Map();
const defaultPlugins: Plugin[] = [
  { id: 'plugin_weather', name: 'Weather', description: 'Get real-time weather data', version: '1.0', author: 'QuantAI Team', category: 'utility', status: 'available', capabilities: ['weather-forecast', 'location-based'], config: {}, installCount: 15000, rating: 4.5 },
  { id: 'plugin_translate', name: 'Translator', description: 'Real-time language translation', version: '2.0', author: 'QuantAI Team', category: 'language', status: 'available', capabilities: ['text-translation', 'audio-translation'], config: {}, installCount: 25000, rating: 4.7 },
  { id: 'plugin_code_review', name: 'Code Reviewer', description: 'AI-powered code review and suggestions', version: '1.5', author: 'QuantDev', category: 'developer', status: 'available', capabilities: ['code-analysis', 'bug-detection'], config: {}, installCount: 8000, rating: 4.3 },
  { id: 'plugin_finance', name: 'Finance Tracker', description: 'Track expenses and investments', version: '1.0', author: 'QuantFin', category: 'finance', status: 'available', capabilities: ['expense-tracking', 'investment-analysis'], config: {}, installCount: 12000, rating: 4.4 },
  { id: 'plugin_health', name: 'Health Assistant', description: 'Health tracking and wellness tips', version: '1.2', author: 'QuantHealth', category: 'health', status: 'available', capabilities: ['health-tracking', 'nutrition-advice'], config: {}, installCount: 18000, rating: 4.6 },
];
for (const p of defaultPlugins) plugins.set(p.id, p);

const userPlugins: Map<string, string[]> = new Map();

export const pluginRoutes: RouteDefinition[] = [
  { method: 'GET', path: '/api/plugins', handler: async (req: Request, res: Response) => { const { category } = req.query as any; let all = Array.from(plugins.values()); if (category) all = all.filter(p => p.category === category); res.status(200).json({ success: true, data: all }); }, requiresAuth: false },
  { method: 'GET', path: '/api/plugins/:id', handler: async (req: Request, res: Response) => { const plugin = plugins.get(req.params['id']); if (!plugin) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Plugin not found' } }); return; } res.status(200).json({ success: true, data: plugin }); }, requiresAuth: false },
  { method: 'POST', path: '/api/plugins/:id/install', handler: async (req: Request, res: Response) => { const plugin = plugins.get(req.params['id']); if (!plugin) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Plugin not found' } }); return; } const installed = userPlugins.get(req.userId!) || []; installed.push(plugin.id); userPlugins.set(req.userId!, installed); plugin.installCount++; res.status(200).json({ success: true, message: 'Plugin installed' }); } },
  { method: 'DELETE', path: '/api/plugins/:id/uninstall', handler: async (req: Request, res: Response) => { const installed = userPlugins.get(req.userId!) || []; const idx = installed.indexOf(req.params['id']); if (idx !== -1) installed.splice(idx, 1); res.status(200).json({ success: true, message: 'Plugin uninstalled' }); } },
  { method: 'GET', path: '/api/plugins/user/installed', handler: async (req: Request, res: Response) => { const installed = userPlugins.get(req.userId!) || []; const userPluginList = installed.map(id => plugins.get(id)).filter(Boolean); res.status(200).json({ success: true, data: userPluginList }); } },
];
