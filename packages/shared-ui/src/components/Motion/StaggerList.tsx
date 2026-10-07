'use client';

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { spring } from '@quant/brand';
import { useMotionConfig } from './MotionConfig';

export interface StaggerListProps {
  staggerDelay?: number;
  className?: string;
  children: React.ReactNode;
  as?: 'div' | 'ul' | 'ol';
  childAs?: 'div' | 'li';
  animated?: boolean;
}

const containerVariants = (staggerDelay: number) => ({
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: staggerDelay,
    },
  },
});

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring' as const,
      damping: spring.gentle.damping,
      stiffness: spring.gentle.stiffness,
      mass: spring.gentle.mass,
    },
  },
};

export function StaggerList({
  staggerDelay = 0.05,
  className,
  children,
  as = 'div',
  childAs,
  animated = true,
}: StaggerListProps) {
  const { shouldAnimate: contextAnimate } = useMotionConfig();
  const prefersReducedMotion = useReducedMotion();
  const shouldAnimate = animated && contextAnimate && !prefersReducedMotion;

  const resolvedChildAs = childAs ?? (as === 'ul' || as === 'ol' ? 'li' : 'div');

  if (!shouldAnimate) {
    const Container = as;
    return <Container className={className}>{children}</Container>;
  }

  const MotionContainer = motion[as];
  const MotionChild = motion[resolvedChildAs];

  return (
    <MotionContainer
      className={className}
      variants={containerVariants(staggerDelay)}
      initial="hidden"
      animate="visible"
    >
      {React.Children.map(children, (child) => {
        if (
          React.isValidElement(child) &&
          (child.type === resolvedChildAs ||
            (typeof child.type === 'string' && child.type === resolvedChildAs))
        ) {
          // Child is already the same element type as the wrapper would be.
          // Spread all of the child's props onto the motion element to avoid nesting (e.g. li > li).
          const { children: childContent, ...restProps } = child.props as Record<string, any>;
          return (
            <MotionChild variants={itemVariants} {...restProps}>
              {childContent}
            </MotionChild>
          );
        }
        return <MotionChild variants={itemVariants}>{child}</MotionChild>;
      })}
    </MotionContainer>
  );
}
