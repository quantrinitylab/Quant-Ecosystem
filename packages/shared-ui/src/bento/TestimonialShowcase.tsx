'use client';

import React, { useState, useEffect, useCallback } from 'react';

export interface TestimonialItem {
  id: string;
  quote: string;
  authorName: string;
  authorRole: string;
  companyName: string;
  avatarUrl?: string;
  rating?: number; // 1-5
  verified?: boolean;
}

export interface TestimonialShowcaseProps {
  testimonials: TestimonialItem[];
  title?: string;
  autoPlayIntervalMs?: number;
  className?: string;
}

/**
 * Calculates the next or previous testimonial index with wrap-around support.
 */
export function calculateNextTestimonialIndex(
  currentIndex: number,
  totalCount: number,
  direction: 'next' | 'prev',
): number {
  if (totalCount <= 0) return 0;
  const normalizedIndex = ((currentIndex % totalCount) + totalCount) % totalCount;
  if (direction === 'next') {
    return (normalizedIndex + 1) % totalCount;
  }
  return (normalizedIndex - 1 + totalCount) % totalCount;
}

export const TestimonialShowcase: React.FC<TestimonialShowcaseProps> = ({
  testimonials,
  title = 'Trusted by Global Leaders',
  autoPlayIntervalMs = 0,
  className = '',
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const totalCount = testimonials.length;

  const handlePrev = useCallback(() => {
    setCurrentIndex((prev) => calculateNextTestimonialIndex(prev, totalCount, 'prev'));
  }, [totalCount]);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => calculateNextTestimonialIndex(prev, totalCount, 'next'));
  }, [totalCount]);

  // Autoplay effect
  useEffect(() => {
    if (autoPlayIntervalMs <= 0 || totalCount <= 1 || isPaused) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => calculateNextTestimonialIndex(prev, totalCount, 'next'));
    }, autoPlayIntervalMs);

    return () => clearInterval(timer);
  }, [autoPlayIntervalMs, totalCount, isPaused]);

  if (!testimonials || testimonials.length === 0) {
    return null;
  }

  const current: TestimonialItem = testimonials[currentIndex] ?? testimonials[0]!;
  const rating = Math.min(Math.max(current.rating ?? 5, 1), 5);
  const isVerified = current.verified !== false;

  // Extract initials for avatar fallback
  const initials =
    current.authorName
      .split(' ')
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'Q';

  return (
    <div
      className={`w-full max-w-4xl mx-auto p-6 md:p-10 rounded-2xl bg-[#0D1117] border border-white/10 text-white shadow-2xl ${className}`}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      data-testid="testimonial-showcase"
    >
      {/* Title */}
      {title && (
        <div className="text-center mb-8">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-2 text-white">{title}</h2>
          <div className="flex items-center justify-center gap-2">
            <span className="inline-block w-8 h-[2px] bg-[#58A6FF]/40 rounded-full" />
            <span className="text-xs uppercase tracking-widest text-[#58A6FF] font-semibold">
              Verified Customer Stories
            </span>
            <span className="inline-block w-8 h-[2px] bg-[#58A6FF]/40 rounded-full" />
          </div>
        </div>
      )}

      {/* Testimonial Card */}
      <div
        className="relative bg-[#161B22] border border-white/10 rounded-2xl p-6 md:p-8 transition-all duration-300 hover:border-[#58A6FF]/30 shadow-[0_0_40px_rgba(0,0,0,0.5)]"
        data-testid={`testimonial-card-${current.id}`}
      >
        {/* Decorative Quote Icon in background */}
        <div className="absolute top-6 right-6 text-white/5 pointer-events-none text-6xl font-serif leading-none select-none">
          “
        </div>

        {/* 5-Star Rating */}
        <div
          className="flex items-center gap-1.5 mb-6"
          data-testid="testimonial-rating"
          aria-label={`${rating} out of 5 stars`}
        >
          {[1, 2, 3, 4, 5].map((star) => (
            <span
              key={star}
              className={`text-xl transition-colors ${
                star <= rating ? 'text-[#F59E0B]' : 'text-gray-600'
              }`}
            >
              ★
            </span>
          ))}
          <span className="ml-2 text-xs font-semibold text-[#F59E0B] px-2 py-0.5 rounded bg-[#F59E0B]/10 border border-[#F59E0B]/20">
            {`${rating}.0`}
          </span>
        </div>

        {/* Quote */}
        <blockquote className="mb-8">
          <p
            className="text-base md:text-xl text-gray-200 leading-relaxed font-normal italic"
            data-testid="testimonial-quote"
          >
            {`"${current.quote}"`}
          </p>
        </blockquote>

        {/* Author / Company / Verification Footer */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-6 border-t border-white/10">
          <div className="flex items-center gap-4">
            {/* Avatar or Initials */}
            {current.avatarUrl ? (
              <img
                src={current.avatarUrl}
                alt={current.authorName}
                className="w-12 h-12 rounded-full object-cover border border-white/10"
                data-testid="testimonial-avatar"
              />
            ) : (
              <div
                className="w-12 h-12 rounded-full bg-gradient-to-tr from-[#58A6FF]/20 to-purple-500/20 border border-[#58A6FF]/30 flex items-center justify-center font-bold text-white text-base shrink-0 shadow-inner"
                data-testid="testimonial-avatar-fallback"
              >
                {initials}
              </div>
            )}

            {/* Author Name and Role */}
            <div>
              <div className="flex items-center gap-2">
                <span
                  className="font-semibold text-white text-sm md:text-base"
                  data-testid="testimonial-author"
                >
                  {current.authorName}
                </span>
                {isVerified && (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#238636]/15 border border-[#238636]/30 text-[#3FB950]"
                    data-testid="testimonial-verified-badge"
                  >
                    <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Verified Customer
                  </span>
                )}
              </div>
              <p className="text-xs text-[#8B949E]" data-testid="testimonial-role">
                {current.authorRole}
              </p>
            </div>
          </div>

          {/* Company Pill */}
          <div className="flex items-center self-start sm:self-center">
            <span
              className="px-3 py-1 rounded-full text-xs font-medium bg-white/5 border border-white/10 text-gray-300 shadow-sm"
              data-testid="testimonial-company"
            >
              {current.companyName}
            </span>
          </div>
        </div>
      </div>

      {/* Carousel Navigation Bar */}
      {totalCount > 1 && (
        <div className="flex items-center justify-between mt-6 px-2">
          {/* Bullet Indicators */}
          <div className="flex items-center gap-2" data-testid="testimonial-bullets">
            {testimonials.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setCurrentIndex(idx)}
                aria-label={`Go to slide ${idx + 1}`}
                className={`h-2 rounded-full transition-all duration-300 ${
                  idx === currentIndex ? 'w-7 bg-[#58A6FF]' : 'w-2 bg-white/20 hover:bg-white/40'
                }`}
                data-testid={`testimonial-bullet-${idx}`}
              />
            ))}
          </div>

          {/* Prev / Next Buttons */}
          <div className="flex items-center gap-2" data-testid="testimonial-navigation">
            <button
              type="button"
              onClick={handlePrev}
              aria-label="Previous testimonial"
              className="p-2.5 rounded-xl bg-[#161B22] border border-white/10 text-gray-300 hover:text-white hover:border-white/30 hover:bg-white/5 transition-all"
              data-testid="testimonial-prev-button"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <span className="text-xs text-[#8B949E] px-1 font-mono">
              {currentIndex + 1} / {totalCount}
            </span>
            <button
              type="button"
              onClick={handleNext}
              aria-label="Next testimonial"
              className="p-2.5 rounded-xl bg-[#161B22] border border-white/10 text-gray-300 hover:text-white hover:border-white/30 hover:bg-white/5 transition-all"
              data-testid="testimonial-next-button"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
