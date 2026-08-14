'use client';

import { useCallback, useState } from 'react';
import { Button, ErrorState, Skeleton } from '@quant/shared-ui';
import { AppShell } from '../../components/AppShell';
import { AppSidebar } from '../../components/AppSidebar';
import { showToast } from '../../components/InboxToast';
import { useCreateLabel, useDeleteLabel, useLabels, useUpdateLabel } from '../../hooks/useLabels';
import type { EmailLabel } from '../../types';

const PRESET_COLORS = [
  '#ff9933', '#ff5e62', '#e64980', '#8b5cf6', '#3b82f6',
  '#06b6d4', '#10b981', '#eab308', '#14b8a6', '#6b7280',
];

function RowIcon({ name }: { name: 'pencil' | 'trash' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === 'pencil' ? (
        <>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z" />
        </>
      ) : (
        <path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6" />
      )}
    </svg>
  );
}

function ColorGrid({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div className="labels-color-grid" role="radiogroup" aria-label="Label colour">
      {PRESET_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={`Use colour ${color}`}
          style={{ backgroundColor: color }}
          className={value === color ? 'is-selected' : ''}
          onClick={() => onChange(color)}
        />
      ))}
    </div>
  );
}

function LabelRow({ label }: { label: EmailLabel }) {
  const updateLabel = useUpdateLabel();
  const deleteLabel = useDeleteLabel();
  const [isEditing, setIsEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [draftName, setDraftName] = useState(label.name);
  const [draftColor, setDraftColor] = useState(label.color || PRESET_COLORS[0]);

  const startEditing = useCallback(() => {
    setDraftName(label.name);
    setDraftColor(label.color || PRESET_COLORS[0]);
    setConfirmingDelete(false);
    setIsEditing(true);
  }, [label.color, label.name]);

  const handleSave = useCallback(async () => {
    const name = draftName.trim();
    if (!name) return;
    try {
      await updateLabel.mutateAsync({ id: label.id, name, color: draftColor });
      showToast({ text: 'Label updated', type: 'success' });
      setIsEditing(false);
    } catch (err) {
      showToast({
        text: err instanceof Error ? err.message : 'Label could not be updated',
        type: 'error',
      });
    }
  }, [draftColor, draftName, label.id, updateLabel]);

  const handleDelete = useCallback(async () => {
    try {
      await deleteLabel.mutateAsync(label.id);
      showToast({ text: `Label \u201C${label.name}\u201D deleted`, type: 'info' });
    } catch (err) {
      showToast({
        text: err instanceof Error ? err.message : 'Label could not be deleted',
        type: 'error',
      });
    }
  }, [deleteLabel, label.id, label.name]);

  if (isEditing) {
    return (
      <div className="labels-row is-editing">
        <div className="labels-row-editor">
          <label className="sr-only" htmlFor={`label-name-${label.id}`}>
            Label name
          </label>
          <input
            id={`label-name-${label.id}`}
            type="text"
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void handleSave();
              if (event.key === 'Escape') setIsEditing(false);
            }}
            autoFocus
          />
          <ColorGrid value={draftColor} onChange={setDraftColor} />
          <div className="labels-actions">
            <Button variant="secondary" onClick={() => setIsEditing(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => void handleSave()}
              disabled={!draftName.trim() || updateLabel.isPending}
            >
              {updateLabel.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="labels-row">
      <span
        className="labels-row-dot"
        style={{ backgroundColor: label.color || '#6b7280' }}
        aria-hidden="true"
      />
      <span className="labels-row-name">{label.name}</span>
      {typeof label.unreadCount === 'number' && label.unreadCount > 0 && (
        <span className="labels-row-meta">{label.unreadCount} unread</span>
      )}
      <div className="labels-row-actions">
        <button
          type="button"
          className="icon-action"
          onClick={startEditing}
          aria-label={`Rename ${label.name}`}
          title="Rename or recolour"
        >
          <RowIcon name="pencil" />
        </button>
        {confirmingDelete ? (
          <div className="labels-confirm">
            <span>Delete?</span>
            <button type="button" onClick={() => void handleDelete()} disabled={deleteLabel.isPending}>
              {deleteLabel.isPending ? '…' : 'Yes'}
            </button>
            <button type="button" onClick={() => setConfirmingDelete(false)}>
              No
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="icon-action icon-action-danger"
            onClick={() => setConfirmingDelete(true)}
            aria-label={`Delete ${label.name}`}
            title="Delete"
          >
            <RowIcon name="trash" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function LabelsPage() {
  const { data: labels, isLoading, error, refetch } = useLabels();
  const createLabel = useCreateLabel();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);

  const handleCreate = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await createLabel.mutateAsync({ name, color: newColor });
      showToast({ text: `Label \u201C${name}\u201D created`, type: 'success' });
      setNewName('');
      setNewColor(PRESET_COLORS[0]);
      setShowCreate(false);
    } catch (err) {
      showToast({
        text: err instanceof Error ? err.message : 'Label could not be created',
        type: 'error',
      });
    }
  }, [createLabel, newColor, newName]);

  return (
    <AppShell
      sidebar={<AppSidebar />}
      theme="dark"
      className="quantmail-shell"
      mobileTitle="Labels"
      aria-label="QuantMail labels"
    >
      <div className="labels-page">
        <header className="labels-header">
          <div>
            <h1>Labels</h1>
            <p>
              {labels && labels.length > 0
                ? `${labels.length} label${labels.length === 1 ? '' : 's'} — rename, recolour, or remove them anytime.`
                : 'Create labels to organise mail your way.'}
            </p>
          </div>
          <Button variant="primary" onClick={() => setShowCreate((value) => !value)}>
            {showCreate ? 'Close' : 'New label'}
          </Button>
        </header>

        {showCreate && (
          <div className="labels-card">
            <label className="sr-only" htmlFor="new-label-name">
              Label name
            </label>
            <input
              id="new-label-name"
              type="text"
              placeholder="Label name — e.g. Clients, Receipts, Travel"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void handleCreate();
                if (event.key === 'Escape') setShowCreate(false);
              }}
              autoFocus
            />
            <ColorGrid value={newColor} onChange={setNewColor} />
            <div className="labels-actions">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowCreate(false);
                  setNewName('');
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => void handleCreate()}
                disabled={!newName.trim() || createLabel.isPending}
              >
                {createLabel.isPending ? 'Creating…' : 'Create label'}
              </Button>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="labels-list" aria-busy="true">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} variant="rect" width="100%" height="58px" />
            ))}
          </div>
        )}

        {error && <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />}

        {!isLoading && !error && labels && labels.length === 0 && !showCreate && (
          <div className="labels-empty">
            <h2>No labels yet</h2>
            <p>
              Labels group related mail — clients, receipts, travel — without moving anything out
              of your inbox.
            </p>
            <Button variant="primary" onClick={() => setShowCreate(true)}>
              Create your first label
            </Button>
          </div>
        )}

        {!isLoading && !error && labels && labels.length > 0 && (
          <div className="labels-list">
            {labels.map((label: EmailLabel) => (
              <LabelRow key={label.id} label={label} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
