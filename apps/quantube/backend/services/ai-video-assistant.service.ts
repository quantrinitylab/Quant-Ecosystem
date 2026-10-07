import type { AIEngine } from '@quant/ai';
import { z } from 'zod';

export const VideoMetaInputSchema = z.object({
  topic: z.string(),
  keywords: z.array(z.string()).optional(),
});

export const DescriptionInputSchema = z.object({
  title: z.string(),
  transcript: z.string().optional(),
  includeTimestamps: z.boolean().optional(),
});

export type VideoMetaInput = z.infer<typeof VideoMetaInputSchema>;
export type DescriptionInput = z.infer<typeof DescriptionInputSchema>;

export class AIVideoAssistantService {
  constructor(private readonly ai: AIEngine) {}

  async generateMetadata(
    input: VideoMetaInput,
    userId: string,
  ): Promise<{ title: string; tags: string[] }> {
    const validated = VideoMetaInputSchema.parse(input);

    const keywordsHint = validated.keywords?.length
      ? `\n\nConsider these keywords: ${validated.keywords.join(', ')}`
      : '';

    const response = await this.ai.infer({
      prompt: `Generate an SEO-optimized YouTube video title and 5 relevant tags for a video about the following topic. Place the title on the first line and each tag on its own line prefixed with a hashtag.\n\nTopic: "${validated.topic}"${keywordsHint}`,
      systemPrompt:
        'You are an expert YouTube SEO strategist. Write compelling, click-worthy titles and highly relevant hashtag tags. Always put the title on the first line and each tag on its own line starting with #.',
      userId,
      app: 'quantube',
      feature: 'video-metadata',
      temperature: 0.7,
    });

    const lines = response.content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const title = lines[0] ?? validated.topic;

    const tags = lines
      .slice(1)
      .flatMap((line) =>
        line
          .replace(/^#/, '')
          .split(/[#,]+/)
          .map((t) => t.trim())
          .filter((t) => t.length > 0),
      )
      .slice(0, 5);

    return { title, tags };
  }

  async generateDescription(
    input: DescriptionInput,
    userId: string,
  ): Promise<{ description: string }> {
    const validated = DescriptionInputSchema.parse(input);

    const transcriptSection = validated.transcript
      ? `\n\nVideo Transcript:\n${validated.transcript}`
      : '';

    const timestampsInstruction = validated.includeTimestamps
      ? '\nInclude timestamp chapters in the description.'
      : '';

    const response = await this.ai.infer({
      prompt: `Write an engaging, SEO-friendly YouTube video description for a video titled "${validated.title}".${transcriptSection}${timestampsInstruction}\n\nWrite a compelling description that hooks viewers, summarizes the content, and includes relevant keywords naturally.`,
      systemPrompt:
        'You are an expert YouTube content writer. Write engaging, well-structured video descriptions that boost watch time and SEO. Use a natural, enthusiastic tone.',
      userId,
      app: 'quantube',
      feature: 'video-description',
      temperature: 0.7,
    });

    return { description: response.content };
  }
}
