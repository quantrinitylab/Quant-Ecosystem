import type { AppId, TutorialOverlay, TutorialStep } from './types.js';

const APP_TUTORIALS: Record<AppId, TutorialStep[]> = {
  'quant-chat': [
    {
      id: 'chat-welcome',
      title: 'Welcome to QuantChat',
      content: 'Send your first message to get started.',
      position: 'center',
      allowDismiss: true,
    },
    {
      id: 'chat-channels',
      title: 'Channels',
      content: 'Browse and join channels to stay connected.',
      targetSelector: '#channels-list',
      position: 'right',
      highlightElement: true,
      allowDismiss: true,
    },
    {
      id: 'chat-ai',
      title: 'AI Assistant',
      content: 'Use the AI assistant for quick answers.',
      targetSelector: '#ai-button',
      position: 'bottom',
      highlightElement: true,
      allowDismiss: true,
    },
  ],
  'quant-mail': [
    {
      id: 'mail-welcome',
      title: 'Welcome to QuantMail',
      content: 'Your inbox, reimagined with AI-powered organization.',
      position: 'center',
      allowDismiss: true,
    },
    {
      id: 'mail-compose',
      title: 'Compose',
      content: 'Click here to compose a new email.',
      targetSelector: '#compose-btn',
      position: 'right',
      highlightElement: true,
      allowDismiss: true,
    },
    {
      id: 'mail-smart',
      title: 'Smart Categories',
      content: 'Emails are automatically categorized for you.',
      targetSelector: '#categories',
      position: 'left',
      highlightElement: true,
      allowDismiss: true,
    },
  ],
  'quant-edits': [
    {
      id: 'edits-welcome',
      title: 'Welcome to QuantEdits',
      content: 'Create beautiful documents with AI assistance.',
      position: 'center',
      allowDismiss: true,
    },
    {
      id: 'edits-new',
      title: 'New Document',
      content: 'Start with a blank doc or use a template.',
      targetSelector: '#new-doc',
      position: 'bottom',
      highlightElement: true,
      allowDismiss: true,
    },
    {
      id: 'edits-collab',
      title: 'Collaborate',
      content: 'Invite others to edit in real-time.',
      targetSelector: '#share-btn',
      position: 'left',
      highlightElement: true,
      allowDismiss: true,
    },
  ],
  'quant-drive': [
    {
      id: 'drive-welcome',
      title: 'Welcome to QuantDrive',
      content: 'Your files, organized and accessible anywhere.',
      position: 'center',
      allowDismiss: true,
    },
    {
      id: 'drive-upload',
      title: 'Upload',
      content: 'Drag and drop files here to upload.',
      targetSelector: '#upload-zone',
      position: 'bottom',
      highlightElement: true,
      allowDismiss: true,
    },
  ],
  'quant-meet': [
    {
      id: 'meet-welcome',
      title: 'Welcome to QuantMeet',
      content: 'High-quality video meetings with AI notes.',
      position: 'center',
      allowDismiss: true,
    },
    {
      id: 'meet-start',
      title: 'Start Meeting',
      content: 'Click to start or schedule a meeting.',
      targetSelector: '#start-meeting',
      position: 'bottom',
      highlightElement: true,
      allowDismiss: true,
    },
  ],
  'quant-calendar': [
    {
      id: 'cal-welcome',
      title: 'Welcome to QuantCalendar',
      content: 'Smart scheduling that works for you.',
      position: 'center',
      allowDismiss: true,
    },
    {
      id: 'cal-create',
      title: 'Create Event',
      content: 'Click any time slot to create an event.',
      targetSelector: '#calendar-grid',
      position: 'top',
      highlightElement: true,
      allowDismiss: true,
    },
  ],
  'quant-tasks': [
    {
      id: 'tasks-welcome',
      title: 'Welcome to QuantTasks',
      content: 'Track your work with smart task management.',
      position: 'center',
      allowDismiss: true,
    },
    {
      id: 'tasks-add',
      title: 'Add Task',
      content: 'Click to add your first task.',
      targetSelector: '#add-task',
      position: 'bottom',
      highlightElement: true,
      allowDismiss: true,
    },
  ],
  'quant-code': [
    {
      id: 'code-welcome',
      title: 'Welcome to QuantGit',
      content: 'Code with AI-powered assistance.',
      position: 'center',
      allowDismiss: true,
    },
    {
      id: 'code-repo',
      title: 'Repositories',
      content: 'Connect your repositories to get started.',
      targetSelector: '#repos-list',
      position: 'right',
      highlightElement: true,
      allowDismiss: true,
    },
  ],
  'quant-social': [
    {
      id: 'social-welcome',
      title: 'Welcome to QuantSocial',
      content: 'Connect with your community.',
      position: 'center',
      allowDismiss: true,
    },
    {
      id: 'social-profile',
      title: 'Your Profile',
      content: 'Complete your profile to connect with others.',
      targetSelector: '#profile-card',
      position: 'left',
      highlightElement: true,
      allowDismiss: true,
    },
  ],
  'quant-ads': [
    {
      id: 'ads-welcome',
      title: 'Welcome to QuantAds',
      content: 'Reach your audience with smart campaigns.',
      position: 'center',
      allowDismiss: true,
    },
    {
      id: 'ads-create',
      title: 'Create Campaign',
      content: 'Set up your first advertising campaign.',
      targetSelector: '#create-campaign',
      position: 'bottom',
      highlightElement: true,
      allowDismiss: true,
    },
  ],
  'quant-pay': [
    {
      id: 'pay-welcome',
      title: 'Welcome to QuantPay',
      content: 'Simple and secure payments.',
      position: 'center',
      allowDismiss: true,
    },
    {
      id: 'pay-setup',
      title: 'Payment Setup',
      content: 'Add a payment method to get started.',
      targetSelector: '#payment-setup',
      position: 'bottom',
      highlightElement: true,
      allowDismiss: true,
    },
  ],
  'quant-photos': [
    {
      id: 'photos-welcome',
      title: 'Welcome to QuantPhotos',
      content: 'Your memories, beautifully organized.',
      position: 'center',
      allowDismiss: true,
    },
    {
      id: 'photos-upload',
      title: 'Upload Photos',
      content: 'Upload your first photos to get started.',
      targetSelector: '#photo-upload',
      position: 'bottom',
      highlightElement: true,
      allowDismiss: true,
    },
  ],
  'quant-mobile': [
    {
      id: 'mobile-welcome',
      title: 'Welcome to Quant Mobile',
      content: 'All your Quant apps in one place.',
      position: 'center',
      allowDismiss: true,
    },
    {
      id: 'mobile-nav',
      title: 'Navigation',
      content: 'Swipe between apps using the bottom navigation.',
      targetSelector: '#bottom-nav',
      position: 'top',
      highlightElement: true,
      allowDismiss: true,
    },
  ],
};

