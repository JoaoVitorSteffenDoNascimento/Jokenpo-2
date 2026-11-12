import React from 'react';
import { Coins, Gift, Sparkles, X } from 'lucide-react';
import { PlayerProfile } from '../types/game';

interface DailyRewardModalProps {
  open: boolean;
  player: PlayerProfile;
  coinsAwarded: number;
  newCoins: number;
  onClose: () => void;
  onGoToShop: () => void;
}

export const DailyRewardModal: React.FC<DailyRewardModalProps> = ({
  open,
  player,
  coinsAwarded,
  newCoins,
  onClose,
  onGoToShop,
}) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="daily-bonus-title"
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-amber-500/35 bg-[#131A26] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
            <Gift className="h-4 w-4" />
            <span>PRIMEIRO LOGIN DO DIA</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar bônus diário"
            className="rounded-lg border border-white/10 p-1.5 text-slate-400 hover:bg-white/5 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 text-center space-y-5">
          <div>
            <h2
              id="daily-bonus-title"
              className="font-display text-2xl font-extrabold text-white"
            >
              Recompensa Diária Entregue!
            </h2>
            <p className="mt-1.5 text-sm text-slate-300">
              Bem-vindo de volta,{' '}
              <span className="font-semibold text-white">{player.nickname}</span>{' '}
              <span className="text-slate-400">({player.turma})</span>.
            </p>
          </div>

          <div className="rounded-xl border border-amber-500/30 bg-[#0B0F17] p-5 space-y-2">
            <div className="text-xs font-medium text-slate-400">
              Bônus de acesso diário
            </div>
            <div className="font-mono-num flex items-center justify-center gap-2 text-4xl font-extrabold text-amber-400">
              <Coins className="h-7 w-7" />
              <span>+{coinsAwarded}</span>
            </div>
            <div className="pt-1 text-xs text-slate-400">
              Saldo atualizado:{' '}
              <span className="font-mono-num font-bold text-slate-200">
                {newCoins} moedas
              </span>
            </div>
          </div>

          <p className="text-xs leading-relaxed text-slate-400">
            Use suas moedinhas exclusivamente na Loja de Skins para personalizar
            suas jogadas de Papel, Parafal, Pedra, Gelo Invertido, Tesoura e Jegue.
          </p>

          <div className="flex flex-col gap-2.5 sm:flex-row">
            <button
              type="button"
              onClick={onGoToShop}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-amber-400/40 bg-[#0B0F17] py-3 text-xs font-bold text-amber-300 hover:border-amber-400 cursor-pointer"
            >
              <Sparkles className="h-4 w-4" />
              <span>Ir para Loja de Skins</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl bg-amber-500 py-3 text-xs font-bold text-slate-950 hover:bg-amber-400 cursor-pointer"
            >
              Continuar na Arena
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
