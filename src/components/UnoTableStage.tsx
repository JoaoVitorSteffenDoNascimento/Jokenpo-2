import React from 'react';
import { Check, Clock, EyeOff, HelpCircle, Layers, Swords } from 'lucide-react';
import { motion } from 'motion/react';
import { getEloInfo, MOVES } from '../constants/gameData';
import {
  MatchParticipant,
  MatchRoom,
  PlayerProfile,
  RoundSummary,
} from '../types/game';
import { MoveCard } from './MoveCard';

interface UnoTableStageProps {
  room: MatchRoom;
  player: PlayerProfile;
  playerTeam: 'A' | 'B';
  revealRound: RoundSummary | null;
  activePairIndex: number;
  activePairUids: string[];
  isMyTurnToPick: boolean;
  isMyTeamChoosing: boolean;
  amIPaired: boolean;
  myTeamSum: number;
  oppTeamSum: number;
  onChooseOpponent: (opponentUid: string) => void;
}

const FAN_ANGLES = [-12, -7, -2, 3, 8, 13];

const SeatCardFan: React.FC<{
  count: number;
  teamColor: 'amber' | 'sky';
  isChoosing: boolean;
}> = ({ count, teamColor, isChoosing }) => {
  const borderClass =
    teamColor === 'amber'
      ? 'border-amber-400/50 bg-[#182235]'
      : 'border-sky-400/50 bg-[#142033]';
  const dotClass = teamColor === 'amber' ? 'text-amber-400/80' : 'text-sky-400/80';

  return (
    <div className="flex items-end justify-center pt-1 pb-0.5" aria-hidden="true">
      {Array.from({ length: count }).map((_, idx) => {
        const angle = FAN_ANGLES[idx] ?? 0;
        const isHighlightedCard = isChoosing && idx === Math.floor(count / 2);
        return (
          <motion.div
            key={idx}
            animate={
              isHighlightedCard
                ? { y: [0, -5, 0] }
                : { y: 0 }
            }
            transition={
              isHighlightedCard
                ? { duration: 1.1, repeat: Infinity, ease: 'easeInOut' }
                : { duration: 0.2 }
            }
            style={{ transform: `rotate(${angle}deg)` }}
            className={`-ml-2 first:ml-0 flex h-8 w-5 items-center justify-center rounded-[4px] border shadow-sm transition-transform ${borderClass} ${
              isHighlightedCard ? 'ring-1 ring-amber-300/70' : ''
            }`}
          >
            <span className={`font-display text-[9px] font-extrabold ${dotClass}`}>
              J2
            </span>
          </motion.div>
        );
      })}
    </div>
  );
};

