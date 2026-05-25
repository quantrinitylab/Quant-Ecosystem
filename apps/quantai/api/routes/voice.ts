// ============================================================================
// QuantAI - Voice API Routes
// ============================================================================

import { Router } from '@quant/server';
import { VoiceController } from '../controllers/voice-controller';

const router = new Router();
const controller = new VoiceController();

router.register('GET', '/api/voice/config', controller.getConfig.bind(controller));
router.register('PUT', '/api/voice/config', controller.updateConfig.bind(controller));
router.register('POST', '/api/voice/transcribe', controller.transcribe.bind(controller));
router.register('POST', '/api/voice/synthesize', controller.synthesize.bind(controller));
router.register('POST', '/api/voice/command', controller.parseCommand.bind(controller));
router.register('GET', '/api/voice/history', controller.getHistory.bind(controller));
router.register('GET', '/api/voice/voices', controller.listVoices.bind(controller));
router.register('GET', '/api/voice/voices/:id/preview', controller.previewVoice.bind(controller));

export default router;
