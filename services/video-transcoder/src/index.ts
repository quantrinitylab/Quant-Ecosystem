import dotenv from 'dotenv';
import { VideoTranscoderWorker } from './worker.js';

dotenv.config();

export * from './ffmpeg.js';
export * from './uploader.js';
export * from './worker.js';

// If run directly as a daemon worker process
if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  const worker = new VideoTranscoderWorker();
  worker.start();

  const shutdown = async () => {
    console.log('[VideoTranscoder] Graceful shutdown...');
    await worker.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
