import type { AppId, EmptyStateConfig, EmptyStateCTA } from './types.js';

type AppPersonality = EmptyStateConfig['personality'];

const APP_PERSONALITIES: Record<AppId, AppPersonality> = {
  'quant-chat': 'witty',
  'quant-mail': 'professional',
  'quant-edits': 'creative',
  'quant-drive': 'friendly',
  'quant-meet': 'motivating',
  'quant-calendar': 'professional',
  'quant-tasks': 'motivating',
  'quant-code': 'technical',
  'quant-social': 'friendly',
  'quant-ads': 'professional',
  'quant-pay': 'professional',
  'quant-photos': 'creative',
  'quant-mobile': 'friendly',
};

const APP_EMPTY_STATES: Record<
  AppId,
  { headline: string; description: string; ctas: EmptyStateCTA[] }
> = {
  'quant-chat': {
    headline: 'Crickets... but the good kind',
    description:
      'Your chat is empty but your potential is full. Start a conversation and watch the magic happen.',
    ctas: [
      { label: 'Start a Chat', action: 'create_chat', primary: true },
      { label: 'Browse Channels', action: 'browse_channels', primary: false },
    ],
  },
  'quant-mail': {
    headline: 'Inbox Zero Achieved',
    description:
      'Your inbox is clear and ready for business. Import your existing emails or compose a new message.',
    ctas: [
      { label: 'Compose Email', action: 'compose', primary: true },
      { label: 'Import Emails', action: 'import_emails', primary: false },
    ],
  },
  'quant-edits': {
    headline: 'A blank canvas awaits',
    description:
      'Every masterpiece starts with a blank page. Create your first document and let your ideas flow.',
    ctas: [
      { label: 'Create Document', action: 'create_doc', primary: true },
      { label: 'Use a Template', action: 'browse_templates', primary: false },
    ],
  },
  'quant-drive': {
    headline: 'Your digital home is ready',
    description:
      'Upload your files and keep everything organized in one place. Drag and drop to get started.',
    ctas: [
      { label: 'Upload Files', action: 'upload', primary: true },
      { label: 'Create Folder', action: 'create_folder', primary: false },
    ],
  },
  'quant-meet': {
    headline: 'Ready when you are',
    description:
      'Start a meeting instantly or schedule one for later. High-quality video with AI-powered notes included.',
    ctas: [
      { label: 'Start Meeting', action: 'start_meeting', primary: true },
      { label: 'Schedule Meeting', action: 'schedule_meeting', primary: false },
    ],
  },
  'quant-calendar': {
    headline: 'Your schedule is clear',
    description:
      'A fresh calendar means endless possibilities. Add your first event or import from another calendar.',
    ctas: [
      { label: 'Create Event', action: 'create_event', primary: true },
      { label: 'Import Calendar', action: 'import_calendar', primary: false },
    ],
  },
  'quant-tasks': {
    headline: 'Nothing to do? Let us fix that',
    description:
      'Add your first task and start conquering your goals. Every big achievement starts with a single step.',
    ctas: [
      { label: 'Add Task', action: 'add_task', primary: true },
      { label: 'Create Project', action: 'create_project', primary: false },
    ],
  },
  'quant-code': {
    headline: '// Ready to code',
    description:
      'Connect your repositories or start a new project. AI-powered code assistance is standing by.',
    ctas: [
      { label: 'Connect Repository', action: 'connect_repo', primary: true },
      { label: 'New Project', action: 'new_project', primary: false },
    ],
  },
  'quant-social': {
    headline: 'Your community awaits',
    description:
      'Connect with others, share updates, and build your network. Start by completing your profile.',
    ctas: [
      { label: 'Complete Profile', action: 'edit_profile', primary: true },
      { label: 'Find People', action: 'discover', primary: false },
    ],
  },
  'quant-ads': {
    headline: 'Your audience is waiting',
    description:
      'Create your first campaign and reach the right people. Smart targeting makes it easy.',
    ctas: [
      { label: 'Create Campaign', action: 'create_campaign', primary: true },
      { label: 'View Analytics', action: 'analytics', primary: false },
    ],
  },
  'quant-pay': {
    headline: 'Payments made simple',
    description:
      'Set up your payment methods and start transacting securely. Fast, simple, and safe.',
    ctas: [
      { label: 'Add Payment Method', action: 'add_payment', primary: true },
      { label: 'Send Money', action: 'send_money', primary: false },
    ],
  },
  'quant-photos': {
    headline: 'Capture the moment',
    description:
      'Upload your photos and let AI organize them beautifully. Your memories deserve a great home.',
    ctas: [
      { label: 'Upload Photos', action: 'upload_photos', primary: true },
      { label: 'Create Album', action: 'create_album', primary: false },
    ],
  },
  'quant-mobile': {
    headline: 'Quant in your pocket',
    description:
      'All your favorite Quant apps, right here. Explore and set up the ones you use most.',
    ctas: [
      { label: 'Explore Apps', action: 'explore_apps', primary: true },
      { label: 'Customize Home', action: 'customize', primary: false },
    ],
  },
};

export class EmptyStateManager {
  getEmptyState(appId: AppId): EmptyStateConfig {
    const data = APP_EMPTY_STATES[appId];
    return {
      appId,
      personality: APP_PERSONALITIES[appId],
      headline: data.headline,
      description: data.description,
      ctas: [...data.ctas],
    };
  }

  getPersonality(appId: AppId): AppPersonality {
    return APP_PERSONALITIES[appId];
  }

  getAllEmptyStates(): EmptyStateConfig[] {
    return (Object.keys(APP_EMPTY_STATES) as AppId[]).map((appId) => this.getEmptyState(appId));
  }

  getCTAs(appId: AppId): EmptyStateCTA[] {
    return [...(APP_EMPTY_STATES[appId]?.ctas ?? [])];
  }

  getPrimaryCTA(appId: AppId): EmptyStateCTA | null {
    const ctas = APP_EMPTY_STATES[appId]?.ctas ?? [];
    return ctas.find((c) => c.primary) ?? null;
  }
}

export function createEmptyStateManager(): EmptyStateManager {
  return new EmptyStateManager();
}

export function getAppPersonality(appId: AppId): AppPersonality {
  return APP_PERSONALITIES[appId];
}
