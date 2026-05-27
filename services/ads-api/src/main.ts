import { startHealthServer } from '@quant/health-server';
import { PrivacyEnforcerService } from '@quant/privacy-ads';

const port = Number(process.env['HEALTH_PORT'] ?? '3006');

// Validate privacy enforcement is available at startup
const enforcer = new PrivacyEnforcerService();
void enforcer.getStrictCSPDirectives();

void startHealthServer(port).then(() => {
  console.log(`ads-api health server listening on port ${port}`);
  console.log('Privacy-first ad enforcement: ACTIVE');
});
