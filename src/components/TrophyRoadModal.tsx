import React from 'react';
import { CheckCircle2, Coins, Gift, Lock, Trophy, X } from 'lucide-react';
import {
  ELO_TIERS,
  getEloInfo,
  getSkinById,
  MOVES,
  TROPHY_ROAD_MILESTONES,
} from '../constants/gameData';
import { claimTrophyMilestone } from '../firebase/services';
import { PlayerProfile, TrophyMilestone } from '../types/game';
import { soundFx } from '../utils/soundFx';

interface TrophyRoadModalProps {
  open: boolean;
  player: PlayerProfile;
  onClose: () => void;
}

export const TrophyRoadModal: React.FC<TrophyRoadModalProps> = ({
  open,
  player,
  onClose,
}) => {
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  if (!open) return null;

  const elo = getEloInfo(player.trophies);
  const claimedSet = new Set(player.claimedMilestones ?? []);

  const handleClaim = async (milestone: TrophyMilestone) => {
    setFeedback(null);
    setBusyId(milestone.id);
    try {
      const res = await claimTrophyMilestone(player, milestone);
      soundFx.playCoin();
      setFeedback({
        type: 'success',
        text: res.skinUnlocked
          ? `Marco de ${milestone.trophies} troféus resgatado: +${res.coinsAwarded} moedinhas e skin "${res.skinUnlocked}" desbloqueada!`
          : `Marco de ${milestone.trophies} troféus resgatado: +${res.coinsAwarded} moedinhas adicionadas!`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Não foi possível resgatar a recompensa.',
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="trophy-road-title"
    >
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-2xl border border-white/15 bg-[#131A26] shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/10 p-6">
          <div>
            <div className="text-xs font-semibold text-amber-400">
              {player.nickname} · {player.turma} · Elo {elo.tier.name}
            </div>
            <h2
              id="trophy-road-title"
              className="font-display mt-1 text-2xl font-extrabold text-white"
            >
              Caminho de Troféus
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Suba de elo para desbloquear moedinhas e skins exclusivas de jogadas.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar Caminho de Troféus"
            className="rounded-lg border border-white/15 bg-[#0B0F17] p-2 text-slate-300 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Summary & Progress */}
        <div className="border-b border-white/10 bg-[#0B0F17] px-6 py-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <Trophy className="h-5 w-5 text-amber-400" />
              <div>
                <div className="text-[11px] text-slate-400">Troféus atuais</div>
                <div className="font-mono-num text-xl font-extrabold text-white">
                  {player.trophies}
                </div>
              </div>
            </div>

            <div className="text-right text-xs text-slate-400">
              {elo.nextTier ? (
                <span>
                  Próximo elo:{' '}
                  <strong className={elo.nextTier.badgeTextClass}>
                    {elo.nextTier.name}
                  </strong>{' '}
                  ·{' '}
                  <span className="font-mono-num text-slate-200">
                    Faltam {elo.trophiesToNext}
                  </span>
                </span>
              ) : (
                <span className="font-semibold text-amber-400">
                  Elo Pro ativo · Temporada Mensal ({player.proSeasonTrophies ?? Math.max(0, player.trophies - 10000)} pts extras)
                </span>
              )}
            </div>
          </div>

          {/* Mini Ladder Overview */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
            {ELO_TIERS.map((tier, index) => {
              const reached = player.trophies >= tier.minTrophies;
              return (
                <React.Fragment key={tier.id}>
                  <span
                    className={
                      reached
                        ? `font-semibold ${tier.badgeTextClass}`
                        : 'text-slate-500'
                    }
                  >
                    {tier.name} ({tier.minTrophies})
                  </span>
                  {index < ELO_TIERS.length - 1 && (
                    <span aria-hidden="true" className="text-slate-600">
                      ·
                    </span>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Feedback */}
        {feedback && (
          <div className="px-6 pt-4">
            <div
              className={`rounded-lg border px-4 py-2.5 text-xs font-medium ${
                feedback.type === 'success'
                  ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300'
                  : 'border-red-500/40 bg-red-950/40 text-red-300'
              }`}
            >
              {feedback.text}
            </div>
          </div>
        )}

        {/* Milestone List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {TROPHY_ROAD_MILESTONES.map((ms) => {
            const unlocked = player.trophies >= ms.trophies;
            const claimed = claimedSet.has(ms.id);
            const missing = Math.max(0, ms.trophies - player.trophies);
            const skin = ms.skinId ? getSkinById(ms.skinId) : null;
            const moveMeta = skin ? MOVES[skin.moveId] : null;
            const alreadyOwnedSkin = skin
              ? player.unlockedSkins.includes(skin.id)
              : false;

            return (
              <div
                key={ms.id}
                className={`flex flex-col justify-between gap-4 rounded-xl border p-4 sm:flex-row sm:items-center ${
                  claimed
                    ? 'border-white/5 bg-[#0B0F17]/50 opacity-75'
                    : unlocked
                    ? 'border-amber-400/50 bg-[#0B0F17]'
                    : 'border-white/10 bg-[#0B0F17]/80'
                }`}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="flex h-12 w-20 shrink-0 flex-col items-center justify-center rounded-lg border border-white/10 bg-[#131A26] px-2">
                    <span className="font-mono-num text-sm font-extrabold text-amber-400">
                      {ms.trophies}
                    </span>
                    <span className="text-[10px] text-slate-400">troféus</span>
                  </div>

                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-white">
                      <span>Elo {ms.eloName}</span>
                      <span aria-hidden="true" className="text-slate-600">
                        ·
                      </span>
                      <span className="inline-flex items-center gap-1 font-mono-num text-amber-300">
                        <Coins className="h-3.5 w-3.5" />
                        <span>+{ms.coins} moedinhas</span>
                      </span>
                    </div>

                    {skin && moveMeta && (
                      <div className="flex items-center gap-2.5 text-xs text-slate-300">
                        <img
                          src={moveMeta.image}
                          alt={skin.name}
                          referrerPolicy="no-referrer"
                          className={`h-7 w-7 rounded object-cover border border-white/15 ${skin.imageFilterClass}`}
                        />
                        <span className="truncate">
                          Skin: <strong className="text-white">{skin.name}</strong> ({moveMeta.name})
                          {alreadyOwnedSkin && !claimed && ' · Já possui (+50 moedas bônus)'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-end shrink-0">
                  {claimed ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Resgatado</span>
                    </span>
                  ) : unlocked ? (
                    <button
                      type="button"
                      disabled={busyId === ms.id}
                      onClick={() => handleClaim(ms)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                    >
                      <Gift className="h-3.5 w-3.5" />
                      <span>
                        {busyId === ms.id ? 'Resgatando...' : 'Resgatar'}
                      </span>
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 font-mono-num text-xs font-medium text-slate-500">
                      <Lock className="h-3.5 w-3.5" />
                      <span>Faltam {missing}</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
