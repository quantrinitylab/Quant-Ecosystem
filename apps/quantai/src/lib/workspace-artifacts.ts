export type WorkFormat = 'document' | 'slides' | 'sheet';

export interface WorkArtifact {
  id: string;
  format: WorkFormat;
  title: string;
  content: string;
  updatedAt: string;
}

export interface MarkdownTable {
  headers: string[];
  rows: string[][];
}

function parseMarkdownRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map((cell) => cell.replace(/\\\|/g, '|').trim());
}

export function parseMarkdownTable(content: string): MarkdownTable | null {
  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length - 1; index += 1) {
    const headerLine = lines[index].trim();
    const separatorLine = lines[index + 1].trim();
    if (
      !headerLine.includes('|') ||
      !separatorLine.includes('|') ||
      !/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(separatorLine)
    ) {
      continue;
    }

    const headers = parseMarkdownRow(headerLine);
    if (headers.length === 0) return null;
    const rows: string[][] = [];
    for (let rowIndex = index + 2; rowIndex < lines.length; rowIndex += 1) {
      const rowLine = lines[rowIndex].trim();
      if (!rowLine.includes('|')) break;
      const row = parseMarkdownRow(rowLine);
      rows.push(headers.map((_, cellIndex) => row[cellIndex] ?? ''));
    }
    return { headers, rows };
  }
  return null;
}

export interface WorkSlide {
  title: string;
  content: string;
}

export function splitMarkdownSlides(content: string): WorkSlide[] {
  const headings = [...content.matchAll(/^#{1,3}\s+(.+)$/gm)];
  if (headings.length > 0) {
    return headings.map((heading, index) => {
      const start = heading.index! + heading[0].length;
      const end = headings[index + 1]?.index ?? content.length;
      return {
        title: heading[1].trim(),
        content: content.slice(start, end).trim(),
      };
    });
  }

  const paragraphs = content
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return [];

  const slides: WorkSlide[] = [];
  for (let index = 0; index < paragraphs.length; index += 3) {
    slides.push({
      title: `Slide ${slides.length + 1}`,
      content: paragraphs.slice(index, index + 3).join('\n\n'),
    });
  }
  return slides;
}

export function buildWorkPrompt(format: WorkFormat, request: string): string {
  const formatInstructions: Record<WorkFormat, string> = {
    document:
      'Create a polished working document in Markdown. Use a clear title, concise sections, and actionable details. Do not claim the document was saved or exported.',
    slides:
      'Create a presentation outline in Markdown. Use one level-two heading per slide in the exact form "## Slide N — Title", followed by concise bullets and speaker notes when useful. Do not claim a slide file was generated.',
    sheet:
      'Create a spreadsheet-ready response in Markdown. Put the primary data in a Markdown table with a header row, one row per record, and consistent columns. State assumptions and units; do not invent missing source data.',
  };

  return `[Work format: ${format}]\n${formatInstructions[format]}\n\nRequest:\n${request.trim()}`;
}

export function getWorkArtifactTitle(format: WorkFormat, content: string): string {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading) return heading;
  const firstLine = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (firstLine) return firstLine.replace(/^#{1,6}\s+/, '').slice(0, 72);
  return format === 'slides'
    ? 'Untitled presentation'
    : format === 'sheet'
      ? 'Untitled sheet'
      : 'Untitled document';
}
