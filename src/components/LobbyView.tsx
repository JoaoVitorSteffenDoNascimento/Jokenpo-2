import React from 'react';
import {
  BookOpen,
  Bot,
  Coins,
  Copy,
  Gift,
  History,
  Map as MapIcon,
  Plus,
  Swords,
  Trophy,
  Users,
} from 'lucide-react';
import {
  DAILY_REWARD_COINS,
  getEloInfo,
  TROPHY_ROAD_MILESTONES,
} from '../constants/gameData';
import {
  canClaimDailyReward,
  claimDailyReward,
  createMatchRoom,
  findOrCreatePublicMatch,
  joinMatchByCode,
  joinMatchById,
  respondDuelInvite,
} from '../firebase/services';
import {
  DuelInvite,
  MatchFormat,
  MatchHistoryEntry,
  MatchMode,
  MatchRoom,
  PlayerProfile,
  TrophyProgressFeedback,
} from '../types/game';
import { soundFx } from '../utils/soundFx';

interface LobbyViewProps {
  player: PlayerProfile;
  waitingRooms: MatchRoom[];
  incomingInvites: DuelInvite[];
  matchHistory: MatchHistoryEntry[];
  recentTrophyProgress: TrophyProgressFeedback | null;
  onClearTrophyProgress: () => void;
  onEnterOnlineMatch: (matchId: string) => void;
  onStartBotMatch: (config: {
    mode: MatchMode;
    format: MatchFormat;
    isFriendly: boolean;
  }) => void;
  onOpenRules: () => void;
  onOpenTrophyRoad: () => void;
  onOpenSkinsShop?: () => void;
  onOpenDeployGuide?: () => void;
}

