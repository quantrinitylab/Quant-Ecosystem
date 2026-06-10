import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

export class VideoStreamService {
  private uploadDir = path.join(process.cwd(), 'uploads');
  private hlsDir = path.join(process.cwd(), 'hls');

  constructor() {
    if (!fs.existsSync(this.hlsDir)) {
      fs.mkdirSync(this.hlsDir, { recursive: true });
    }
  }

  async generateHLS(videoId: string, inputPath: string): Promise<string> {
    const outputDir = path.join(this.hlsDir, videoId);

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const masterPlaylist = path.join(outputDir, 'master.m3u8');

    // FFmpeg command for HLS generation with multiple bitrates
    const ffmpegArgs = [
      '-i',
      inputPath,
      '-c:v',
      'libx264',
      '-c:a',
      'aac',
      '-f',
      'hls',
      '-hls_time',
      '10',
      '-hls_list_size',
      '0',
      '-hls_segment_filename',
      path.join(outputDir, '%03d.ts'),
      masterPlaylist,
    ];

    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', ffmpegArgs);

      ffmpeg.stderr.on('data', (data) => {
        console.log(`FFmpeg: ${data}`);
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve(masterPlaylist);
        } else {
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });
    });
  }

  async getStreamUrl(videoId: string): Promise<string> {
    return `/hls/${videoId}/master.m3u8`;
  }
}