const HiddenTableCard: React.FC<{
  teamColor: 'amber' | 'sky';
  playerName: string;
}> = ({ teamColor, playerName }) => {
  const frame =
    teamColor === 'amber'
      ? 'border-amber-400/60 bg-gradient-to-br from-[#1C273B] via-[#131C2D] to-[#0D1420]'
      : 'border-sky-400/60 bg-gradient-to-br from-[#17263D] via-[#111B2D] to-[#0D1420]';
  const accentText = teamColor === 'amber' ? 'text-amber-300' : 'text-sky-300';
  const innerRing =
    teamColor === 'amber' ? 'border-amber-400/25' : 'border-sky-400/25';

  return (
    <motion.div
      initial={{ opacity: 0, y: -14, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className={`relative flex aspect-square w-full flex-col items-center justify-center overflow-hidden rounded-xl border p-3 text-center shadow-lg ${frame}`}
    >
      <div
        className={`flex h-full w-full flex-col items-center justify-center rounded-lg border border-dashed p-2 ${innerRing}`}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0B0F17]/80 border border-white/10">
          <HelpCircle className={`h-5 w-5 ${accentText}`} />
        </div>
        <span className={`font-display mt-2 text-xs font-extrabold ${accentText}`}>
          Jokenpo 2
        </span>
        <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-slate-300">
          <EyeOff className="h-3 w-3 text-slate-400" />
          <span>Carta oculta</span>
        </span>
        <span className="mt-1 max-w-full truncate text-[10px] text-slate-500">
          {playerName}
        </span>
      </div>
    </motion.div>
  );
};

const WaitingTableSlot: React.FC<{
  active: boolean;
  label: string;
}> = ({ active, label }) => {
  return (
    <div
      className={`flex aspect-square w-full flex-col items-center justify-center rounded-xl border border-dashed p-3 text-center transition-colors ${
        active
          ? 'border-amber-400/45 bg-[#0B0F17]/70'
          : 'border-white/10 bg-[#0B0F17]/40'
      }`}
    >
      {active ? (
        <motion.div
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          className="flex flex-col items-center gap-1.5"
        >
          <Layers className="h-5 w-5 text-amber-400" />
          <span className="text-xs font-semibold text-amber-300">{label}</span>
        </motion.div>
      ) : (
        <div className="flex flex-col items-center gap-1.5">
          <Clock className="h-4 w-4 text-slate-500" />
          <span className="text-xs text-slate-500">{label}</span>
        </div>
      )}
    </div>
  );
};

interface PlayerSeatProps {
  participant: MatchParticipant;
  role: 'ally' | 'opponent';
  hasPicked: boolean;
  isChoosingNow: boolean;
  isPairingPhase: boolean;
  isRevealing: boolean;
  pairedAgainstName?: string;
  canChooseThisOpponent: boolean;
  opponentAlreadyPaired: boolean;
  onChooseOpponent: (uid: string) => void;
}

const PlayerSeat: React.FC<PlayerSeatProps> = ({
  participant,
  role,
  hasPicked,
  isChoosingNow,
  isPairingPhase,
  isRevealing,
  pairedAgainstName,
  canChooseThisOpponent,
  opponentAlreadyPaired,
  onChooseOpponent,
}) => {
  const elo = getEloInfo(participant.trophies || 0);
  const cardsLeft = hasPicked || isRevealing ? 5 : 6;
  const teamColor = role === 'ally' ? 'amber' : 'sky';

  return (
    <div
      className={`flex flex-col items-center justify-between gap-2 rounded-xl border px-3.5 py-3 text-center transition-colors ${
        isChoosingNow && !hasPicked
          ? 'border-amber-400/60 bg-[#0B0F17]'
          : hasPicked
          ? 'border-emerald-500/40 bg-[#0B0F17]/90'
          : 'border-white/10 bg-[#0B0F17]/80'
      }`}
    >
      <div className="w-full min-w-0">
        <div className="flex items-center justify-center gap-1.5 text-[11px]">
          <span
            className={`font-semibold ${
              role === 'ally' ? 'text-amber-400' : 'text-sky-400'
            }`}
          >
            {role === 'ally' ? 'Parceiro' : 'Adversário'}
          </span>
          <span aria-hidden="true" className="text-slate-600">
            ·
          </span>
          <span className="text-slate-400">{participant.turma}</span>
        </div>
        <div className="mt-0.5 truncate text-sm font-bold text-white">
          {participant.nickname}
        </div>
        <div className="text-[11px] text-slate-500">
          {elo.tier.name}
          {pairedAgainstName ? ` · vs ${pairedAgainstName}` : ''}
        </div>
      </div>

      {/* UNO-style Face-down Card Fan */}
      <SeatCardFan
        count={cardsLeft}
        teamColor={teamColor}
        isChoosing={!isPairingPhase && !isRevealing && isChoosingNow && !hasPicked}
      />

      {/* Explicit Status / Action */}
      {isPairingPhase && canChooseThisOpponent ? (
        <button
          type="button"
          disabled={opponentAlreadyPaired}
          onClick={() => onChooseOpponent(participant.uid)}
          className={`mt-0.5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
            opponentAlreadyPaired
              ? 'border border-white/10 bg-[#131A26] text-slate-500 cursor-not-allowed'
              : 'bg-amber-500 text-slate-950 hover:bg-amber-400 cursor-pointer'
          }`}
        >
          <Swords className="h-3.5 w-3.5" />
          <span>{opponentAlreadyPaired ? 'Já pareado' : 'Enfrentar'}</span>
        </button>
      ) : (
        <div className="flex items-center justify-center gap-1 text-[11px] font-semibold">
          {isRevealing ? (
            <span className="text-amber-300">Carta revelada</span>
          ) : isPairingPhase ? (
            <span className="text-slate-400">
              {pairedAgainstName ? 'Confronto definido' : 'Aguardando definição'}
            </span>
          ) : hasPicked ? (
            <span className="inline-flex items-center gap-1 text-emerald-400">
              <Check className="h-3.5 w-3.5" />
              <span>Carta na mesa (Oculta)</span>
            </span>
          ) : isChoosingNow ? (
            <span className="inline-flex items-center gap-1 text-amber-300">
              <Layers className="h-3.5 w-3.5" />
              <span>Escolhendo carta...</span>
            </span>
          ) : (
            <span className="text-slate-500">Aguardando turno</span>
          )}
        </div>
      )}
    </div>
  );
};

export const UnoTableStage: React.FC<UnoTableStageProps> = ({
  room,
  player,
  playerTeam,
  revealRound,
  activePairIndex,
  activePairUids,
  isMyTurnToPick,
  isMyTeamChoosing,
  amIPaired,
  myTeamSum,
  oppTeamSum,
  onChooseOpponent,
}) => {
  const myTeamList = playerTeam === 'A' ? room.teamA : room.teamB;
  const oppTeamList = playerTeam === 'A' ? room.teamB : room.teamA;
  const myTeammates = myTeamList.filter((p) => p.uid !== player.uid);

  const pairedA = new Set((room.roundPairings || []).map((p) => p.split(':')[0]));
  const pairedB = new Set((room.roundPairings || []).map((p) => p.split(':')[1]));
  const oppPairedSet = playerTeam === 'A' ? pairedB : pairedA;

  const pairings =
    room.roundPairings && room.roundPairings.length === room.teamSize
      ? room.roundPairings
      : room.teamA.map((p, i) => `${p.uid}:${room.teamB[i]?.uid ?? ''}`);

  const findPairedAgainstName = (uid: string): string | undefined => {
    for (const pairStr of room.roundPairings || []) {
      const [uA, uB] = pairStr.split(':');
      if (uA === uid) {
        return room.teamB.find((p) => p.uid === uB)?.nickname;
      }
      if (uB === uid) {
        return room.teamA.find((p) => p.uid === uA)?.nickname;
      }
    }
    return undefined;
  };

  const renderSeat = (participant: MatchParticipant, role: 'ally' | 'opponent') => {
    const hasPicked = Boolean(room.roundPicks[participant.uid]);
    const isChoosingNow =
      room.roundPhase === 'picking' &&
      (room.teamSize === 1 || activePairUids.includes(participant.uid));
    return (
      <PlayerSeat
        key={participant.uid}
        participant={participant}
        role={role}
        hasPicked={hasPicked}
        isChoosingNow={isChoosingNow}
        isPairingPhase={room.roundPhase === 'pairing'}
        isRevealing={Boolean(revealRound)}
        pairedAgainstName={findPairedAgainstName(participant.uid)}
        canChooseThisOpponent={
          role === 'opponent' && isMyTeamChoosing && !amIPaired
        }
        opponentAlreadyPaired={oppPairedSet.has(participant.uid)}
        onChooseOpponent={onChooseOpponent}
      />
    );
  };

  const myPick = room.roundPicks[player.uid];

  const tableCenter = (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-[#0E1829] to-[#0A111D] p-4 sm:p-5 shadow-inner space-y-4">
      {revealRound ? (
        /* Revealed Table Flip */
        <div className="space-y-4">
          <div className="text-center">
            <div className="text-xs font-semibold text-slate-400">
              Cartas Reveladas — Rodada {revealRound.roundNumber}
            </div>
            <h2
              className={`font-display mt-0.5 text-xl sm:text-2xl font-extrabold ${
                revealRound.winnerTeam === 'DRAW'
                  ? 'text-slate-200'
                  : revealRound.winnerTeam === playerTeam
                  ? 'text-emerald-400'
                  : 'text-red-400'
              }`}
            >
              {revealRound.winnerTeam === 'DRAW'
                ? 'Rodada Empatada!'
                : revealRound.winnerTeam === playerTeam
                ? 'Sua Equipe Venceu a Rodada!'
                : 'Equipe Adversária Venceu a Rodada'}
            </h2>
          </div>

          <div
            className={`grid gap-4 ${
              revealRound.clashes.length === 1
                ? 'grid-cols-1 max-w-md mx-auto'
                : revealRound.clashes.length === 2
                ? 'grid-cols-1 md:grid-cols-2'
                : 'grid-cols-1 md:grid-cols-3'
            }`}
          >
            {revealRound.clashes.map((clash) => {
              const leftIsMe = playerTeam === 'A';
              const leftName = leftIsMe ? clash.playerAName : clash.playerBName;
              const rightName = leftIsMe ? clash.playerBName : clash.playerAName;
              const leftMove = leftIsMe ? clash.moveA : clash.moveB;
              const rightMove = leftIsMe ? clash.moveB : clash.moveA;
              const leftSkin = leftIsMe ? clash.skinA : clash.skinB;
              const rightSkin = leftIsMe ? clash.skinB : clash.skinA;

              const myOutcome =
                clash.outcomeForA === 'draw'
                  ? 'draw'
                  : leftIsMe
                  ? clash.outcomeForA
                  : clash.outcomeForA === 'win'
                  ? 'loss'
                  : 'win';

              return (
                <motion.div
                  key={clash.slotIndex}
                  initial={{ opacity: 0.5, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                  className="rounded-xl border border-white/10 bg-[#0B0F17]/90 p-3.5 space-y-2.5"
                >
                  <div className="grid grid-cols-11 items-center gap-2">
                    <div className="col-span-5 space-y-1">
                      <div className="text-xs font-semibold text-amber-400 truncate">
                        {leftName}
                      </div>
                      <MoveCard moveId={leftMove} skinId={leftSkin} compact />
                    </div>
                    <div className="col-span-1 text-center font-display text-xs font-extrabold text-slate-500">
                      VS
                    </div>
                    <div className="col-span-5 space-y-1">
                      <div className="text-xs font-semibold text-sky-400 truncate text-right">
                        {rightName}
                      </div>
                      <MoveCard moveId={rightMove} skinId={rightSkin} compact />
                    </div>
                  </div>
                  <div
                    className={`text-center text-xs font-semibold ${
                      myOutcome === 'win'
                        ? 'text-emerald-400'
                        : myOutcome === 'loss'
                        ? 'text-red-400'
                        : 'text-slate-300'
                    }`}
                  >
                    {clash.reason}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      ) : room.roundPhase === 'pairing' && room.teamSize > 1 ? (
        /* Team Matchup Selection on the Table */
        <div className="py-6 text-center space-y-3">
          <div className="font-mono-num text-xs text-slate-400">
            Troféus somados: Sua Equipe {myTeamSum} vs Adversários {oppTeamSum}
          </div>
          <h2 className="font-display text-xl font-bold text-white">
            {isMyTeamChoosing
              ? amIPaired
                ? 'Seu confronto foi definido — aguardando parceiro na mesa'
                : 'Sua equipe tem mais troféus: clique em "Enfrentar" no jogador ao lado ou acima'
              : 'A equipe com mais troféus está escolhendo os confrontos na mesa...'}
          </h2>
          <p className="mx-auto max-w-lg text-xs text-slate-400">
            Depois que os duelos forem definidos, cada par joga sua carta virada para baixo na mesa até todas serem reveladas juntas.
          </p>
          {(room.roundPairings || []).length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2 text-xs text-slate-300">
              {(room.roundPairings || []).map((pairStr, idx) => {
                const [uA, uB] = pairStr.split(':');
                const pA = room.teamA.find((p) => p.uid === uA);
                const pB = room.teamB.find((p) => p.uid === uB);
                return (
                  <span key={idx} className="font-medium text-amber-300">
                    {pA?.nickname} vs {pB?.nickname}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* UNO-style Hidden Cards on Center Table */
        <div className="space-y-4">
          <div className="text-center">
            <h2 className="font-display text-lg sm:text-xl font-bold text-white">
              {myPick
                ? `Você colocou ${MOVES[myPick].name} na mesa — aguardando cartas ocultas`
                : isMyTurnToPick
                ? 'Sua vez! Escolha uma carta da sua mão abaixo para jogar na mesa'
                : 'Jogadores ao lado estão escolhendo suas cartas ocultas...'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              {room.teamSize > 1
                ? `Confronto ${activePairIndex + 1} de ${room.teamSize} jogando · Cartas ficam viradas até todos escolherem`
                : 'Você vê quando o oponente coloca a carta na mesa, mas o movimento fica oculto até você jogar'}
            </p>
          </div>

          <div
            className={`grid gap-3.5 ${
              room.teamSize === 1
                ? 'grid-cols-1 max-w-md mx-auto'
                : room.teamSize === 2
                ? 'grid-cols-1 md:grid-cols-2'
                : 'grid-cols-1 md:grid-cols-3'
            }`}
          >
            {pairings.map((pairStr, idx) => {
              const [uidA, uidB] = pairStr.split(':');
              const pA = room.teamA.find((p) => p.uid === uidA) ?? room.teamA[idx];
              const pB = room.teamB.find((p) => p.uid === uidB) ?? room.teamB[idx];
              const leftP = playerTeam === 'A' ? pA : pB;
              const rightP = playerTeam === 'A' ? pB : pA;
              const leftPicked = leftP ? Boolean(room.roundPicks[leftP.uid]) : false;
              const rightPicked = rightP ? Boolean(room.roundPicks[rightP.uid]) : false;
              const isActivePair = idx === activePairIndex;

              return (
                <div
                  key={idx}
                  className={`rounded-xl border p-3.5 space-y-2.5 transition-colors ${
                    isActivePair
                      ? 'border-amber-400/50 bg-[#0B0F17]/95'
                      : 'border-white/10 bg-[#0B0F17]/65 opacity-80'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>
                      {room.teamSize === 1 ? 'Mesa Central' : `Confronto ${idx + 1}`}
                    </span>
                    <span className="font-medium text-slate-300">
                      {leftPicked && rightPicked
                        ? 'Cartas prontas'
                        : isActivePair
                        ? 'Em escolha'
                        : 'Na fila'}
                    </span>
                  </div>

                  <div className="grid grid-cols-11 items-center gap-2">
                    <div className="col-span-5 space-y-1.5">
                      <div className="truncate text-xs font-bold text-amber-400">
                        {leftP?.uid === player.uid
                          ? `${leftP.nickname} (Você)`
                          : leftP?.nickname ?? '—'}
                      </div>
                      {leftP?.uid === player.uid && myPick ? (
                        <motion.div
                          initial={{ opacity: 0, y: 12, scale: 0.94 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                        >
                          <MoveCard
                            moveId={myPick}
                            skinId={player.equippedSkins[myPick]}
                            selected
                            compact
                          />
                        </motion.div>
                      ) : leftPicked && leftP ? (
                        <HiddenTableCard
                          teamColor="amber"
                          playerName={leftP.nickname}
                        />
                      ) : (
                        <WaitingTableSlot
                          active={isActivePair}
                          label={
                            leftP?.uid === player.uid
                              ? 'Jogue abaixo'
                              : isActivePair
                              ? 'Escolhendo...'
                              : 'Aguardando'
                          }
                        />
                      )}
                    </div>

                    <div className="col-span-1 text-center font-display text-xs font-extrabold text-slate-500">
                      VS
                    </div>

                    <div className="col-span-5 space-y-1.5">
                      <div className="truncate text-right text-xs font-bold text-sky-400">
                        {rightP?.nickname ?? '—'}
                      </div>
                      {rightPicked && rightP ? (
                        <HiddenTableCard
                          teamColor="sky"
                          playerName={rightP.nickname}
                        />
                      ) : (
                        <WaitingTableSlot
                          active={isActivePair}
                          label={isActivePair ? 'Escolhendo...' : 'Aguardando'}
                        />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <section className="rounded-2xl border border-white/10 bg-[#131A26] p-4 sm:p-6 space-y-4">
      {room.mode === '1v1' ? (
        <>
          {/* Opponent across the top of the table */}
          <div className="mx-auto max-w-xs">
            {oppTeamList[0] && renderSeat(oppTeamList[0], 'opponent')}
          </div>
          {tableCenter}
        </>
      ) : room.mode === '2v2' ? (
        <>
          {/* Teammate across the top (UNO partner style) */}
          <div className="mx-auto max-w-xs">
            {myTeammates[0] && renderSeat(myTeammates[0], 'ally')}
          </div>
          {/* Opponents on the Left and Right sides of the center table */}
          <div className="grid grid-cols-1 items-center gap-4 lg:grid-cols-12">
            <div className="lg:col-span-3">
              {oppTeamList[0] && renderSeat(oppTeamList[0], 'opponent')}
            </div>
            <div className="lg:col-span-6">{tableCenter}</div>
            <div className="lg:col-span-3">
              {oppTeamList[1] && renderSeat(oppTeamList[1], 'opponent')}
            </div>
          </div>
        </>
      ) : (
        <>
          {/* 3v3: 3 Opponents across the top arc */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {oppTeamList.map((opp) => renderSeat(opp, 'opponent'))}
          </div>
          {/* 2 Allies flanking Left & Right beside the center table */}
          <div className="grid grid-cols-1 items-center gap-4 lg:grid-cols-12">
            <div className="lg:col-span-2">
              {myTeammates[0] && renderSeat(myTeammates[0], 'ally')}
            </div>
            <div className="lg:col-span-8">{tableCenter}</div>
            <div className="lg:col-span-2">
              {myTeammates[1] && renderSeat(myTeammates[1], 'ally')}
            </div>
          </div>
        </>
      )}
    </section>
  );
};
