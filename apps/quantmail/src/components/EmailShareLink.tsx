'use client';

import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { showToast } from './InboxToast';

interface EmailShareLinkProps {
  emailId: string;
  subject: string;
}

/**
 * Email Share Link — generate a shareable link to an email thread.
 * Gmail has no equivalent (you can only forward). We let you create a
 * time-limited shareable link for collaborators who need context.
 */
export function EmailShareLink({ emailId, subject }: EmailShareLinkProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [expiry, setExpiry] = useState<'1h' | '24h' | '7d' | '30d'>('24h');

  const generateLink = useCallback(() => {
    // In production, this calls the backend to generate a signed, time-limited URL
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://quantmail.in';
    const fakeLink = `${baseUrl}/shared/${emailId}?exp=${expiry}&sig=${Math.random().toString(36).slice(2, 10)}`;
    setLink(fakeLink);
  }, [emailId, expiry]);

  const copyLink = useCallback(() => {
    if (!link) return;
    navigator.clipboard
      .writeText(link)
      .then(() => {
        showToast({ text: 'Share link copied to clipboard', type: 'success' });
      })
      .catch(() => {
        showToast({ text: 'Failed to copy', type: 'error' });
      });
  }, [link]);

  return (
    <div className="email-share-link">
      <button type="button" className="share-link-trigger" onClick={() => setIsOpen((v) => !v)}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-4 h-4"
        >
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
        Share
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="share-link-panel"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
          >
            <h4 className="share-link-title">
              Share "{subject.slice(0, 30)}
              {subject.length > 30 ? '…' : ''}"
            </h4>
            <div className="share-link-expiry">
              <span>Expires in:</span>
              {(['1h', '24h', '7d', '30d'] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={expiry === opt ? 'is-active' : ''}
                  onClick={() => {
                    setExpiry(opt);
                    setLink(null);
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>
            {!link ? (
              <button type="button" className="share-link-generate" onClick={generateLink}>
                Generate link
              </button>
            ) : (
              <div className="share-link-result">
                <input type="text" readOnly value={link} className="share-link-input" />
                <button type="button" className="share-link-copy" onClick={copyLink}>
                  Copy
                </button>
              </div>
            )}
            <p className="share-link-note">
              Anyone with this link can view the email for the chosen duration.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
