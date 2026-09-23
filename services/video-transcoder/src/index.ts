import dotenv from 'dotenv';
import { VideoTranscoderWorker } from './worker.js';

dotenv.config();

const worker = new VideoTranscoderWorker();
worker.start();

const shutdown = async () => {
  console.log('[VideoTranscoder] Graceful shutdown...');
  await worker.stop();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
