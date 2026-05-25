// ============================================================================
// QuantAI - Code API Routes
// ============================================================================

import { Router } from '@quant/server';
import { CodeController } from '../controllers/code-controller';

const router = new Router();
const controller = new CodeController();

router.register('POST', '/api/code/execute', controller.execute.bind(controller));
router.register('POST', '/api/code/generate', controller.generate.bind(controller));
router.register('POST', '/api/code/explain', controller.explain.bind(controller));
router.register('POST', '/api/code/debug', controller.debug.bind(controller));
router.register('POST', '/api/code/autocomplete', controller.autocomplete.bind(controller));

export default router;
