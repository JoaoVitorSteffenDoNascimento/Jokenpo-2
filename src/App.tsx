import React, { Suspense } from 'react';
import { User } from 'firebase/auth';
import { AnimatePresence, motion } from 'motion/react';
import {
  processDailyLoginReward,
  signInWithGoogle,
  signInWithLocalArena,
  signOutUser,
  subscribeAuthSession,
  subscribeFriendships,
  subscribeIncomingInvites,
  subscribeLeaderboard,
  subscribePlayerProfile,
  subscribeRecentMatchHistory,
  subscribeWaitingRooms,
  syncProSeasonIfNeeded,
} from './firebase/services';
import {
  DuelInvite,
  Friendship,
  MatchFormat,
  MatchHistoryEntry,
  MatchMode,
  MatchRoom,
  PlayerProfile,
  TrophyProgressFeedback,
} from './types/game';
import { AppTab, Navbar } from './components/Navbar';
import { AuthOnboarding } from './components/AuthOnboarding';
import { LobbyView } from './components/LobbyView';
import { soundFx } from './utils/soundFx';
import { exitArenaFullscreen, requestArenaFullscreen } from './utils/haptics';

const ArenaView = React.lazy(() =>
  import('./components/ArenaView').then((m) => ({ default: m.ArenaView }))
);
const RankingsView = React.lazy(() =>
  import('./components/RankingsView').then((m) => ({ default: m.RankingsView }))
);
const SkinsShopView = React.lazy(() =>
  import('./components/SkinsShopView').then((m) => ({ default: m.SkinsShopView }))
);
const FriendsView = React.lazy(() =>
  import('./components/FriendsView').then((m) => ({ default: m.FriendsView }))
);
const HexagonRulesModal = React.lazy(() =>
  import('./components/HexagonRulesModal').then((m) => ({
    default: m.HexagonRulesModal,
  }))
);
const DailyRewardModal = React.lazy(() =>
  import('./components/DailyRewardModal').then((m) => ({
    default: m.DailyRewardModal,
  }))
);
const TrophyRoadModal = React.lazy(() =>
  import('./components/TrophyRoadModal').then((m) => ({
    default: m.TrophyRoadModal,
  }))
);
const DeployGuideModal = React.lazy(() =>
  import('./components/DeployGuideModal').then((m) => ({
    default: m.DeployGuideModal,
  }))
);

