'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ============================================================================
// Task 8.2: FriendPin — Map marker with AI avatar, online indicator
// Task 8.3: Tap popup card (name, avatar, last active, open-chat button)
// Task 8.4: Animated movement to new position over 500ms
// ============================================================================

export interface FriendLocation {
  userId: string;
  username: string;
  /**
   * Backend GET /map/friends har friend ke saath displayName bhi bhejta hai.
   * Pin render use NAHI dikhata — woh sirf map search (QC-F-331) ke naam-match
   * aur results panel ke liye hai. Socket updates se aane wale doston par ye
   * field NAHI hota (frame me hai hi NAHI), isiliye optional hai.
   */
  displayName?: string;
  avatarUrl: string;
  position: [number, number]; // [lng, lat] → mapped to % for display
  lastUpdated: Date;
  isOnline: boolean;
  conversationId?: string;
}

interface FriendPinProps {
  friend: FriendLocation;
  /** Position in % coordinates for map display */
  top: string;
  left: string;
  /** Called when "Open Chat" is tapped */
  onOpenChat?: (conversationId: string) => void;
  /**
   * QC-F-331: map search se chuna gaya pin. True ho to pin highlight hoga
   * aur uska popup card khula dikhega — ye is div-canvas par "focus" ka
   * ekmatra imaandaar arth hai (koi geographic camera maujood NAHI hai).
   */
  focused?: boolean;
}

export function FriendPin({ friend, top, left, onOpenChat, focused }: FriendPinProps) {
  const [showPopup, setShowPopup] = useState(false);

  // Effective popup sthiti: search-focus popup ko khula rakhta hai; internal
  // tap state bhi aparivartit kaam karta hai. Dhyaan: tap-outside dismiss
  // overlay sirf internal state band karta hai — page-side focus saaf karna
  // page ka kaam hai (query/tab badlaav par).
  const popupVisible = focused === true || showPopup;

  const lastActiveMinutes = Math.floor(
    (Date.now() - new Date(friend.lastUpdated).getTime()) / 60000,
  );

  const lastActiveText =
    lastActiveMinutes < 1
      ? 'Active now'
      : lastActiveMinutes < 60
        ? `Last active: ${lastActiveMinutes} min ago`
        : `Last active: ${Math.floor(lastActiveMinutes / 60)}h ago`;

  return (
    <>
      {/* Task 8.4: Animated pin movement using CSS transition (500ms) */}
      <motion.div
        className={`absolute flex flex-col items-center cursor-pointer ${
          focused ? 'z-50' : 'z-20'
        }`}
        data-focused={focused ? 'true' : undefined}
        style={{ top, left }}
        animate={{ top, left }}
        transition={{ duration: 0.5, ease: 'easeInOut' }}
        onClick={() => setShowPopup(!showPopup)}
        layout
      >
        {/* Pin: circular avatar (32px) with pointed tail */}
        <div className="relative">
          {/* Avatar circle */}
          <div
            className={`w-8 h-8 rounded-full overflow-hidden border-2 border-white shadow-lg ${
              focused ? 'ring-2 ring-emerald-400 scale-110' : ''
            }`}
          >
            {friend.avatarUrl ? (
              <img
                src={friend.avatarUrl}
                alt={friend.username}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                {friend.username.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {/* Pointed tail at the bottom */}
          <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px] border-t-white" />

          {/* Online indicator (green dot) */}
          {friend.isOnline && (
            <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-white" />
          )}
        </div>

        {/* Username label below pin */}
        <span className="mt-1 text-[10px] text-white bg-black/60 px-1.5 py-0.5 rounded-full whitespace-nowrap">
          {friend.username}
        </span>
      </motion.div>

      {/* Task 8.3: Tap popup card */}
      <AnimatePresence>
        {popupVisible && (
          <>
            {/* Tap-outside dismiss overlay */}
            <div className="fixed inset-0 z-40" onClick={() => setShowPopup(false)} />

            {/* Popup positioned above the pin */}
            <motion.div
              className="absolute z-50"
              style={{
                top: `calc(${top} - 120px)`,
                left,
                transform: 'translateX(-50%)',
              }}
              initial={{ opacity: 0, scale: 0.8, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 10 }}
              transition={{ duration: 0.2 }}
            >
              <div className="bg-[var(--quant-card)] rounded-xl p-3 shadow-2xl border border-[var(--quant-border)] min-w-[180px]">
                <div className="flex items-center gap-3 mb-2">
                  {/* Larger avatar */}
                  <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-[var(--quant-primary)]">
                    {friend.avatarUrl ? (
                      <img
                        src={friend.avatarUrl}
                        alt={friend.username}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold">
                        {friend.username.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[var(--quant-foreground)]">
                      {friend.username}
                    </p>
                    <p className="text-xs text-[var(--quant-muted-foreground)]">{lastActiveText}</p>
                  </div>
                </div>

                {/* Open Chat button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowPopup(false);
                    if (friend.conversationId) {
                      onOpenChat?.(friend.conversationId);
                    }
                  }}
                  className="w-full py-2 bg-[var(--quant-primary)] text-white text-xs font-medium rounded-lg hover:opacity-90 transition-opacity"
                >
                  Open Chat
                </button>
              </div>

              {/* Popup arrow pointing down */}
              <div className="flex justify-center">
                <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-[var(--quant-card)]" />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

export default FriendPin;
