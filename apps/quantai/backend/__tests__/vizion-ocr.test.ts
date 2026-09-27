import { describe, it, expect } from 'vitest';
import {
  analyzeImageVision,
  calculateIoU,
  filterDetectionsByNms,
  clearVisionForTesting,
  NormalizedBoundingBox,
  DetectedObject,
} from '../services/vision-ocr.service';

describe('Vizion OCR Service', () => {
  it('analyzeImageVision returns scene caption and detected objects', () => {
    const result = analyzeImageVision('http://example.com/image.jpg', { minConfidence: 0.5 });
    expect(result.imageUrl).toBe('http://example.com/image.jpg');
    expect(result.detectedObjects.length).toBeGreaterThan(0);
    expect(result.sceneCaption).toContain('person');
    expect(result.sceneCaption).toContain('laptop');
  });

  it('minConfidence filter excludes low-confidence objects', () => {
    const result = analyzeImageVision('http://example.com/image.jpg', { minConfidence: 0.95 });
    expect(result.detectedObjects).toHaveLength(0);
    expect(result.sceneCaption).toBe('No objects detected.');
  });

  it('OCR text extraction generates line blocks and concatenates full text', () => {
    const result = analyzeImageVision('http://example.com/image.jpg', {
      extractOcr: true,
      minConfidence: 0.5,
    });
    expect(result.ocrBlocks.length).toBeGreaterThan(0);
    expect(result.extractedText).toContain('Hello World');
    expect(result.extractedText).not.toContain('Low conf');
  });

  it('calculateIoU computes accurate intersection over union', () => {
    const box1: NormalizedBoundingBox = { x: 0, y: 0, width: 0.5, height: 0.5 };
    const box2: NormalizedBoundingBox = { x: 0, y: 0, width: 0.5, height: 0.5 };
    const box3: NormalizedBoundingBox = { x: 0.5, y: 0.5, width: 0.5, height: 0.5 };
    const box4: NormalizedBoundingBox = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };

    expect(calculateIoU(box1, box2)).toBeCloseTo(1.0);
    expect(calculateIoU(box1, box3)).toBeCloseTo(0.0);
    expect(calculateIoU(box1, box4)).toBeCloseTo(0.142857);
  });

  it('NMS suppression removes overlapping duplicate detections', () => {
    const detections: DetectedObject[] = [
      {
        label: 'person',
        confidence: 0.9,
        boundingBox: { x: 0.1, y: 0.1, width: 0.3, height: 0.8 },
      },
      {
        label: 'person',
        confidence: 0.85,
        boundingBox: { x: 0.15, y: 0.15, width: 0.3, height: 0.8 },
      },
      { label: 'car', confidence: 0.8, boundingBox: { x: 0.5, y: 0.5, width: 0.2, height: 0.2 } },
    ];

    const filtered = filterDetectionsByNms(detections, 0.45);
    expect(filtered).toHaveLength(2);
    expect(filtered.filter((d) => d.label === 'person')).toHaveLength(1);
    expect(filtered.filter((d) => d.label === 'car')).toHaveLength(1);
  });
});
