import type { ToolDefinition } from '../types.js';
import { mailTools } from './mail-tools.js';
import { chatTools } from './chat-tools.js';
import { calendarTools } from './calendar-tools.js';
import { docsTools } from './docs-tools.js';
import { driveTools } from './drive-tools.js';
import { meetTools } from './meet-tools.js';
import { neonTools } from './neon-tools.js';
import { syncTools } from './sync-tools.js';
import { tubeTools } from './tube-tools.js';
import { maxTools } from './max-tools.js';
import { editsTools } from './edits-tools.js';
import { adsTools } from './ads-tools.js';
import { mapsTools } from './maps-tools.js';
import { photosTools } from './photos-tools.js';
import { deviceTools } from './device-tools.js';
import { studioTools } from './studio-tools.js';
import { paymentsTools } from './payments-tools.js';

export const allTools: ToolDefinition[] = [
  ...mailTools,
  ...chatTools,
  ...calendarTools,
  ...docsTools,
  ...driveTools,
  ...meetTools,
  ...neonTools,
  ...syncTools,
  ...tubeTools,
  ...maxTools,
  ...editsTools,
  ...adsTools,
  ...mapsTools,
  ...photosTools,
  ...deviceTools,
  ...studioTools,
  ...paymentsTools,
];

export {
  mailTools,
  chatTools,
  calendarTools,
  docsTools,
  driveTools,
  meetTools,
  neonTools,
  syncTools,
  tubeTools,
  maxTools,
  editsTools,
  adsTools,
  mapsTools,
  photosTools,
  deviceTools,
  studioTools,
  paymentsTools,
};
