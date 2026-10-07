import { describe, it, expect, beforeEach } from 'vitest';
import { TrackingPixelStripperService } from '../services/tracking-pixel-stripper.service';

describe('TrackingPixelStripperService', () => {
  let service: TrackingPixelStripperService;

  beforeEach(() => {
    service = new TrackingPixelStripperService();
  });

  describe('stripTrackers', () => {
    it('removes 1x1 pixel images', () => {
      const html = `
        <html><body>
          <p>Hello world</p>
          <img src="https://tracker.example.com/pixel.gif" width="1" height="1" />
          <p>Content</p>
        </body></html>
      `;

      const result = service.stripTrackers(html);

      expect(result.trackersRemoved).toBeGreaterThan(0);
      expect(result.cleanedHtml).not.toContain('tracker.example.com');
      expect(result.cleanedHtml).toContain('Hello world');
      expect(result.cleanedHtml).toContain('Content');
    });

    it('removes images from known tracker domains', () => {
      const html = `
        <html><body>
          <p>Newsletter</p>
          <img src="https://open.mailtrack.io/track/abc123" alt="" />
          <img src="https://cdn.sendgrid.net/pixel/track.gif" />
        </body></html>
      `;

      const result = service.stripTrackers(html);

      expect(result.trackersRemoved).toBeGreaterThan(0);
      expect(result.cleanedHtml).not.toContain('mailtrack.io');
      expect(result.cleanedHtml).not.toContain('sendgrid.net');
      expect(result.cleanedHtml).toContain('Newsletter');
    });

    it('removes invisible iframes', () => {
      const html = `
        <html><body>
          <p>Email content</p>
          <iframe src="https://tracking.example.com/frame" width="0" height="0"></iframe>
          <p>More content</p>
        </body></html>
      `;

      const result = service.stripTrackers(html);

      expect(result.trackersRemoved).toBeGreaterThan(0);
      expect(result.cleanedHtml).not.toContain('<iframe');
      expect(result.cleanedHtml).toContain('Email content');
    });

    it('preserves legitimate images', () => {
      const html = `
        <html><body>
          <img src="https://example.com/photo.jpg" width="600" height="400" />
          <p>Some text</p>
        </body></html>
      `;

      const result = service.stripTrackers(html);

      expect(result.trackersRemoved).toBe(0);
      expect(result.cleanedHtml).toContain('example.com/photo.jpg');
    });

    it('handles HTML with no trackers', () => {
      const html = '<html><body><p>Plain text email</p></body></html>';
      const result = service.stripTrackers(html);

      expect(result.trackersRemoved).toBe(0);
      expect(result.cleanedHtml).toBe(html);
    });
  });

  describe('detectTrackers', () => {
    it('returns detailed tracker report', () => {
      const html = `
        <html><body>
          <img src="https://pixel.mailchimp.com/open.gif" width="1" height="1" />
          <img src="https://click.list-manage.com/track/click" />
          <iframe src="https://beacon.doubleclick.net/frame" style="display:none"></iframe>
        </body></html>
      `;

      const report = service.detectTrackers(html);

      expect(report.trackersFound).toBeGreaterThanOrEqual(2);
      expect(report.trackerDetails.length).toBeGreaterThanOrEqual(2);
      expect(report.trackerDetails.some((t) => t.type === 'pixel')).toBe(true);
      expect(report.cleanedHtml).not.toContain('mailchimp.com');
    });

    it('identifies tracker types correctly', () => {
      const html = `
        <html><body>
          <img src="https://example.com/img.gif" width="1" height="1" />
          <a href="https://click.sendgrid.net/redirect">Click here</a>
        </body></html>
      `;

      const report = service.detectTrackers(html);

      const pixel = report.trackerDetails.find((t) => t.type === 'pixel');
      expect(pixel).toBeDefined();
      expect(pixel!.url).toContain('example.com/img.gif');

      const redirect = report.trackerDetails.find((t) => t.type === 'redirect_link');
      expect(redirect).toBeDefined();
      expect(redirect!.url).toContain('sendgrid.net');
    });
  });

  describe('getTrackerReport', () => {
    it('returns same result as detectTrackers', () => {
      const html = `
        <html><body>
          <img src="https://tracking.example.com/pixel.gif" width="1" height="1" />
        </body></html>
      `;

      const report = service.getTrackerReport(html);
      const detected = service.detectTrackers(html);

      expect(report.trackersFound).toBe(detected.trackersFound);
      expect(report.trackerDetails).toEqual(detected.trackerDetails);
      expect(report.cleanedHtml).toBe(detected.cleanedHtml);
    });
  });
});
