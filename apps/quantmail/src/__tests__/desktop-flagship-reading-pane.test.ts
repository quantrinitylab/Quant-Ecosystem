// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'app');
const pageCode = readFileSync(join(appDir, 'page.tsx'), 'utf8');
const globalsCss = readFileSync(join(appDir, 'globals.css'), 'utf8');
const shellCss = readFileSync(join(appDir, 'shell.css'), 'utf8');

describe('Desktop Flagship Outlook Architecture Contract', () => {
  describe('RootPage default routing', () => {
    it('defaults to Flagship Inbox when view is not people', () => {
      expect(pageCode).toMatch(/searchParams\?\.get\('view'\)\s*!==\s*'people'/);
      expect(pageCode).toMatch(/<>\s*\{isInbox\s*\?\s*<InboxPageContent\s*\/>\s*:\s*<PeopleHome\s*\/>\}\s*<\/>/);
    });
  });

  describe('Desktop Split Reading Pane in page.tsx', () => {
    it('renders reading-pane with ConversationalThreadView variant="pane" on desktop', () => {
      expect(pageCode).toContain('ConversationalThreadView');
      expect(pageCode).toMatch(/variant="pane"/);
      expect(pageCode).toMatch(/<section[^>]*className=\{`reading-pane hidden lg:flex/);
    });

    it('renders the Outlook empty placeholder state with accurate copy and circle surface', () => {
      expect(pageCode).toContain('Select an item to read');
      expect(pageCode).toContain(
        'Click on any conversation in the list to view its contents, reply, or take actions.'
      );
      expect(pageCode).toMatch(/rounded-full size-16/);
      expect(pageCode).toMatch(/MailIcon\s+name="mail"/);
    });

    it('wires all thread actions correctly including mutations.trash, archive, unarchive, star', () => {
      expect(pageCode).toContain('mutations.trash(ids)');
      expect(pageCode).toContain('mutations.archive(ids)');
      expect(pageCode).toContain('mutations.unarchive(ids)');
      expect(pageCode).toContain('mutations.toggleStar(conversationIds(selectedThreadId))');
    });

    it('openEmail keeps selection in reading pane on desktop and only navigates on mobile <1024px', () => {
      expect(pageCode).toMatch(/useIsMobile\(1024\)/);
      expect(pageCode).toMatch(
        /const isMobileViewport = isMobile \|\| \(typeof window !== 'undefined' && window\.innerWidth < 1024\);/
      );
      expect(pageCode).toMatch(
        /if \(isMobileViewport && targetId && typeof window !== 'undefined'\)/
      );
    });
  });

  describe('CSS layout contract for side-by-side desktop pane', () => {
    it('sets inbox-workspace to flex-row and defines reading-pane flex in globals.css at min-width 1024px', () => {
      expect(globalsCss).toMatch(
        /@media\s*\(min-width:\s*1024px\)[\s\S]*?\.inbox-workspace\s*\{[^}]*flex-direction:\s*row/
      );
      expect(globalsCss).toMatch(
        /@media\s*\(min-width:\s*1024px\)[\s\S]*?\.inbox-list-pane\s*\{[^}]*width:\s*420px/
      );
      expect(globalsCss).toMatch(
        /@media\s*\(min-width:\s*1024px\)[\s\S]*?\.reading-pane\s*\{[^}]*flex:\s*1/
      );
    });

    it('preserves mobile single-pane contract in shell.css', () => {
      expect(shellCss).toMatch(/@media \(max-width: 899px\)/);
      expect(shellCss).toMatch(/\.reading-pane\s*\{\s*display:\s*none !important;/);
    });
  });
});
