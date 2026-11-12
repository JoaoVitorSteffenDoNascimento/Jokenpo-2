import React from 'react';
import {
  ArrowLeft,
  BookOpen,
  Box,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  RotateCcw,
  Send,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  calculateMatchReward,
  DEFAULT_EQUIPPED_SKINS,
  getEloInfo,
  MatchRewardResult,
  MOVE_ORDER,
  MOVES,
  resolveCharacterCustomization,
  resolveMovePair,
  ROUND_DURATION_SECONDS,
  SKINS_CATALOG,
} from '../constants/gameData';
import {
  autoCompletePairingOnTimeout,
  cancelMatchRoom,
  chooseRoundPairing,
  getChoosingTeam,
  recordPlayerMatchResult,
  resolveRoundIfReady,
  sendDuelInvite,
  subscribeMatchRoom,
  submitRoundPick,
} from '../firebase/services';
import {
  Friendship,
  MatchFormat,
  MatchMode,
  MatchParticipant,
  MatchRoom,
  MoveId,
  PairClashResult,
  PlayerProfile,
  RoundSummary,
  TrophyProgressFeedback,
  TURMAS,
} from '../types/game';
import { soundFx } from '../utils/soundFx';
import { vibrateTap, vibrateThrow } from '../utils/haptics';
import { MoveCard } from './MoveCard';
import { UnoTableStage } from './UnoTableStage';
import { TableArena3D } from './three/TableArena3D';

interface ArenaViewProps {
  player: PlayerProfile;
  onlineMatchId: string | null;
  botConfig: {
    mode: MatchMode;
    format: MatchFormat;
    isFriendly: boolean;
  } | null;
  friendships: Friendship[];
  onMatchFinished: (feedback: TrophyProgressFeedback) => void;
  onExitArena: () => void;
  onOpenRules: () => void;
}

function buildBotTeam(
  count: number,
  prefix: string,
  excludeTurma: string
): MatchParticipant[] {
  const result: MatchParticipant[] = [];
  for (let i = 0; i < count; i++) {
    const turma =
      TURMAS[(i * 3 + (prefix === 'Ally' ? 1 : 5)) % TURMAS.length] || excludeTurma;
    const equipped = { ...DEFAULT_EQUIPPED_SKINS };
    for (const m of MOVE_ORDER) {
      const options = SKINS_CATALOG.filter((s) => s.moveId === m);
      const pick = options[Math.floor(Math.random() * options.length)];
      if (pick) equipped[m] = pick.id;
    }
    result.push({
      uid: `bot_${prefix.toLowerCase()}_${i}`,
      nickname:
        prefix === 'Ally' ? `Parceiro_${i + 1}` : `Rival_${turma}`,
      turma,
      trophies: 600 + i * 250,
      equippedSkins: equipped,
      characterCustomization: resolveCharacterCustomization(
        null,
        i + (prefix === 'Ally' ? 1 : 3)
      ),
      isBot: true,
    });
  }
  return result;
}

function createInitialBotRoom(
  player: PlayerProfile,
  config: { mode: MatchMode; format: MatchFormat; isFriendly: boolean }
): MatchRoom {
  const teamSize: 1 | 2 | 3 =
    config.mode === '3v3' ? 3 : config.mode === '2v2' ? 2 : 1;
  const allies = buildBotTeam(teamSize - 1, 'Ally', player.turma);
  const rivals = buildBotTeam(teamSize, 'Rival', player.turma);
  const teamA: MatchParticipant[] = [
    {
      uid: player.uid,
      nickname: player.nickname,
      turma: player.turma,
      trophies: player.trophies,
      equippedSkins: player.equippedSkins,
      characterCustomization: resolveCharacterCustomization(
        player.characterCustomization,
        0
      ),
    },
    ...allies,
  ];
  const participantUids = [...teamA, ...rivals].map((p) => p.uid);

  return {
    id: `local_bot_${Date.now()}`,
    code: 'BOT',
    creatorUid: player.uid,
    mode: config.mode,
    format: config.format,
    isFriendly: config.isFriendly,
    isPublicQueue: false,
    status: 'active',
    teamSize,
    teamA,
    teamB: rivals,
    participantUids,
    currentRound: 1,
    roundPhase: teamSize === 1 ? 'picking' : 'pairing',
    roundPairings:
      teamSize === 1 ? [`${teamA[0].uid}:${rivals[0].uid}`] : [],
    roundStartedAt: Date.now(),
    teamAScore: 0,
    teamBScore: 0,
    roundPicks: {},
    roundHistory: [],
    winnerTeam: '',
  };
}

