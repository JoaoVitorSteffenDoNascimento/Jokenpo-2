import React from 'react';
import { getSkinById, MOVES } from '../constants/gameData';
import { CardAuraId, MoveId } from '../types/game';

interface MoveCardProps {
  moveId: MoveId;
  skinId?: string;
  auraId?: CardAuraId;
  selected?: boolean;
  disabled?: boolean;
  compact?: boolean;
  shortcutKey?: string;
  onClick?: () => void;
}

const AURA_STYLES: Record<CardAuraId, { ringClass: string; glowClass: string; badgeLabel: string }> = {
  chama_real: {
    ringClass: 'shadow-[0_0_18px_rgba(245,158,11,0.45)] border-amber-400/80',
    glowClass: 'bg-amber-500/15',
    badgeLabel: 'Chama',
  },
  plasma_ciano: {
    ringClass: 'shadow-[0_0_18px_rgba(34,211,238,0.45)] border-cyan-400/80',
    glowClass: 'bg-cyan-500/15',
    badgeLabel: 'Plasma',
  },
  relampago_ouro: {
    ringClass: 'shadow-[0_0_18px_rgba(16,185,129,0.45)] border-emerald-400/80',
    glowClass: 'bg-emerald-500/15',
    badgeLabel: 'Esmeralda',
  },
  sombra_arcana: {
    ringClass: 'shadow-[0_0_18px_rgba(251,113,133,0.45)] border-rose-400/80',
    glowClass: 'bg-rose-500/15',
    badgeLabel: 'Névoa',
  },
  chamas_carmesim: {
    ringClass: 'shadow-[0_0_20px_rgba(239,68,68,0.5)] border-red-500/85',
    glowClass: 'bg-red-500/20',
    badgeLabel: 'Inferno',
  },
  relampago_eletrico: {
    ringClass: 'shadow-[0_0_20px_rgba(250,204,21,0.5)] border-yellow-400/85',
    glowClass: 'bg-yellow-400/20',
    badgeLabel: 'Tensão 24K',
  },
  void_cosmico: {
    ringClass: 'shadow-[0_0_20px_rgba(168,85,247,0.5)] border-purple-500/85',
    glowClass: 'bg-purple-500/20',
    badgeLabel: 'Void',
  },
  glitch_cyberpunk: {
    ringClass: 'shadow-[0_0_20px_rgba(16,185,129,0.55)] border-emerald-400/90',
    glowClass: 'bg-emerald-500/20',
    badgeLabel: 'Glitch',
  },
};

export const MoveCard: React.FC<MoveCardProps> = React.memo(({
  moveId,
  skinId,
  auraId,
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
  const auraStyle = auraId ? AURA_STYLES[auraId] : undefined;

  return (
    <button
      type="button"
      disabled={disabled || !onClick}
      onClick={onClick}
      className={`group relative flex w-full min-w-0 flex-col overflow-hidden rounded-xl border text-left transition-transform duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
        skin.frameClass
      } ${
        selected
          ? auraStyle
            ? `ring-2 ${auraStyle.ringClass} -translate-y-1`
            : 'ring-2 ring-amber-400 -translate-y-1 shadow-xl shadow-amber-500/25'
          : auraStyle
          ? `${auraStyle.ringClass} ${onClick && !disabled ? 'hover:-translate-y-1 cursor-pointer' : 'cursor-default'}`
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
        {auraStyle && (
          <div className={`pointer-events-none absolute inset-0 ${auraStyle.glowClass} mix-blend-screen opacity-70`} />
        )}
      </div>

      <div className={`${compact ? 'p-1.5 sm:p-2.5' : 'p-3'} w-full min-w-0 overflow-hidden`}>
        <div className="flex items-center justify-between gap-1.5 min-w-0">
          <span className="font-display text-xs sm:text-sm font-bold text-white truncate min-w-0">
            {isCustomSkin ? skin.name : move.name}
          </span>
          {(shortcutKey || isCustomSkin) && (
            <div className="hidden sm:flex items-center gap-1 shrink-0">
              {isCustomSkin && (
                <span
                  className="text-[10px] font-bold tracking-wide uppercase"
                  style={{ color: skin.accentColor }}
                >
                  {skin.rarity}
                </span>
              )}
              {shortcutKey && (
                <span className="font-mono-num rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-amber-300 border border-amber-400/30">
                  [{shortcutKey}]
                </span>
              )}
            </div>
          )}
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
