// ============================================================================
// QuantAI - Models Controller
// ============================================================================

import { modelService } from '../services/model-service';

export class ModelsController {
  listModels(options?: any) { return modelService.listModels(options); }
  getModel(id: string) { return modelService.getModel(id); }
  compareModels(ids: string[]) { return modelService.compareModels(ids); }
  startTraining(userId: string, input: any) { return modelService.startTrainingJob(userId, input); }
  getTrainingJob(id: string) { return modelService.getTrainingJob(id); }
  listTrainingJobs(userId: string) { return modelService.listTrainingJobs(userId); }
  cancelTraining(id: string) { return modelService.cancelTrainingJob(id); }
}

export const modelsController = new ModelsController();
