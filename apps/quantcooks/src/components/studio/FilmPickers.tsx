// ============================================================================
// QuantCooks Studio — Recipe Film Studio pickers (spec §5.3, checklist #41)
//
// The film composer's three pickers, shared by the Film home hero and the
// project workspace so the two surfaces can never diverge:
//  - GenrePickerModal: preview swatch left, genre list right; a pick
//    writes back into the composer's Genre chip (the Promo format-modal
//    lesson: the modal is never a separate workflow).
//  - StylePanel: three columns — Colour Palette / Lighting / Camera
//    Moveset Style — each Auto or a named choice; a Manual Style toggle
//    gates the named choices; the Style chip summarises the three picks.
//  - CameraMovePicker: the camera library (video.ts vocabulary) as a
//    single-pick list for one shot / one composer brief.
// All copy and names are original QuantCooks (spec §5.3).
// ============================================================================

import React from 'react';
import {
  FILM_GENRES,
  FILM_LIGHTING,
  FILM_MOVESETS,
  FILM_PALETTES,
  FILM_STYLE_AUTO,
  filmGenreById,
  type FilmGenre,
  type FilmStyle,
} from '../../lib/studio/film';
import { CAMERA_MOVES, type CameraMove } from '../../lib/studio/video';

// ---------------------------------------------------------------------------
// Genre picker modal
// ---------------------------------------------------------------------------

export interface GenrePickerModalProps {
  open: boolean;
  selectedId?: string | null;
  onSelect: (genre: FilmGenre) => void;
  onClose: () => void;
}

export const GenrePickerModal: React.FC<GenrePickerModalProps> = ({
  open,
  selectedId,
  onSelect,
  onClose,
}) => {
  if (!open) return null;
  const selected = filmGenreById(selectedId ?? null);
  return (
    <div className="studio-film-genre-modal" data-testid="film-genre-modal" role="dialog" aria-label="Pick a genre">
      <div className="studio-film-genre-preview" data-testid="film-genre-preview">
        {selected ? (
          <>
            <strong>{selected.name}</strong>
            <p>{selected.description}</p>
            <p>Picking a genre closes this panel and writes the choice onto the composer chip.</p>
          </>
        ) : (
          <>
            <strong>No genre picked yet</strong>
            <p>
              A genre is the film&rsquo;s overall feel — it rides on every shot the Director plans, and you
              can change it any time before a shot is generated.
            </p>
          </>
        )}
      </div>
      <ul className="studio-film-genre-list" aria-label="Genres">
        {FILM_GENRES.map((genre) => (
          <li key={genre.id}>
            <button
              type="button"
              data-testid={`film-genre-${genre.id}`}
              aria-pressed={selectedId === genre.id}
              onClick={() => onSelect(genre)}
            >
              <strong>{genre.name}</strong>
              <span>{genre.description}</span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" data-testid="film-genre-close" onClick={onClose}>
        Close
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Style panel — three columns, Auto or named, Manual Style toggle
// ---------------------------------------------------------------------------

export interface StylePanelProps {
  style: FilmStyle;
  onChange: (style: FilmStyle) => void;
  /** Manual Style off = every column is held at Auto (spec §5.3 toggle). */
  manual: boolean;
  onManualChange: (manual: boolean) => void;
}

const STYLE_COLUMNS: Array<{ key: keyof FilmStyle; label: string; options: string[] }> = [
  { key: 'palette', label: 'Colour Palette', options: FILM_PALETTES },
  { key: 'lighting', label: 'Lighting', options: FILM_LIGHTING },
  { key: 'moveset', label: 'Camera Moveset Style', options: FILM_MOVESETS },
];

export const StylePanel: React.FC<StylePanelProps> = ({ style, onChange, manual, onManualChange }) => {
  const effective: FilmStyle = manual
    ? style
    : { palette: FILM_STYLE_AUTO, lighting: FILM_STYLE_AUTO, moveset: FILM_STYLE_AUTO };
  return (
    <div className="studio-film-style-panel" data-testid="film-style-panel" aria-label="Style settings">
      <label className="studio-film-style-manual">
        <input
          type="checkbox"
          data-testid="film-style-manual"
          checked={manual}
          onChange={(e) => onManualChange(e.target.checked)}
        />
        Manual Style — off holds every column at Auto
      </label>
      <div className="studio-film-style-columns">
        {STYLE_COLUMNS.map((column) => (
          <div key={column.key} className="studio-film-style-column" data-testid={`film-style-column-${column.key}`}>
            <h3>{column.label}</h3>
            {column.options.map((option) => (
              <button
                key={option}
                type="button"
                data-testid={`film-style-${column.key}-${option.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                aria-pressed={effective[column.key] === option}
                disabled={!manual && option !== FILM_STYLE_AUTO}
                onClick={() => onChange({ ...style, [column.key]: option })}
              >
                {option}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Camera move picker — one pick for a shot or a composer brief
// ---------------------------------------------------------------------------

export interface CameraMovePickerProps {
  selectedId?: string | null;
  onSelect: (move: CameraMove) => void;
  onClear?: () => void;
}

export const CameraMovePicker: React.FC<CameraMovePickerProps> = ({ selectedId, onSelect, onClear }) => {
  return (
    <div className="studio-film-camera-picker" data-testid="film-camera-picker" aria-label="Camera moves">
      <p>
        One move per pick here — stacking up to three moves on a single clip lives in Video Studio&rsquo;s
        Motion Control. A shot in a film carries one deliberate move.
      </p>
      <ul>
        {CAMERA_MOVES.map((move) => (
          <li key={move.id}>
            <button
              type="button"
              data-testid={`film-camera-${move.id}`}
              aria-pressed={selectedId === move.id}
              onClick={() => onSelect(move)}
            >
              <strong>{move.name}</strong>
              <span>
                {move.family} · {move.description}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {onClear && (
        <button type="button" data-testid="film-camera-clear" onClick={onClear}>
          Director&rsquo;s choice — no fixed move
        </button>
      )}
    </div>
  );
};

export default GenrePickerModal;
