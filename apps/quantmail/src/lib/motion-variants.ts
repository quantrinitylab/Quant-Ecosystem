import { spring } from '@quant/brand';

export const listContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
};

export const listItemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring' as const,
      ...spring.gentle,
    },
  },
};

// Swipe gesture variants for mobile email actions
export const swipeVariants = {
  idle: { x: 0 },
  swipeLeft: {
    x: -120,
    transition: { type: 'spring' as const, ...spring.snappy },
  },
  swipeRight: {
    x: 120,
    transition: { type: 'spring' as const, ...spring.snappy },
  },
  dismissed: {
    x: -400,
    opacity: 0,
    transition: { type: 'spring' as const, ...spring.snappy },
  },
};

// Expand/collapse variants for sections and quoted text
export const expandCollapseVariants = {
  collapsed: {
    height: 0,
    opacity: 0,
    overflow: 'hidden' as const,
  },
  expanded: {
    height: 'auto',
    opacity: 1,
    overflow: 'hidden' as const,
    transition: {
      height: { type: 'spring' as const, ...spring.gentle },
      opacity: { duration: 0.2, delay: 0.05 },
    },
  },
};

// Toast slide-up variants for undo send and notifications
export const toastSlideUpVariants = {
  hidden: {
    y: 80,
    opacity: 0,
    scale: 0.95,
  },
  visible: {
    y: 0,
    opacity: 1,
    scale: 1,
    transition: {
      type: 'spring' as const,
      ...spring.snappy,
    },
  },
  exit: {
    y: 80,
    opacity: 0,
    scale: 0.95,
    transition: { duration: 0.2 },
  },
};

// Reading pane slide-in for desktop 3-pane layout
export const readingPaneVariants = {
  hidden: { opacity: 0, x: 20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      type: 'spring' as const,
      ...spring.gentle,
    },
  },
  exit: {
    opacity: 0,
    x: 20,
    transition: { duration: 0.15 },
  },
};

// Attachment gallery item variants
export const attachmentItemVariants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      type: 'spring' as const,
      ...spring.gentle,
    },
  },
};

// Filter chip animation
export const chipVariants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      type: 'spring' as const,
      ...spring.snappy,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.8,
    transition: { duration: 0.15 },
  },
};
