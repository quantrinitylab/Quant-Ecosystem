export interface NormalizedBoundingBox {
  x: number; // 0.0 to 1.0
  y: number; // 0.0 to 1.0
  width: number; // 0.0 to 1.0
  height: number; // 0.0 to 1.0
}
export interface DetectedObject {
  label: string;
  confidence: number; // 0.0 to 1.0
  boundingBox: NormalizedBoundingBox;
}
export interface OcrWordToken {
  text: string;
  confidence: number;
  boundingBox: NormalizedBoundingBox;
}
export interface OcrLineBlock {
  text: string;
  words: OcrWordToken[];
  boundingBox: NormalizedBoundingBox;
}
export interface VisionAnalysisResult {
  id: string;
  imageUrl: string;
  sceneCaption: string;
  detectedObjects: DetectedObject[];
  extractedText: string;
  ocrBlocks: OcrLineBlock[];
  detectedLanguage?: string;
  processingTimeMs: number;
  analyzedAt: string;
}

export function calculateIoU(box1: NormalizedBoundingBox, box2: NormalizedBoundingBox): number {
  const x1_1 = box1.x;
  const y1_1 = box1.y;
  const x2_1 = box1.x + box1.width;
  const y2_1 = box1.y + box1.height;

  const x1_2 = box2.x;
  const y1_2 = box2.y;
  const x2_2 = box2.x + box2.width;
  const y2_2 = box2.y + box2.height;

  const intersectionX1 = Math.max(x1_1, x1_2);
  const intersectionY1 = Math.max(y1_1, y1_2);
  const intersectionX2 = Math.min(x2_1, x2_2);
  const intersectionY2 = Math.min(y2_1, y2_2);

  const intersectionArea =
    Math.max(0, intersectionX2 - intersectionX1) * Math.max(0, intersectionY2 - intersectionY1);

  const box1Area = box1.width * box1.height;
  const box2Area = box2.width * box2.height;

  const unionArea = box1Area + box2Area - intersectionArea;

  if (unionArea === 0) {
    return 0;
  }

  return intersectionArea / unionArea;
}

export function filterDetectionsByNms(
  detections: DetectedObject[],
  iouThreshold: number = 0.45,
): DetectedObject[] {
  const sortedDetections = [...detections].sort((a, b) => b.confidence - a.confidence);
  const keptDetections: DetectedObject[] = [];

  for (const detection of sortedDetections) {
    let keep = true;
    for (const keptDetection of keptDetections) {
      if (detection.label === keptDetection.label) {
        const iou = calculateIoU(detection.boundingBox, keptDetection.boundingBox);
        if (iou > iouThreshold) {
          keep = false;
          break;
        }
      }
    }
    if (keep) {
      keptDetections.push(detection);
    }
  }

  return keptDetections;
}

export function analyzeImageVision(
  imageUrl: string,
  options?: {
    detectObjects?: boolean;
    extractOcr?: boolean;
    languageHint?: string;
    minConfidence?: number;
  },
): VisionAnalysisResult {
  if (!imageUrl || typeof imageUrl !== 'string') {
    throw new Error('Invalid imageUrl');
  }

  const minConfidence = options?.minConfidence ?? 0.5;
  const detectObjects = options?.detectObjects ?? true;
  const extractOcr = options?.extractOcr ?? true;

  const mockObjects: DetectedObject[] = [
    { label: 'person', confidence: 0.9, boundingBox: { x: 0.1, y: 0.1, width: 0.3, height: 0.8 } },
    { label: 'laptop', confidence: 0.8, boundingBox: { x: 0.4, y: 0.5, width: 0.4, height: 0.4 } },
    { label: 'dog', confidence: 0.3, boundingBox: { x: 0.8, y: 0.8, width: 0.2, height: 0.2 } },
    {
      label: 'person',
      confidence: 0.85,
      boundingBox: { x: 0.15, y: 0.15, width: 0.3, height: 0.8 },
    },
  ];

  const mockOcrBlocks: OcrLineBlock[] = [
    {
      text: 'Hello World',
      boundingBox: { x: 0.1, y: 0.1, width: 0.2, height: 0.05 },
      words: [
        {
          text: 'Hello',
          confidence: 0.9,
          boundingBox: { x: 0.1, y: 0.1, width: 0.08, height: 0.05 },
        },
        {
          text: 'World',
          confidence: 0.85,
          boundingBox: { x: 0.19, y: 0.1, width: 0.11, height: 0.05 },
        },
      ],
    },
    {
      text: 'Low conf',
      boundingBox: { x: 0.5, y: 0.5, width: 0.1, height: 0.05 },
      words: [
        {
          text: 'Low',
          confidence: 0.4,
          boundingBox: { x: 0.5, y: 0.5, width: 0.05, height: 0.05 },
        },
        {
          text: 'conf',
          confidence: 0.45,
          boundingBox: { x: 0.55, y: 0.5, width: 0.05, height: 0.05 },
        },
      ],
    },
  ];

  let detectedObjects: DetectedObject[] = [];
  if (detectObjects) {
    const confidentObjects = mockObjects.filter((obj) => obj.confidence >= minConfidence);
    detectedObjects = filterDetectionsByNms(confidentObjects, 0.45);
  }

  let ocrBlocks: OcrLineBlock[] = [];
  if (extractOcr) {
    ocrBlocks = mockOcrBlocks
      .map((block) => {
        const confidentWords = block.words.filter((w) => w.confidence >= minConfidence);
        if (confidentWords.length === 0) return null;
        return {
          ...block,
          text: confidentWords.map((w) => w.text).join(' '),
          words: confidentWords,
        };
      })
      .filter(Boolean) as OcrLineBlock[];
  }

  const sceneCaption = `A scene containing ${detectedObjects.map((obj) => obj.label).join(', ')}`;
  const extractedText = ocrBlocks.map((block) => block.text).join('\n');

  return {
    id: `vision-${Date.now()}`,
    imageUrl,
    sceneCaption: detectedObjects.length > 0 ? sceneCaption : 'No objects detected.',
    detectedObjects,
    extractedText,
    ocrBlocks,
    detectedLanguage: options?.languageHint ?? 'en',
    processingTimeMs: Math.floor(Math.random() * 500) + 100,
    analyzedAt: new Date().toISOString(),
  };
}

export function clearVisionForTesting(): void {
  // Clear any internal state if needed
}
