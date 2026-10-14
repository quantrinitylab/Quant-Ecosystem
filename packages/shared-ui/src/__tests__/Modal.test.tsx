// @vitest-environment jsdom
// Modal layout options: the default centred dialog, and the full-screen-on-mobile variant used
// by document viewers (QuantMail Drive previews).
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Modal } from '../components/Modal';

describe('Modal layout', () => {
  it('is a padded, rounded, height-capped dialog by default', () => {
    render(
      <Modal isOpen onClose={() => {}} title="Plain">
        <p>Body</p>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('p-4 sm:p-6');
    const panel = dialog.querySelector<HTMLElement>('.quant-modal-panel')!;
    expect(panel.className).toContain('max-w-md');
    expect(panel.className).toContain('max-h-[88vh]');
    expect(panel.className).not.toContain('100dvh');
    expect(panel.style.borderRadius).toBe('0.75rem');
    expect(screen.getByText('Body').parentElement!.className).toContain('px-5 py-4 sm:px-6');
  });

  it('fills a phone screen with fullScreenOnMobile and takes a custom body padding', () => {
    render(
      <Modal isOpen onClose={() => {}} title="Report.pdf" size="full" fullScreenOnMobile bodyClassName="px-3 py-3 sm:px-6 sm:py-4">
        <p>Body</p>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('p-0 sm:p-6');
    const panel = dialog.querySelector<HTMLElement>('.quant-modal-panel')!;
    expect(panel.className).toContain('max-w-5xl');
    expect(panel.className).toContain('h-[100dvh]');
    expect(panel.className).toContain('rounded-none');
    expect(panel.className).toContain('sm:rounded-xl');
    expect(panel.className).toContain('sm:max-h-[88vh]');
    // Corners come from the classes (square on a phone): no inline radius to override them.
    expect(panel.style.borderRadius).toBe('');
    const body = screen.getByText('Body').parentElement!;
    expect(body.className).toContain('px-3 py-3 sm:px-6 sm:py-4');
    expect(body.className).not.toContain('px-5');
  });
});
