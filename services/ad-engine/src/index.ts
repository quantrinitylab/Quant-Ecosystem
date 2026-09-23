import dotenv from 'dotenv';
import { CreatorRevShareWorker } from './rev-share-worker.js';

dotenv.config();

const worker = new CreatorRevShareWorker();
worker.start();

const shutdown = async () => {
  console.log('[AdEngine] Shutting down...');
  await worker.stop();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
