// ============================================================================
// Quant Ecosystem - Cross-App Share Modal Component
// ============================================================================

import React, { useState } from 'react';
import type { QuantAsset, CoreQuantAppId } from './types';
import { CORE_QUANT_APPS } from './constants';
import { CrossAppAssetPipeline } from './CrossAppAssetPipeline';

export interface CrossAppShareModalProps {
  isOpen: boolean;
  asset: QuantAsset;
  onClose: () => void;
  onShareComplete?: (targetApp: CoreQuantAppId, targetUrl: string) => void;
}

export const CrossAppShareModal: React.FC<CrossAppShareModalProps> = ({
  isOpen,
  asset,
  onClose,
  onShareComplete,
}) => {
  const [selectedApp, setSelectedApp] = useState<CoreQuantAppId>('quantchat');
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!isOpen) return null;

  const pipeline = CrossAppAssetPipeline.getInstance();

  const handleShare = async () => {
    setIsProcessing(true);
    setFeedback(null);

    let result;
    if (
      ((asset.sourceApp as string) === 'quantdrive' || asset.sourceApp === 'quantmail') &&
      selectedApp === 'quantai'
    ) {
      result = await pipeline.transferDriveFileToAICanvas(asset);
    } else if (asset.sourceApp === 'quantai' && selectedApp === 'quantgram') {
      result = await pipeline.publishAIToGramReel(asset, { targetAspect: '9:16' });
    } else if (
      asset.sourceApp === 'quantgram' &&
      (selectedApp === 'quantchat' || selectedApp === 'quantmail')
    ) {
      result = await pipeline.shareGramReel(asset, selectedApp);
    } else if (
      asset.mimeType.startsWith('audio') &&
      (selectedApp === 'quantmax' || selectedApp === 'quantmail')
    ) {
      result = await pipeline.transcribeVoiceNoteToDriveDoc(asset);
    } else {
      // General fall-through jump
      result = await pipeline.shareGramReel(asset, 'quantchat');
    }

    setIsProcessing(false);
    if (result.success) {
      setFeedback(result.message);
      onShareComplete?.(selectedApp, result.targetUrl);
      setTimeout(() => {
        window.location.href = result.targetUrl;
      }, 700);
    } else {
      setFeedback(`Error: ${result.message}`);
    }
  };

  const shareTargets: CoreQuantAppId[] = [
    'quantchat',
    'quantmail',
    'quantgram',
    'quantai',
    'quantube',
    'quantwave',
    'quantmax',
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Cross-App Share Hub"
    >
      <div className="w-full max-w-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-2xl overflow-hidden p-6 space-y-4">
        {/* Modal Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              Ecosystem 1-Click Share
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            ✕
          </button>
        </div>

        {/* Asset Summary Card */}
        <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
          {asset.thumbnailUrl ? (
            <img
              src={asset.thumbnailUrl}
              alt=""
              className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-12 h-12 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-600 font-bold text-lg flex-shrink-0">
              ⚡
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">
              {asset.name}
            </p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              From: {CORE_QUANT_APPS[asset.sourceApp]?.name || asset.sourceApp} •{' '}
              {(asset.sizeBytes / 1024 / 1024).toFixed(1)} MB
            </p>
          </div>
        </div>

        {/* Target App Chooser */}
        <div>
          <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 block">
            Select Target Quant Application:
          </label>
          <div className="grid grid-cols-4 gap-2">
            {shareTargets.map((appId) => {
              const app = CORE_QUANT_APPS[appId];
              const isSelected = selectedApp === appId;

              return (
                <button
                  key={appId}
                  type="button"
                  onClick={() => setSelectedApp(appId)}
                  className={`flex flex-col items-center p-2.5 rounded-xl border transition-all ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500/20 shadow-xs'
                      : 'border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <span
                    className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs mb-1"
                    style={{ backgroundColor: `${app.accentColor}20`, color: app.accentColor }}
                  >
                    {app.name.charAt(5)}
                  </span>
                  <span className="text-[11px] font-medium truncate w-full text-center">
                    {app.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Feedback Message */}
        {feedback && (
          <div
            className={`p-3 rounded-xl text-xs font-medium ${
              feedback.startsWith('Error')
                ? 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-300'
                : 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300'
            }`}
          >
            {feedback}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isProcessing}
            onClick={handleShare}
            className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm disabled:opacity-50 transition-colors"
          >
            {isProcessing
              ? 'Transforming & Dispatching...'
              : `Transfer to ${CORE_QUANT_APPS[selectedApp].name} ➔`}
          </button>
        </div>
      </div>
    </div>
  );
};