export class TutorialEngine {
  private overlays: Map<string, TutorialOverlay> = new Map();

  createTutorial(appId: AppId): TutorialOverlay {
    const steps = APP_TUTORIALS[appId] ?? [];
    const overlay: TutorialOverlay = {
      id: `tutorial-${appId}-${Date.now()}`,
      appId,
      steps,
      currentStepIndex: 0,
      completed: false,
      dismissed: false,
      progress: steps.length > 0 ? 0 : 1,
    };
    this.overlays.set(overlay.id, overlay);
    return overlay;
  }

  advanceStep(tutorialId: string): TutorialOverlay | null {
    const overlay = this.overlays.get(tutorialId);
    if (!overlay || overlay.completed || overlay.dismissed) {
      return overlay ?? null;
    }

    const nextIndex = overlay.currentStepIndex + 1;
    if (nextIndex >= overlay.steps.length) {
      overlay.completed = true;
      overlay.progress = 1;
    } else {
      overlay.currentStepIndex = nextIndex;
      overlay.progress = nextIndex / overlay.steps.length;
    }

    return { ...overlay };
  }

  dismissTutorial(tutorialId: string): TutorialOverlay | null {
    const overlay = this.overlays.get(tutorialId);
    if (!overlay) return null;

    overlay.dismissed = true;
    return { ...overlay };
  }

  skipTutorial(tutorialId: string): TutorialOverlay | null {
    const overlay = this.overlays.get(tutorialId);
    if (!overlay) return null;

    overlay.dismissed = true;
    overlay.currentStepIndex = overlay.steps.length - 1;
    return { ...overlay };
  }

  getCurrentStep(tutorialId: string): TutorialStep | null {
    const overlay = this.overlays.get(tutorialId);
    if (!overlay || overlay.completed || overlay.dismissed) return null;
    return overlay.steps[overlay.currentStepIndex] ?? null;
  }

  getTutorial(tutorialId: string): TutorialOverlay | null {
    const overlay = this.overlays.get(tutorialId);
    return overlay ? { ...overlay } : null;
  }

  getProgress(tutorialId: string): number {
    const overlay = this.overlays.get(tutorialId);
    return overlay?.progress ?? 0;
  }

  getTutorialSteps(appId: AppId): TutorialStep[] {
    return [...(APP_TUTORIALS[appId] ?? [])];
  }
}

export function createTutorialEngine(): TutorialEngine {
  return new TutorialEngine();
}

export function getAppTutorialSteps(appId: AppId): TutorialStep[] {
  return [...(APP_TUTORIALS[appId] ?? [])];
}