function advanceBotRoomWithPicks(
  curr: MatchRoom,
  nextPicks: Record<string, MoveId>
): MatchRoom {
  const allDone = curr.participantUids.every((id) => Boolean(nextPicks[id]));
  if (!allDone) {
    return { ...curr, roundPicks: nextPicks };
  }

  let teamAPoints = 0;
  let teamBPoints = 0;
  const clashes: PairClashResult[] = [];
  for (let i = 0; i < curr.roundPairings.length; i++) {
    const [uidA, uidB] = curr.roundPairings[i].split(':');
    const pA = curr.teamA.find((p) => p.uid === uidA)!;
    const pB = curr.teamB.find((p) => p.uid === uidB)!;
    const moveA = nextPicks[pA.uid];
    const moveB = nextPicks[pB.uid];
    const { outcomeForA, reason } = resolveMovePair(moveA, moveB);
    if (outcomeForA === 'win') teamAPoints += 1;
    if (outcomeForA === 'loss') teamBPoints += 1;
    clashes.push({
      slotIndex: i,
      playerAName: pA.nickname,
      playerBName: pB.nickname,
      moveA,
      moveB,
      skinA: pA.equippedSkins?.[moveA] ?? `${moveA}_default`,
      skinB: pB.equippedSkins?.[moveB] ?? `${moveB}_default`,
      outcomeForA,
      reason,
    });
  }

  let roundWinner: 'A' | 'B' | 'DRAW' = 'DRAW';
  let nextAScore = curr.teamAScore;
  let nextBScore = curr.teamBScore;
  if (teamAPoints > teamBPoints) {
    roundWinner = 'A';
    nextAScore += 1;
  } else if (teamBPoints > teamAPoints) {
    roundWinner = 'B';
    nextBScore += 1;
  }

  const summary: RoundSummary = {
    roundNumber: curr.currentRound,
    winnerTeam: roundWinner,
    teamAPoints,
    teamBPoints,
    clashes,
  };

  const targetWins = curr.format === 'MD5' ? 3 : 2;
  const finished =
    nextAScore >= targetWins ||
    nextBScore >= targetWins ||
    curr.currentRound >= 15;

  let winnerTeam: 'A' | 'B' | 'DRAW' | '' = '';
  if (finished) {
    if (nextAScore > nextBScore) winnerTeam = 'A';
    else if (nextBScore > nextAScore) winnerTeam = 'B';
    else winnerTeam = 'DRAW';
  }

  return {
    ...curr,
    roundHistory: [...curr.roundHistory, summary],
    teamAScore: nextAScore,
    teamBScore: nextBScore,
    currentRound: finished ? curr.currentRound : curr.currentRound + 1,
    roundPhase: finished
      ? curr.roundPhase
      : curr.teamSize === 1
      ? 'picking'
      : 'pairing',
    roundPairings:
      !finished && curr.teamSize === 1
        ? [`${curr.teamA[0].uid}:${curr.teamB[0].uid}`]
        : finished
        ? curr.roundPairings
        : [],
    roundPicks: finished ? nextPicks : {},
    roundStartedAt: Date.now() + 2400,
    status: finished ? 'finished' : 'active',
    winnerTeam,
  };
}

