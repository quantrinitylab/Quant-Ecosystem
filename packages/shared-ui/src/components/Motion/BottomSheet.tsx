// ============================================================================
// Shared UI - BottomSheet Component
// ============================================================================

import React, { useCallback } from 'react';
import { AnimatePresence, motion, type PanInfo } from 'framer-motion';
import { spring } from '@quant/brand';

export type SnapPoint = 0.25 | 0.5 | 0.9;

export interface BottomSheetProps {
  children: React.ReactNode;
  open: boolean;
  onClose: () => void;
  snapPoints?: SnapPoint[];
  initialSnap?: SnapPoint;
  className?: string;
  'aria-label'?: string;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  children,
  open,
  onClose,
  snapPoints: _snapPoints = [0.5, 0.9],
  initialSnap = 0.5,
  className = '',
  'aria-label': ariaLabel = 'Bottom sheet',
}) => {
  const transition = {
    type: 'spring' as const,
    ...spring.gentle,
  };

  const sheetHeight = `${initialSnap * 100}%`;

  const handleDragEnd = useCallback(
    (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      if (info.velocity.y > 300 || info.offset.y > 100) {
        onClose();
      }
    },
    [onClose],
  );

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/50 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            className={`fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 rounded-t-2xl shadow-xl ${className}`}
            style={{ height: sheetHeight }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={transition}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
            role="dialog"
            aria-label={ariaLabel}
            aria-modal="true"
          >
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full" />
            </div>
            <div className="overflow-y-auto px-4 pb-4 h-full">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
