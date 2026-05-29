// ============================================================================
// Shared UI - AnimatedList Component
// ============================================================================

import React from 'react';
import { motion } from 'framer-motion';
import { spring } from '@quant/brand';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export interface AnimatedListProps {
  children: React.ReactNode;
  staggerDelay?: number;
  className?: string;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring' as const,
      ...spring.snappy,
    },
  },
};

const reducedContainerVariants = {
  hidden: { opacity: 1 },
  visible: { opacity: 1 },
};

const reducedItemVariants = {
  hidden: { opacity: 1, y: 0 },
  visible: { opacity: 1, y: 0 },
};

export const AnimatedList: React.FC<AnimatedListProps> = ({
  children,
  staggerDelay = 0.05,
  className = '',
}) => {
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    return (
      <motion.div
        variants={reducedContainerVariants}
        initial="hidden"
        animate="visible"
        className={className}
      >
        {React.Children.map(children, (child) => (
          <motion.div variants={reducedItemVariants}>{child}</motion.div>
        ))}
      </motion.div>
    );
  }

  const container = {
    ...containerVariants,
    visible: {
      ...containerVariants.visible,
      transition: {
        staggerChildren: staggerDelay,
      },
    },
  };

  return (
    <motion.div variants={container} initial="hidden" animate="visible" className={className}>
      {React.Children.map(children, (child) => (
        <motion.div variants={itemVariants}>{child}</motion.div>
      ))}
    </motion.div>
  );
};
