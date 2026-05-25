// ============================================================================
// QuantAI - Memory API Routes
// ============================================================================

import { Router } from '@quant/server';
import { MemoryController } from '../controllers/memory-controller';

const router = new Router();
const controller = new MemoryController();

router.register('GET', '/api/memory', controller.list.bind(controller));
router.register('POST', '/api/memory', controller.create.bind(controller));
router.register('GET', '/api/memory/search', controller.search.bind(controller));
router.register('GET', '/api/memory/stats', controller.stats.bind(controller));
router.register('PUT', '/api/memory/:id', controller.update.bind(controller));
router.register('DELETE', '/api/memory/:id', controller.delete.bind(controller));
router.register('PUT', '/api/memory/:id/privacy', controller.setPrivacy.bind(controller));
router.register('DELETE', '/api/memory/all', controller.clearAll.bind(controller));
router.register('POST', '/api/memory/import', controller.importMemories.bind(controller));
router.register('GET', '/api/memory/export', controller.exportMemories.bind(controller));

export default router;
