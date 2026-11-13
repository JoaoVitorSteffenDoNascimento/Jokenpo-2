import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { MOVES } from '../constants/gameData';
import { MatchRoom, RoundSummary } from '../types/game';
import { MoveCard } from './MoveCard';
import { Flame, Shield, Swords, Trophy, Zap } from 'lucide-react';
import { vibrateHeavy } from '../utils/haptics';

interface CinematicClashOverlayProps {
  revealRound: RoundSummary | null;
  playerTeam: 'A' | 'B';
  room: MatchRoom;
}

export const CinematicClashOverlay: React.FC<CinematicClashOverlayProps> = ({
  revealRound,
  playerTeam,
}) => {
  const [phase, setPhase] = React.useState<'intro' | 'clash' | 'exalt' | 'banner'>('intro');

  React.useEffect(() => {
    if (!revealRound) {
      setPhase('intro');
      return;
    }

    setPhase('intro');
    const tClash = setTimeout(() => {
      setPhase('clash');
      vibrateHeavy();
    }, 350);

    const tExalt = setTimeout(() => {
      setPhase('exalt');
    }, 850);

    const tBanner = setTimeout(() => {
      setPhase('banner');
    }, 2250);

    return () => {
      clearTimeout(tClash);
      clearTimeout(tExalt);
      clearTimeout(tBanner);
    };
  }, [revealRound]);

  if (!revealRound) return null;

  const isPlayerWin = revealRound.winnerTeam === playerTeam;
  const isDraw = revealRound.winnerTeam === 'DRAW';
  const clashes = revealRound.clashes || [];

  return (
    <AnimatePresence>
      <motion.div
        key={`clash-overlay-${revealRound.roundNumber}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="pointer-events-none fixed inset-0 z-50 flex flex-col items-center justify-center p-3 sm:p-6 overflow-hidden select-none"
      >
        {/* Dynamic Vignette & Radial Atmospheric Background */}
        <div className="absolute inset-0 bg-radial-[circle_at_center,_rgba(15,23,42,0.85)_0%,_rgba(2,6,23,0.96)_100%] backdrop-blur-md" />

        {/* Ambient Pulsing Particles/Light Beams */}
        <motion.div
          animate={{
            scale: [1, 1.15, 1],
            opacity: [0.2, 0.45, 0.2],
          }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          className={`absolute h-96 w-96 rounded-full blur-3xl pointer-events-none ${
            isDraw
              ? 'bg-amber-500/20'
              : isPlayerWin
              ? 'bg-emerald-500/25'
              : 'bg-rose-500/25'
          }`}
        />

        {/* Impact Screen Shake Container */}
        <motion.div
          animate={
            phase === 'clash'
              ? {
                  x: [0, -6, 7, -4, 4, 0],
                  y: [0, 5, -6, 3, -3, 0],
                }
              : { x: 0, y: 0 }
          }
          transition={{ duration: 0.35 }}
          className="relative z-10 flex w-full max-w-4xl flex-col items-center justify-center space-y-4 sm:space-y-6"
        >
          {/* Round Header Tag */}
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="flex items-center gap-2 rounded-full border border-amber-400/40 bg-slate-900/90 px-4 py-1.5 shadow-xl backdrop-blur-md"
          >
            <Swords className="h-4 w-4 text-amber-400 animate-pulse" />
            <span className="font-display text-xs sm:text-sm font-extrabold uppercase tracking-widest text-amber-300">
              Confronto Hexagonal · Rodada {revealRound.roundNumber}
            </span>
          </motion.div>

          {/* Individual Duels Representation (1v1, 2v2, 3v3) */}
          <div
            className={`grid w-full gap-4 sm:gap-6 items-center justify-center ${
              clashes.length === 1
                ? 'grid-cols-1 max-w-md'
                : clashes.length === 2
                ? 'grid-cols-1 sm:grid-cols-2 max-w-2xl'
                : 'grid-cols-1 sm:grid-cols-3 max-w-4xl'
            }`}
          >
            {clashes.map((c, idx) => {
              const moveAData = MOVES[c.moveA];
              const moveBData = MOVES[c.moveB];
              const myTeamIsA = playerTeam === 'A';
              const myMove = myTeamIsA ? c.moveA : c.moveB;
              const oppMove = myTeamIsA ? c.moveB : c.moveA;
              const mySkin = myTeamIsA ? c.skinA : c.skinB;
              const oppSkin = myTeamIsA ? c.skinB : c.skinA;
              const myOutcome =
                c.outcomeForA === 'draw'
                  ? 'draw'
                  : (c.outcomeForA === 'win' && myTeamIsA) || (c.outcomeForA === 'loss' && !myTeamIsA)
                  ? 'win'
                  : 'loss';

              return (
                <div
                  key={`clash-slot-${idx}`}
                  className="flex flex-col items-center rounded-2xl border border-white/10 bg-slate-900/80 p-3 sm:p-4 shadow-2xl backdrop-blur-xl"
                >
                  {/* Duel Cards Clash Area */}
                  <div className="relative flex items-center justify-center gap-3 sm:gap-5 w-full py-2">
                    {/* My Card (Team / Player Card) */}
                    <motion.div
                      initial={{ x: -60, opacity: 0, scale: 0.8 }}
                      animate={
                        phase === 'intro'
                          ? { x: -30, opacity: 0.9, scale: 0.9 }
                          : phase === 'clash'
                          ? { x: -6, opacity: 1, scale: 1.05 }
                          : myOutcome === 'win'
                          ? { x: 0, opacity: 1, scale: 1.1 }
                          : myOutcome === 'loss'
                          ? { x: -14, opacity: 0.45, scale: 0.88, filter: 'grayscale(0.6)' }
                          : { x: 0, opacity: 1, scale: 1 }
                      }
                      transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                      className={`relative w-24 sm:w-28 rounded-xl transition-shadow ${
                        myOutcome === 'win' && phase !== 'intro'
                          ? 'ring-4 ring-emerald-400 shadow-[0_0_28px_rgba(16,185,129,0.7)]'
                          : ''
                      }`}
                    >
                      <MoveCard
                        moveId={myMove}
                        skinId={mySkin}
                        compact
                        disabled={false}
                      />
                      <div className="mt-1 text-center font-display text-[10px] sm:text-xs font-bold text-amber-300 truncate">
                        {myTeamIsA ? c.playerAName : c.playerBName}
                      </div>
                    </motion.div>

                    {/* Clash Center Impact Symbol */}
                    <motion.div
                      animate={
                        phase === 'clash'
                          ? { scale: [1, 1.45, 1], rotate: [0, -15, 15, 0] }
                          : { scale: 1, rotate: 0 }
                      }
                      className="flex flex-col items-center justify-center shrink-0 z-20"
                    >
                      <div
                        className={`flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-full border shadow-lg ${
                          phase === 'clash'
                            ? 'border-white bg-amber-400 text-slate-950 shadow-[0_0_24px_rgba(255,255,255,0.9)] animate-ping'
                            : 'border-amber-400/60 bg-slate-950 text-amber-400'
                        }`}
                      >
                        <Zap className="h-4 w-4 sm:h-5 sm:w-5" />
                      </div>
                      <span className="mt-1 font-mono-num text-[10px] font-black tracking-wider text-slate-400">
                        VS
                      </span>
                    </motion.div>

                    {/* Opponent Card */}
                    <motion.div
                      initial={{ x: 60, opacity: 0, scale: 0.8 }}
                      animate={
                        phase === 'intro'
                          ? { x: 30, opacity: 0.9, scale: 0.9 }
                          : phase === 'clash'
                          ? { x: 6, opacity: 1, scale: 1.05 }
                          : myOutcome === 'loss'
                          ? { x: 0, opacity: 1, scale: 1.1 }
                          : myOutcome === 'win'
                          ? { x: 14, opacity: 0.45, scale: 0.88, filter: 'grayscale(0.6)' }
                          : { x: 0, opacity: 1, scale: 1 }
                      }
                      transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                      className={`relative w-24 sm:w-28 rounded-xl transition-shadow ${
                        myOutcome === 'loss' && phase !== 'intro'
                          ? 'ring-4 ring-rose-400 shadow-[0_0_28px_rgba(244,63,94,0.7)]'
                          : ''
                      }`}
                    >
                      <MoveCard
                        moveId={oppMove}
                        skinId={oppSkin}
                        compact
                        disabled={false}
                      />
                      <div className="mt-1 text-center font-display text-[10px] sm:text-xs font-bold text-sky-300 truncate">
                        {myTeamIsA ? c.playerBName : c.playerAName}
                      </div>
                    </motion.div>
                  </div>

                  {/* Brazilian Rule Justification Banner */}
                  {(phase === 'exalt' || phase === 'banner') && c.reason && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.92 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      className="mt-2.5 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-1.5 text-center text-[11px] sm:text-xs font-semibold text-slate-200 shadow-inner"
                    >
                      <span className="text-amber-400 font-bold">💥 </span>
                      {c.reason}
                    </motion.div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Epilogue Banner: Victorious Announcement */}
          {phase === 'banner' && (
            <motion.div
              initial={{ scale: 0.75, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 360, damping: 20 }}
              className={`flex items-center gap-3 rounded-2xl border px-6 py-3 shadow-2xl backdrop-blur-xl ${
                isDraw
                  ? 'border-amber-400/60 bg-amber-500/20 text-amber-200 shadow-amber-500/30'
                  : isPlayerWin
                  ? 'border-emerald-400/80 bg-emerald-500/25 text-emerald-100 shadow-emerald-500/40'
                  : 'border-rose-400/80 bg-rose-500/25 text-rose-100 shadow-rose-500/40'
              }`}
            >
              {isDraw ? (
                <Shield className="h-6 w-6 text-amber-300" />
              ) : isPlayerWin ? (
                <Trophy className="h-6 w-6 text-emerald-300 animate-bounce" />
              ) : (
                <Flame className="h-6 w-6 text-rose-300" />
              )}
              <div className="font-display text-sm sm:text-lg font-black uppercase tracking-wider">
                {isDraw
                  ? 'EMPATE NA RODADA!'
                  : isPlayerWin
                  ? 'VITÓRIA DA SUA EQUIPE!'
                  : 'RODADA DO ADVERSÁRIO!'}
              </div>
            </motion.div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
