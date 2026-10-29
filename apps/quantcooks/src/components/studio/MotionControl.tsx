// ============================================================================
// QuantCooks Studio — Motion Control (spec §3.3, checklist #25, G-4)
//
// The camera-preset stack builder, as its own surface inside the Video
// Studio workspace. Moves are QuantCooks' original food vocabulary on the
// generic camera families; the library below is the local catalogue (the
// list_camera_presets data shape) until that endpoint lands, exactly like
// presets.ts feeds Explore.
//
// Stacking rules are the lib's, not the component's whim: at most 3 moves,
// an ordered stack the user can reorder and trim, and incompatible pairs
// BLOCK with the reason printed where the tap happened — a move is never
// silently dropped or swapped. Each stacked move re-prices Generate
// through pricing.ts's stacked-extras term; the impact is stated here in
// the same words the quote uses.
// ============================================================================

import React from 'react';
import {
  CAMERA_MOVE_FAMILIES,
  MAX_CAMERA_STACK,
  STACKED_EXTRA_CREDITS,
  cameraMoveById,
  cameraMovesForFamily,
} from '../../lib/studio/video';

export interface MotionControlProps {
  /** Move ids in run order. */
  stack: string[];
  /** The last blocked add's reason (or other stack notice), shown inline. */
  notice?: string | null;
  onAdd: (moveId: string) => void;
  onRemove: (moveId: string) => void;
  onMove: (moveId: string, direction: -1 | 1) => void;
}

export const MotionControl: React.FC<MotionControlProps> = ({
  stack,
  notice,
  onAdd,
  onRemove,
  onMove,
}) => {
  return (
    <div className="studio-motion" data-testid="motion-control">
      <div className="studio-motion-stack" aria-label="Your camera move stack">
        <h3>
          Your stack · {stack.length} of {MAX_CAMERA_STACK} moves
        </h3>
        {stack.length === 0 ? (
          <p data-testid="motion-stack-empty">
            No moves stacked yet. Tap a move below to add it — moves run in stack order, first move first.
          </p>
        ) : (
          <ol className="studio-motion-stack-list">
            {stack.map((moveId, index) => {
              const move = cameraMoveById(moveId);
              if (!move) return null;
              return (
                <li key={moveId} className="studio-motion-stack-item" data-testid={`motion-stack-item-${moveId}`}>
                  <span className="studio-motion-stack-name">
                    {index + 1}. {move.name}
                  </span>
                  <button
                    type="button"
                    data-testid={`motion-move-up-${moveId}`}
                    aria-label={`Move ${move.name} earlier`}
                    disabled={index === 0}
                    onClick={() => onMove(moveId, -1)}
                  >
                    Earlier
                  </button>
                  <button
                    type="button"
                    data-testid={`motion-move-down-${moveId}`}
                    aria-label={`Move ${move.name} later`}
                    disabled={index === stack.length - 1}
                    onClick={() => onMove(moveId, 1)}
                  >
                    Later
                  </button>
                  <button
                    type="button"
                    data-testid={`motion-remove-${moveId}`}
                    aria-label={`Remove ${move.name}`}
                    onClick={() => onRemove(moveId)}
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ol>
        )}
        <p className="studio-motion-stack-price" data-testid="motion-stack-price">
          {stack.length === 0
            ? 'Moves are optional — a plain described shot is fine. Each move you stack adds to the price.'
            : `${stack.length} move${stack.length === 1 ? '' : 's'} stacked · +${stack.length * STACKED_EXTRA_CREDITS} credits on the run, already counted in the Generate price.`}
        </p>
        {notice && (
          <p className="studio-motion-notice" data-testid="motion-stack-notice" role="alert">
            {notice}
          </p>
        )}
      </div>

      <div className="studio-motion-library" aria-label="Camera move library">
        {CAMERA_MOVE_FAMILIES.map((family) => {
          const moves = cameraMovesForFamily(family);
          if (moves.length === 0) return null;
          return (
            <section key={family} className="studio-motion-family" data-testid={`motion-family-${family}`}>
              <h3>{family}</h3>
              <ul className="studio-motion-grid">
                {moves.map((move) => {
                  const stacked = stack.includes(move.id);
                  return (
                    <li key={move.id}>
                      <button
                        type="button"
                        className="studio-motion-card"
                        data-testid={`motion-add-${move.id}`}
                        aria-pressed={stacked}
                        disabled={stacked}
                        onClick={() => onAdd(move.id)}
                      >
                        <strong>{move.name}</strong>
                        <span>{move.description}</span>
                        <span className="studio-motion-bestfor">Best for: {move.bestFor.join(' · ')}</span>
                        <span className="studio-motion-card-state">
                          {stacked ? 'In your stack' : `Add to stack · typical run ${move.typicalCredits} credits`}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
};

export default MotionControl;