export default function App() {
  const [firebaseUser, setFirebaseUser] = React.useState<User | null>(null);
  const [authReady, setAuthReady] = React.useState(false);
  const [authLoading, setAuthLoading] = React.useState(false);
  const [authError, setAuthError] = React.useState('');

  const [player, setPlayer] = React.useState<PlayerProfile | null>(null);
  const [profileLoading, setProfileLoading] = React.useState(false);

  const [activeTab, setActiveTab] = React.useState<AppTab>('arena');
  const [rulesOpen, setRulesOpen] = React.useState(false);
  const [trophyRoadOpen, setTrophyRoadOpen] = React.useState(false);
  const [deployGuideOpen, setDeployGuideOpen] = React.useState(false);
  const [dailyBonus, setDailyBonus] = React.useState<{
    coinsAwarded: number;
    newCoins: number;
  } | null>(null);
  const [recentTrophyProgress, setRecentTrophyProgress] =
    React.useState<TrophyProgressFeedback | null>(null);
  const checkedDailyUidRef = React.useRef<string | null>(null);
  const checkedProSeasonUidRef = React.useRef<string | null>(null);

  // Active match state (either online room ID or bot match config)
  const [onlineMatchId, setOnlineMatchId] = React.useState<string | null>(null);
  const [botMatchConfig, setBotMatchConfig] = React.useState<{
    mode: MatchMode;
    format: MatchFormat;
    isFriendly: boolean;
  } | null>(null);

  // Real-time platform collections
  const [leaderboard, setLeaderboard] = React.useState<PlayerProfile[]>([]);
  const [waitingRooms, setWaitingRooms] = React.useState<MatchRoom[]>([]);
  const [friendships, setFriendships] = React.useState<Friendship[]>([]);
  const [incomingInvites, setIncomingInvites] = React.useState<DuelInvite[]>([]);
  const [matchHistory, setMatchHistory] = React.useState<MatchHistoryEntry[]>([]);

  // Auth listener (Firebase + Local Arena hybrid session)
  React.useEffect(() => {
    const unsub = subscribeAuthSession((user) => {
      setFirebaseUser(user);
      setAuthReady(true);
      if (!user) {
        setPlayer(null);
        setOnlineMatchId(null);
        setBotMatchConfig(null);
        setDailyBonus(null);
        setTrophyRoadOpen(false);
        setMatchHistory([]);
        checkedDailyUidRef.current = null;
        checkedProSeasonUidRef.current = null;
      }
    });
    return unsub;
  }, []);

  // Player profile listener
  React.useEffect(() => {
    if (!firebaseUser) return;
    setProfileLoading(true);
    const unsub = subscribePlayerProfile(firebaseUser.uid, (profile) => {
      setPlayer(profile);
      setProfileLoading(false);
    });
    return unsub;
  }, [firebaseUser]);

  // Platform subscriptions (only when authenticated and onboarded)
  React.useEffect(() => {
    if (!authReady || !firebaseUser || !player) return;
    const unsubBoard = subscribeLeaderboard(setLeaderboard);
    const unsubRooms = subscribeWaitingRooms(setWaitingRooms);
    const unsubFriends = subscribeFriendships(player.uid, setFriendships);
    const unsubInvites = subscribeIncomingInvites(player.uid, setIncomingInvites);
    const unsubHistory = subscribeRecentMatchHistory(player.uid, setMatchHistory);

    return () => {
      unsubBoard();
      unsubRooms();
      unsubFriends();
      unsubInvites();
      unsubHistory();
    };
  }, [authReady, firebaseUser, player?.uid]);

  // Trigger automatic daily login reward on first login of the day when profile loads
  React.useEffect(() => {
    const uid = player?.uid;
    if (!authReady || !firebaseUser || !uid) return;
    if (checkedDailyUidRef.current === uid) return;
    checkedDailyUidRef.current = uid;

    processDailyLoginReward(uid)
      .then((res) => {
        if (res.awarded) {
          soundFx.playCoin();
          setDailyBonus({
            coinsAwarded: res.coinsAwarded,
            newCoins: res.newCoins,
          });
        }
      })
      .catch((err) => {
        checkedDailyUidRef.current = null;
        console.error('Erro ao processar recompensa diária de login:', err);
      });
  }, [authReady, firebaseUser, player?.uid]);

  // Monthly Pro Season reset check on profile load
  React.useEffect(() => {
    const uid = player?.uid;
    if (!authReady || !firebaseUser || !uid) return;
    if (checkedProSeasonUidRef.current === uid) return;
    checkedProSeasonUidRef.current = uid;

    syncProSeasonIfNeeded(uid).catch((err) => {
      checkedProSeasonUidRef.current = null;
      console.error('Erro ao sincronizar temporada Pro:', err);
    });
  }, [authReady, firebaseUser, player?.uid]);

  const handleSignIn = async () => {
    setAuthError('');
    setAuthLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes('unauthorized-domain') ||
        msg.includes('operation-not-supported') ||
        msg.includes('popup-blocked') ||
        msg.includes('network-request-failed')
      ) {
        const localUser = signInWithLocalArena();
        setFirebaseUser(localUser);
        setAuthError('');
      } else if (msg.includes('popup-closed-by-user')) {
        setAuthError(
          'Janela do Google fechada. Você pode tentar novamente ou clicar em "Entrar Direto (Nickname + Turma)".'
        );
      } else {
        const localUser = signInWithLocalArena();
        setFirebaseUser(localUser);
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleEnterLocalArena = () => {
    setAuthError('');
    const localUser = signInWithLocalArena();
    setFirebaseUser(localUser);
  };

  const handleSignOut = async () => {
    await signOutUser();
    setActiveTab('arena');
  };

  const handleMatchFinished = React.useCallback(
    (progress: TrophyProgressFeedback) => setRecentTrophyProgress(progress),
    []
  );

  const handleClearTrophyProgress = React.useCallback(
    () => setRecentTrophyProgress(null),
    []
  );

  const inArena = Boolean(onlineMatchId || botMatchConfig);

  return (
    <div
      className={`relative min-h-screen bg-[#0B0F17] text-slate-100 flex flex-col ${
        player && !inArena ? 'pb-16 md:pb-0' : ''
      }`}
    >
      {/* AAA Ambient Background Glow */}
      {!inArena && (
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
          <div className="absolute -top-40 left-1/4 h-96 w-96 rounded-full bg-amber-500/10 blur-[128px]" />
          <div className="absolute top-1/3 -right-20 h-96 w-96 rounded-full bg-cyan-500/10 blur-[128px]" />
          <div className="absolute -bottom-20 left-1/3 h-96 w-96 rounded-full bg-emerald-500/10 blur-[128px]" />
        </div>
      )}
      {!inArena && (
        <Navbar
          activeTab={activeTab}
          onSelectTab={(tab) => {
            setOnlineMatchId(null);
            setBotMatchConfig(null);
            setActiveTab(tab);
          }}
          player={player}
          onSignIn={handleSignIn}
          onSignOut={handleSignOut}
          onOpenDeployGuide={() => setDeployGuideOpen(true)}
          authLoading={authLoading}
          hideMobileBottomNav={inArena}
        />
      )}

      {authError && !inArena && (
        <div className="mx-auto mt-4 w-full max-w-6xl px-4 sm:px-6">
          <div className="rounded-xl border border-amber-500/40 bg-amber-950/40 px-4 py-3 text-xs text-amber-200">
            {authError}
          </div>
        </div>
      )}

      {!authReady || (firebaseUser && profileLoading && !player) ? (
        <div className="flex flex-1 items-center justify-center p-12 text-sm text-slate-400">
          Carregando arena Jokenpo 2...
        </div>
      ) : !firebaseUser || !player ? (
        <AuthOnboarding
          firebaseUser={firebaseUser}
          onSignIn={handleSignIn}
          onEnterLocalArena={handleEnterLocalArena}
          authLoading={authLoading}
          onAccountCreated={(newProfile) => setPlayer(newProfile)}
          onOpenRules={() => setRulesOpen(true)}
        />
      ) : inArena ? (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#090605] p-12 text-sm text-amber-300">
              Preparando mesa 3D em Tela Cheia...
            </div>
          }
        >
          <ArenaView
            player={player}
            onlineMatchId={onlineMatchId}
            botConfig={botMatchConfig}
            friendships={friendships}
            onMatchFinished={handleMatchFinished}
            onExitArena={() => {
              exitArenaFullscreen();
              setOnlineMatchId(null);
              setBotMatchConfig(null);
            }}
            onOpenRules={() => setRulesOpen(true)}
          />
        </Suspense>
      ) : (
        <AnimatePresence mode="wait">
          {activeTab === 'arena' ? (
            <motion.div
              key="tab-arena"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="flex-1"
            >
              <LobbyView
                player={player}
                waitingRooms={waitingRooms}
                incomingInvites={incomingInvites}
                matchHistory={matchHistory}
                recentTrophyProgress={recentTrophyProgress}
                onClearTrophyProgress={handleClearTrophyProgress}
                onEnterOnlineMatch={(matchId) => {
                  requestArenaFullscreen();
                  setBotMatchConfig(null);
                  setOnlineMatchId(matchId);
                }}
                onStartBotMatch={(config) => {
                  requestArenaFullscreen();
                  setOnlineMatchId(null);
                  setBotMatchConfig(config);
                }}
                onOpenRules={() => setRulesOpen(true)}
                onOpenTrophyRoad={() => setTrophyRoadOpen(true)}
                onOpenSkinsShop={() => setActiveTab('skins')}
                onOpenDeployGuide={() => setDeployGuideOpen(true)}
              />
            </motion.div>
          ) : (
            <motion.div
              key={`tab-${activeTab}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="flex-1"
            >
              <Suspense
                fallback={
                  <div className="flex flex-1 items-center justify-center p-12 text-sm text-slate-400">
                    Carregando módulo...
                  </div>
                }
              >
                {activeTab === 'rankings' ? (
                  <RankingsView players={leaderboard} currentPlayer={player} />
                ) : activeTab === 'skins' ? (
                  <SkinsShopView player={player} />
                ) : (
                  <FriendsView
                    player={player}
                    friendships={friendships}
                    allPlayers={leaderboard}
                    onEnterOnlineMatch={(matchId) => {
                      requestArenaFullscreen();
                      setActiveTab('arena');
                      setBotMatchConfig(null);
                      setOnlineMatchId(matchId);
                    }}
                  />
                )}
              </Suspense>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      <Suspense fallback={null}>
        {rulesOpen && (
          <HexagonRulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
        )}
        {deployGuideOpen && (
          <DeployGuideModal
            open={deployGuideOpen}
            onClose={() => setDeployGuideOpen(false)}
          />
        )}
        {player && trophyRoadOpen && (
          <TrophyRoadModal
            open={trophyRoadOpen}
            player={player}
            onClose={() => setTrophyRoadOpen(false)}
          />
        )}
        {!onlineMatchId && !botMatchConfig && player && dailyBonus && (
          <DailyRewardModal
            open={Boolean(dailyBonus)}
            player={player}
            coinsAwarded={dailyBonus.coinsAwarded}
            newCoins={dailyBonus.newCoins}
            onClose={() => setDailyBonus(null)}
            onGoToShop={() => {
              setDailyBonus(null);
              setOnlineMatchId(null);
              setBotMatchConfig(null);
              setActiveTab('skins');
            }}
          />
        )}
      </Suspense>
    </div>
  );
}
