export interface BeatMarker {
  timestampMs: number;
  energy: number; // 0.0 to 1.0
  isDrop: boolean;
}

export interface WaveformAnalysisResult {
  id: string;
  audioTrackId: string;
  durationSeconds: number;
  barCount: number;
  amplitudeBars: number[]; // Array of normalized values (0.0 to 1.0)
  estimatedBpm: number;
  beatMarkers: BeatMarker[];
  dropCount: number;
}

export class AudioWaveformBeatsService {
  public generateWaveformBars(audioSamples: number[], targetBarCount: number = 64): number[] {
    const barCount = Math.min(Math.max(targetBarCount, 1), 256);
    if (!audioSamples || audioSamples.length === 0) {
      return Array(barCount).fill(0.05);
    }

    const bucketSize = Math.max(Math.floor(audioSamples.length / barCount), 1);
    const bars: number[] = [];

    let maxRms = 0;
    const rawRms: number[] = [];

    for (let i = 0; i < barCount; i++) {
      const startIndex = i * bucketSize;
      let sumSquares = 0;
      let actualSize = 0;
      for (let j = 0; j < bucketSize && startIndex + j < audioSamples.length; j++) {
        sumSquares += audioSamples[startIndex + j] ** 2;
        actualSize++;
      }

      const rms = actualSize > 0 ? Math.sqrt(sumSquares / actualSize) : 0;
      rawRms.push(rms);
      if (rms > maxRms) {
        maxRms = rms;
      }
    }

    return rawRms.map((rms) => {
      let normalized = maxRms > 0 ? rms / maxRms : 0;
      normalized = Math.max(normalized, 0.05); // min aesthetic height
      normalized = Math.min(normalized, 1.0);
      return normalized;
    });
  }

  public detectTempoAndBeats(
    durationSeconds: number,
    energySamples: number[],
    bpmHint?: number,
  ): { bpm: number; markers: BeatMarker[] } {
    let bpm = bpmHint !== undefined ? bpmHint : 120;
    bpm = Math.max(60, Math.min(bpm, 200));

    const markers: BeatMarker[] = [];
    const msPerBeat = (60 / bpm) * 1000;
    const totalMs = durationSeconds * 1000;

    let currentTime = 0;
    let sampleIndex = 0;
    const maxIndex = energySamples.length > 0 ? energySamples.length - 1 : 0;

    while (currentTime <= totalMs) {
      const progress = totalMs > 0 ? currentTime / totalMs : 0;
      const targetSampleIndex = Math.floor(progress * maxIndex);
      const energy = energySamples.length > 0 ? energySamples[targetSampleIndex] : 0;

      const isDrop = energy >= 0.8;

      markers.push({
        timestampMs: currentTime,
        energy,
        isDrop,
      });

      currentTime += msPerBeat;
    }

    return { bpm, markers };
  }

  public analyzeAudioTrack(
    trackId: string,
    durationSeconds: number,
    rawSamples: number[],
    targetBarCount: number = 64,
  ): WaveformAnalysisResult {
    const amplitudeBars = this.generateWaveformBars(rawSamples, targetBarCount);

    // We'll use the amplitudeBars as energy samples to detect tempo and beats
    const { bpm, markers } = this.detectTempoAndBeats(durationSeconds, amplitudeBars);

    const dropCount = markers.filter((m) => m.isDrop).length;

    return {
      id: `waveform-${trackId}-${Date.now()}`,
      audioTrackId: trackId,
      durationSeconds,
      barCount: amplitudeBars.length,
      amplitudeBars,
      estimatedBpm: bpm,
      beatMarkers: markers,
      dropCount,
    };
  }

  public getNearestBeatMarker(currentTimeMs: number, markers: BeatMarker[]): BeatMarker | null {
    if (!markers || markers.length === 0) {
      return null;
    }

    let nearest = markers[0];
    let minDiff = Math.abs(nearest.timestampMs - currentTimeMs);

    for (let i = 1; i < markers.length; i++) {
      const diff = Math.abs(markers[i].timestampMs - currentTimeMs);
      if (diff < minDiff) {
        minDiff = diff;
        nearest = markers[i];
      }
    }

    return nearest;
  }
}

export const audioWaveformBeatsService = new AudioWaveformBeatsService();
