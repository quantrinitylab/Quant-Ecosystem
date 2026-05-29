// ============================================================================
// QuantChat - E2EEncryption Component
// Encryption status, key fingerprint, verification QR, encrypted banner
// ============================================================================
import React, { useState, useEffect, useCallback } from 'react';
import { logger } from '@quant/common';
import { getAuthHeaders, getAuthHeadersWithContent } from '../lib/auth';

interface EncryptionStatus {
  isEncrypted: boolean;
  protocol: string;
  keyFingerprint: string;
  peerFingerprint: string;
  sessionEstablished: boolean;
  lastKeyRotation: string;
  messagesSentEncrypted: number;
  verifiedDevice: boolean;
}
interface E2EEncryptionProps {
  conversationId: string;
  peerId: string;
  peerName: string;
}

export const E2EEncryption: React.FC<E2EEncryptionProps> = ({
  conversationId,
  peerId,
  peerName,
}) => {
  const [status, setStatus] = useState<EncryptionStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [showDetails, setShowDetails] = useState<boolean>(false);
  const [showVerification, setShowVerification] = useState<boolean>(false);
  const [verificationCode, setVerificationCode] = useState<string>('');
  const [verifying, setVerifying] = useState<boolean>(false);
  const [verificationResult, setVerificationResult] = useState<'pending' | 'verified' | 'failed'>(
    'pending',
  );

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/encryption/status/${conversationId}`, {
        headers: { ...getAuthHeaders() },
      });
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      }
    } catch (err) {
      logger.error('Failed to fetch encryption status:', err);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleVerify = useCallback(async () => {
    if (!verificationCode.trim()) return;
    setVerifying(true);
    try {
      const response = await fetch(`/api/encryption/verify/${conversationId}`, {
        method: 'POST',
        headers: {
          ...getAuthHeadersWithContent(),
        },
        body: JSON.stringify({ code: verificationCode, peerId }),
      });
      if (response.ok) {
        setVerificationResult('verified');
        setStatus((prev) => (prev ? { ...prev, verifiedDevice: true } : prev));
      } else {
        setVerificationResult('failed');
      }
    } catch {
      setVerificationResult('failed');
    } finally {
      setVerifying(false);
    }
  }, [conversationId, verificationCode, peerId]);

  const formatFingerprint = (fp: string): string => fp.match(/.{1,4}/g)?.join(' ') || fp;

  if (loading) return <div className="e2e-loading">Loading encryption info...</div>;
  if (!status) return <div className="e2e-unavailable">Encryption status unavailable</div>;

  return (
    <div className="e2e-encryption">
      <div className="encryption-banner" onClick={() => setShowDetails(!showDetails)}>
        <span className="lock-icon">{status.isEncrypted ? '\u{1F512}' : '\u{1F513}'}</span>
        <span className="banner-text">
          {status.isEncrypted ? 'Messages are end-to-end encrypted' : 'Encryption not available'}
        </span>
        <span className="expand-icon">{showDetails ? '\u25B2' : '\u25BC'}</span>
      </div>

      {showDetails && (
        <div className="encryption-details">
          <div className="detail-section">
            <h4>Encryption Protocol</h4>
            <p>{status.protocol} (Double Ratchet + X3DH)</p>
            <p className="detail-note">
              Only you and {peerName} can read these messages. Not even QuantChat can access them.
            </p>
          </div>
          <div className="detail-section">
            <h4>Your Key Fingerprint</h4>
            <code className="fingerprint">{formatFingerprint(status.keyFingerprint)}</code>
          </div>
          <div className="detail-section">
            <h4>{peerName}'s Key Fingerprint</h4>
            <code className="fingerprint">{formatFingerprint(status.peerFingerprint)}</code>
          </div>
          <div className="detail-section">
            <h4>Session Info</h4>
            <ul className="session-info">
              <li>Session established: {status.sessionEstablished ? 'Yes' : 'No'}</li>
              <li>Last key rotation: {new Date(status.lastKeyRotation).toLocaleDateString()}</li>
              <li>Messages encrypted: {status.messagesSentEncrypted.toLocaleString()}</li>
              <li>Device verified: {status.verifiedDevice ? '\u2705 Yes' : '\u274C No'}</li>
            </ul>
          </div>
          <div className="verification-section">
            <h4>Verify Identity</h4>
            {status.verifiedDevice ? (
              <div className="verified-badge">
                <span>\u2705</span>
                <p>{peerName}'s device is verified</p>
              </div>
            ) : (
              <>
                <p>Compare the security numbers with {peerName} to verify their identity.</p>
                <button onClick={() => setShowVerification(true)} className="verify-btn">
                  Verify
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {showVerification && (
        <div className="verification-modal">
          <div className="modal-content">
            <h3>Verify {peerName}'s Identity</h3>
            <div className="qr-section">
              <div className="qr-placeholder">
                <p>QR Code</p>
                <code>{status.peerFingerprint.slice(0, 16)}</code>
              </div>
              <p>Ask {peerName} to scan this QR code, or compare the numbers below.</p>
            </div>
            <div className="numbers-comparison">
              <div className="number-block">
                <label>Your number</label>
                <code>{formatFingerprint(status.keyFingerprint.slice(0, 20))}</code>
              </div>
              <div className="number-block">
                <label>{peerName}'s number</label>
                <code>{formatFingerprint(status.peerFingerprint.slice(0, 20))}</code>
              </div>
            </div>
            <div className="verify-input">
              <p>Or enter the verification code shown on {peerName}'s device:</p>
              <input
                type="text"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                placeholder="Enter code"
              />
            </div>
            {verificationResult === 'verified' && (
              <div className="result success">\u2705 Verified successfully!</div>
            )}
            {verificationResult === 'failed' && (
              <div className="result failed">\u274C Verification failed. Numbers do not match.</div>
            )}
            <div className="modal-actions">
              <button onClick={handleVerify} disabled={verifying || !verificationCode.trim()}>
                {verifying ? 'Verifying...' : 'Verify'}
              </button>
              <button
                onClick={() => {
                  setShowVerification(false);
                  setVerificationResult('pending');
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default E2EEncryption;