function formatRemainingTime(ms: number): string {
  const totalMinutes = Math.max(1, Math.ceil(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${hours}h ${mins}m`;
}

function formatMatchDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Agora';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export const LobbyView: React.FC<LobbyViewProps> = ({
  player,
  waitingRooms,
  incomingInvites,
  matchHistory,
  recentTrophyProgress,
  onClearTrophyProgress,
  onEnterOnlineMatch,
  onStartBotMatch,
  onOpenRules,
  onOpenTrophyRoad,
  onOpenSkinsShop,
  onOpenDeployGuide,
}) => {
  const [mode, setMode] = React.useState<MatchMode>('1v1');
  const [format, setFormat] = React.useState<MatchFormat>('MD3');
  const [isFriendly, setIsFriendly] = React.useState(false);
  const [joinCode, setJoinCode] = React.useState('');
  const [busyAction, setBusyAction] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const [displayTrophies, setDisplayTrophies] = React.useState(player.trophies);
  const [animatingTrophies, setAnimatingTrophies] = React.useState(false);

  React.useEffect(() => {
    if (!recentTrophyProgress) {
      setDisplayTrophies(player.trophies);
      setAnimatingTrophies(false);
    }
  }, [player.trophies, recentTrophyProgress]);

  React.useEffect(() => {
    if (!recentTrophyProgress) return;

    const from = recentTrophyProgress.previousTrophies;
    const to = recentTrophyProgress.newTrophies;
    setDisplayTrophies(from);
    setAnimatingTrophies(true);

    const duration = 1100;
    const start = performance.now();
    let rafId = 0;

    const step = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayTrophies(Math.round(from + (to - from) * eased));
      if (t < 1) {
        rafId = requestAnimationFrame(step);
      }
    };

    rafId = requestAnimationFrame(step);
    const clearTimer = setTimeout(() => {
      setAnimatingTrophies(false);
      onClearTrophyProgress();
    }, 4000);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(clearTimer);
    };
  }, [recentTrophyProgress, onClearTrophyProgress]);

  const elo = getEloInfo(animatingTrophies ? displayTrophies : player.trophies);
  const daily = canClaimDailyReward(player.lastDailyClaimAt);
  const claimedSet = new Set(player.claimedMilestones ?? []);
  const unclaimedMilestonesCount = TROPHY_ROAD_MILESTONES.filter(
    (m) => player.trophies >= m.trophies && !claimedSet.has(m.id)
  ).length;

  const handleClaimDaily = async () => {
    setFeedback(null);
    setBusyAction('daily');
    try {
      const amount = await claimDailyReward(player);
      soundFx.playCoin();
      setFeedback({
        type: 'success',
        text: `Recompensa diária resgatada: +${amount} moedinhas para comprar skins.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Não foi possível resgatar.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleQuickQueue = async () => {
    setFeedback(null);
    setBusyAction('queue');
    try {
      const room = await findOrCreatePublicMatch({
        player,
        mode,
        format,
        isFriendly,
      });
      onEnterOnlineMatch(room.id);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Erro ao buscar partida.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleCreatePrivate = async () => {
    setFeedback(null);
    setBusyAction('create');
    try {
      const room = await createMatchRoom({
        player,
        mode,
        format,
        isFriendly,
        isPublicQueue: false,
      });
      onEnterOnlineMatch(room.id);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Erro ao criar sala.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleJoinCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setBusyAction('code');
    try {
      const room = await joinMatchByCode(joinCode, player);
      onEnterOnlineMatch(room.id);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Código inválido.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleAcceptInvite = async (invite: DuelInvite) => {
    setFeedback(null);
    setBusyAction(`invite_${invite.id}`);
    try {
      await respondDuelInvite(invite.id, 'accepted');
      const room = await joinMatchById(invite.matchId, player);
      onEnterOnlineMatch(room.id);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Convite expirado ou sala cheia.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleDeclineInvite = async (inviteId: string) => {
    try {
      await respondDuelInvite(inviteId, 'declined');
    } catch {
      // ignore
    }
  };

  const totalMatches = player.wins + player.losses + player.draws;
  const winRate =
    totalMatches > 0 ? Math.round((player.wins / totalMatches) * 100) : 0;

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
      {/* Profile & Daily Reward Overview */}
      <section className="rounded-2xl border border-white/10 bg-[#131A26] p-6">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span className="font-semibold text-amber-400">{player.turma}</span>
              <span aria-hidden="true">·</span>
              <span className={`font-semibold ${elo.tier.badgeTextClass}`}>
                Elo {elo.tier.name}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-num">
                {player.wins}V / {player.losses}D / {player.draws}E ({winRate}%)
              </span>
              {player.lossStreak > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-sky-400 font-medium">
                    Proteção 3 derrotas: {player.lossStreak}/3
                  </span>
                </>
              )}
            </div>

            <h1 className="font-display text-3xl font-extrabold text-white">
              {player.nickname}
            </h1>

            {/* Elo Progress */}
            <div className="max-w-md pt-1">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>
                  {elo.nextTier
                    ? `Próximo elo: ${elo.nextTier.name} (${elo.nextTier.minTrophies} troféus)`
                    : 'Elo máximo alcançado: Pro (Temporada Mensal)'}
                </span>
                <span className="font-mono-num text-slate-300">
                  {elo.nextTier ? `Faltam ${elo.trophiesToNext}` : 'Topo'}
                </span>
              </div>
              <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-[#0B0F17] p-0.5">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ease-out ${
                    animatingTrophies && recentTrophyProgress && recentTrophyProgress.delta >= 0
                      ? 'bg-gradient-to-r from-amber-500 via-yellow-300 to-emerald-400'
                      : 'bg-amber-500'
                  }`}
                  style={{ width: `${elo.progressPercent}%` }}
                />
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={onOpenTrophyRoad}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/40 bg-[#0B0F17] px-3 py-1.5 text-xs font-semibold text-amber-300 hover:border-amber-400 hover:text-amber-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <MapIcon className="h-3.5 w-3.5" />
                  <span>
                    Caminho de Troféus
                    {unclaimedMilestonesCount > 0
                      ? ` · ${unclaimedMilestonesCount} para resgatar`
                      : ''}
                  </span>
                </button>

                {onOpenSkinsShop && (
                  <button
                    type="button"
                    onClick={onOpenSkinsShop}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-[#0B0F17] px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-amber-400/60 hover:text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <span>Inspecionar Objetos & Skins 3D</span>
                  </button>
                )}

                {onOpenDeployGuide && (
                  <button
                    type="button"
                    onClick={onOpenDeployGuide}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-[#0B0F17] px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-white/35 hover:text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <span>Deploy Vercel / GitHub Pages</span>
                  </button>
                )}
              </div>
              {animatingTrophies && recentTrophyProgress?.promotedTo && (
                <div className="mt-1.5 text-xs font-bold text-amber-300 animate-bounce">
                  Novo elo desbloqueado: {recentTrophyProgress.promotedTo}!
                </div>
              )}
            </div>
          </div>

          {/* Stats & Daily Reward */}
          <div className="flex flex-wrap items-center gap-5 sm:gap-7">
            <div
              className={`relative rounded-xl px-3 py-1.5 transition-all duration-500 ${
                animatingTrophies && recentTrophyProgress
                  ? recentTrophyProgress.delta >= 0
                    ? 'bg-amber-500/15 ring-2 ring-amber-400/70 scale-105'
                    : 'bg-red-500/10 ring-1 ring-red-400/50'
                  : ''
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <Trophy
                  className={`h-3.5 w-3.5 text-amber-400 transition-transform duration-300 ${
                    animatingTrophies && recentTrophyProgress && recentTrophyProgress.delta > 0
                      ? 'scale-125 animate-bounce'
                      : ''
                  }`}
                />
                <span>Troféus</span>
              </div>
              <div className="flex items-baseline gap-2">
                <div className="font-mono-num mt-0.5 text-2xl font-bold text-white transition-transform duration-300">
                  {displayTrophies}
                </div>
                {animatingTrophies && recentTrophyProgress && recentTrophyProgress.delta !== 0 && (
                  <span
                    className={`font-mono-num text-xs font-extrabold animate-bounce ${
                      recentTrophyProgress.delta > 0
                        ? 'text-emerald-400'
                        : 'text-red-400'
                    }`}
                  >
                    {recentTrophyProgress.delta > 0
                      ? `+${recentTrophyProgress.delta}`
                      : recentTrophyProgress.delta}
                  </span>
                )}
              </div>
              {animatingTrophies && recentTrophyProgress?.streakRecoveryTriggered && (
                <div className="mt-0.5 text-[10px] font-bold text-sky-300">
                  Recuperação 3 derrotas
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <Coins className="h-3.5 w-3.5 text-amber-300" />
                <span>Moedinhas</span>
              </div>
              <div className="font-mono-num mt-0.5 text-2xl font-bold text-amber-300">
                {player.coins}
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                disabled={!daily.eligible || busyAction === 'daily'}
                onClick={handleClaimDaily}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                  daily.eligible
                    ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 cursor-pointer'
                    : 'border border-white/10 bg-[#0B0F17] text-slate-400 cursor-not-allowed'
                }`}
              >
                <Gift className="h-4 w-4" />
                <span>
                  {daily.eligible
                    ? `Resgatar +${DAILY_REWARD_COINS} Moedas`
                    : `Diária em ${formatRemainingTime(daily.msRemaining)}`}
                </span>
              </button>

              <button
                type="button"
                onClick={onOpenRules}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-[#0B0F17] px-3.5 py-2.5 text-xs font-semibold text-slate-200 hover:border-white/30 hover:text-white cursor-pointer whitespace-nowrap shrink-0"
              >
                <BookOpen className="h-4 w-4 text-amber-400" />
                <span>Regras</span>
              </button>
            </div>
          </div>
        </div>

        {feedback && (
          <div
            className={`mt-4 rounded-lg border px-4 py-2.5 text-xs font-medium ${
              feedback.type === 'success'
                ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300'
                : 'border-red-500/40 bg-red-950/40 text-red-300'
            }`}
          >
            {feedback.text}
          </div>
        )}
      </section>

      {/* Incoming Duel Invites */}
      {incomingInvites.length > 0 && (
        <section className="rounded-2xl border border-amber-500/35 bg-[#131A26] p-5 space-y-3">
          <h2 className="font-display text-base font-bold text-amber-400">
            Convites de Duelo Recebidos
          </h2>
          <div className="divide-y divide-white/10">
            {incomingInvites.map((inv) => (
              <div
                key={inv.id}
                className="flex flex-col justify-between gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center"
              >
                <div className="text-sm">
                  <span className="font-bold text-white">{inv.fromNickname}</span>
                  <span className="text-slate-400">
                    {' '}
                    ({inv.fromTurma}) convidou você · {inv.mode} · {inv.format} ·{' '}
                    {inv.isFriendly ? 'Amistoso' : 'Ranqueado'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busyAction === `invite_${inv.id}`}
                    onClick={() => handleAcceptInvite(inv)}
                    className="rounded-lg bg-amber-500 px-3.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-400 cursor-pointer"
                  >
                    Aceitar e Entrar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeclineInvite(inv.id)}
                    className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
                  >
                    Recusar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Main Arena Configurator + Public Rooms */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Battle Setup */}
        <section className="lg:col-span-7 rounded-2xl border border-white/10 bg-[#131A26] p-6 space-y-6">
          <div>
            <h2 className="font-display text-xl font-bold text-white">
              Configurar Duelo
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Escolha entre 1v1, Duplas (2v2) ou Trios (3v3), no formato Melhor de 3 ou Melhor de 5.
            </p>
          </div>

          <div className="space-y-4">
            {/* Mode selector */}
            <div>
              <span className="block text-xs font-semibold text-slate-300 mb-2">
                Modo de Equipe
              </span>
              <div className="grid grid-cols-3 gap-2 rounded-xl bg-[#0B0F17] p-1">
                {(['1v1', '2v2', '3v3'] as MatchMode[]).map((m) => {
                  const active = mode === m;
                  const label = m === '1v1' ? '1v1 Solo' : m === '2v2' ? 'Duplas 2v2' : 'Trios 3v3';
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMode(m)}
                      className={`rounded-lg py-2.5 text-xs font-bold transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#1A2333] text-amber-400'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Format selector */}
            <div>
              <span className="block text-xs font-semibold text-slate-300 mb-2">
                Formato da Partida
              </span>
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#0B0F17] p-1">
                <button
                  type="button"
                  onClick={() => setFormat('MD3')}
                  className={`rounded-lg px-3 py-2.5 text-xs font-bold transition-colors cursor-pointer ${
                    format === 'MD3'
                      ? 'bg-[#1A2333] text-amber-400'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Melhor de 3 (
                  {mode === '3v3'
                    ? '+50–60'
                    : mode === '2v2'
                    ? '+40–50'
                    : '+10–20'}{' '}
                  / -10–20)
                </button>
                <button
                  type="button"
                  onClick={() => setFormat('MD5')}
                  className={`rounded-lg px-3 py-2.5 text-xs font-bold transition-colors cursor-pointer ${
                    format === 'MD5'
                      ? 'bg-[#1A2333] text-amber-400'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Melhor de 5 (
                  {mode === '3v3'
                    ? '+55–65'
                    : mode === '2v2'
                    ? '+45–55'
                    : '+20–30'}{' '}
                  / -20–30)
                </button>
              </div>
            </div>

            {/* Ranked vs Friendly */}
            <div>
              <span className="block text-xs font-semibold text-slate-300 mb-2">
                Tipo de Disputa
              </span>
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#0B0F17] p-1">
                <button
                  type="button"
                  onClick={() => setIsFriendly(false)}
                  className={`rounded-lg py-2.5 text-xs font-bold transition-colors cursor-pointer ${
                    !isFriendly
                      ? 'bg-[#1A2333] text-amber-400'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Ranqueada (Vale Troféus)
                </button>
                <button
                  type="button"
                  onClick={() => setIsFriendly(true)}
                  className={`rounded-lg py-2.5 text-xs font-bold transition-colors cursor-pointer ${
                    isFriendly
                      ? 'bg-[#1A2333] text-sky-400'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Duelo Amistoso (0 troféus)
                </button>
              </div>
            </div>
          </div>

          {/* Primary Launch Buttons */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pt-2">
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={handleQuickQueue}
              className="flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-3.5 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-60 transition-colors cursor-pointer"
            >
              <Swords className="h-4 w-4" />
              <span>
                {busyAction === 'queue' ? 'Entrando na fila...' : 'Buscar Oponente Online'}
              </span>
            </button>

            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => onStartBotMatch({ mode, format, isFriendly })}
              className="flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-[#0B0F17] px-5 py-3.5 text-sm font-bold text-white hover:border-amber-400/60 transition-colors cursor-pointer"
            >
              <Bot className="h-4 w-4 text-amber-400" />
              <span>Jogar Agora vs Bot</span>
            </button>
          </div>

          <div className="flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={handleCreatePrivate}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 bg-[#0B0F17] px-4 py-2.5 text-xs font-semibold text-slate-200 hover:border-white/30 hover:text-white cursor-pointer whitespace-nowrap"
            >
              <Plus className="h-4 w-4 text-amber-400" />
              <span>Criar Sala Privada (Código / Amigos)</span>
            </button>

            <form onSubmit={handleJoinCode} className="flex items-center gap-2">
              <input
                type="text"
                maxLength={8}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Código (ex: K7P9M2)"
                className="font-mono-num w-40 rounded-lg border border-white/15 bg-[#0B0F17] px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
              />
              <button
                type="submit"
                disabled={busyAction === 'code' || joinCode.trim().length < 4}
                className="rounded-lg bg-white/10 px-3.5 py-2 text-xs font-bold text-white hover:bg-white/20 disabled:opacity-40 cursor-pointer"
              >
                Entrar
              </button>
            </form>
          </div>
        </section>

        {/* Open Public Queue Rooms */}
        <section className="lg:col-span-5 rounded-2xl border border-white/10 bg-[#131A26] p-6 flex flex-col">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div>
              <h2 className="font-display text-lg font-bold text-white">
                Salas Online Abertas
              </h2>
              <p className="text-xs text-slate-400">
                Entre direto em uma partida aguardando jogadores
              </p>
            </div>
            <Users className="h-5 w-5 text-slate-400" />
          </div>

          <div className="mt-4 flex-1 space-y-3">
            {waitingRooms.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-[#0B0F17]/60 p-6 text-center">
                <p className="text-sm font-medium text-slate-300">
                  Nenhuma sala pública aberta no momento
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Clique em Buscar Oponente Online para abrir uma nova sala ou enfrente os Bots.
                </p>
              </div>
            ) : (
              waitingRooms.map((room) => {
                const totalNeeded = room.teamSize * 2;
                const currentCount = room.participantUids.length;
                const isAlreadyIn = room.participantUids.includes(player.uid);
                return (
                  <div
                    key={room.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#0B0F17] p-3.5"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-bold text-white truncate">
                        <span>{room.teamA[0]?.nickname ?? 'Jogador'}</span>
                        <span className="text-xs font-normal text-slate-400">
                          {room.teamA[0]?.turma}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
                        <span>{room.mode}</span>
                        <span aria-hidden="true">·</span>
                        <span>{room.format}</span>
                        <span aria-hidden="true">·</span>
                        <span>{room.isFriendly ? 'Amistoso' : 'Ranqueada'}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-num text-amber-400">
                          {currentCount}/{totalNeeded}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={async () => {
                        if (isAlreadyIn) {
                          onEnterOnlineMatch(room.id);
                          return;
                        }
                        try {
                          await joinMatchById(room.id, player);
                          onEnterOnlineMatch(room.id);
                        } catch (err) {
                          setFeedback({
                            type: 'error',
                            text:
                              err instanceof Error
                                ? err.message
                                : 'Não foi possível entrar na sala.',
                          });
                        }
                      }}
                      className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3.5 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 shrink-0 cursor-pointer"
                    >
                      {isAlreadyIn ? 'Voltar' : 'Jogar'}
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4 text-xs text-slate-400">
            <span>Dica: em Duplas e Trios cada integrante joga na sua posição.</span>
            <Copy className="h-3.5 w-3.5 shrink-0 opacity-0" aria-hidden="true" />
          </div>
        </section>
      </div>

      {/* Histórico (Últimos 5 Duelos) */}
      <section className="rounded-2xl border border-white/10 bg-[#131A26] p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div>
            <h2 className="font-display text-lg font-bold text-white">
              Histórico
            </h2>
            <p className="text-xs text-slate-400">
              Seus últimos 5 duelos registrados na arena
            </p>
          </div>
          <History className="h-5 w-5 text-amber-400" />
        </div>

        {matchHistory.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-[#0B0F17]/60 px-6 py-10 text-center">
            <p className="text-sm font-medium text-slate-300">
              Nenhum duelo registrado ainda
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Dispute uma partida ranqueada, amistosa ou contra os bots para ver seu histórico recente aqui.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {matchHistory.slice(0, 5).map((entry) => {
              const outcomeLabel =
                entry.outcome === 'win'
                  ? 'Vitória'
                  : entry.outcome === 'loss'
                  ? 'Derrota'
                  : 'Empate';
              const outcomeColor =
                entry.outcome === 'win'
                  ? 'text-emerald-400'
                  : entry.outcome === 'loss'
                  ? 'text-red-400'
                  : 'text-slate-300';

              return (
                <div
                  key={entry.id}
                  className="flex flex-col justify-between gap-3 py-3.5 first:pt-1 last:pb-0 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className={`font-bold ${outcomeColor}`}>
                        {outcomeLabel}
                      </span>
                      <span aria-hidden="true" className="text-slate-600">
                        ·
                      </span>
                      <span className="font-semibold text-white truncate">
                        vs {entry.opponentName}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <span>{entry.opponentTurma}</span>
                      <span aria-hidden="true">·</span>
                      <span>{entry.mode}</span>
                      <span aria-hidden="true">·</span>
                      <span>{entry.format}</span>
                      <span aria-hidden="true">·</span>
                      <span>{entry.isFriendly ? 'Amistoso' : 'Ranqueada'}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-num">
                        {formatMatchDateTime(entry.playedAt)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-5 sm:justify-end shrink-0">
                    <div className="text-right">
                      <div className="text-[11px] text-slate-500">Placar</div>
                      <div className="font-mono-num text-sm font-bold text-white">
                        {entry.scoreText}
                      </div>
                    </div>

                    <div className="min-w-[82px] text-right">
                      <div className="text-[11px] text-slate-500">Troféus</div>
                      <div
                        className={`font-mono-num text-sm font-bold ${
                          entry.trophyDelta > 0
                            ? 'text-emerald-400'
                            : entry.trophyDelta < 0
                            ? 'text-red-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {entry.trophyDelta > 0
                          ? `+${entry.trophyDelta}`
                          : entry.trophyDelta}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
};
