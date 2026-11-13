import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { signInWithPopup, signOut, User } from 'firebase/auth';
import { auth, db, googleProvider } from './config';
import { handleFirestoreError, OperationType } from './errorHandler';
import {
  DAILY_REWARD_COINS,
  DEFAULT_CHARACTER_CUSTOMIZATION,
  DEFAULT_EQUIPPED_SKINS,
  DEFAULT_UNLOCKED_SKINS,
  getCurrentSeasonMonthKey,
  getSkinById,
  MOVE_ORDER,
  resolveCharacterCustomization,
  resolveMovePair,
} from '../constants/gameData';
import {
  CharacterCustomization,
  DuelInvite,
  Friendship,
  MatchFormat,
  MatchHistoryEntry,
  MatchMode,
  MatchParticipant,
  MatchRoom,
  MoveId,
  PairClashResult,
  PlayerProfile,
  RoundSummary,
  SkinDefinition,
  TrophyMilestone,
  Turma,
} from '../types/game';

// ==========================================
// HYBRID LOCAL ARENA (OFFLINE STORAGE & AUTH)
// ==========================================
const localProfilesMemory = new Map<string, PlayerProfile>();
const localMatchesMemory = new Map<string, MatchHistoryEntry[]>();
const localRoomsMemory = new Map<string, MatchRoom>();

export function isLocalArenaUid(uid: string): boolean {
  return typeof uid === 'string' && uid.startsWith('local_arena_');
}

export function signInWithLocalArena(
  displayName = 'Duelista_Local'
): { uid: string; displayName: string; email: string } {
  const cleanName = displayName.trim().replace(/\s+/g, '_') || 'Duelista_Local';
  const uid = `local_arena_${cleanName.toLowerCase()}`;
  const localUser = {
    uid,
    displayName: cleanName,
    email: `${cleanName.toLowerCase()}@local.arena`,
  };
  if (typeof globalThis.localStorage !== 'undefined') {
    globalThis.localStorage.setItem('local_arena_current_user', JSON.stringify(localUser));
  }
  return localUser;
}

function getLocalProfile(uid: string): PlayerProfile | null {
  if (localProfilesMemory.has(uid)) return localProfilesMemory.get(uid)!;
  if (typeof globalThis.localStorage !== 'undefined') {
    const raw = globalThis.localStorage.getItem(`local_arena_profile_${uid}`);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as PlayerProfile;
        localProfilesMemory.set(uid, parsed);
        return parsed;
      } catch {
        // Ignore malformed cache
      }
    }
  }
  return null;
}

function saveLocalProfile(profile: PlayerProfile): void {
  localProfilesMemory.set(profile.uid, profile);
  if (typeof globalThis.localStorage !== 'undefined') {
    globalThis.localStorage.setItem(`local_arena_profile_${profile.uid}`, JSON.stringify(profile));
  }
}

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

export function normalizeNickname(nickname: string): string {
  return nickname.trim().toLowerCase();
}

