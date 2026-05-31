'use client';

import { motion } from 'framer-motion';
import { spring } from '@quant/brand';

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  enter: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring' as const,
      ...spring.gentle,
    },
  },
};

interface PageTransitionProps {
  children: React.ReactNode;
  className?: string;
}

export function PageTransition({ children, className }: PageTransitionProps) {
  return (
    <motion.div variants={pageVariants} initial="initial" animate="enter" className={className}>
      {children}
    </motion.div>
  );
}
