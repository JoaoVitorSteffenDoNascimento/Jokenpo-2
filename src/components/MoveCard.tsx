import React from 'react';
import { getSkinById, MOVES } from '../constants/gameData';
import { MoveId } from '../types/game';

interface MoveCardProps {
  moveId: MoveId;
  skinId?: string;
  selected?: boolean;
  disabled?: boolean;
  compact?: boolean;
  shortcutKey?: string;
  onClick?: () => void;
}

export const MoveCard: React.FC<MoveCardProps> = React.memo(({
  moveId,
  skinId,
  selected = false,
  disabled = false,
  compact = false,
  shortcutKey,
  onClick,
}) => {
  const move = MOVES[moveId];
  const skin = getSkinById(skinId);
  const [imgError, setImgError] = React.useState(false);

  const isCustomSkin = skin.cost > 0;
  const displayImage = skin.customImage ?? move.image;

  return (
    <button
      type="button"
      disabled={disabled || !onClick}
      onClick={onClick}
      className={`group relative flex flex-col overflow-hidden rounded-xl border text-left transition-transform duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
        skin.frameClass
      } ${
        selected
          ? 'ring-2 ring-amber-400 -translate-y-1 shadow-xl shadow-amber-500/25'
          : onClick && !disabled
          ? 'hover:-translate-y-1 hover:border-amber-400/70 cursor-pointer'
          : 'cursor-default'
      } ${disabled && !selected ? 'opacity-55' : ''}`}
    >
      <div
        className={`relative w-full overflow-hidden bg-[#0E141F] ${
          compact ? 'aspect-[4/3] sm:aspect-square' : 'aspect-square'
        }`}
      >
        {!imgError ? (
          <img
            src={displayImage}
            alt={`${move.name} - ${skin.name}`}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className={`h-full w-full object-cover transition-transform duration-200 ${
              onClick && !disabled ? 'group-hover:scale-105' : ''
            } ${skin.imageFilterClass}`}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900 p-3 text-center">
            <span className="font-display text-sm font-bold text-slate-200">
              {move.name}
            </span>
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />

        {shortcutKey && (
          <span className="hidden sm:inline-block font-mono-num absolute top-2 left-2 rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-bold text-amber-300 border border-amber-400/30">
            [{shortcutKey}]
          </span>
        )}

        {isCustomSkin && (
          <span
            className="hidden sm:inline-block absolute bottom-1.5 right-2 text-[10px] font-bold tracking-wide uppercase"
            style={{ color: skin.accentColor }}
          >
            {skin.rarity}
          </span>
        )}
      </div>

      <div className={compact ? 'p-1.5 sm:p-2.5' : 'p-3'}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-display text-xs sm:text-sm font-bold text-white truncate">
            {isCustomSkin ? skin.name : move.name}
          </span>
        </div>
        <p className="mt-0.5 text-[10px] sm:text-[11px] text-slate-400 truncate">
          {isCustomSkin
            ? `${move.shortName} · ${skin.material3d?.finishLabel ?? skin.rarity}`
            : `Vence ${MOVES[move.beats[0]].shortName} · ${MOVES[move.beats[1]].shortName}`}
        </p>
      </div>
    </button>
  );
});
