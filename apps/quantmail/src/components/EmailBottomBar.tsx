'use client';

export interface EmailBottomBarProps {
  onReply: () => void;
  onForward: () => void;
  onEmoji?: (emoji: string) => void;
}

export function EmailBottomBar({ onReply, onForward, onEmoji }: EmailBottomBarProps) {
  return (
    <div className="sticky bottom-0 z-20 flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-t border-[#282C35] bg-[#0c1017]/95 backdrop-blur-xl shadow-2xl">
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onReply}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-xs transition-all shadow-md active:scale-95"
        >
          <svg
            className="size-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
          >
            <path d="M9 14L4 9l5-5" />
            <path d="M4 9h11a5 5 0 015 5v5" />
          </svg>
          <span>Reply</span>
        </button>

        <button
          type="button"
          onClick={onForward}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#282C35] hover:bg-[#3A404D] text-[#F5F5F5] hover:text-white font-semibold text-xs border border-[#3A404D] transition-all active:scale-95"
        >
          <svg
            className="size-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
          >
            <path d="M15 14l5-5-5-5" />
            <path d="M20 9H9a5 5 0 00-5 5v5" />
          </svg>
          <span>Forward</span>
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        {['👍', '❤️', '🔥', '🙏'].map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onEmoji?.(emoji)}
            className="p-1.5 rounded-xl bg-[#111318] border border-[#282C35] hover:border-[#FF8C42]/50 hover:bg-[#282C35] text-sm transition-all hover:scale-110"
            title={`React with ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
