// ============================================================================
// QuantAI - Translation API Routes
// ============================================================================

import { Router } from '@quant/server';
import { TranslateController } from '../controllers/translate-controller';

const router = new Router();
const controller = new TranslateController();

router.register('POST', '/api/translate', controller.translate.bind(controller));
router.register('POST', '/api/translate/detect', controller.detectLanguage.bind(controller));
router.register('POST', '/api/translate/conversation', controller.translateConversation.bind(controller));
router.register('POST', '/api/translate/ocr', controller.ocrTranslate.bind(controller));
router.register('POST', '/api/translate/batch', controller.batchTranslate.bind(controller));
router.register('GET', '/api/translate/history', controller.getHistory.bind(controller));
router.register('GET', '/api/translate/languages', controller.getLanguages.bind(controller));
router.register('GET', '/api/translate/conversation', controller.getConversation.bind(controller));
router.register('DELETE', '/api/translate/conversation', controller.clearConversation.bind(controller));

export default router;
