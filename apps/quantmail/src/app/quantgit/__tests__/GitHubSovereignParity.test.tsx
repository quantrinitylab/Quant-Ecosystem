import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BranchSelectorModal } from '../components/BranchSelectorModal';
import { CloneCodespacesMenu } from '../components/CloneCodespacesMenu';
import { RepoSidebarMetadata } from '../components/RepoSidebarMetadata';
import { MCPRegistryTab } from '../components/MCPRegistryTab';
import { CopilotFleetModeView } from '../components/CopilotFleetModeView';
import { DeveloperAppearanceSettings } from '../components/DeveloperAppearanceSettings';
import { NotificationsInbox } from '../components/NotificationsInbox';
import { CodeTab } from '../components/CodeTab';

describe('QuantGit 159-Screen GitHub Sovereign Parity Components', () => {
  describe('BranchSelectorModal (Screens 108–110)', () => {
    it('renders branch selector with branches and tags tabs', () => {
      const html = renderToStaticMarkup(
        <BranchSelectorModal
          isOpen={true}
          onClose={vi.fn()}
          currentBranch="main"
          branches={['main', 'feat/speech-telemetry', 'fix/ci-timeout']}
          tags={['v1.0.5', 'v1.0.0']}
          defaultBranch="main"
          onSelectBranch={vi.fn()}
          onSelectTag={vi.fn()}
        />,
      );

      expect(html).toContain('Switch branches/tags');
      expect(html).toContain('Find a branch...');
      expect(html).toContain('Branches (3)');
      expect(html).toContain('Tags (2)');
      expect(html).toContain('main');
      expect(html).toContain('default');
      expect(html).toContain('feat/speech-telemetry');
    });

    it('returns null when closed', () => {
      const html = renderToStaticMarkup(
        <BranchSelectorModal
          isOpen={false}
          onClose={vi.fn()}
          currentBranch="main"
          branches={['main']}
          tags={[]}
          onSelectBranch={vi.fn()}
          onSelectTag={vi.fn()}
        />,
      );

      expect(html).toBe('');
    });
  });

  describe('CloneCodespacesMenu (Screens 111–114)', () => {
    it('renders local clone protocols and codespaces launcher', () => {
      const html = renderToStaticMarkup(
        <CloneCodespacesMenu
          isOpen={true}
          onClose={vi.fn()}
          repoOwner="quantrinitylab"
          repoName="Quant-Ecosystem"
          currentBranch="main"
        />,
      );

      expect(html).toContain('Clone');
      expect(html).toContain('Codespaces');
      expect(html).toContain('HTTPS');
      expect(html).toContain('SSH');
      expect(html).toContain('GitHub CLI');
      expect(html).toContain('Quant CLI');
      expect(html).toContain('Sovereign @quant/cli');
      expect(html).toContain('quant repo clone quantrinitylab/Quant-Ecosystem');
      expect(html).toContain('1-Click Copy');
      expect(html).toContain('https://quantmail.in/git/quantrinitylab/Quant-Ecosystem.git');
      expect(html).toContain('Download ZIP');
      expect(html).toContain('Open in Quant Copilot App');
    });

    it('renders 1-click sovereign quant repo clone terminal copy command and feedback', () => {
      const html = renderToStaticMarkup(
        <CloneCodespacesMenu
          isOpen={true}
          onClose={vi.fn()}
          repoOwner="quantrinitylab"
          repoName="Quant-Ecosystem"
          currentBranch="main"
        />,
      );

      expect(html).toContain('quant repo clone quantrinitylab/Quant-Ecosystem');
      expect(html).toContain('1-Click Copy');
      expect(html).toContain('Sovereign @quant/cli');
    });
  });

  describe('RepoSidebarMetadata (Screens 15–17, 116–125)', () => {
    it('renders star toggle, releases, contributors, and language distribution', () => {
      const html = renderToStaticMarkup(
        <RepoSidebarMetadata
          repoOwner="quantrinitylab"
          repoName="Quant-Ecosystem"
          description="Sovereign AI Operating System"
          websiteUrl="https://quantmail.in"
          topics={['web-platform', 'enterprise', 'high-performance']}
          starsCount={111000}
          forksCount={5200}
          watchersCount={146}
          releasesCount={28144}
          latestReleaseTag="v1.0.5"
          latestReleaseTime="12 hours ago"
          usedByCount="110K"
          contributorsCount={8}
          languages={[
            { name: 'TypeScript', percentage: 83.9, color: '#3178c6' },
            { name: 'MDX', percentage: 15.6, color: '#fcb32c' },
            { name: 'JavaScript', percentage: 0.5, color: '#f7df1e' },
          ]}
        />,
      );

      expect(html).toContain('About');
      expect(html).toContain('Sovereign AI Operating System');
      expect(html).toContain('quantmail.in');
      expect(html).toContain('web-platform');
      expect(html).toContain('Releases');
      expect(html).toContain('28,144');
      expect(html).toContain('v1.0.5');
      expect(html).toContain('Used by');
      expect(html).toContain('110K');
      expect(html).toContain('Contributors');
      expect(html).toContain('Languages');
      expect(html).toContain('TypeScript');
      expect(html).toContain('83.9%');
    });
  });

  describe('MCPRegistryTab (Screens 59–60)', () => {
    it('renders official 288+ server catalog and search', () => {
      const html = renderToStaticMarkup(<MCPRegistryTab />);

      expect(html).toContain('Connect models to the real world');
      expect(html).toContain('Search MCPs...');
      expect(html).toContain('Markitdown');
      expect(html).toContain('Chrome DevTools MCP');
      expect(html).toContain('Playwright');
      expect(html).toContain('GitHub');
    });
  });

  describe('CopilotFleetModeView (Screens 1–14, 135–142)', () => {
    it('renders Copilot cloud agent OS, models, and usage meter', () => {
      const html = renderToStaticMarkup(
        <CopilotFleetModeView repoOwner="quantrinitylab" repoName="Quant-Ecosystem" />,
      );

      expect(html).toContain('GitHub Copilot Fleet Mode');
      expect(html).toContain('Cloud Agents');
      expect(html).toContain('Claude Sonnet 4.5');
      expect(html).toContain('1 / 200 Credits');
      expect(html).toContain('Delegate tasks to Copilot cloud agents');
      expect(html).toContain('agent');
      expect(html).toContain('debug');
    });
  });

  describe('DeveloperAppearanceSettings (Screens 39–52, 81–84)', () => {
    it('renders theme preferences, markdown font, tab size, and feature previews', () => {
      const html = renderToStaticMarkup(<DeveloperAppearanceSettings />);

      expect(html).toContain('Appearance &amp; Accessibility');
      expect(html).toContain('Theme preferences');
      expect(html).toContain('Sync with system');
      expect(html).toContain('Use a fixed-width (monospace) font when editing Markdown');
      expect(html).toContain('Tab size preference');
      expect(html).toContain('Emoji skin tone preference');
      expect(html).toContain('Feature Preview');
      expect(html).toContain('Command Palette');
    });
  });

  describe('NotificationsInbox (Screens 22, 85–86, 145–146)', () => {
    it('renders Inbox, Saved, and Done tabs with notifications', () => {
      const html = renderToStaticMarkup(<NotificationsInbox />);

      expect(html).toContain('All notifications');
      expect(html).toContain('Inbox');
      expect(html).toContain('Saved');
      expect(html).toContain('Done');
      expect(html).toContain('Unread');
      expect(html).toContain('smart inbox categorization');
      expect(html).toContain('quantrinitylab / Quant-Ecosystem');
    });
  });

  describe('CodeTab & Sovereign Code Editor & File Creator', () => {
    it('renders Add file dropdown trigger and file explorer tree', () => {
      const mockRepo = {
        id: 'repo-1',
        name: 'Quant-Ecosystem',
        description: 'Test repo',
        defaultBranch: 'main',
      };
      const mockFiles = [
        { path: 'README.md', name: 'README.md', type: 'file', content: '# Hello Quant' },
        { path: 'src', name: 'src', type: 'dir' },
      ];
      const html = renderToStaticMarkup(
        <CodeTab
          selectedRepo={mockRepo as any}
          currentBranch="main"
          files={mockFiles as any}
          setModalState={vi.fn()}
          openBlobEditor={vi.fn()}
          showToast={vi.fn()}
        />,
      );

      expect(html).toContain('Add file');
      expect(html).toContain('README.md');
      expect(html).toContain('src');
      expect(html).toContain('Go to file');
    });
  });
});
