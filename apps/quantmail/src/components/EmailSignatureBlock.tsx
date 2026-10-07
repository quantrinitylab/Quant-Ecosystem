'use client';

import { useMemo } from 'react';
import { useSafeEmailHtml } from '../lib/safe-html';

interface EmailSignatureBlockProps {
  signatureHtml: string;
  senderName?: string;
}

/**
 * Email signature block with smart rendering.
 * Gmail renders signatures inline as part of the message body.
 * We separate the signature visually with a subtle divider and collapse option,
 * keeping the email body clean and focused on content.
 */
export function EmailSignatureBlock({ signatureHtml, senderName }: EmailSignatureBlockProps) {
  // Signature markup comes from the sending client, so it gets the same
  // DOMPurify pass as the message body it was split out of.
  const safeHtml = useSafeEmailHtml(signatureHtml);

  const isSignature = useMemo(() => {
    if (!signatureHtml) return false;
    // Detect common signature patterns
    const lower = signatureHtml.toLowerCase();
    return (
      lower.includes('regards') ||
      lower.includes('best,') ||
      lower.includes('cheers') ||
      lower.includes('sincerely') ||
      lower.includes('sent from') ||
      lower.includes('--') ||
      lower.includes('phone:') ||
      lower.includes('mobile:')
    );
  }, [signatureHtml]);

  if (!safeHtml || !isSignature) return null;

  return (
    <div className="email-signature-block">
      <div className="signature-divider" aria-hidden="true">
        <span />
        <span className="signature-label">Signature</span>
        <span />
      </div>
      <div className="signature-content" dangerouslySetInnerHTML={{ __html: safeHtml }} />
    </div>
  );
}
