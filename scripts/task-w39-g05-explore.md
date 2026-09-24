# TASK W39-G05: QuantGram Explore 3-Column Asymmetric Masonry Grid

**Target Application:** `apps/quantneon`
**Target File:** `apps/quantneon/src/components/ExploreGrid.tsx`
**Engine:** `apps/quantneon/src/features/explore/explore-matrix.ts` (Already tested and verified 100% green)

## Requirements:

1. Create `apps/quantneon/src/components/ExploreGrid.tsx` using React, TypeScript, and Tailwind CSS.
2. Implement 3-column asymmetric masonry grid:
   - Use CSS Grid `grid-cols-3 gap-1 md:gap-2 auto-rows-[120px] sm:auto-rows-[160px] md:auto-rows-[220px]`.
   - Items where `isAsymmetricLargeItem(index)` is true should span 2 columns and 2 rows (`col-span-2 row-span-2`).
3. Overlays & Badges:
   - For reels (`item.type === 'reel'`), display duration badge (`formatVideoDuration(item.durationSeconds || 0)`) in top-right with semi-transparent frosted background (`bg-black/60 backdrop-blur-sm text-white text-xs px-1.5 py-0.5 rounded`).
   - Display view count pill (`formatExploreViews(item.views || 0)`) in bottom-left (`bg-black/50 text-white text-xs px-1.5 py-0.5 rounded flex items-center gap-1`).
   - For products (`item.type === 'product'`), display shopping bag icon in top-right.
4. "Search with Meta AI" / Quanty AI Search Bar:
   - Prominent search input at the top with magnifying glass and Quanty sparkle icon (`Ask Quanty anything or search reels...`).
   - Filters items using `filterExploreBySearchQuery(items, searchQuery)`.
5. Empty State:
   - Clean, dark-mode empty state when query returns no items.
6. Verify:
   - Ensure 0 TypeScript errors (`pnpm --filter @quant/quantgram typecheck`).
   - Ensure Vitest tests pass (`pnpm --filter @quant/quantgram test run explore-matrix.test.ts`).
