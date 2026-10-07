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


// Modal/dialog scale-in with backdrop blur
export const dialogVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 8 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      type: 'spring' as const,
      ...spring.snappy,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: 8,
    transition: { duration: 0.15 },
  },
};

export const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.15 } },
  exit: { opacity: 0, transition: { duration: 0.12 } },
};

// Button press micro-interaction
export const buttonPressVariants = {
  idle: { scale: 1 },
  hover: { scale: 1.02, transition: { type: 'spring' as const, ...spring.snappy } },
  tap: { scale: 0.97, transition: { duration: 0.08 } },
};

// Card hover lift effect
export const cardHoverVariants = {
  idle: { y: 0, boxShadow: '0 0 0 rgba(0,0,0,0)' },
  hover: {
    y: -2,
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    transition: { type: 'spring' as const, ...spring.snappy },
  },
};

// Sidebar collapse/expand
export const sidebarVariants = {
  expanded: {
    width: '16rem',
    transition: { type: 'spring' as const, ...spring.gentle },
  },
  collapsed: {
    width: '4rem',
    transition: { type: 'spring' as const, ...spring.gentle },
  },
};

// Notification slide-in from top-right
export const notificationVariants = {
  hidden: { opacity: 0, x: 20, y: -10, scale: 0.95 },
  visible: {
    opacity: 1,
    x: 0,
    y: 0,
    scale: 1,
    transition: { type: 'spring' as const, ...spring.snappy },
  },
  exit: {
    opacity: 0,
    x: 20,
    scale: 0.95,
    transition: { duration: 0.15 },
  },
};

// Compose window minimize/expand
export const composeWindowVariants = {
  expanded: {
    height: 'auto',
    opacity: 1,
    transition: { type: 'spring' as const, ...spring.gentle },
  },
  minimized: {
    height: '3rem',
    opacity: 0.9,
    transition: { type: 'spring' as const, ...spring.snappy },
  },
};

// Skeleton shimmer
export const shimmerVariants = {
  initial: { backgroundPosition: '-200% 0' },
  animate: {
    backgroundPosition: '200% 0',
    transition: { repeat: Infinity, duration: 1.5, ease: 'linear' },
  },
};

// Drag-and-drop item
export const draggableVariants = {
  idle: { scale: 1, boxShadow: '0 0 0 rgba(0,0,0,0)', zIndex: 0 },
  dragging: {
    scale: 1.03,
    boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
    zIndex: 100,
    transition: { type: 'spring' as const, ...spring.snappy },
  },
};

// Page transition (for route changes)
export const pageTransitionVariants = {
  initial: { opacity: 0, y: 6 },
  enter: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] },
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: { duration: 0.15 },
  },
};
