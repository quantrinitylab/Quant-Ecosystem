import { z } from 'zod';

const TrackerDetailSchema = z.object({
  type: z.enum(['pixel', 'tracker_domain', 'invisible_iframe', 'redirect_link']),
  url: z.string(),
  domain: z.string().optional(),
});

export const TrackerReportSchema = z.object({
  trackersFound: z.number(),
  trackerDetails: z.array(TrackerDetailSchema),
  cleanedHtml: z.string(),
});

export type TrackerReport = z.infer<typeof TrackerReportSchema>;
export type TrackerDetail = z.infer<typeof TrackerDetailSchema>;

const KNOWN_TRACKER_DOMAINS = [
  'mailtrack.io',
  'sendgrid.net',
  'mailchimp.com',
  'list-manage.com',
  'tracking.',
  'pixel.',
  'open.',
  'click.',
  'trk.',
  'tr.',
  'beacon.',
  'doubleclick.net',
  'google-analytics.com',
  'facebook.com/tr',
];

export class TrackingPixelStripperService {
  stripTrackers(htmlBody: string): { cleanedHtml: string; trackersRemoved: number } {
    const report = this.detectTrackers(htmlBody);
    return {
      cleanedHtml: report.cleanedHtml,
      trackersRemoved: report.trackersFound,
    };
  }

  detectTrackers(htmlBody: string): TrackerReport {
    const trackerDetails: TrackerDetail[] = [];
    let cleanedHtml = htmlBody;

    // Detect and remove 1x1 pixel images
    const pixelRegex =
      /<img[^>]*(?:width\s*=\s*["']?1["']?\s*height\s*=\s*["']?1["']?|height\s*=\s*["']?1["']?\s*width\s*=\s*["']?1["']?)[^>]*>/gi;
    const pixelMatches: string[] = Array.from(htmlBody.match(pixelRegex) ?? []);
    for (const match of pixelMatches) {
      const urlMatch = match.match(/src\s*=\s*["']([^"']+)["']/i);
      const url = urlMatch ? urlMatch[1] : 'unknown';
      trackerDetails.push({
        type: 'pixel',
        url,
        domain: this.extractDomain(url),
      });
      cleanedHtml = cleanedHtml.replace(match, '');
    }

    // Detect images from known tracker domains
    const imgRegex = /<img[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/gi;
    let imgMatch: RegExpExecArray | null;
    while ((imgMatch = imgRegex.exec(htmlBody)) !== null) {
      const url = imgMatch[1];
      if (this.isTrackerDomain(url) && !pixelMatches.includes(imgMatch[0])) {
        trackerDetails.push({
          type: 'tracker_domain',
          url,
          domain: this.extractDomain(url),
        });
        cleanedHtml = cleanedHtml.replace(imgMatch[0], '');
      }
    }

    // Detect invisible iframes (0 width/height or hidden)
    const iframeRegex =
      /<iframe[^>]*(?:width\s*=\s*["']?0["']?|height\s*=\s*["']?0["']?|style\s*=\s*["'][^"']*display\s*:\s*none[^"']*["']|style\s*=\s*["'][^"']*visibility\s*:\s*hidden[^"']*["'])[^>]*>[\s\S]*?<\/iframe>/gi;
    const iframeMatches = htmlBody.match(iframeRegex) || [];
    for (const match of iframeMatches) {
      const srcMatch = match.match(/src\s*=\s*["']([^"']+)["']/i);
      const url = srcMatch ? srcMatch[1] : 'unknown';
      trackerDetails.push({
        type: 'invisible_iframe',
        url,
        domain: this.extractDomain(url),
      });
      cleanedHtml = cleanedHtml.replace(match, '');
    }

    // Detect redirect/tracking links
    const linkRegex = /<a[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi;
    let linkMatch: RegExpExecArray | null;
    while ((linkMatch = linkRegex.exec(htmlBody)) !== null) {
      const url = linkMatch[1];
      if (this.isTrackerDomain(url)) {
        trackerDetails.push({
          type: 'redirect_link',
          url,
          domain: this.extractDomain(url),
        });
      }
    }

    return {
      trackersFound: trackerDetails.length,
      trackerDetails,
      cleanedHtml,
    };
  }

  getTrackerReport(htmlBody: string): TrackerReport {
    return this.detectTrackers(htmlBody);
  }

  private isTrackerDomain(url: string): boolean {
    const lowerUrl = url.toLowerCase();
    return KNOWN_TRACKER_DOMAINS.some((domain) => lowerUrl.includes(domain));
  }

  private extractDomain(url: string): string | undefined {
    try {
      if (url === 'unknown') return undefined;
      const parsed = new URL(url);
      return parsed.hostname;
    } catch {
      return undefined;
    }
  }
}
