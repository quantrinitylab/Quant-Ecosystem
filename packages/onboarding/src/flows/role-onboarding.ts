import type { OnboardingFlow, OnboardingRole, OnboardingStep } from '../types.js';

function createPersonalSteps(): OnboardingStep[] {
  return [
    {
      id: 'connect-email',
      title: 'Connect Email',
      description: 'Link your email account for seamless communication',
      status: 'active',
      required: true,
    },
    {
      id: 'upload-file',
      title: 'Upload a File',
      description: 'Try uploading a document to get started with storage',
      status: 'pending',
      required: false,
    },
    {
      id: 'create-doc',
      title: 'Create a Document',
      description: 'Create your first document to explore the editor',
      status: 'pending',
      required: false,
    },
    {
      id: 'setup-ai',
      title: 'Set Up AI Assistant',
      description: 'Configure your personal AI assistant preferences',
      status: 'pending',
      required: false,
    },
  ];
}

function createTeamAdminSteps(): OnboardingStep[] {
  return [
    {
      id: 'create-workspace',
      title: 'Create Workspace',
      description: 'Set up your team workspace',
      status: 'active',
      required: true,
    },
    {
      id: 'invite-team',
      title: 'Invite Team',
      description: 'Add team members to your workspace',
      status: 'pending',
      required: true,
    },
    {
      id: 'setup-permissions',
      title: 'Set Up Permissions',
      description: 'Configure roles and access levels',
      status: 'pending',
      required: true,
    },
    {
      id: 'choose-tools',
      title: 'Choose Tools',
      description: 'Select the apps and integrations for your team',
      status: 'pending',
      required: false,
    },
  ];
}

function createCreatorSteps(): OnboardingStep[] {
  return [
    {
      id: 'setup-profile',
      title: 'Set Up Profile',
      description: 'Create your public creator profile',
      status: 'active',
      required: true,
    },
    {
      id: 'upload-content',
      title: 'Upload Content',
      description: 'Upload your first piece of content',
      status: 'pending',
      required: true,
    },
    {
      id: 'configure-publishing',
      title: 'Configure Publishing',
      description: 'Set up your publishing preferences and schedule',
      status: 'pending',
      required: false,
    },
    {
      id: 'connect-monetization',
      title: 'Connect Monetization',
      description: 'Set up payment methods to start earning',
      status: 'pending',
      required: false,
    },
  ];
}

function createAdvertiserSteps(): OnboardingStep[] {
  return [
    {
      id: 'setup-business',
      title: 'Set Up Business',
      description: 'Add your business details and branding',
      status: 'active',
      required: true,
    },
    {
      id: 'create-campaign',
      title: 'Create Campaign',
      description: 'Create your first advertising campaign',
      status: 'pending',
      required: true,
    },
    {
      id: 'define-audience',
      title: 'Define Audience',
      description: 'Set up your target audience parameters',
      status: 'pending',
      required: true,
    },
    {
      id: 'set-budget',
      title: 'Set Budget',
      description: 'Configure your campaign budget and bidding strategy',
      status: 'pending',
      required: true,
    },
  ];
}

function createDeveloperSteps(): OnboardingStep[] {
  return [
    {
      id: 'connect-repo',
      title: 'Connect Repository',
      description: 'Link your code repository for CI/CD integration',
      status: 'active',
      required: true,
    },
    {
      id: 'setup-ci',
      title: 'Set Up CI/CD',
      description: 'Configure continuous integration and deployment',
      status: 'pending',
      required: false,
    },
    {
      id: 'configure-apis',
      title: 'Configure APIs',
      description: 'Set up API keys and access tokens',
      status: 'pending',
      required: true,
    },
    {
      id: 'create-agent',
      title: 'Create an Agent',
      description: 'Build your first AI agent using the platform SDK',
      status: 'pending',
      required: false,
    },
  ];
}

const roleStepFactories: Record<OnboardingRole, () => OnboardingStep[]> = {
  personal: createPersonalSteps,
  'team-admin': createTeamAdminSteps,
  creator: createCreatorSteps,
  advertiser: createAdvertiserSteps,
  developer: createDeveloperSteps,
};

export function createRoleOnboardingFlow(role: OnboardingRole): OnboardingFlow {
  const steps = roleStepFactories[role]();
  return {
    id: `role-onboarding-${role}-${Date.now()}`,
    role,
    steps,
    currentStepIndex: 0,
  };
}
