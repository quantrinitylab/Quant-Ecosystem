// ============================================================================
// QuantNeon - InteractiveSticker Component
// ============================================================================

import type { Sticker } from '../types';

interface InteractiveStickerProps {
  sticker: Sticker;
  onInteract: (stickerId: string, data: unknown) => void;
}

export function InteractiveSticker({ sticker, onInteract }: InteractiveStickerProps) {
  const positionStyle = {
    position: 'absolute' as const,
    left: `${sticker.position.x * 100}%`,
    top: `${sticker.position.y * 100}%`,
  };

  switch (sticker.type) {
    case 'poll':
      return (
        <div
          className="bg-white/90 backdrop-blur-sm rounded-2xl p-4 min-w-[200px] shadow-xl"
          style={positionStyle}
          role="group"
          aria-label="Poll sticker"
        >
          <h4 className="text-gray-900 font-semibold text-sm mb-3">
            {sticker.data.question || 'Poll'}
          </h4>
          <div className="flex flex-col gap-2">
            {(sticker.data.options || []).map((opt: string, i: number) => (
              <button
                key={i}
                className="w-full min-h-[44px] px-4 py-2.5 bg-gray-100 hover:bg-blue-100 rounded-xl text-sm font-medium text-gray-800 transition-colors text-left"
                onClick={() => onInteract(sticker.id, { option: i })}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      );

    case 'question':
      return (
        <div
          className="bg-white/90 backdrop-blur-sm rounded-2xl p-4 min-w-[220px] shadow-xl"
          style={positionStyle}
          role="group"
          aria-label="Question sticker"
        >
          <p className="text-gray-900 font-semibold text-sm mb-3">
            {sticker.data.question || 'Ask me anything'}
          </p>
          <input
            className="w-full min-h-[44px] px-4 py-2.5 bg-gray-100 rounded-xl text-sm text-gray-800 placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="Type your answer..."
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onInteract(sticker.id, { answer: (e.target as HTMLInputElement).value });
              }
            }}
            aria-label="Your answer"
          />
        </div>
      );

    case 'slider':
      return (
        <div
          className="bg-white/90 backdrop-blur-sm rounded-2xl p-4 min-w-[200px] shadow-xl"
          style={positionStyle}
          role="group"
          aria-label="Slider sticker"
        >
          <p className="text-gray-900 font-semibold text-sm mb-3">
            {sticker.data.prompt || 'Rate this'}
          </p>
          <input
            type="range"
            min={0}
            max={100}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
            onChange={(e) => onInteract(sticker.id, { value: Number(e.target.value) })}
            aria-label={sticker.data.prompt || 'Rate this'}
          />
        </div>
      );

    case 'countdown':
      return (
        <div
          className="bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl p-4 min-w-[180px] shadow-xl text-center"
          style={positionStyle}
          role="timer"
          aria-label="Countdown sticker"
        >
          <h4 className="text-white font-bold text-sm mb-2">{sticker.data.title || 'Countdown'}</h4>
          <span className="text-white text-2xl font-mono font-bold">
            {sticker.data.endTime || '00:00:00'}
          </span>
        </div>
      );

    case 'quiz':
      return (
        <div
          className="bg-white/90 backdrop-blur-sm rounded-2xl p-4 min-w-[200px] shadow-xl"
          style={positionStyle}
          role="group"
          aria-label="Quiz sticker"
        >
          <h4 className="text-gray-900 font-semibold text-sm mb-3">
            {sticker.data.question || 'Quiz'}
          </h4>
          <div className="flex flex-col gap-2">
            {(sticker.data.options || []).map((opt: string, i: number) => (
              <button
                key={i}
                className="w-full min-h-[44px] px-4 py-2.5 bg-gray-100 hover:bg-green-100 rounded-xl text-sm font-medium text-gray-800 transition-colors text-left"
                onClick={() => onInteract(sticker.id, { answer: i })}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      );

    default:
      return (
        <div
          className="bg-white/80 backdrop-blur-sm rounded-2xl p-3 shadow-lg"
          style={positionStyle}
          aria-label={`${sticker.type} sticker`}
        >
          <span className="text-gray-600 text-xs capitalize">{sticker.type}</span>
        </div>
      );
  }
}

export default InteractiveSticker;
