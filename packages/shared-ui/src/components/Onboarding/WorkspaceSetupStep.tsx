// ============================================================================
// Shared UI - Workspace Setup Step Component
// ============================================================================

import React from 'react';

export interface WorkspaceSetupStepProps {
  workspaceName?: string;
  onWorkspaceNameChange?: (name: string) => void;
  inviteEmails?: string;
  onInviteEmailsChange?: (emails: string) => void;
}

export const WorkspaceSetupStep: React.FC<WorkspaceSetupStepProps> = ({
  workspaceName = '',
  onWorkspaceNameChange,
  inviteEmails = '',
  onInviteEmailsChange,
}) => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Set up your workspace</h2>
        <p className="text-base text-gray-500">
          Create a workspace for your team and invite members.
        </p>
      </div>
      <div className="space-y-4 max-w-sm">
        <div>
          <label htmlFor="workspace-name" className="block text-sm font-medium text-gray-700 mb-1">
            Workspace name
          </label>
          <input
            id="workspace-name"
            type="text"
            value={workspaceName}
            onChange={(e) => onWorkspaceNameChange?.(e.target.value)}
            placeholder="My Team"
            className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            aria-label="Workspace name"
          />
        </div>
        <div>
          <label htmlFor="invite-emails" className="block text-sm font-medium text-gray-700 mb-1">
            Invite members (optional)
          </label>
          <textarea
            id="invite-emails"
            value={inviteEmails}
            onChange={(e) => onInviteEmailsChange?.(e.target.value)}
            placeholder="Enter email addresses, one per line"
            rows={3}
            className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
            aria-label="Invite members by email"
          />
        </div>
      </div>
    </div>
  );
};