export const ArenaView: React.FC<ArenaViewProps> = ({
  player,
  onlineMatchId,
  botConfig,
  friendships,
  onMatchFinished,
  onExitArena,
  onOpenRules,
}) => {
  const [onlineRoom, setOnlineRoom] = React.useState<MatchRoom | null>(null);
  const [botRoom, setBotRoom] = React.useState<MatchRoom | null>(() =>
    botConfig ? createInitialBotRoom(player, botConfig) : null
  );
  const [secondsLeft, setSecondsLeft] = React.useState(ROUND_DURATION_SECONDS);
  const [muted, setMuted] = React.useState(soundFx.muted);
  const [copiedCode, setCopiedCode] = React.useState(false);
  const [invitedUids, setInvitedUids] = React.useState<string[]>([]);
  const [revealRound, setRevealRound] = React.useState<RoundSummary | null>(null);
  const [rewardResult, setRewardResult] = React.useState<MatchRewardResult | null>(
    null
  );
  const [modalDisplayTrophies, setModalDisplayTrophies] = React.useState(
    player.trophies
  );
  const [prevTrophiesSnapshot, setPrevTrophiesSnapshot] = React.useState(
    player.trophies
  );
  const [prevEloName, setPrevEloName] = React.useState<string>(() =>
    getEloInfo(player.trophies).tier.name
  );
  const [stagedMove, setStagedMove] = React.useState<MoveId>('parafal');
  const [hudCollapsed, setHudCollapsed] = React.useState(false);
  const [use3DTable, setUse3DTable] = React.useState(true);

  const lastSeenRoundHistoryCountRef = React.useRef(0);
  const recordedMatchIdRef = React.useRef<string | null>(null);
  const resolvingRef = React.useRef(false);
  const prevOtherPicksCountRef = React.useRef(0);

  const isBotMode = Boolean(botConfig && !onlineMatchId);
  const room = isBotMode ? botRoom : onlineRoom;

  React.useEffect(() => {
    if (!onlineMatchId) return;
    const unsub = subscribeMatchRoom(onlineMatchId, (data) => {
      setOnlineRoom(data);
    });
    return unsub;
  }, [onlineMatchId]);

  const playerTeam: 'A' | 'B' = React.useMemo(() => {
    if (!room) return 'A';
    return room.teamB.some((p) => p.uid === player.uid) ? 'B' : 'A';
  }, [room, player.uid]);

  // Identify active pair in sequential picking for team matches (2v2 / 3v3)
  const activePairIndex = React.useMemo(() => {
    if (!room || room.roundPhase !== 'picking') return -1;
    if (!room.roundPairings || room.roundPairings.length === 0) return 0;
    for (let i = 0; i < room.roundPairings.length; i++) {
      const [uA, uB] = room.roundPairings[i].split(':');
      if (!room.roundPicks[uA] || !room.roundPicks[uB]) {
        return i;
      }
    }
    return room.roundPairings.length - 1;
  }, [room]);

  const activePairUids = React.useMemo(() => {
    if (!room || activePairIndex < 0) return [] as string[];
    const pair = room.roundPairings?.[activePairIndex];
    if (!pair) return [] as string[];
    return pair.split(':');
  }, [room, activePairIndex]);

  const isMyTurnToPick =
    room?.status === 'active' &&
    room.roundPhase === 'picking' &&
    (room.teamSize === 1 || activePairUids.includes(player.uid));

  // Play soft card-place sound when another seated player puts a hidden card on the table
  React.useEffect(() => {
    if (!room || room.status !== 'active' || revealRound) {
      prevOtherPicksCountRef.current = 0;
      return;
    }
    const otherPicksCount = Object.keys(room.roundPicks || {}).filter(
      (uid) => uid !== player.uid
    ).length;
    if (otherPicksCount > prevOtherPicksCountRef.current) {
      soundFx.playCardPlace();
    }
    prevOtherPicksCountRef.current = otherPicksCount;
  }, [room?.roundPicks, room?.currentRound, room?.status, revealRound, player.uid]);

  // Detect new round in roundHistory to play FX and show reveal banner
  React.useEffect(() => {
    if (!room) return;
    if (room.roundHistory.length > lastSeenRoundHistoryCountRef.current) {
      const latest = room.roundHistory[room.roundHistory.length - 1];
      lastSeenRoundHistoryCountRef.current = room.roundHistory.length;
      setRevealRound(latest);
      soundFx.playCardFlip();

      if (latest.winnerTeam === 'DRAW') {
        soundFx.playRoundDraw();
      } else if (latest.winnerTeam === playerTeam) {
        soundFx.playRoundWin();
      } else {
        soundFx.playRoundLoss();
      }

      const timer = setTimeout(() => {
        setRevealRound(null);
      }, 2400);
      return () => clearTimeout(timer);
    }
  }, [room, playerTeam]);

  // Record match reward once when status === 'finished'
  React.useEffect(() => {
    if (!room || room.status !== 'finished') return;
    if (recordedMatchIdRef.current === room.id) return;
    recordedMatchIdRef.current = room.id;

    let outcome: 'win' | 'loss' | 'draw' = 'draw';
    if (room.winnerTeam === 'A' || room.winnerTeam === 'B') {
      outcome = room.winnerTeam === playerTeam ? 'win' : 'loss';
    }

    if (outcome === 'win') {
      soundFx.playVictory();
    }

    const baseTrophies = player.trophies;
    setPrevTrophiesSnapshot(baseTrophies);

    const calc = calculateMatchReward({
      outcome,
      mode: room.mode,
      format: room.format,
      isFriendly: room.isFriendly,
      currentTrophies: baseTrophies,
      currentLossStreak: player.lossStreak,
    });

    setRewardResult(calc);
    const oldElo = getEloInfo(baseTrophies).tier.name;
    const nextElo = getEloInfo(calc.newTrophies).tier.name;
    onMatchFinished({
      previousTrophies: baseTrophies,
      newTrophies: calc.newTrophies,
      delta: calc.trophyDelta,
      streakRecoveryTriggered: calc.streakRecoveryTriggered,
      promotedTo: nextElo !== oldElo && calc.trophyDelta > 0 ? nextElo : null,
      timestamp: Date.now(),
    });

    const myFinalScore = playerTeam === 'A' ? room.teamAScore : room.teamBScore;
    const oppFinalScore = playerTeam === 'A' ? room.teamBScore : room.teamAScore;
    const oppTeam = playerTeam === 'A' ? room.teamB : room.teamA;
    const opponentName =
      oppTeam.map((p) => p.nickname).join(', ') || 'Adversário';
    const opponentTurma =
      Array.from(new Set(oppTeam.map((p) => p.turma))).join(' / ') || 'ARENA';
    const scoreText = `${myFinalScore} - ${oppFinalScore}`;

    recordPlayerMatchResult(player.uid, {
      outcome,
      newTrophies: calc.newTrophies,
      coinsEarned: calc.coinsEarned,
      newLossStreak: calc.newLossStreak,
      mode: room.mode,
      format: room.format,
      isFriendly: room.isFriendly,
      opponentName,
      opponentTurma,
      scoreText,
      trophyDelta: calc.trophyDelta,
    }).catch((err) => {
      console.error('Erro ao salvar resultado:', err);
    });
  }, [room, playerTeam, player.uid, player.trophies, player.lossStreak, onMatchFinished]);

  // Animate trophy count-up inside match finished modal
  React.useEffect(() => {
    if (!rewardResult || room?.status !== 'finished' || revealRound) return;
    const from = prevTrophiesSnapshot;
    const to = rewardResult.newTrophies;
    setModalDisplayTrophies(from);

    const duration = 900;
    const start = performance.now();
    let rafId = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setModalDisplayTrophies(Math.round(from + (to - from) * eased));
      if (t < 1) rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [rewardResult, room?.status, revealRound, prevTrophiesSnapshot]);

  // Countdown timer for active round (pairing & picking)
  React.useEffect(() => {
    if (!room || room.status !== 'active' || revealRound) {
      setSecondsLeft(ROUND_DURATION_SECONDS);
      return;
    }

    const tick = () => {
      const elapsedSec = Math.floor((Date.now() - room.roundStartedAt) / 1000);
      const remaining = Math.max(0, ROUND_DURATION_SECONDS - elapsedSec);
      setSecondsLeft((prev) => (prev !== remaining ? remaining : prev));

      if (remaining === 0 && !isBotMode && !resolvingRef.current) {
        resolvingRef.current = true;
        if (room.roundPhase === 'pairing') {
          autoCompletePairingOnTimeout(room.id, room.currentRound).finally(() => {
            resolvingRef.current = false;
          });
        } else {
          resolveRoundIfReady(room.id, room.currentRound, true).finally(() => {
            resolvingRef.current = false;
          });
        }
      }
    };

    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [room, isBotMode, revealRound]);

  // Auto-resolve online room when all picks arrive
  React.useEffect(() => {
    if (!room || isBotMode || room.status !== 'active' || room.roundPhase !== 'picking') {
      return;
    }
    const allPicked = room.participantUids.every((uid) =>
      Boolean(room.roundPicks[uid])
    );
    if (allPicked && !resolvingRef.current) {
      resolvingRef.current = true;
      resolveRoundIfReady(room.id, room.currentRound, false).finally(() => {
        resolvingRef.current = false;
      });
    }
  }, [room, isBotMode]);

  // Bot automation for pairing (when bot team has higher trophies) and sequential pair picking
  React.useEffect(() => {
    if (!isBotMode || !botRoom || botRoom.status !== 'active' || revealRound) return;

    if (botRoom.roundPhase === 'pairing') {
      const choosingTeam = getChoosingTeam(botRoom.teamA, botRoom.teamB);
      if (choosingTeam === 'B') {
        const timer = setTimeout(() => {
          setBotRoom((curr) => {
            if (!curr || curr.roundPhase !== 'pairing') return curr;
            const shuffledA = [...curr.teamA].sort(() => Math.random() - 0.5);
            const pairings = curr.teamB.map(
              (pB, idx) => `${shuffledA[idx].uid}:${pB.uid}`
            );
            return {
              ...curr,
              roundPairings: pairings,
              roundPhase: 'picking',
              roundStartedAt: Date.now(),
            };
          });
        }, 700);
        return () => clearTimeout(timer);
      }
      return;
    }

    // In 'picking' phase: bots pick one by one so you watch seated players place hidden cards on the table
    if (botRoom.roundPhase === 'picking' && activePairIndex >= 0) {
      const [uA, uB] = botRoom.roundPairings[activePairIndex].split(':');
      const botNeedPick =
        (uA.startsWith('bot_') && !botRoom.roundPicks[uA]) ||
        (uB.startsWith('bot_') && !botRoom.roundPicks[uB]);

      if (botNeedPick) {
        const humanAlreadyPicked = Boolean(botRoom.roundPicks[player.uid]);
        const delayMs = humanAlreadyPicked ? 450 : 1150;
        const timer = setTimeout(() => {
          setBotRoom((curr) => {
            if (!curr || curr.status !== 'active' || curr.roundPhase !== 'picking') {
              return curr;
            }
            const nextPicks = { ...curr.roundPicks };
            if (uA.startsWith('bot_') && !nextPicks[uA]) {
              nextPicks[uA] =
                MOVE_ORDER[Math.floor(Math.random() * MOVE_ORDER.length)];
            } else if (uB.startsWith('bot_') && !nextPicks[uB]) {
              nextPicks[uB] =
                MOVE_ORDER[Math.floor(Math.random() * MOVE_ORDER.length)];
            }

            return advanceBotRoomWithPicks(curr, nextPicks);
          });
        }, delayMs);
        return () => clearTimeout(timer);
      }
    }
  }, [isBotMode, botRoom, revealRound, activePairIndex, player.uid]);

  // Bot timeout handling
  React.useEffect(() => {
    if (!isBotMode || !botRoom || botRoom.status !== 'active' || revealRound) return;
    if (secondsLeft === 0) {
      if (botRoom.roundPhase === 'pairing') {
        setBotRoom((curr) => {
          if (!curr || curr.roundPhase !== 'pairing') return curr;
          const pairedA = new Set(curr.roundPairings.map((p) => p.split(':')[0]));
          const pairedB = new Set(curr.roundPairings.map((p) => p.split(':')[1]));
          const remA = curr.teamA.filter((p) => !pairedA.has(p.uid));
          const remB = curr.teamB.filter((p) => !pairedB.has(p.uid));
          const next = [...curr.roundPairings];
          for (let i = 0; i < Math.min(remA.length, remB.length); i++) {
            next.push(`${remA[i].uid}:${remB[i].uid}`);
          }
          return {
            ...curr,
            roundPairings: next,
            roundPhase: 'picking',
            roundStartedAt: Date.now(),
          };
        });
      } else if (isMyTurnToPick && !botRoom.roundPicks[player.uid]) {
        handleSelectMove(stagedMove);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, isBotMode, botRoom, revealRound, isMyTurnToPick]);

  const handleChooseOpponent = async (opponentUid: string) => {
    if (!room || room.status !== 'active' || room.roundPhase !== 'pairing') return;
    soundFx.playSelect();

    if (isBotMode && botRoom) {
      setBotRoom((curr) => {
        if (!curr || curr.roundPhase !== 'pairing') return curr;
        const pairedA = new Set(curr.roundPairings.map((p) => p.split(':')[0]));
        const pairedB = new Set(curr.roundPairings.map((p) => p.split(':')[1]));
        if (pairedA.has(player.uid) || pairedB.has(opponentUid)) return curr;

        const nextPairings = [...curr.roundPairings, `${player.uid}:${opponentUid}`];
        pairedA.add(player.uid);
        pairedB.add(opponentUid);

        // Bots on Team A automatically pick remaining opponents if 3v3
        const remA = curr.teamA.filter((p) => !pairedA.has(p.uid));
        const remB = curr.teamB.filter((p) => !pairedB.has(p.uid));
        for (let i = 0; i < Math.min(remA.length, remB.length); i++) {
          nextPairings.push(`${remA[i].uid}:${remB[i].uid}`);
        }

        return {
          ...curr,
          roundPairings: nextPairings,
          roundPhase: 'picking',
          roundStartedAt: Date.now(),
        };
      });
    } else if (onlineMatchId) {
      await chooseRoundPairing(onlineMatchId, room.currentRound, player.uid, opponentUid);
    }
  };

  const handleSelectMove = async (moveId: MoveId) => {
    if (!room || room.status !== 'active' || room.roundPhase !== 'picking' || revealRound) return;
    if (!isMyTurnToPick || room.roundPicks[player.uid]) return;

    soundFx.playCardPlace();

    if (isBotMode && botRoom) {
      setBotRoom((curr) => {
        if (!curr || curr.status !== 'active' || curr.roundPhase !== 'picking') {
          return curr;
        }
        return advanceBotRoomWithPicks(curr, {
          ...curr.roundPicks,
          [player.uid]: moveId,
        });
      });
    } else if (onlineMatchId) {
      await submitRoundPick(onlineMatchId, player.uid, moveId);
    }
  };

  const handleStageOrThrowCard = (moveId: MoveId) => {
    if (stagedMove !== moveId) {
      soundFx.playSelect();
      vibrateTap();
      setStagedMove(moveId);
      return;
    }
    vibrateThrow();
    handleSelectMove(moveId);
  };

  // Liar's Bar Keybinds: [1-6] Select/Stage Card, [SPACE]/[E]/[Enter] Throw Card to Table, [H] Toggle HUD
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '1' && e.key <= '6') {
        const idx = Number(e.key) - 1;
        const moveId = MOVE_ORDER[idx];
        if (moveId) {
          soundFx.playSelect();
          setStagedMove(moveId);
        }
      } else if (e.key === ' ' || e.key === 'e' || e.key === 'E' || e.key === 'Enter') {
        if (room?.status === 'active' && room.roundPhase === 'picking' && isMyTurnToPick && !room.roundPicks[player.uid]) {
          e.preventDefault();
          handleSelectMove(stagedMove);
        }
      } else if (e.key === 'h' || e.key === 'H') {
        setHudCollapsed((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, revealRound, isMyTurnToPick, stagedMove]);

  const handleRestartBot = () => {
    if (!botConfig) return;
    lastSeenRoundHistoryCountRef.current = 0;
    recordedMatchIdRef.current = null;
    setRevealRound(null);
    setRewardResult(null);
    setPrevEloName(getEloInfo(player.trophies).tier.name);
    setBotRoom(createInitialBotRoom(player, botConfig));
  };

  const handleToggleMute = () => {
    soundFx.muted = !muted;
    setMuted(!muted);
  };

  const handleCopyCode = () => {
    if (!room) return;
    navigator.clipboard?.writeText(room.code).catch(() => {});
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1800);
  };

  const acceptedFriends = friendships.filter((f) => f.status === 'accepted');

  if (!room) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-16 text-center">
        <p className="text-sm text-slate-400">Carregando sala da arena...</p>
      </main>
    );
  }

  const targetWins = room.format === 'MD5' ? 3 : 2;
  const myPick = room.roundPicks[player.uid];
  const myTeamScore = playerTeam === 'A' ? room.teamAScore : room.teamBScore;
  const oppTeamScore = playerTeam === 'A' ? room.teamBScore : room.teamAScore;

  const choosingTeam = getChoosingTeam(room.teamA, room.teamB);
  const myTeamSum = (playerTeam === 'A' ? room.teamA : room.teamB).reduce(
    (s, p) => s + (p.trophies || 0),
    0
  );
  const oppTeamSum = (playerTeam === 'A' ? room.teamB : room.teamA).reduce(
    (s, p) => s + (p.trophies || 0),
    0
  );
  const isMyTeamChoosing = choosingTeam === playerTeam;

  // Waiting Room View
  if (room.status === 'waiting') {
    return (
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onExitArena}
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-white cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Voltar ao Lobby</span>
          </button>

          {room.creatorUid === player.uid && (
            <button
              type="button"
              onClick={async () => {
                await cancelMatchRoom(room.id);
                onExitArena();
              }}
              className="rounded-lg border border-red-500/40 px-3.5 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-950/40 cursor-pointer"
            >
              Cancelar Sala
            </button>
          )}
        </div>

        <section className="rounded-2xl border border-white/10 bg-[#131A26] p-6 space-y-6">
          <div className="flex flex-col justify-between gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-center">
            <div>
              <div className="text-xs font-semibold text-amber-400">
                {room.mode} · {room.format} · {room.isFriendly ? 'Amistoso' : 'Ranqueada'}
              </div>
              <h1 className="font-display mt-1 text-2xl font-extrabold text-white">
                Aguardando Jogadores ({room.participantUids.length}/{room.teamSize * 2})
              </h1>
            </div>

            <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-[#0B0F17] px-4 py-2.5">
              <span className="text-xs text-slate-400">Código:</span>
              <span className="font-mono-num text-lg font-bold tracking-wider text-amber-400">
                {room.code}
              </span>
              <button
                type="button"
                onClick={handleCopyCode}
                aria-label="Copiar código"
                className="ml-1 text-slate-400 hover:text-white cursor-pointer"
              >
                {copiedCode ? (
                  <Check className="h-4 w-4 text-emerald-400" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-[#0B0F17] p-4 space-y-2.5">
              <div className="text-xs font-bold text-amber-400">
                Equipe A ({room.teamA.length}/{room.teamSize})
              </div>
              {Array.from({ length: room.teamSize }).map((_, idx) => {
                const p = room.teamA[idx];
                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded-lg border border-white/5 bg-[#131A26] px-3 py-2 text-sm"
                  >
                    <span className={p ? 'font-semibold text-white' : 'text-slate-500'}>
                      {p ? p.nickname : 'Vaga aberta...'}
                    </span>
                    {p && <span className="text-xs text-slate-400">{p.turma}</span>}
                  </div>
                );
              })}
            </div>

            <div className="rounded-xl border border-white/10 bg-[#0B0F17] p-4 space-y-2.5">
              <div className="text-xs font-bold text-sky-400">
                Equipe B ({room.teamB.length}/{room.teamSize})
              </div>
              {Array.from({ length: room.teamSize }).map((_, idx) => {
                const p = room.teamB[idx];
                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded-lg border border-white/5 bg-[#131A26] px-3 py-2 text-sm"
                  >
                    <span className={p ? 'font-semibold text-white' : 'text-slate-500'}>
                      {p ? p.nickname : 'Vaga aberta...'}
                    </span>
                    {p && <span className="text-xs text-slate-400">{p.turma}</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {acceptedFriends.length > 0 && (
            <div className="border-t border-white/10 pt-5 space-y-3">
              <div className="text-xs font-semibold text-slate-300">
                Convidar Amigos para esta Sala
              </div>
              <div className="flex flex-wrap gap-2">
                {acceptedFriends.map((f) => {
                  const otherUid = f.users.find((u) => u !== player.uid) ?? '';
                  const snap = f.profiles?.[otherUid];
                  const alreadyIn = room.participantUids.includes(otherUid);
                  const sent = invitedUids.includes(otherUid);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      disabled={alreadyIn || sent}
                      onClick={async () => {
                        await sendDuelInvite({
                          fromPlayer: player,
                          toUid: otherUid,
                          match: room,
                        });
                        setInvitedUids((prev) => [...prev, otherUid]);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-[#0B0F17] px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-amber-400 disabled:opacity-50 cursor-pointer"
                    >
                      <Send className="h-3 w-3 text-amber-400" />
                      <span>
                        {snap?.nickname ?? 'Amigo'}{' '}
                        {alreadyIn ? '(Na sala)' : sent ? '(Convidado)' : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </main>
    );
  }

  const newEloInfo = rewardResult
    ? getEloInfo(modalDisplayTrophies)
    : getEloInfo(player.trophies);
  const promoted =
    rewardResult && newEloInfo.tier.name !== prevEloName && rewardResult.trophyDelta > 0;

  // Helpers for Pairing Phase
  const pairedA = new Set((room.roundPairings || []).map((p) => p.split(':')[0]));
  const pairedB = new Set((room.roundPairings || []).map((p) => p.split(':')[1]));
  const amIPaired =
    playerTeam === 'A' ? pairedA.has(player.uid) : pairedB.has(player.uid);

  return (
    <main className="mx-auto max-w-6xl space-y-2.5 sm:space-y-4 px-2.5 py-2.5 sm:px-6 sm:py-5">
      {/* Top Arena HUD */}
      <section className="flex flex-wrap items-center justify-between gap-2 sm:gap-4 rounded-xl sm:rounded-2xl border border-white/10 bg-[#131A26] px-3 py-2 sm:px-5 sm:py-3">
        <div className="flex items-center gap-2.5 sm:gap-4">
          <button
            type="button"
            onClick={onExitArena}
            className="inline-flex min-h-[38px] items-center gap-1.5 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden xs:inline sm:inline">Sair</span>
          </button>
          <span className="text-[11px] sm:text-xs text-slate-400">
            {room.mode} · {room.format}
            <span className="hidden sm:inline">
              {' '}
              · {room.isFriendly ? 'Amistoso' : 'Ranqueada'}
              {isBotMode ? ' · vs Bot' : ''}
            </span>
          </span>
        </div>

        {/* Scoreboard */}
        <div className="flex items-center gap-3 sm:gap-5">
          <div className="text-right">
            <div className="hidden sm:block text-[11px] font-semibold text-amber-400">
              Sua Equipe
            </div>
            <div className="flex items-center justify-end gap-1 sm:mt-1 sm:gap-1.5">
              {Array.from({ length: targetWins }).map((_, i) => (
                <span
                  key={i}
                  className={`h-2 w-4 sm:h-2.5 sm:w-6 rounded-sm transition-colors ${
                    i < myTeamScore ? 'bg-amber-400' : 'bg-[#0B0F17] border border-white/15'
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="font-mono-num text-lg sm:text-2xl font-extrabold text-white">
            {myTeamScore} : {oppTeamScore}
          </div>

          <div className="text-left">
            <div className="hidden sm:block text-[11px] font-semibold text-sky-400">
              Adversários
            </div>
            <div className="flex items-center gap-1 sm:mt-1 sm:gap-1.5">
              {Array.from({ length: targetWins }).map((_, i) => (
                <span
                  key={i}
                  className={`h-2 w-4 sm:h-2.5 sm:w-6 rounded-sm transition-colors ${
                    i < oppTeamScore ? 'bg-sky-400' : 'bg-[#0B0F17] border border-white/15'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Camera Mode Toggle, Sound & Rules */}
        <div className="flex items-center gap-1.5 sm:gap-2.5">
          <button
            type="button"
            onClick={() => {
              vibrateTap();
              setUse3DTable((v) => !v);
            }}
            className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] sm:text-xs font-bold transition-colors cursor-pointer ${
              use3DTable
                ? 'border-amber-400/60 bg-amber-500/15 text-amber-300'
                : 'border-white/15 bg-[#0B0F17] text-slate-300 hover:text-white'
            }`}
          >
            <Box className="h-3.5 w-3.5" />
            <span className="sm:hidden">{use3DTable ? '3D' : '2D'}</span>
            <span className="hidden sm:inline">
              {use3DTable ? "Mesa 3D (Liar's Bar)" : 'Visão 2D'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleToggleMute}
            aria-label={muted ? 'Ativar som' : 'Silenciar som'}
            className="flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg border border-white/15 bg-[#0B0F17] p-2 text-slate-300 hover:text-white cursor-pointer"
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>

          <button
            type="button"
            onClick={onOpenRules}
            aria-label="Regras do hexágono"
            className="flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg border border-white/15 bg-[#0B0F17] p-2 text-amber-400 hover:text-amber-300 cursor-pointer"
          >
            <BookOpen className="h-4 w-4" />
          </button>
        </div>
      </section>

      {/* Main Match Table Stage: 3D Saloon Table (Default) or 2D Tactical Table */}
      {use3DTable ? (
        <TableArena3D
          room={room}
          player={player}
          playerTeam={playerTeam}
          secondsLeft={secondsLeft}
          stagedMove={stagedMove}
          revealRound={revealRound}
          activePairIndex={activePairIndex}
          activePairUids={activePairUids}
          isMyTurnToPick={isMyTurnToPick}
          isMyTeamChoosing={isMyTeamChoosing}
          amIPaired={amIPaired}
          myTeamSum={myTeamSum}
          oppTeamSum={oppTeamSum}
          hudCollapsed={hudCollapsed}
          onToggleHud={() => setHudCollapsed((v) => !v)}
          onStageMove={(m) => {
            soundFx.playSelect();
            setStagedMove(m);
          }}
          onThrowStagedMove={() => handleSelectMove(stagedMove)}
          onChooseOpponent={handleChooseOpponent}
        />
      ) : (
        <UnoTableStage
          room={room}
          player={player}
          playerTeam={playerTeam}
          revealRound={revealRound}
          activePairIndex={activePairIndex}
          activePairUids={activePairUids}
          isMyTurnToPick={isMyTurnToPick}
          isMyTeamChoosing={isMyTeamChoosing}
          amIPaired={amIPaired}
          myTeamSum={myTeamSum}
          oppTeamSum={oppTeamSum}
          onChooseOpponent={handleChooseOpponent}
        />
      )}

      {/* Thumb-Zone Player Hand Dock at the Bottom */}
      <section className="rounded-xl sm:rounded-2xl border border-white/10 bg-[#131A26] p-2.5 sm:p-3.5 space-y-2.5 sm:space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-slate-300">
            <span className="font-display font-bold text-white">
              Sua Mão ({myPick ? '1 na mesa' : '6 cartas'})
            </span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span
              className={
                myPick
                  ? 'text-emerald-400 font-semibold'
                  : isMyTurnToPick
                  ? 'text-amber-300 font-semibold'
                  : 'text-slate-400'
              }
            >
              {myPick
                ? `Lançada: ${MOVES[myPick].name}`
                : isMyTurnToPick
                ? `Selecionada: ${MOVES[stagedMove].shortName}`
                : 'Aguardando sua vez na mesa'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {!myPick && isMyTurnToPick && (
              <button
                type="button"
                onClick={() => {
                  vibrateThrow();
                  handleSelectMove(stagedMove);
                }}
                className="hidden sm:inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-extrabold text-slate-950 hover:bg-amber-400 cursor-pointer"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Lançar {MOVES[stagedMove].shortName} [ESPAÇO]</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setHudCollapsed((v) => !v)}
              className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-white/15 bg-[#0B0F17] px-2.5 py-1 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
            >
              {hudCollapsed ? (
                <>
                  <ChevronUp className="h-3.5 w-3.5" />
                  <span>Mostrar Cartas</span>
                </>
              ) : (
                <>
                  <ChevronDown className="h-3.5 w-3.5" />
                  <span>Recolher</span>
                </>
              )}
            </button>
          </div>
        </div>

        {!hudCollapsed && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-3 lg:grid-cols-6 sm:gap-3">
            {MOVE_ORDER.map((moveId, idx) => (
              <MoveCard
                key={moveId}
                moveId={moveId}
                skinId={player.equippedSkins[moveId]}
                selected={(myPick ?? stagedMove) === moveId}
                compact
                disabled={
                  room.status !== 'active' ||
                  !isMyTurnToPick ||
                  Boolean(myPick) ||
                  Boolean(revealRound)
                }
                shortcutKey={String(idx + 1)}
                onClick={() => handleStageOrThrowCard(moveId)}
              />
            ))}
          </div>
        )}

        {/* Mobile Thumb-Zone Primary Action CTA */}
        {room.roundPhase === 'picking' && !revealRound && !myPick && isMyTurnToPick && (
          <button
            type="button"
            onClick={() => {
              vibrateThrow();
              handleSelectMove(stagedMove);
            }}
            className="flex sm:hidden w-full min-h-[48px] items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-black uppercase tracking-wide text-slate-950 shadow-lg shadow-amber-500/25 active:scale-[0.98] transition-transform cursor-pointer"
          >
            <Sparkles className="h-4 w-4" />
            <span>Jogar {MOVES[stagedMove].name} na Mesa</span>
          </button>
        )}
      </section>

      {/* Match Over Modal with Animated Trophy Counter & Progress Bar */}
      {room.status === 'finished' && !revealRound && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#131A26] p-6 text-center space-y-5 shadow-2xl">
            <div>
              <div className="text-xs font-semibold text-slate-400">
                {room.mode} · {room.format} · {room.isFriendly ? 'Amistoso' : 'Ranqueada'}
              </div>
              <h2
                className={`font-display mt-1 text-3xl font-extrabold ${
                  room.winnerTeam === 'DRAW'
                    ? 'text-slate-200'
                    : room.winnerTeam === playerTeam
                    ? 'text-amber-400'
                    : 'text-red-400'
                }`}
              >
                {room.winnerTeam === 'DRAW'
                  ? 'Empate!'
                  : room.winnerTeam === playerTeam
                  ? 'Vitória da Equipe!'
                  : 'Derrota na Arena'}
              </h2>
              <div className="font-mono-num mt-2 text-2xl font-bold text-white">
                {myTeamScore} — {oppTeamScore}
              </div>
            </div>

            {rewardResult && (
              <div className="space-y-3 rounded-xl border border-white/10 bg-[#0B0F17] p-4">
                {rewardResult.streakRecoveryTriggered && (
                  <div className="rounded-lg border border-sky-400/40 bg-sky-950/50 px-3 py-2 text-xs font-semibold text-sky-300">
                    Bônus de 3 Derrotas Seguidas ativado: +{rewardResult.trophyDelta} troféus de recuperação!
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg border border-white/5 bg-[#131A26] p-3">
                    <div className="text-xs text-slate-400">Troféus</div>
                    <div className="mt-1 flex items-baseline justify-center gap-2">
                      <span className="font-mono-num text-2xl font-bold text-white">
                        {modalDisplayTrophies}
                      </span>
                      <span
                        className={`font-mono-num text-sm font-extrabold ${
                          rewardResult.trophyDelta > 0
                            ? 'text-emerald-400 animate-bounce'
                            : rewardResult.trophyDelta < 0
                            ? 'text-red-400'
                            : 'text-slate-300'
                        }`}
                      >
                        {rewardResult.trophyDelta > 0
                          ? `+${rewardResult.trophyDelta}`
                          : rewardResult.trophyDelta}
                      </span>
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/5 bg-[#131A26] p-3">
                    <div className="text-xs text-slate-400">Moedinhas</div>
                    <div className="font-mono-num mt-1 text-2xl font-bold text-amber-300">
                      +{rewardResult.coinsEarned}
                    </div>
                  </div>
                </div>

                {/* Animated Elo Progress Bar inside Match Summary */}
                <div className="pt-1 text-left">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span className={`font-semibold ${newEloInfo.tier.badgeTextClass}`}>
                      Elo {newEloInfo.tier.name}
                    </span>
                    <span className="font-mono-num">
                      {newEloInfo.nextTier
                        ? `${newEloInfo.progressPercent}% até ${newEloInfo.nextTier.name}`
                        : 'Elo Máximo'}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[#131A26]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-400 transition-all duration-1000 ease-out"
                      style={{ width: `${newEloInfo.progressPercent}%` }}
                    />
                  </div>
                </div>

                {promoted && (
                  <div className="flex items-center justify-center gap-1.5 border-t border-white/10 pt-2.5 text-xs font-bold text-amber-400 animate-pulse">
                    <Trophy className="h-4 w-4" />
                    <span>Você subiu para o elo {newEloInfo.tier.name}!</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col gap-2.5 sm:flex-row">
              {isBotMode && (
                <button
                  type="button"
                  onClick={handleRestartBot}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 py-3 text-sm font-bold text-slate-950 hover:bg-amber-400 cursor-pointer"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>Jogar Novamente</span>
                </button>
              )}
              <button
                type="button"
                onClick={onExitArena}
                className={`flex-1 rounded-xl py-3 text-sm font-bold cursor-pointer ${
                  isBotMode
                    ? 'border border-white/15 bg-[#0B0F17] text-white hover:border-white/30'
                    : 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                }`}
              >
                Voltar ao Lobby
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
