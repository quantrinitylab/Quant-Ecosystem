// ============================================================================
// QuantAI API - Device Control Routes
// Phone/laptop control, app automation, system commands
// ============================================================================

import type { Request, Response } from '../middleware';
import type { RouteDefinition } from '../../src/types';
import { deviceService } from '../services/device-service';

export const deviceControlRoutes: RouteDefinition[] = [
  {
    method: 'POST',
    path: '/api/devices',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      const device = deviceService.registerDevice(req.userId!, { name: body.name, type: body.type, os: body.os, osVersion: body.osVersion, screenResolution: body.screenResolution });
      res.status(201).json({ success: true, data: device });
    },
  },
  {
    method: 'GET',
    path: '/api/devices',
    handler: async (req: Request, res: Response) => {
      const devices = deviceService.listDevices(req.userId!);
      res.status(200).json({ success: true, data: devices });
    },
  },
  {
    method: 'GET',
    path: '/api/devices/:deviceId',
    handler: async (req: Request, res: Response) => {
      const device = deviceService.getDevice(req.params['deviceId']);
      if (!device) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Device not found' } }); return; }
      res.status(200).json({ success: true, data: device });
    },
  },
  {
    method: 'POST',
    path: '/api/devices/:deviceId/command',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      try {
        const result = await deviceService.executeCommand(req.params['deviceId'], { type: body.type, params: body.params || {} });
        res.status(200).json({ success: true, data: result });
      } catch (error: any) {
        res.status(400).json({ success: false, error: { code: 'COMMAND_FAILED', message: error.message } });
      }
    },
  },
  {
    method: 'GET',
    path: '/api/devices/:deviceId/screen',
    handler: async (req: Request, res: Response) => {
      const screen = deviceService.readScreen(req.params['deviceId']);
      if (!screen) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Device not found' } }); return; }
      res.status(200).json({ success: true, data: screen });
    },
  },
  {
    method: 'GET',
    path: '/api/devices/:deviceId/history',
    handler: async (req: Request, res: Response) => {
      const limit = Number(req.query['limit']) || 50;
      const history = deviceService.getCommandHistory(req.params['deviceId'], limit);
      res.status(200).json({ success: true, data: history });
    },
  },
  {
    method: 'PUT',
    path: '/api/devices/:deviceId/status',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      const updated = deviceService.updateDeviceStatus(req.params['deviceId'], body.status);
      if (!updated) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Device not found' } }); return; }
      res.status(200).json({ success: true, message: 'Status updated' });
    },
  },
  {
    method: 'DELETE',
    path: '/api/devices/:deviceId',
    handler: async (req: Request, res: Response) => {
      deviceService.removeDevice(req.params['deviceId']);
      res.status(200).json({ success: true, message: 'Device removed' });
    },
  },
];
