'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Collaborator {
  id: string;
  name: string;
  color: string;
  cursorLine: number;
  cursorCol: number;
  selection?: { startLine: number; endLine: number };
}

interface CollaborativeCursorProps {
  collaborators: Collaborator[];
  lineHeight: number;
}

const COLORS = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f7dc6f', '#bb8fce', '#85c1e9'];

/**
 * Collaborative Cursors — shows other people editing the same file in real-time.
 * Google Docs has this for text. We bring it to code editing.
 * Each collaborator gets a colored cursor + name label.
 */
export function CollaborativeCursor({ collaborators, lineHeight }: CollaborativeCursorProps) {
  return (
    <div className="collab-cursors" aria-hidden="true">
      <AnimatePresence>
        {collaborators.map((collab) => (
          <motion.div
            key={collab.id}
            className="collab-cursor"
            style={{
              top: (collab.cursorLine - 1) * lineHeight,
              left: collab.cursorCol * 7.2, // Approximate monospace char width
              borderColor: collab.color,
            }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
          >
            <div className="collab-cursor-line" style={{ backgroundColor: collab.color }} />
            <span className="collab-cursor-label" style={{ backgroundColor: collab.color }}>
              {collab.name}
            </span>
            {collab.selection && (
              <div
                className="collab-selection"
                style={{
                  backgroundColor: `${collab.color}20`,
                  top: 0,
                  height: (collab.selection.endLine - collab.selection.startLine + 1) * lineHeight,
                }}
              />
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/**
 * Presence indicator — shows who else is viewing/editing this file.
 */
export function CollaboratorPresence({ collaborators }: { collaborators: Collaborator[] }) {
  if (collaborators.length === 0) return null;

  return (
    <div className="collab-presence">
      {collaborators.slice(0, 5).map((collab) => (
        <span
          key={collab.id}
          className="collab-avatar"
          style={{ backgroundColor: collab.color }}
          title={`${collab.name} is editing`}
        >
          {collab.name[0].toUpperCase()}
        </span>
      ))}
      {collaborators.length > 5 && (
        <span className="collab-more">+{collaborators.length - 5}</span>
      )}
    </div>
  );
}
