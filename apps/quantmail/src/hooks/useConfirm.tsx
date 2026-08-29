'use client';

import { useCallback, useRef, useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
}

const EMPTY: ConfirmOptions = { title: '', message: '' };

/**
 * An awaitable confirm(), so replacing window.confirm() does not mean rewriting
 * the handler around it:
 *
 *   const { confirm, dialog } = useConfirm();
 *   if (!(await confirm({ title: '…', message: '…', variant: 'destructive' }))) return;
 *   …
 *   return (<>{…}{dialog}</>);
 *
 * The returned `dialog` element must be rendered somewhere in the tree, once.
 */
export function useConfirm() {
  const [isOpen, setIsOpen] = useState(false);
  // Held separately from `isOpen` so the copy survives the close animation. Both
  // in one nullable piece of state would blank the panel out mid-fade.
  const [options, setOptions] = useState<ConfirmOptions>(EMPTY);
  const resolveRef = useRef<((confirmed: boolean) => void) | null>(null);

  const settle = useCallback((confirmed: boolean) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setIsOpen(false);
    resolve?.(confirmed);
  }, []);

  const confirm = useCallback((next: ConfirmOptions) => {
    // A second ask while one is open resolves the first as cancelled. Otherwise
    // the handler awaiting it would stay suspended for the life of the page, and
    // any cleanup after its `await` would never run.
    resolveRef.current?.(false);
    setOptions(next);
    setIsOpen(true);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const handleConfirm = useCallback(() => settle(true), [settle]);
  const handleCancel = useCallback(() => settle(false), [settle]);

  const dialog = (
    <ConfirmDialog
      isOpen={isOpen}
      title={options.title}
      message={options.message}
      confirmLabel={options.confirmLabel}
      cancelLabel={options.cancelLabel}
      variant={options.variant}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );

  return { confirm, dialog };
}