export async function checkNicknameAvailable(nickname: string): Promise<boolean> {
  const lower = normalizeNickname(nickname);
  if (lower.length < 3 || lower.length > 20 || !/^[a-z0-9_.-]+$/.test(lower)) {
    return false;
  }
  const path = `nicknames/${lower}`;
  try {
    const snap = await getDoc(doc(db, 'nicknames', lower));
    return !snap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function createPlayerAccount(
  user: Pick<User, 'uid'> & { displayName?: string | null; email?: string | null },
  nickname: string,
  turma: Turma
): Promise<PlayerProfile> {
  const trimmed = nickname.trim();
  const lower = normalizeNickname(trimmed);
  if (lower.length < 3 || lower.length > 20 || !/^[a-zA-Z0-9_.-]+$/.test(trimmed)) {
    throw new Error('Nickname deve ter entre 3 e 20 caracteres (letras, números, _, . ou -).');
  }

  if (isLocalArenaUid(user.uid)) {
    const existing = getLocalProfile(user.uid);
    if (existing) return existing;
    const newProfile: PlayerProfile = {
      uid: user.uid,
      nickname: trimmed,
      nicknameLower: lower,
      turma,
      trophies: 0,
      coins: 150,
      wins: 0,
      losses: 0,
      draws: 0,
      lossStreak: 0,
      lastDailyClaimAt: '',
      unlockedSkins: DEFAULT_UNLOCKED_SKINS,
      equippedSkins: DEFAULT_EQUIPPED_SKINS,
      claimedMilestones: [],
      proSeasonMonth: getCurrentSeasonMonthKey(),
      proSeasonTrophies: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    saveLocalProfile(newProfile);
    return newProfile;
  }

  const nickRef = doc(db, 'nicknames', lower);
  const playerRef = doc(db, 'players', user.uid);
  const privateRef = doc(db, 'users_private', user.uid);

  try {
    await runTransaction(db, async (tx) => {
      const nickSnap = await tx.get(nickRef);
      if (nickSnap.exists()) {
        throw new Error('Este nickname já está em uso. Escolha outro!');
      }
      const playerSnap = await tx.get(playerRef);
      if (playerSnap.exists()) {
        throw new Error('Conta já cadastrada.');
      }

      tx.set(nickRef, {
        uid: user.uid,
        nickname: trimmed,
        turma,
        createdAt: serverTimestamp(),
      });

      tx.set(playerRef, {
        uid: user.uid,
        nickname: trimmed,
        nicknameLower: lower,
        turma,
        trophies: 0,
        coins: 150,
        wins: 0,
        losses: 0,
        draws: 0,
        lossStreak: 0,
        lastDailyClaimAt: '',
        unlockedSkins: DEFAULT_UNLOCKED_SKINS,
        equippedSkins: DEFAULT_EQUIPPED_SKINS,
        claimedMilestones: [],
        proSeasonMonth: getCurrentSeasonMonthKey(),
        proSeasonTrophies: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      tx.set(privateRef, {
        uid: user.uid,
        email: (user.email || '').slice(0, 200),
        displayName: (user.displayName || trimmed).slice(0, 100),
        createdAt: serverTimestamp(),
      });
    });

    const created = await getDoc(playerRef);
    return created.data() as PlayerProfile;
  } catch (error) {
    if (error instanceof Error && (error.message.includes('nickname') || error.message.includes('Conta já'))) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `players/${user.uid}`);
  }
}

function getLocalCharacterCustomization(uid: string): CharacterCustomization | null {
  try {
    const raw = localStorage.getItem(`jokenpo2_char_custom_${uid}`);
    if (!raw) return null;
    return resolveCharacterCustomization(JSON.parse(raw), 0);
  } catch {
    return null;
  }
}

export function subscribePlayerProfile(
  uid: string,
  onData: (profile: PlayerProfile | null) => void
): () => void {
  if (isLocalArenaUid(uid)) {
    onData(getLocalProfile(uid));
    return () => {};
  }
  const path = `players/${uid}`;
  return onSnapshot(
    doc(db, 'players', uid),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      const data = snap.data() as PlayerProfile;
      const custom =
        data.characterCustomization ??
        getLocalCharacterCustomization(uid) ??
        DEFAULT_CHARACTER_CUSTOMIZATION;
      onData({
        ...data,
        characterCustomization: resolveCharacterCustomization(custom, 0),
      });
    },
    (error) => handleFirestoreError(error, OperationType.GET, path)
  );
}

export function subscribeLeaderboard(
  onData: (players: PlayerProfile[]) => void
): () => void {
  const path = 'players';
  const q = query(
    collection(db, 'players'),
    where('trophies', '>=', 0),
    orderBy('trophies', 'desc'),
    limit(200)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => d.data() as PlayerProfile);
      onData(list);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

function getLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function canClaimDailyReward(lastClaimIso: string): {
  eligible: boolean;
  msRemaining: number;
} {
  if (!lastClaimIso) return { eligible: true, msRemaining: 0 };
  const lastDate = new Date(lastClaimIso);
  if (Number.isNaN(lastDate.getTime())) return { eligible: true, msRemaining: 0 };

  const now = new Date();
  if (getLocalDateKey(lastDate) !== getLocalDateKey(now)) {
    return { eligible: true, msRemaining: 0 };
  }

  const nextMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    0,
    0,
    0
  );
  return {
    eligible: false,
    msRemaining: Math.max(0, nextMidnight.getTime() - now.getTime()),
  };
}

export interface DailyLoginRewardResult {
  awarded: boolean;
  coinsAwarded: number;
  newCoins: number;
  claimedAt: string;
}

export async function processDailyLoginReward(
  uid: string
): Promise<DailyLoginRewardResult> {
  if (isLocalArenaUid(uid)) {
    const p = getLocalProfile(uid);
    if (!p) return { awarded: false, coinsAwarded: 0, newCoins: 0, claimedAt: '' };
    const nowIso = new Date().toISOString();
    const eligibility = canClaimDailyReward(p.lastDailyClaimAt);
    if (!eligibility.eligible) {
      return { awarded: false, coinsAwarded: 0, newCoins: p.coins, claimedAt: p.lastDailyClaimAt };
    }
    const updated: PlayerProfile = {
      ...p,
      coins: p.coins + DAILY_REWARD_COINS,
      lastDailyClaimAt: nowIso,
    };
    saveLocalProfile(updated);
    return {
      awarded: true,
      coinsAwarded: DAILY_REWARD_COINS,
      newCoins: updated.coins,
      claimedAt: nowIso,
    };
  }
  const path = `players/${uid}`;
  const playerRef = doc(db, 'players', uid);
  const nowIso = new Date().toISOString();

  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(playerRef);
      if (!snap.exists()) {
        return {
          awarded: false,
          coinsAwarded: 0,
          newCoins: 0,
          claimedAt: '',
        };
      }

      const current = snap.data() as PlayerProfile;
      const { eligible } = canClaimDailyReward(current.lastDailyClaimAt);
      if (!eligible) {
        return {
          awarded: false,
          coinsAwarded: 0,
          newCoins: current.coins,
          claimedAt: current.lastDailyClaimAt,
        };
      }

      const nextCoins = current.coins + DAILY_REWARD_COINS;
      tx.update(playerRef, {
        coins: nextCoins,
        lastDailyClaimAt: nowIso,
        updatedAt: serverTimestamp(),
      });

      return {
        awarded: true,
        coinsAwarded: DAILY_REWARD_COINS,
        newCoins: nextCoins,
        claimedAt: nowIso,
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function claimDailyReward(player: PlayerProfile): Promise<number> {
  const result = await processDailyLoginReward(player.uid);
  if (!result.awarded) {
    throw new Error('Recompensa diária já resgatada hoje.');
  }
  return result.coinsAwarded;
}

export async function buySkin(player: PlayerProfile, skin: SkinDefinition): Promise<void> {
  if (player.unlockedSkins.includes(skin.id)) return;
  if (player.coins < skin.cost) {
    throw new Error('Moedinhas insuficientes para comprar esta skin.');
  }
  if (isLocalArenaUid(player.uid)) {
    const p = getLocalProfile(player.uid) ?? player;
    const updated: PlayerProfile = {
      ...p,
      coins: p.coins - skin.cost,
      unlockedSkins: [...p.unlockedSkins, skin.id],
      equippedSkins: {
        ...p.equippedSkins,
        [skin.moveId]: skin.id,
      },
    };
    saveLocalProfile(updated);
    return;
  }
  const path = `players/${player.uid}`;
  try {
    await updateDoc(doc(db, 'players', player.uid), {
      coins: player.coins - skin.cost,
      unlockedSkins: [...player.unlockedSkins, skin.id],
      equippedSkins: {
        ...player.equippedSkins,
        [skin.moveId]: skin.id,
      },
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function equipSkin(
  player: PlayerProfile,
  moveId: MoveId,
  skinId: string
): Promise<void> {
  if (!player.unlockedSkins.includes(skinId)) {
    throw new Error('Desbloqueie a skin antes de equipar.');
  }
  if (isLocalArenaUid(player.uid)) {
    const p = getLocalProfile(player.uid) ?? player;
    const updated: PlayerProfile = {
      ...p,
      equippedSkins: {
        ...p.equippedSkins,
        [moveId]: skinId,
      },
    };
    saveLocalProfile(updated);
    return;
  }
  const path = `players/${player.uid}`;
  try {
    await updateDoc(doc(db, 'players', player.uid), {
      equippedSkins: {
        ...player.equippedSkins,
        [moveId]: skinId,
      },
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function saveCharacterCustomization(
  uid: string,
  customization: CharacterCustomization
): Promise<void> {
  const clean = resolveCharacterCustomization(customization, 0);
  try {
    localStorage.setItem(`jokenpo2_char_custom_${uid}`, JSON.stringify(clean));
  } catch {
    // ignore storage quota errors
  }
  const path = `players/${uid}`;
  try {
    await updateDoc(doc(db, 'players', uid), {
      characterCustomization: clean,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function recordPlayerMatchResult(
  playerUid: string,
  params: {
    outcome: 'win' | 'loss' | 'draw';
    newTrophies: number;
    coinsEarned: number;
    newLossStreak: number;
    mode: MatchMode;
    format: MatchFormat;
    isFriendly: boolean;
    opponentName: string;
    opponentTurma: string;
    scoreText: string;
    trophyDelta: number;
  }
): Promise<void> {
  if (isLocalArenaUid(playerUid)) {
    const p = getLocalProfile(playerUid);
    if (p) {
      const updated: PlayerProfile = {
        ...p,
        trophies: params.newTrophies,
        coins: p.coins + params.coinsEarned,
        wins: p.wins + (params.outcome === 'win' ? 1 : 0),
        losses: p.losses + (params.outcome === 'loss' ? 1 : 0),
        draws: p.draws + (params.outcome === 'draw' ? 1 : 0),
        lossStreak: params.newLossStreak,
      };
      saveLocalProfile(updated);
    }
    const history = localMatchesMemory.get(playerUid) ?? [];
    const nowIso = new Date().toISOString();
    history.unshift({
      id: `match_${Date.now()}`,
      uid: playerUid,
      outcome: params.outcome,
      mode: params.mode,
      format: params.format,
      isFriendly: params.isFriendly,
      opponentName: params.opponentName,
      opponentTurma: params.opponentTurma,
      scoreText: params.scoreText,
      trophyDelta: params.trophyDelta,
      playedAt: nowIso,
      createdAt: nowIso,
    });
    localMatchesMemory.set(playerUid, history.slice(0, 20));
    return;
  }
  const path = `players/${playerUid}`;
  const playerRef = doc(db, 'players', playerUid);
  const historyRef = doc(collection(db, 'players', playerUid, 'history'));
  const seasonMonth = getCurrentSeasonMonthKey();
  const proSeasonTrophies = Math.max(0, params.newTrophies - 10000);
  const playedAt = new Date().toISOString();

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(playerRef);
      if (!snap.exists()) return;
      const current = snap.data() as PlayerProfile;

      tx.update(playerRef, {
        trophies: params.newTrophies,
        coins: current.coins + params.coinsEarned,
        wins: current.wins + (params.outcome === 'win' ? 1 : 0),
        losses: current.losses + (params.outcome === 'loss' ? 1 : 0),
        draws: current.draws + (params.outcome === 'draw' ? 1 : 0),
        lossStreak: params.newLossStreak,
        proSeasonMonth: seasonMonth,
        proSeasonTrophies,
        updatedAt: serverTimestamp(),
      });

      tx.set(historyRef, {
        id: historyRef.id,
        uid: playerUid,
        outcome: params.outcome,
        opponentName: (params.opponentName || 'Adversário').slice(0, 80),
        opponentTurma: (params.opponentTurma || 'ARENA').slice(0, 30),
        mode: params.mode,
        format: params.format,
        isFriendly: params.isFriendly,
        scoreText: (params.scoreText || '0 - 0').slice(0, 20),
        trophyDelta: Math.max(-40, Math.min(80, params.trophyDelta)),
        playedAt,
        createdAt: serverTimestamp(),
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export function subscribeRecentMatchHistory(
  uid: string,
  onData: (entries: MatchHistoryEntry[]) => void
): () => void {
  if (isLocalArenaUid(uid)) {
    onData(localMatchesMemory.get(uid) ?? []);
    return () => {};
  }
  const path = `players/${uid}/history`;
  const q = query(
    collection(db, 'players', uid, 'history'),
    where('uid', '==', uid)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => d.data() as MatchHistoryEntry)
        .sort((a, b) => (b.playedAt || '').localeCompare(a.playedAt || ''))
        .slice(0, 5);
      onData(list);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

export async function claimTrophyMilestone(
  player: PlayerProfile,
  milestone: TrophyMilestone
): Promise<{ coinsAwarded: number; skinUnlocked: string | null }> {
  if (isLocalArenaUid(player.uid)) {
    if (player.trophies < milestone.trophies) {
      throw new Error(
        `Você precisa de ${milestone.trophies} troféus para resgatar este marco.`
      );
    }
    const p = getLocalProfile(player.uid) ?? player;
    const claimed = p.claimedMilestones ?? [];
    if (claimed.includes(milestone.id)) throw new Error('Marco já resgatado.');
    const coinsAwarded = milestone.coins;
    const skinUnlocked = milestone.skinId
      ? getSkinById(milestone.skinId)?.name ?? milestone.skinId
      : null;
    const updated: PlayerProfile = {
      ...p,
      coins: p.coins + coinsAwarded,
      claimedMilestones: [...claimed, milestone.id],
    };
    saveLocalProfile(updated);
    return { coinsAwarded, skinUnlocked };
  }
  const path = `players/${player.uid}`;
  const playerRef = doc(db, 'players', player.uid);

  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(playerRef);
      if (!snap.exists()) {
        throw new Error('Perfil não encontrado.');
      }
      const current = snap.data() as PlayerProfile;
      const claimed = current.claimedMilestones ?? [];

      if (claimed.includes(milestone.id)) {
        throw new Error('Marco já resgatado.');
      }
      if (current.trophies < milestone.trophies) {
        throw new Error(`Você precisa de ${milestone.trophies} troféus para resgatar este marco.`);
      }

      let nextUnlocked = current.unlockedSkins;
      let coinsAwarded = milestone.coins;
      let skinUnlocked: string | null = null;

      if (milestone.skinId) {
        if (!current.unlockedSkins.includes(milestone.skinId)) {
          nextUnlocked = [...current.unlockedSkins, milestone.skinId];
          skinUnlocked = getSkinById(milestone.skinId).name;
        } else {
          // Player already owns the skin: award extra coins within rule limit (+500)
          coinsAwarded = Math.min(500, milestone.coins + 50);
        }
      }

      tx.update(playerRef, {
        coins: current.coins + coinsAwarded,
        unlockedSkins: nextUnlocked,
        claimedMilestones: [...claimed, milestone.id],
        updatedAt: serverTimestamp(),
      });

      return { coinsAwarded, skinUnlocked };
    });
  } catch (error) {
    if (error instanceof Error && (error.message.includes('Marco') || error.message.includes('troféus') || error.message.includes('Perfil'))) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function syncProSeasonIfNeeded(uid: string): Promise<boolean> {
  const path = `players/${uid}`;
  const playerRef = doc(db, 'players', uid);
  const currentMonth = getCurrentSeasonMonthKey();

  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(playerRef);
      if (!snap.exists()) return false;
      const current = snap.data() as PlayerProfile;

      if (
        current.trophies >= 10000 &&
        current.proSeasonMonth &&
        current.proSeasonMonth !== currentMonth
      ) {
        tx.update(playerRef, {
          trophies: 10000,
          proSeasonMonth: currentMonth,
          proSeasonTrophies: 0,
          updatedAt: serverTimestamp(),
        });
        return true;
      }
      return false;
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function toParticipant(player: PlayerProfile): MatchParticipant {
  return {
    uid: player.uid,
    nickname: player.nickname,
    turma: player.turma,
    trophies: player.trophies,
    equippedSkins: player.equippedSkins,
    characterCustomization: resolveCharacterCustomization(
      player.characterCustomization,
      0
    ),
  };
}

export function getChoosingTeam(
  teamA: MatchParticipant[],
  teamB: MatchParticipant[]
): 'A' | 'B' {
  const sumA = teamA.reduce((acc, p) => acc + (p.trophies || 0), 0);
  const sumB = teamB.reduce((acc, p) => acc + (p.trophies || 0), 0);
  return sumA >= sumB ? 'A' : 'B';
}

export async function createMatchRoom(params: {
  player: PlayerProfile;
  mode: MatchMode;
  format: MatchFormat;
  isFriendly: boolean;
  isPublicQueue: boolean;
}): Promise<MatchRoom> {
  if (isLocalArenaUid(params.player.uid)) {
    const roomId = `room_local_${Date.now()}`;
    const teamSize: 1 | 2 | 3 =
      params.mode === '3v3' ? 3 : params.mode === '2v2' ? 2 : 1;
    const room: MatchRoom = {
      id: roomId,
      code: '1234',
      creatorUid: params.player.uid,
      mode: params.mode,
      format: params.format,
      isFriendly: params.isFriendly,
      isPublicQueue: params.isPublicQueue,
      status: 'waiting',
      teamSize,
      teamA: [
        {
          uid: params.player.uid,
          nickname: params.player.nickname,
          turma: params.player.turma,
          trophies: params.player.trophies,
          equippedSkins: params.player.equippedSkins,
          characterCustomization: params.player.characterCustomization,
        },
      ],
      teamB: [],
      participantUids: [params.player.uid],
      currentRound: 1,
      roundPhase: params.mode === '1v1' ? 'picking' : 'pairing',
      roundPairings: [],
      roundStartedAt: Date.now(),
      teamAScore: 0,
      teamBScore: 0,
      roundPicks: {},
      roundHistory: [],
      winnerTeam: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    localRoomsMemory.set(roomId, room);
    return room;
  }
  const matchRef = doc(collection(db, 'matches'));
  const teamSize: 1 | 2 | 3 =
    params.mode === '3v3' ? 3 : params.mode === '2v2' ? 2 : 1;
  const code = generateRoomCode();
  const payload = {
    id: matchRef.id,
    code,
    creatorUid: params.player.uid,
    mode: params.mode,
    format: params.format,
    isFriendly: params.isFriendly,
    isPublicQueue: params.isPublicQueue,
    status: 'waiting' as const,
    teamSize,
    teamA: [toParticipant(params.player)],
    teamB: [],
    participantUids: [params.player.uid],
    currentRound: 1,
    roundPhase: (teamSize === 1 ? 'picking' : 'pairing') as 'pairing' | 'picking',
    roundPairings: [] as string[],
    roundStartedAt: Date.now(),
    teamAScore: 0,
    teamBScore: 0,
    roundPicks: {},
    roundHistory: [],
    winnerTeam: '' as const,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(matchRef, payload);
    return {
      ...payload,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `matches/${matchRef.id}`);
  }
}

export async function joinMatchById(
  matchId: string,
  player: PlayerProfile,
  preferredTeam?: 'A' | 'B'
): Promise<MatchRoom> {
  const matchRef = doc(db, 'matches', matchId);
  try {
    const updated = await runTransaction(db, async (tx) => {
      const snap = await tx.get(matchRef);
      if (!snap.exists()) {
        throw new Error('Sala não encontrada.');
      }
      const room = snap.data() as MatchRoom;
      if (room.participantUids.includes(player.uid)) {
        return room;
      }
      if (room.status !== 'waiting') {
        throw new Error('Esta partida já começou ou foi encerrada.');
      }

      const participant = toParticipant(player);
      const nextTeamA = [...room.teamA];
      const nextTeamB = [...room.teamB];

      if (preferredTeam === 'A' && nextTeamA.length < room.teamSize) {
        nextTeamA.push(participant);
      } else if (preferredTeam === 'B' && nextTeamB.length < room.teamSize) {
        nextTeamB.push(participant);
      } else if (nextTeamB.length < room.teamSize && nextTeamB.length <= nextTeamA.length) {
        nextTeamB.push(participant);
      } else if (nextTeamA.length < room.teamSize) {
        nextTeamA.push(participant);
      } else if (nextTeamB.length < room.teamSize) {
        nextTeamB.push(participant);
      } else {
        throw new Error('Sala lotada.');
      }

      const nextParticipants = [...room.participantUids, player.uid];
      const isFull =
        nextTeamA.length === room.teamSize && nextTeamB.length === room.teamSize;
      const nextStatus = isFull ? 'active' : 'waiting';
      const nowMs = Date.now();
      const nextRoundPhase: 'pairing' | 'picking' =
        room.teamSize === 1 ? 'picking' : 'pairing';
      const nextPairings =
        isFull && room.teamSize === 1
          ? [`${nextTeamA[0].uid}:${nextTeamB[0].uid}`]
          : [];

      tx.update(matchRef, {
        teamA: nextTeamA,
        teamB: nextTeamB,
        participantUids: nextParticipants,
        status: nextStatus,
        roundPhase: nextRoundPhase,
        roundPairings: nextPairings,
        roundStartedAt: isFull ? nowMs : room.roundStartedAt,
        updatedAt: serverTimestamp(),
      });

      return {
        ...room,
        teamA: nextTeamA,
        teamB: nextTeamB,
        participantUids: nextParticipants,
        status: nextStatus,
        roundPhase: nextRoundPhase,
        roundPairings: nextPairings,
        roundStartedAt: isFull ? nowMs : room.roundStartedAt,
      } as MatchRoom;
    });
    return updated;
  } catch (error) {
    if (error instanceof Error && (error.message.includes('Sala') || error.message.includes('partida'))) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `matches/${matchId}`);
  }
}

export async function joinMatchByCode(
  code: string,
  player: PlayerProfile
): Promise<MatchRoom> {
  const cleanCode = code.trim().toUpperCase();
  if (cleanCode.length < 4) {
    throw new Error('Digite um código de sala válido.');
  }
  const path = 'matches';
  try {
    const q = query(
      collection(db, 'matches'),
      where('status', '==', 'waiting'),
      where('code', '==', cleanCode),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      throw new Error('Nenhuma sala aguardando com este código.');
    }
    return await joinMatchById(snap.docs[0].id, player);
  } catch (error) {
    if (error instanceof Error && (error.message.includes('código') || error.message.includes('Sala') || error.message.includes('partida'))) {
      throw error;
    }
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function findOrCreatePublicMatch(params: {
  player: PlayerProfile;
  mode: MatchMode;
  format: MatchFormat;
  isFriendly: boolean;
}): Promise<MatchRoom> {
  const path = 'matches';
  try {
    const q = query(
      collection(db, 'matches'),
      where('status', '==', 'waiting'),
      where('isPublicQueue', '==', true),
      limit(20)
    );
    const snap = await getDocs(q);
    const compatible = snap.docs
      .map((d) => d.data() as MatchRoom)
      .find(
        (r) =>
          r.mode === params.mode &&
          r.format === params.format &&
          r.isFriendly === params.isFriendly &&
          !r.participantUids.includes(params.player.uid) &&
          r.participantUids.length < r.teamSize * 2
      );

    if (compatible) {
      return await joinMatchById(compatible.id, params.player);
    }

    return await createMatchRoom({
      ...params,
      isPublicQueue: true,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export function subscribeWaitingRooms(
  onData: (rooms: MatchRoom[]) => void
): () => void {
  const path = 'matches';
  const q = query(
    collection(db, 'matches'),
    where('status', '==', 'waiting'),
    limit(20)
  );
  return onSnapshot(
    q,
    (snap) => {
      const rooms = snap.docs
        .map((d) => d.data() as MatchRoom)
        .filter((r) => r.isPublicQueue);
      onData(rooms);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

export function subscribeMatchRoom(
  matchId: string,
  onData: (room: MatchRoom | null) => void
): () => void {
  const path = `matches/${matchId}`;
  return onSnapshot(
    doc(db, 'matches', matchId),
    (snap) => {
      onData(snap.exists() ? (snap.data() as MatchRoom) : null);
    },
    (error) => handleFirestoreError(error, OperationType.GET, path)
  );
}

export async function cancelMatchRoom(matchId: string): Promise<void> {
  const path = `matches/${matchId}`;
  try {
    await updateDoc(doc(db, 'matches', matchId), {
      status: 'cancelled',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function chooseRoundPairing(
  matchId: string,
  expectedRound: number,
  chooserUid: string,
  targetOpponentUid: string
): Promise<void> {
  const matchRef = doc(db, 'matches', matchId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(matchRef);
      if (!snap.exists()) return;
      const room = snap.data() as MatchRoom;
      if (
        room.status !== 'active' ||
        room.currentRound !== expectedRound ||
        room.roundPhase !== 'pairing'
      ) {
        return;
      }

      const choosingTeam = getChoosingTeam(room.teamA, room.teamB);
      const isChooserOnTeamA = room.teamA.some((p) => p.uid === chooserUid);
      const isChooserOnTeamB = room.teamB.some((p) => p.uid === chooserUid);
      if (
        (choosingTeam === 'A' && !isChooserOnTeamA) ||
        (choosingTeam === 'B' && !isChooserOnTeamB)
      ) {
        return;
      }

      const uidA = choosingTeam === 'A' ? chooserUid : targetOpponentUid;
      const uidB = choosingTeam === 'A' ? targetOpponentUid : chooserUid;

      const pairedA = new Set(room.roundPairings.map((p) => p.split(':')[0]));
      const pairedB = new Set(room.roundPairings.map((p) => p.split(':')[1]));
      if (pairedA.has(uidA) || pairedB.has(uidB)) return;

      const nextPairings = [...room.roundPairings, `${uidA}:${uidB}`];
      pairedA.add(uidA);
      pairedB.add(uidB);

      // Auto-pair the last remaining pair if only 1 player per team remains
      if (nextPairings.length === room.teamSize - 1) {
        const remA = room.teamA.find((p) => !pairedA.has(p.uid));
        const remB = room.teamB.find((p) => !pairedB.has(p.uid));
        if (remA && remB) {
          nextPairings.push(`${remA.uid}:${remB.uid}`);
        }
      }

      const allPaired = nextPairings.length >= room.teamSize;
      tx.update(matchRef, {
        roundPairings: nextPairings,
        roundPhase: allPaired ? 'picking' : 'pairing',
        roundStartedAt: allPaired ? Date.now() : room.roundStartedAt,
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `matches/${matchId}`);
  }
}

export async function autoCompletePairingOnTimeout(
  matchId: string,
  expectedRound: number
): Promise<void> {
  const matchRef = doc(db, 'matches', matchId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(matchRef);
      if (!snap.exists()) return;
      const room = snap.data() as MatchRoom;
      if (
        room.status !== 'active' ||
        room.currentRound !== expectedRound ||
        room.roundPhase !== 'pairing'
      ) {
        return;
      }
      const pairedA = new Set(room.roundPairings.map((p) => p.split(':')[0]));
      const pairedB = new Set(room.roundPairings.map((p) => p.split(':')[1]));
      const remA = room.teamA.filter((p) => !pairedA.has(p.uid));
      const remB = room.teamB.filter((p) => !pairedB.has(p.uid));
      const nextPairings = [...room.roundPairings];
      for (let i = 0; i < Math.min(remA.length, remB.length); i++) {
        nextPairings.push(`${remA[i].uid}:${remB[i].uid}`);
      }
      tx.update(matchRef, {
        roundPairings: nextPairings,
        roundPhase: 'picking',
        roundStartedAt: Date.now(),
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `matches/${matchId}`);
  }
}

export async function submitRoundPick(
  matchId: string,
  uid: string,
  moveId: MoveId
): Promise<void> {
  const matchRef = doc(db, 'matches', matchId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(matchRef);
      if (!snap.exists()) return;
      const room = snap.data() as MatchRoom;
      if (room.status !== 'active' || room.roundPhase !== 'picking') return;
      if (room.roundPicks[uid]) return;
      tx.update(matchRef, {
        roundPicks: {
          ...room.roundPicks,
          [uid]: moveId,
        },
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `matches/${matchId}`);
  }
}

export async function resolveRoundIfReady(
  matchId: string,
  expectedRound: number,
  forceTimeout = false
): Promise<void> {
  const matchRef = doc(db, 'matches', matchId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(matchRef);
      if (!snap.exists()) return;
      const room = snap.data() as MatchRoom;
      if (
        room.status !== 'active' ||
        room.currentRound !== expectedRound ||
        room.roundPhase !== 'picking'
      ) {
        return;
      }

      const allPicked = room.participantUids.every((uid) => Boolean(room.roundPicks[uid]));
      if (!allPicked && !forceTimeout) return;

      const finalPicks: Record<string, MoveId> = { ...room.roundPicks };
      for (const uid of room.participantUids) {
        if (!finalPicks[uid]) {
          finalPicks[uid] = MOVE_ORDER[Math.floor(Math.random() * MOVE_ORDER.length)];
        }
      }

      const pairings =
        room.roundPairings && room.roundPairings.length === room.teamSize
          ? room.roundPairings
          : room.teamA.map((pA, i) => `${pA.uid}:${room.teamB[i]?.uid ?? ''}`);

      let teamAPoints = 0;
      let teamBPoints = 0;
      const clashes: PairClashResult[] = [];

      for (let i = 0; i < pairings.length; i++) {
        const [uidA, uidB] = pairings[i].split(':');
        const pA = room.teamA.find((p) => p.uid === uidA) ?? room.teamA[i];
        const pB = room.teamB.find((p) => p.uid === uidB) ?? room.teamB[i];
        if (!pA || !pB) continue;
        const moveA = finalPicks[pA.uid];
        const moveB = finalPicks[pB.uid];
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
      let nextAScore = room.teamAScore;
      let nextBScore = room.teamBScore;
      if (teamAPoints > teamBPoints) {
        roundWinner = 'A';
        nextAScore += 1;
      } else if (teamBPoints > teamAPoints) {
        roundWinner = 'B';
        nextBScore += 1;
      }

      const summary: RoundSummary = {
        roundNumber: room.currentRound,
        winnerTeam: roundWinner,
        teamAPoints,
        teamBPoints,
        clashes,
      };

      const targetWins = room.format === 'MD5' ? 3 : 2;
      const matchFinished =
        nextAScore >= targetWins ||
        nextBScore >= targetWins ||
        room.currentRound >= 15;

      let winnerTeam: 'A' | 'B' | 'DRAW' | '' = '';
      if (matchFinished) {
        if (nextAScore > nextBScore) winnerTeam = 'A';
        else if (nextBScore > nextAScore) winnerTeam = 'B';
        else winnerTeam = 'DRAW';
      }

      const nextRoundPhase: 'pairing' | 'picking' =
        room.teamSize === 1 ? 'picking' : 'pairing';
      const nextPairings =
        !matchFinished && room.teamSize === 1
          ? [`${room.teamA[0].uid}:${room.teamB[0].uid}`]
          : [];

      tx.update(matchRef, {
        roundHistory: [...room.roundHistory, summary],
        teamAScore: nextAScore,
        teamBScore: nextBScore,
        currentRound: matchFinished ? room.currentRound : room.currentRound + 1,
        roundPhase: matchFinished ? room.roundPhase : nextRoundPhase,
        roundPairings: matchFinished ? pairings : nextPairings,
        roundPicks: matchFinished ? finalPicks : {},
        roundStartedAt: Date.now(),
        status: matchFinished ? 'finished' : 'active',
        winnerTeam,
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `matches/${matchId}`);
  }
}

// FRIENDS & INVITES

export function buildPairId(uidA: string, uidB: string): string {
  return uidA < uidB ? `${uidA}_${uidB}` : `${uidB}_${uidA}`;
}

export async function sendFriendRequestByNickname(
  currentPlayer: PlayerProfile,
  targetNickname: string
): Promise<void> {
  const lower = normalizeNickname(targetNickname);
  if (!lower) throw new Error('Digite o nickname do jogador.');
  if (lower === currentPlayer.nicknameLower) {
    throw new Error('Você não pode adicionar a si mesmo.');
  }

  let targetUid = '';
  try {
    const nickSnap = await getDoc(doc(db, 'nicknames', lower));
    if (!nickSnap.exists()) {
      throw new Error('Nenhum jogador encontrado com este nickname.');
    }
    targetUid = (nickSnap.data() as { uid: string }).uid;
  } catch (error) {
    if (error instanceof Error && error.message.includes('Nenhum jogador')) throw error;
    handleFirestoreError(error, OperationType.GET, `nicknames/${lower}`);
  }

  const targetSnap = await getDoc(doc(db, 'players', targetUid));
  if (!targetSnap.exists()) {
    throw new Error('Perfil do jogador não encontrado.');
  }
  const targetPlayer = targetSnap.data() as PlayerProfile;

  const pairId = buildPairId(currentPlayer.uid, targetUid);
  const friendRef = doc(db, 'friendships', pairId);

  try {
    const existing = await getDoc(friendRef);
    if (existing.exists()) {
      const f = existing.data() as Friendship;
      if (f.status === 'accepted') {
        throw new Error('Vocês já são amigos!');
      }
      throw new Error('Já existe uma solicitação de amizade pendente.');
    }

    await setDoc(friendRef, {
      id: pairId,
      users: [currentPlayer.uid, targetUid].sort(),
      profiles: {
        [currentPlayer.uid]: {
          nickname: currentPlayer.nickname,
          turma: currentPlayer.turma,
          trophies: currentPlayer.trophies,
        },
        [targetUid]: {
          nickname: targetPlayer.nickname,
          turma: targetPlayer.turma,
          trophies: targetPlayer.trophies,
        },
      },
      requesterUid: currentPlayer.uid,
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    if (error instanceof Error && (error.message.includes('amigos') || error.message.includes('pendente'))) {
      throw error;
    }
    handleFirestoreError(error, OperationType.CREATE, `friendships/${pairId}`);
  }
}

export async function acceptFriendRequest(friendship: Friendship): Promise<void> {
  const path = `friendships/${friendship.id}`;
  try {
    await updateDoc(doc(db, 'friendships', friendship.id), {
      status: 'accepted',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function removeFriendship(pairId: string): Promise<void> {
  const path = `friendships/${pairId}`;
  try {
    await deleteDoc(doc(db, 'friendships', pairId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeFriendships(
  uid: string,
  onData: (items: Friendship[]) => void
): () => void {
  const path = 'friendships';
  const q = query(
    collection(db, 'friendships'),
    where('users', 'array-contains', uid)
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => d.data() as Friendship));
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

export async function sendDuelInvite(params: {
  fromPlayer: PlayerProfile;
  toUid: string;
  match: MatchRoom;
}): Promise<void> {
  const inviteRef = doc(collection(db, 'duel_invites'));
  try {
    await setDoc(inviteRef, {
      id: inviteRef.id,
      fromUid: params.fromPlayer.uid,
      fromNickname: params.fromPlayer.nickname,
      fromTurma: params.fromPlayer.turma,
      toUid: params.toUid,
      matchId: params.match.id,
      matchCode: params.match.code,
      mode: params.match.mode,
      format: params.match.format,
      isFriendly: params.match.isFriendly,
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `duel_invites/${inviteRef.id}`);
  }
}

export async function respondDuelInvite(
  inviteId: string,
  status: 'accepted' | 'declined'
): Promise<void> {
  const path = `duel_invites/${inviteId}`;
  try {
    await updateDoc(doc(db, 'duel_invites', inviteId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export function subscribeIncomingInvites(
  uid: string,
  onData: (invites: DuelInvite[]) => void
): () => void {
  const path = 'duel_invites';
  const q = query(
    collection(db, 'duel_invites'),
    where('toUid', '==', uid)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => d.data() as DuelInvite)
        .filter((i) => i.status === 'pending');
      onData(list);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}
