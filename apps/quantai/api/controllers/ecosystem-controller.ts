// ============================================================================
// QuantAI - Ecosystem Controller
// ============================================================================

import { ecosystemService } from '../services/ecosystem-service';

export class EcosystemController {
  listApps() { return ecosystemService.listApps(); }
  getApp(id: string) { return ecosystemService.getApp(id); }
  updateConfig(id: string, config: Record<string, unknown>) { return ecosystemService.updateAppConfig(id, config); }
  toggleAI(id: string) { return ecosystemService.toggleAppAI(id); }
  setModel(id: string, modelId: string) { return ecosystemService.setAppModel(id, modelId); }
  getAnalytics() { return ecosystemService.getAnalytics(); }
  getAppAnalytics(id: string) { return ecosystemService.getAppAnalytics(id); }
  getPolicy() { return ecosystemService.getGlobalPolicy(); }
}

export const ecosystemController = new EcosystemController();
