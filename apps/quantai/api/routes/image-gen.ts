// ============================================================================
// QuantAI - Image Generation API Routes
// ============================================================================

import { Router } from '@quant/server';
import { ImageGenController } from '../controllers/image-gen-controller';

const router = new Router();
const controller = new ImageGenController();

router.register('POST', '/api/images/generate', controller.generate.bind(controller));
router.register('POST', '/api/images/:id/variations', controller.variations.bind(controller));
router.register('POST', '/api/images/:id/upscale', controller.upscale.bind(controller));
router.register('POST', '/api/images/:id/inpaint', controller.inpaint.bind(controller));
router.register('GET', '/api/images', controller.list.bind(controller));
router.register('GET', '/api/images/:id', controller.get.bind(controller));
router.register('DELETE', '/api/images/:id', controller.delete.bind(controller));

export default router;
