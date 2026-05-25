// ============================================================================
// QuantAI - Personas API Routes
// ============================================================================

import { Router } from '@quant/server';
import { PersonasController } from '../controllers/personas-controller';

const router = new Router();
const controller = new PersonasController();

router.register('GET', '/api/personas', controller.list.bind(controller));
router.register('POST', '/api/personas', controller.create.bind(controller));
router.register('GET', '/api/personas/:id', controller.get.bind(controller));
router.register('PUT', '/api/personas/:id', controller.update.bind(controller));
router.register('DELETE', '/api/personas/:id', controller.delete.bind(controller));
router.register('POST', '/api/personas/:id/chat', controller.chat.bind(controller));
router.register('POST', '/api/personas/:id/knowledge', controller.uploadKnowledge.bind(controller));
router.register('PUT', '/api/personas/:id/share', controller.toggleShare.bind(controller));

export default router;
