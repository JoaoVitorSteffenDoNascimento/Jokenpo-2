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
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
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

// ============================================================================
// HYBRID CLOUD + LOCAL ARENA STORAGE & CROSS-TAB BROADCAST ENGINE
// ============================================================================

const LOCAL_AUTH_KEY = 'jokenpo2_local_auth_user_v1';
const LOCAL_PROFILES_KEY = 'jokenpo2_local_profiles_v1';
const LOCAL_HISTORY_PREFIX = 'jokenpo2_local_history_';
const LOCAL_FRIENDS_PREFIX = 'jokenpo2_local_friends_';
const LOCAL_ROOMS_KEY = 'jokenpo2_local_rooms_v1';
const LOCAL_EVENT_NAME = 'jokenpo2-local-state-change';

const arenaChannel =
  typeof window !== 'undefined' && 'BroadcastChannel' in window
    ? new BroadcastChannel('jokenpo2_arena_sync_v1')
    : null;

if (arenaChannel) {
  arenaChannel.onmessage = () => {
    window.dispatchEvent(new CustomEvent(LOCAL_EVENT_NAME));
  };
}

function notifyLocalStateChange(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(LOCAL_EVENT_NAME));
  }
  try {
    arenaChannel?.postMessage({ ts: Date.now() });
  } catch {
    // ignore channel errors
  }
}

export function isLocalArenaUid(uid: string | undefined | null): boolean {
  return Boolean(uid && uid.startsWith('local_arena_'));
}

export function getLocalArenaUser(): User | null {
  try {
    const raw = localStorage.getItem(LOCAL_AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      uid: string;
      displayName: string;
      email: string;
    };
    if (!parsed?.uid) return null;
    return {
      uid: parsed.uid,
      displayName: parsed.displayName || 'Duelista IF',
      email: parsed.email || 'arena@if.edu.br',
      emailVerified: true,
      isAnonymous: true,
      metadata: {},
      providerData: [],
      refreshToken: '',
      tenantId: null,
      delete: async () => {},
      getIdToken: async () => 'local-token',
      getIdTokenResult: async () => ({} as never),
      reload: async () => {},
      toJSON: () => parsed,
      phoneNumber: null,
      photoURL: null,
      providerId: 'local',
    } as unknown as User;
  } catch {
    return null;
  }
}

export function signInWithLocalArena(preferredName?: string): User {
  const existing = getLocalArenaUser();
  if (existing) {
    notifyLocalStateChange();
    return existing;
  }
  let storedUid = '';
  try {
    storedUid = localStorage.getItem('jokenpo2_last_local_uid_v1') || '';
  } catch {
    // ignore
  }
  const uid =
    storedUid ||
    `local_arena_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const payload = {
    uid,
    displayName: preferredName?.trim() || 'Duelista da Arena',
    email: `${uid}@arena.if.edu.br`,
  };
  try {
    localStorage.setItem('jokenpo2_last_local_uid_v1', uid);
    localStorage.setItem(LOCAL_AUTH_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage errors
  }
  notifyLocalStateChange();
  return getLocalArenaUser()!;
}

export function subscribeAuthSession(
  onUserChange: (user: User | null, isLocalMode: boolean) => void
): () => void {
  let firebaseUser: User | null = auth.currentUser;

  const emit = () => {
    if (firebaseUser) {
      onUserChange(firebaseUser, false);
      return;
    }
    const localUser = getLocalArenaUser();
    onUserChange(localUser, Boolean(localUser));
  };

  const unsubFirebase = onAuthStateChanged(
    auth,
    (u) => {
      firebaseUser = u;
      emit();
    },
    () => {
      emit();
    }
  );

  const handleLocalChange = () => emit();
  window.addEventListener(LOCAL_EVENT_NAME, handleLocalChange);
  window.addEventListener('storage', handleLocalChange);

  emit();

  return () => {
    unsubFirebase();
    window.removeEventListener(LOCAL_EVENT_NAME, handleLocalChange);
    window.removeEventListener('storage', handleLocalChange);
  };
}

function readLocalProfilesMap(): Record<string, PlayerProfile> {
  try {
    const raw = localStorage.getItem(LOCAL_PROFILES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, PlayerProfile>)
      : {};
  } catch {
    return {};
  }
}

function writeLocalProfile(profile: PlayerProfile): PlayerProfile {
  try {
    const map = readLocalProfilesMap();
    map[profile.uid] = profile;
    localStorage.setItem(LOCAL_PROFILES_KEY, JSON.stringify(map));
  } catch {
    // ignore storage quota errors
  }
  notifyLocalStateChange();
  return profile;
}

function readLocalProfile(uid: string): PlayerProfile | null {
  const map = readLocalProfilesMap();
  return map[uid] ?? null;
}

function readLocalHistory(uid: string): MatchHistoryEntry[] {
  try {
    const raw = localStorage.getItem(`${LOCAL_HISTORY_PREFIX}${uid}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MatchHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function appendLocalHistory(uid: string, entry: MatchHistoryEntry): void {
  try {
    const current = readLocalHistory(uid);
    const updated = [entry, ...current.filter((e) => e.id !== entry.id)].slice(0, 20);
    localStorage.setItem(`${LOCAL_HISTORY_PREFIX}${uid}`, JSON.stringify(updated));
  } catch {
    // ignore
  }
  notifyLocalStateChange();
}

const SEEDED_IF_LEADERBOARD_PLAYERS: PlayerProfile[] = [
  {
    uid: 'seed_if_pro_1',
    nickname: 'DomJegue_IF',
    nicknameLower: 'domjegue_if',
    turma: 'INF4M',
    trophies: 10840,
    coins: 4200,
    wins: 312,
    losses: 48,
    draws: 15,
    lossStreak: 0,
    lastDailyClaimAt: '',
    unlockedSkins: DEFAULT_UNLOCKED_SKINS,
    equippedSkins: {
      ...DEFAULT_EQUIPPED_SKINS,
      jegue: 'jegue_rei',
      parafal: 'parafal_dourada',
      tesoura: 'tesoura_neon',
    },
    claimedMilestones: [],
    proSeasonMonth: getCurrentSeasonMonthKey(),
    proSeasonTrophies: 840,
  },
  {
    uid: 'seed_if_pro_2',
    nickname: 'Cauan_Parafal',
    nicknameLower: 'cauan_parafal',
    turma: 'ETM3M',
    trophies: 10420,
    coins: 3150,
    wins: 284,
    losses: 61,
    draws: 19,
    lossStreak: 0,
    lastDailyClaimAt: '',
    unlockedSkins: DEFAULT_UNLOCKED_SKINS,
    equippedSkins: {
      ...DEFAULT_EQUIPPED_SKINS,
      parafal: 'parafal_cyber',
      gelo_invertido: 'gelo_invertido_prisma',
    },
    claimedMilestones: [],
    proSeasonMonth: getCurrentSeasonMonthKey(),
    proSeasonTrophies: 420,
  },
  {
    uid: 'seed_if_pro_3',
    nickname: 'JoaoSteffen_IF',
    nicknameLower: 'joaosteffen_if',
    turma: 'INF3M',
    trophies: 10190,
    coins: 2890,
    wins: 265,
    losses: 52,
    draws: 14,
    lossStreak: 0,
    lastDailyClaimAt: '',
    unlockedSkins: DEFAULT_UNLOCKED_SKINS,
    equippedSkins: {
      ...DEFAULT_EQUIPPED_SKINS,
      jegue: 'jegue_cyber',
      pedra: 'pedra_obsidiana',
    },
    claimedMilestones: [],
    proSeasonMonth: getCurrentSeasonMonthKey(),
    proSeasonTrophies: 190,
  },
  {
    uid: 'seed_if_global_1',
    nickname: 'Valtair_Lenda',
    nicknameLower: 'valtair_lenda',
    turma: 'ETM4T',
    trophies: 8650,
    coins: 1900,
    wins: 210,
    losses: 65,
    draws: 12,
    lossStreak: 0,
    lastDailyClaimAt: '',
    unlockedSkins: DEFAULT_UNLOCKED_SKINS,
    equippedSkins: DEFAULT_EQUIPPED_SKINS,
    claimedMilestones: [],
    proSeasonMonth: getCurrentSeasonMonthKey(),
    proSeasonTrophies: 0,
  },
  {
    uid: 'seed_if_cont_1',
    nickname: 'Bia_CryoRuby',
    nicknameLower: 'bia_cryoruby',
    turma: 'INF2M',
    trophies: 7680,
    coins: 1640,
    wins: 185,
    losses: 58,
    draws: 11,
    lossStreak: 0,
    lastDailyClaimAt: '',
    unlockedSkins: DEFAULT_UNLOCKED_SKINS,
    equippedSkins: DEFAULT_EQUIPPED_SKINS,
    claimedMilestones: [],
    proSeasonMonth: getCurrentSeasonMonthKey(),
    proSeasonTrophies: 0,
  },
  {
    uid: 'seed_if_nac_1',
    nickname: 'Lucas_Katana',
    nicknameLower: 'lucas_katana',
    turma: 'INF2T',
    trophies: 6420,
    coins: 1420,
    wins: 156,
    losses: 54,
    draws: 9,
    lossStreak: 0,
    lastDailyClaimAt: '',
    unlockedSkins: DEFAULT_UNLOCKED_SKINS,
    equippedSkins: DEFAULT_EQUIPPED_SKINS,
    claimedMilestones: [],
    proSeasonMonth: getCurrentSeasonMonthKey(),
    proSeasonTrophies: 0,
  },
  {
    uid: 'seed_if_est_1',
    nickname: 'Gabi_Grimorio',
    nicknameLower: 'gabi_grimorio',
    turma: 'ETM2M',
    trophies: 5340,
    coins: 1180,
    wins: 132,
    losses: 49,
    draws: 8,
    lossStreak: 0,
    lastDailyClaimAt: '',
    unlockedSkins: DEFAULT_UNLOCKED_SKINS,
    equippedSkins: DEFAULT_EQUIPPED_SKINS,
    claimedMilestones: [],
    proSeasonMonth: getCurrentSeasonMonthKey(),
    proSeasonTrophies: 0,
  },
  {
    uid: 'seed_if_reg_1',
    nickname: 'Matheus_Meteor',
    nicknameLower: 'matheus_meteor',
    turma: 'INF1M',
    trophies: 4290,
    coins: 980,
    wins: 108,
    losses: 44,
    draws: 7,
    lossStreak: 0,
    lastDailyClaimAt: '',
    unlockedSkins: DEFAULT_UNLOCKED_SKINS,
    equippedSkins: DEFAULT_EQUIPPED_SKINS,
    claimedMilestones: [],
    proSeasonMonth: getCurrentSeasonMonthKey(),
    proSeasonTrophies: 0,
  },
  {
    uid: 'seed_if_mun_1',
    nickname: 'Rafa_Saloon',
    nicknameLower: 'rafa_saloon',
    turma: 'ETM1T',
    trophies: 3250,
    coins: 820,
    wins: 86,
    losses: 39,
    draws: 6,
    lossStreak: 0,
    lastDailyClaimAt: '',
    unlockedSkins: DEFAULT_UNLOCKED_SKINS,
    equippedSkins: DEFAULT_EQUIPPED_SKINS,
    claimedMilestones: [],
    proSeasonMonth: getCurrentSeasonMonthKey(),
    proSeasonTrophies: 0,
  },
  {
    uid: 'seed_if_vet_1',
    nickname: 'Pedro_Veterano',
    nicknameLower: 'pedro_veterano',
    turma: 'INF3T',
    trophies: 2480,
    coins: 640,
    wins: 68,
    losses: 31,
    draws: 5,
    lossStreak: 0,
    lastDailyClaimAt: '',
    unlockedSkins: DEFAULT_UNLOCKED_SKINS,
    equippedSkins: DEFAULT_EQUIPPED_SKINS,
    claimedMilestones: [],
    proSeasonMonth: getCurrentSeasonMonthKey(),
    proSeasonTrophies: 0,
  },
  {
    uid: 'seed_if_ter_1',
    nickname: 'Ana_Tatica',
    nicknameLower: 'ana_tatica',
    turma: 'ETM2T',
    trophies: 1740,
    coins: 520,
    wins: 49,
    losses: 24,
    draws: 4,
    lossStreak: 0,
    lastDailyClaimAt: '',
    unlockedSkins: DEFAULT_UNLOCKED_SKINS,
    equippedSkins: DEFAULT_EQUIPPED_SKINS,
    claimedMilestones: [],
    proSeasonMonth: getCurrentSeasonMonthKey(),
    proSeasonTrophies: 0,
  },
  {
    uid: 'seed_if_seg_1',
    nickname: 'Gui_Calouro',
    nicknameLower: 'gui_calouro',
    turma: 'INF1T',
    trophies: 1120,
    coins: 410,
    wins: 34,
    losses: 19,
    draws: 3,
    lossStreak: 0,
    lastDailyClaimAt: '',
    unlockedSkins: DEFAULT_UNLOCKED_SKINS,
    equippedSkins: DEFAULT_EQUIPPED_SKINS,
    claimedMilestones: [],
    proSeasonMonth: getCurrentSeasonMonthKey(),
    proSeasonTrophies: 0,
  },
  {
    uid: 'seed_if_bixo_1',
    nickname: 'Mari_BixoIF',
    nicknameLower: 'mari_bixoif',
    turma: 'ETM1M',
    trophies: 680,
    coins: 310,
    wins: 21,
    losses: 12,
    draws: 2,
    lossStreak: 0,
    lastDailyClaimAt: '',
    unlockedSkins: DEFAULT_UNLOCKED_SKINS,
    equippedSkins: DEFAULT_EQUIPPED_SKINS,
    claimedMilestones: [],
    proSeasonMonth: getCurrentSeasonMonthKey(),
    proSeasonTrophies: 0,
  },
];

function mergeLeaderboardProfiles(cloudList: PlayerProfile[]): PlayerProfile[] {
  const byUid = new Map<string, PlayerProfile>();
  for (const seed of SEEDED_IF_LEADERBOARD_PLAYERS) {
    byUid.set(seed.uid, seed);
  }
  const localMap = readLocalProfilesMap();
  for (const p of Object.values(localMap)) {
    if (p && p.uid && p.nickname) {
      byUid.set(p.uid, p);
    }
  }
  for (const c of cloudList) {
    if (c && c.uid && c.nickname) {
      byUid.set(c.uid, c);
    }
  }
  return Array.from(byUid.values())
    .sort((a, b) => (b.trophies || 0) - (a.trophies || 0))
    .slice(0, 200);
}

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutUser(): Promise<void> {
  try {
    localStorage.removeItem(LOCAL_AUTH_KEY);
  } catch {
    // ignore
  }
  notifyLocalStateChange();
  try {
    await signOut(auth);
  } catch {
    // ignore if not signed into firebase
  }
}

export function normalizeNickname(nickname: string): string {
  return nickname.trim().toLowerCase();
}

export async function checkNicknameAvailable(nickname: string): Promise<boolean> {
  const lower = normalizeNickname(nickname);
  if (lower.length < 3 || lower.length > 20 || !/^[a-z0-9_.-]+$/.test(lower)) {
    return false;
  }
  const localUser = getLocalArenaUser();
  const localProfiles = Object.values(readLocalProfilesMap());
  const takenLocally = localProfiles.some(
    (p) => p.nicknameLower === lower && p.uid !== localUser?.uid && p.uid !== auth.currentUser?.uid
  );
  if (takenLocally) return false;

  if (!auth.currentUser || isLocalArenaUid(auth.currentUser.uid)) {
    return true;
  }

  try {
    const snap = await getDoc(doc(db, 'nicknames', lower));
    return !snap.exists();
  } catch {
    return true;
  }
}

export async function createPlayerAccount(
  user: User,
  nickname: string,
  turma: Turma
): Promise<PlayerProfile> {
  const trimmed = nickname.trim();
  const lower = normalizeNickname(trimmed);
  if (lower.length < 3 || lower.length > 20 || !/^[a-zA-Z0-9_.-]+$/.test(trimmed)) {
    throw new Error('Nickname deve ter entre 3 e 20 caracteres (letras, números, _, . ou -).');
  }

  const baseProfile: PlayerProfile = {
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
    characterCustomization: DEFAULT_CHARACTER_CUSTOMIZATION,
    claimedMilestones: [],
    proSeasonMonth: getCurrentSeasonMonthKey(),
    proSeasonTrophies: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (isLocalArenaUid(user.uid) || !auth.currentUser) {
    return writeLocalProfile(baseProfile);
  }

  const nickRef = doc(db, 'nicknames', lower);
  const playerRef = doc(db, 'players', user.uid);
  const privateRef = doc(db, 'users_private', user.uid);

  try {
    await runTransaction(db, async (tx) => {
      const nickSnap = await tx.get(nickRef);
      if (nickSnap.exists() && nickSnap.data()?.uid !== user.uid) {
        throw new Error('Este nickname já está em uso. Escolha outro!');
      }
      const playerSnap = await tx.get(playerRef);
      if (playerSnap.exists()) {
        return;
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
    const finalProfile = (created.data() as PlayerProfile) || baseProfile;
    writeLocalProfile(finalProfile);
    return finalProfile;
  } catch (error) {
    if (error instanceof Error && error.message.includes('nickname')) {
      throw error;
    }
    return writeLocalProfile(baseProfile);
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
  const emitLocal = () => {
    const local = readLocalProfile(uid);
    if (!local) {
      onData(null);
      return;
    }
    const custom =
      local.characterCustomization ??
      getLocalCharacterCustomization(uid) ??
      DEFAULT_CHARACTER_CUSTOMIZATION;
    onData({
      ...local,
      characterCustomization: resolveCharacterCustomization(custom, 0),
    });
  };

  const handleLocalEvent = () => {
    if (isLocalArenaUid(uid) || !auth.currentUser) {
      emitLocal();
    }
  };

  window.addEventListener(LOCAL_EVENT_NAME, handleLocalEvent);
  window.addEventListener('storage', handleLocalEvent);

  if (isLocalArenaUid(uid) || !auth.currentUser) {
    emitLocal();
    return () => {
      window.removeEventListener(LOCAL_EVENT_NAME, handleLocalEvent);
      window.removeEventListener('storage', handleLocalEvent);
    };
  }

  const unsubFirestore = onSnapshot(
    doc(db, 'players', uid),
    (snap) => {
      if (!snap.exists()) {
        const fallbackLocal = readLocalProfile(uid);
        if (fallbackLocal) {
          emitLocal();
        } else {
          onData(null);
        }
        return;
      }
      const data = snap.data() as PlayerProfile;
      const custom =
        data.characterCustomization ??
        getLocalCharacterCustomization(uid) ??
        DEFAULT_CHARACTER_CUSTOMIZATION;
      const hydrated: PlayerProfile = {
        ...data,
        characterCustomization: resolveCharacterCustomization(custom, 0),
      };
      writeLocalProfile(hydrated);
      onData(hydrated);
    },
    () => {
      emitLocal();
    }
  );

  return () => {
    unsubFirestore();
    window.removeEventListener(LOCAL_EVENT_NAME, handleLocalEvent);
    window.removeEventListener('storage', handleLocalEvent);
  };
}

export function subscribeLeaderboard(
  onData: (players: PlayerProfile[]) => void
): () => void {
  let latestCloud: PlayerProfile[] = [];

  const emitMerged = () => {
    onData(mergeLeaderboardProfiles(latestCloud));
  };

  const handleLocalEvent = () => emitMerged();
  window.addEventListener(LOCAL_EVENT_NAME, handleLocalEvent);
  window.addEventListener('storage', handleLocalEvent);

  emitMerged();

  if (!auth.currentUser || isLocalArenaUid(auth.currentUser.uid)) {
    return () => {
      window.removeEventListener(LOCAL_EVENT_NAME, handleLocalEvent);
      window.removeEventListener('storage', handleLocalEvent);
    };
  }

  const q = query(
    collection(db, 'players'),
    where('trophies', '>=', 0),
    orderBy('trophies', 'desc'),
    limit(200)
  );
  const unsubFirestore = onSnapshot(
    q,
    (snap) => {
      latestCloud = snap.docs.map((d) => d.data() as PlayerProfile);
      emitMerged();
    },
    () => {
      emitMerged();
    }
  );

  return () => {
    unsubFirestore();
    window.removeEventListener(LOCAL_EVENT_NAME, handleLocalEvent);
    window.removeEventListener('storage', handleLocalEvent);
  };
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
  const nowIso = new Date().toISOString();

  const processLocally = (): DailyLoginRewardResult => {
    const current = readLocalProfile(uid);
    if (!current) {
      return { awarded: false, coinsAwarded: 0, newCoins: 0, claimedAt: '' };
    }
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
    writeLocalProfile({
      ...current,
      coins: nextCoins,
      lastDailyClaimAt: nowIso,
      updatedAt: nowIso,
    });
    return {
      awarded: true,
      coinsAwarded: DAILY_REWARD_COINS,
      newCoins: nextCoins,
      claimedAt: nowIso,
    };
  };

  if (isLocalArenaUid(uid) || !auth.currentUser) {
    return processLocally();
  }

  const playerRef = doc(db, 'players', uid);
  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(playerRef);
      if (!snap.exists()) {
        return processLocally();
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

      writeLocalProfile({
        ...current,
        coins: nextCoins,
        lastDailyClaimAt: nowIso,
      });

      return {
        awarded: true,
        coinsAwarded: DAILY_REWARD_COINS,
        newCoins: nextCoins,
        claimedAt: nowIso,
      };
    });
  } catch {
    return processLocally();
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
  const base = readLocalProfile(player.uid) ?? player;
  const mergedCoins = Math.max(base.coins, player.coins);
  const mergedTrophies = Math.max(base.trophies, player.trophies);
  const unlocked = Array.from(new Set([...base.unlockedSkins, ...player.unlockedSkins]));
  if (unlocked.includes(skin.id)) return;
  if (mergedCoins < skin.cost) {
    throw new Error('Moedinhas insuficientes para comprar esta skin.');
  }

  const nextProfile: PlayerProfile = {
    ...base,
    ...player,
    trophies: mergedTrophies,
    coins: mergedCoins - skin.cost,
    unlockedSkins: [...unlocked, skin.id],
    equippedSkins: {
      ...base.equippedSkins,
      ...player.equippedSkins,
      [skin.moveId]: skin.id,
    },
    updatedAt: new Date().toISOString(),
  };

  writeLocalProfile(nextProfile);

  if (isLocalArenaUid(player.uid) || !auth.currentUser) {
    return;
  }

  try {
    await updateDoc(doc(db, 'players', player.uid), {
      coins: nextProfile.coins,
      unlockedSkins: nextProfile.unlockedSkins,
      equippedSkins: nextProfile.equippedSkins,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // local profile already updated
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

  const nextProfile: PlayerProfile = {
    ...player,
    equippedSkins: {
      ...player.equippedSkins,
      [moveId]: skinId,
    },
    updatedAt: new Date().toISOString(),
  };

  writeLocalProfile(nextProfile);

  if (isLocalArenaUid(player.uid) || !auth.currentUser) {
    return;
  }

  try {
    await updateDoc(doc(db, 'players', player.uid), {
      equippedSkins: nextProfile.equippedSkins,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // local profile already updated
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

  const local = readLocalProfile(uid);
  if (local) {
    writeLocalProfile({
      ...local,
      characterCustomization: clean,
      updatedAt: new Date().toISOString(),
    });
  }

  if (isLocalArenaUid(uid) || !auth.currentUser) {
    return;
  }

  try {
    await updateDoc(doc(db, 'players', uid), {
      characterCustomization: clean,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // local customization already saved
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
  const seasonMonth = getCurrentSeasonMonthKey();
  const proSeasonTrophies = Math.max(0, params.newTrophies - 10000);
  const playedAt = new Date().toISOString();
  const historyEntry: MatchHistoryEntry = {
    id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
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
  };

  const localCurrent = readLocalProfile(playerUid);
  if (localCurrent) {
    writeLocalProfile({
      ...localCurrent,
      trophies: params.newTrophies,
      coins: localCurrent.coins + params.coinsEarned,
      wins: localCurrent.wins + (params.outcome === 'win' ? 1 : 0),
      losses: localCurrent.losses + (params.outcome === 'loss' ? 1 : 0),
      draws: localCurrent.draws + (params.outcome === 'draw' ? 1 : 0),
      lossStreak: params.newLossStreak,
      proSeasonMonth: seasonMonth,
      proSeasonTrophies,
      updatedAt: playedAt,
    });
  }
  appendLocalHistory(playerUid, historyEntry);

  if (isLocalArenaUid(playerUid) || !auth.currentUser) {
    return;
  }

  const playerRef = doc(db, 'players', playerUid);
  const historyRef = doc(collection(db, 'players', playerUid, 'history'));

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
        ...historyEntry,
        id: historyRef.id,
        createdAt: serverTimestamp(),
      });
    });
  } catch {
    // local profile and history already persisted
  }
}

export function subscribeRecentMatchHistory(
  uid: string,
  onData: (entries: MatchHistoryEntry[]) => void
): () => void {
  const emitLocal = () => {
    const list = readLocalHistory(uid)
      .sort((a, b) => (b.playedAt || '').localeCompare(a.playedAt || ''))
      .slice(0, 5);
    onData(list);
  };

  const handleLocalEvent = () => {
    if (isLocalArenaUid(uid) || !auth.currentUser) {
      emitLocal();
    }
  };

  window.addEventListener(LOCAL_EVENT_NAME, handleLocalEvent);
  window.addEventListener('storage', handleLocalEvent);

  if (isLocalArenaUid(uid) || !auth.currentUser) {
    emitLocal();
    return () => {
      window.removeEventListener(LOCAL_EVENT_NAME, handleLocalEvent);
      window.removeEventListener('storage', handleLocalEvent);
    };
  }

  const q = query(
    collection(db, 'players', uid, 'history'),
    where('uid', '==', uid)
  );
  const unsubFirestore = onSnapshot(
    q,
    (snap) => {
      const cloudList = snap.docs
        .map((d) => d.data() as MatchHistoryEntry)
        .sort((a, b) => (b.playedAt || '').localeCompare(a.playedAt || ''))
        .slice(0, 5);
      if (cloudList.length > 0) {
        onData(cloudList);
      } else {
        emitLocal();
      }
    },
    () => {
      emitLocal();
    }
  );

  return () => {
    unsubFirestore();
    window.removeEventListener(LOCAL_EVENT_NAME, handleLocalEvent);
    window.removeEventListener('storage', handleLocalEvent);
  };
}

export async function claimTrophyMilestone(
  player: PlayerProfile,
  milestone: TrophyMilestone
): Promise<{ coinsAwarded: number; skinUnlocked: string | null }> {
  const claimLocally = (): { coinsAwarded: number; skinUnlocked: string | null } => {
    const localStored = readLocalProfile(player.uid);
    const current: PlayerProfile = localStored
      ? {
          ...localStored,
          trophies: Math.max(localStored.trophies, player.trophies),
          coins: Math.max(localStored.coins, player.coins),
        }
      : player;
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
        coinsAwarded = Math.min(500, milestone.coins + 50);
      }
    }

    writeLocalProfile({
      ...current,
      coins: current.coins + coinsAwarded,
      unlockedSkins: nextUnlocked,
      claimedMilestones: [...claimed, milestone.id],
      updatedAt: new Date().toISOString(),
    });

    return { coinsAwarded, skinUnlocked };
  };

  if (isLocalArenaUid(player.uid) || !auth.currentUser) {
    return claimLocally();
  }

  const playerRef = doc(db, 'players', player.uid);

  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(playerRef);
      if (!snap.exists()) {
        return claimLocally();
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
          coinsAwarded = Math.min(500, milestone.coins + 50);
        }
      }

      tx.update(playerRef, {
        coins: current.coins + coinsAwarded,
        unlockedSkins: nextUnlocked,
        claimedMilestones: [...claimed, milestone.id],
        updatedAt: serverTimestamp(),
      });

      writeLocalProfile({
        ...current,
        coins: current.coins + coinsAwarded,
        unlockedSkins: nextUnlocked,
        claimedMilestones: [...claimed, milestone.id],
      });

      return { coinsAwarded, skinUnlocked };
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('Marco') ||
        error.message.includes('troféus') ||
        error.message.includes('Perfil'))
    ) {
      throw error;
    }
    return claimLocally();
  }
}

export async function syncProSeasonIfNeeded(uid: string): Promise<boolean> {
  const currentMonth = getCurrentSeasonMonthKey();

  const syncLocally = (): boolean => {
    const current = readLocalProfile(uid);
    if (!current) return false;
    if (
      current.trophies >= 10000 &&
      current.proSeasonMonth &&
      current.proSeasonMonth !== currentMonth
    ) {
      writeLocalProfile({
        ...current,
        trophies: 10000,
        proSeasonMonth: currentMonth,
        proSeasonTrophies: 0,
        updatedAt: new Date().toISOString(),
      });
      return true;
    }
    return false;
  };

  if (isLocalArenaUid(uid) || !auth.currentUser) {
    return syncLocally();
  }

  const playerRef = doc(db, 'players', uid);

  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(playerRef);
      if (!snap.exists()) return syncLocally();
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
        syncLocally();
        return true;
      }
      return false;
    });
  } catch {
    return syncLocally();
  }
}

// ============================================================================
// ROOMS & MULTIPLAYER MATCHMAKING (FIRESTORE + LOCAL CROSS-TAB FALLBACK)
// ============================================================================

function readLocalRoomsMap(): Record<string, MatchRoom> {
  try {
    const raw = localStorage.getItem(LOCAL_ROOMS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, MatchRoom>)
      : {};
  } catch {
    return {};
  }
}

function writeLocalRoom(room: MatchRoom): MatchRoom {
  try {
    const map = readLocalRoomsMap();
    map[room.id] = room;
    localStorage.setItem(LOCAL_ROOMS_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
  notifyLocalStateChange();
  return room;
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
  const matchRef = doc(collection(db, 'matches'));
  const teamSize: 1 | 2 | 3 =
    params.mode === '3v3' ? 3 : params.mode === '2v2' ? 2 : 1;
  const code = generateRoomCode();
  const baseRoom: MatchRoom = {
    id: matchRef.id,
    code,
    creatorUid: params.player.uid,
    mode: params.mode,
    format: params.format,
    isFriendly: params.isFriendly,
    isPublicQueue: params.isPublicQueue,
    status: 'waiting',
    teamSize,
    teamA: [toParticipant(params.player)],
    teamB: [],
    participantUids: [params.player.uid],
    currentRound: 1,
    roundPhase: teamSize === 1 ? 'picking' : 'pairing',
    roundPairings: [],
    roundStartedAt: Date.now(),
    teamAScore: 0,
    teamBScore: 0,
    roundPicks: {},
    roundHistory: [],
    winnerTeam: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (isLocalArenaUid(params.player.uid) || !auth.currentUser) {
    return writeLocalRoom(baseRoom);
  }

  try {
    await setDoc(matchRef, {
      ...baseRoom,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return writeLocalRoom(baseRoom);
  } catch {
    return writeLocalRoom(baseRoom);
  }
}

function joinRoomLogic(
  room: MatchRoom,
  player: PlayerProfile,
  preferredTeam?: 'A' | 'B'
): MatchRoom {
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

  return {
    ...room,
    teamA: nextTeamA,
    teamB: nextTeamB,
    participantUids: nextParticipants,
    status: nextStatus,
    roundPhase: nextRoundPhase,
    roundPairings: nextPairings,
    roundStartedAt: isFull ? nowMs : room.roundStartedAt,
    updatedAt: new Date().toISOString(),
  };
}

export async function joinMatchById(
  matchId: string,
  player: PlayerProfile,
  preferredTeam?: 'A' | 'B'
): Promise<MatchRoom> {
  const localRooms = readLocalRoomsMap();
  if ((isLocalArenaUid(player.uid) || !auth.currentUser) && localRooms[matchId]) {
    const updated = joinRoomLogic(localRooms[matchId], player, preferredTeam);
    return writeLocalRoom(updated);
  }

  const matchRef = doc(db, 'matches', matchId);
  try {
    const updated = await runTransaction(db, async (tx) => {
      const snap = await tx.get(matchRef);
      if (!snap.exists()) {
        if (localRooms[matchId]) {
          return joinRoomLogic(localRooms[matchId], player, preferredTeam);
        }
        throw new Error('Sala não encontrada.');
      }
      const room = snap.data() as MatchRoom;
      const nextRoom = joinRoomLogic(room, player, preferredTeam);

      tx.update(matchRef, {
        teamA: nextRoom.teamA,
        teamB: nextRoom.teamB,
        participantUids: nextRoom.participantUids,
        status: nextRoom.status,
        roundPhase: nextRoom.roundPhase,
        roundPairings: nextRoom.roundPairings,
        roundStartedAt: nextRoom.roundStartedAt,
        updatedAt: serverTimestamp(),
      });

      return nextRoom;
    });
    return writeLocalRoom(updated);
  } catch (error) {
    if (localRooms[matchId]) {
      const updated = joinRoomLogic(localRooms[matchId], player, preferredTeam);
      return writeLocalRoom(updated);
    }
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

  const localRooms = Object.values(readLocalRoomsMap());
  const localMatch = localRooms.find(
    (r) => r.status === 'waiting' && r.code.toUpperCase() === cleanCode
  );
  if (localMatch && (isLocalArenaUid(player.uid) || !auth.currentUser)) {
    return await joinMatchById(localMatch.id, player);
  }

  try {
    const q = query(
      collection(db, 'matches'),
      where('status', '==', 'waiting'),
      where('code', '==', cleanCode),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      if (localMatch) {
        return await joinMatchById(localMatch.id, player);
      }
      throw new Error('Nenhuma sala aguardando com este código.');
    }
    return await joinMatchById(snap.docs[0].id, player);
  } catch (error) {
    if (localMatch) {
      return await joinMatchById(localMatch.id, player);
    }
    if (
      error instanceof Error &&
      (error.message.includes('código') ||
        error.message.includes('Sala') ||
        error.message.includes('partida'))
    ) {
      throw error;
    }
    throw new Error('Nenhuma sala aguardando com este código.');
  }
}

export async function findOrCreatePublicMatch(params: {
  player: PlayerProfile;
  mode: MatchMode;
  format: MatchFormat;
  isFriendly: boolean;
}): Promise<MatchRoom> {
  const findCompatible = (rooms: MatchRoom[]) =>
    rooms.find(
      (r) =>
        r.status === 'waiting' &&
        r.isPublicQueue &&
        r.mode === params.mode &&
        r.format === params.format &&
        r.isFriendly === params.isFriendly &&
        !r.participantUids.includes(params.player.uid) &&
        r.participantUids.length < r.teamSize * 2
    );

  if (isLocalArenaUid(params.player.uid) || !auth.currentUser) {
    const localCompatible = findCompatible(Object.values(readLocalRoomsMap()));
    if (localCompatible) {
      return await joinMatchById(localCompatible.id, params.player);
    }
    return await createMatchRoom({
      ...params,
      isPublicQueue: true,
    });
  }

  try {
    const q = query(
      collection(db, 'matches'),
      where('status', '==', 'waiting'),
      where('isPublicQueue', '==', true),
      limit(20)
    );
    const snap = await getDocs(q);
    const compatible = findCompatible(snap.docs.map((d) => d.data() as MatchRoom));

    if (compatible) {
      return await joinMatchById(compatible.id, params.player);
    }

    return await createMatchRoom({
      ...params,
      isPublicQueue: true,
    });
  } catch {
    return await createMatchRoom({
      ...params,
      isPublicQueue: true,
    });
  }
}

export function subscribeWaitingRooms(
  onData: (rooms: MatchRoom[]) => void
): () => void {
  let cloudRooms: MatchRoom[] = [];

  const emitMerged = () => {
    const byId = new Map<string, MatchRoom>();
    for (const r of Object.values(readLocalRoomsMap())) {
      if (r.status === 'waiting' && r.isPublicQueue) {
        byId.set(r.id, r);
      }
    }
    for (const r of cloudRooms) {
      if (r.status === 'waiting' && r.isPublicQueue) {
        byId.set(r.id, r);
      }
    }
    onData(Array.from(byId.values()));
  };

  const handleLocal = () => emitMerged();
  window.addEventListener(LOCAL_EVENT_NAME, handleLocal);
  window.addEventListener('storage', handleLocal);

  emitMerged();

  if (!auth.currentUser || isLocalArenaUid(auth.currentUser.uid)) {
    return () => {
      window.removeEventListener(LOCAL_EVENT_NAME, handleLocal);
      window.removeEventListener('storage', handleLocal);
    };
  }

  const q = query(
    collection(db, 'matches'),
    where('status', '==', 'waiting'),
    limit(20)
  );
  const unsubFirestore = onSnapshot(
    q,
    (snap) => {
      cloudRooms = snap.docs
        .map((d) => d.data() as MatchRoom)
        .filter((r) => r.isPublicQueue);
      emitMerged();
    },
    () => {
      emitMerged();
    }
  );

  return () => {
    unsubFirestore();
    window.removeEventListener(LOCAL_EVENT_NAME, handleLocal);
    window.removeEventListener('storage', handleLocal);
  };
}

export function subscribeMatchRoom(
  matchId: string,
  onData: (room: MatchRoom | null) => void
): () => void {
  const emitLocal = () => {
    const map = readLocalRoomsMap();
    onData(map[matchId] ?? null);
  };

  const handleLocal = () => {
    if (!auth.currentUser || isLocalArenaUid(auth.currentUser.uid)) {
      emitLocal();
    }
  };

  window.addEventListener(LOCAL_EVENT_NAME, handleLocal);
  window.addEventListener('storage', handleLocal);

  if (!auth.currentUser || isLocalArenaUid(auth.currentUser.uid)) {
    emitLocal();
    return () => {
      window.removeEventListener(LOCAL_EVENT_NAME, handleLocal);
      window.removeEventListener('storage', handleLocal);
    };
  }

  const unsubFirestore = onSnapshot(
    doc(db, 'matches', matchId),
    (snap) => {
      if (snap.exists()) {
        const room = snap.data() as MatchRoom;
        writeLocalRoom(room);
        onData(room);
      } else {
        emitLocal();
      }
    },
    () => {
      emitLocal();
    }
  );

  return () => {
    unsubFirestore();
    window.removeEventListener(LOCAL_EVENT_NAME, handleLocal);
    window.removeEventListener('storage', handleLocal);
  };
}

export async function cancelMatchRoom(matchId: string): Promise<void> {
  const map = readLocalRoomsMap();
  if (map[matchId]) {
    writeLocalRoom({
      ...map[matchId],
      status: 'cancelled',
      updatedAt: new Date().toISOString(),
    });
  }
  if (!auth.currentUser || isLocalArenaUid(auth.currentUser.uid)) return;

  try {
    await updateDoc(doc(db, 'matches', matchId), {
      status: 'cancelled',
      updatedAt: serverTimestamp(),
    });
  } catch {
    // local room already cancelled
  }
}

export async function chooseRoundPairing(
  matchId: string,
  expectedRound: number,
  chooserUid: string,
  targetOpponentUid: string
): Promise<void> {
  const applyPairing = (room: MatchRoom): MatchRoom | null => {
    if (
      room.status !== 'active' ||
      room.currentRound !== expectedRound ||
      room.roundPhase !== 'pairing'
    ) {
      return null;
    }

    const choosingTeam = getChoosingTeam(room.teamA, room.teamB);
    const isChooserOnTeamA = room.teamA.some((p) => p.uid === chooserUid);
    const isChooserOnTeamB = room.teamB.some((p) => p.uid === chooserUid);
    if (
      (choosingTeam === 'A' && !isChooserOnTeamA) ||
      (choosingTeam === 'B' && !isChooserOnTeamB)
    ) {
      return null;
    }

    const uidA = choosingTeam === 'A' ? chooserUid : targetOpponentUid;
    const uidB = choosingTeam === 'A' ? targetOpponentUid : chooserUid;

    const pairedA = new Set(room.roundPairings.map((p) => p.split(':')[0]));
    const pairedB = new Set(room.roundPairings.map((p) => p.split(':')[1]));
    if (pairedA.has(uidA) || pairedB.has(uidB)) return null;

    const nextPairings = [...room.roundPairings, `${uidA}:${uidB}`];
    pairedA.add(uidA);
    pairedB.add(uidB);

    if (nextPairings.length === room.teamSize - 1) {
      const remA = room.teamA.find((p) => !pairedA.has(p.uid));
      const remB = room.teamB.find((p) => !pairedB.has(p.uid));
      if (remA && remB) {
        nextPairings.push(`${remA.uid}:${remB.uid}`);
      }
    }

    const allPaired = nextPairings.length >= room.teamSize;
    return {
      ...room,
      roundPairings: nextPairings,
      roundPhase: allPaired ? 'picking' : 'pairing',
      roundStartedAt: allPaired ? Date.now() : room.roundStartedAt,
      updatedAt: new Date().toISOString(),
    };
  };

  const localMap = readLocalRoomsMap();
  if (localMap[matchId]) {
    const next = applyPairing(localMap[matchId]);
    if (next) writeLocalRoom(next);
  }

  if (!auth.currentUser || isLocalArenaUid(auth.currentUser.uid)) return;

  const matchRef = doc(db, 'matches', matchId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(matchRef);
      if (!snap.exists()) return;
      const room = snap.data() as MatchRoom;
      const next = applyPairing(room);
      if (!next) return;

      tx.update(matchRef, {
        roundPairings: next.roundPairings,
        roundPhase: next.roundPhase,
        roundStartedAt: next.roundStartedAt,
        updatedAt: serverTimestamp(),
      });
    });
  } catch {
    // local room already updated
  }
}

export async function autoCompletePairingOnTimeout(
  matchId: string,
  expectedRound: number
): Promise<void> {
  const applyAutoPair = (room: MatchRoom): MatchRoom | null => {
    if (
      room.status !== 'active' ||
      room.currentRound !== expectedRound ||
      room.roundPhase !== 'pairing'
    ) {
      return null;
    }
    const pairedA = new Set(room.roundPairings.map((p) => p.split(':')[0]));
    const pairedB = new Set(room.roundPairings.map((p) => p.split(':')[1]));
    const remA = room.teamA.filter((p) => !pairedA.has(p.uid));
    const remB = room.teamB.filter((p) => !pairedB.has(p.uid));
    const nextPairings = [...room.roundPairings];
    for (let i = 0; i < Math.min(remA.length, remB.length); i++) {
      nextPairings.push(`${remA[i].uid}:${remB[i].uid}`);
    }
    return {
      ...room,
      roundPairings: nextPairings,
      roundPhase: 'picking',
      roundStartedAt: Date.now(),
      updatedAt: new Date().toISOString(),
    };
  };

  const localMap = readLocalRoomsMap();
  if (localMap[matchId]) {
    const next = applyAutoPair(localMap[matchId]);
    if (next) writeLocalRoom(next);
  }

  if (!auth.currentUser || isLocalArenaUid(auth.currentUser.uid)) return;

  const matchRef = doc(db, 'matches', matchId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(matchRef);
      if (!snap.exists()) return;
      const room = snap.data() as MatchRoom;
      const next = applyAutoPair(room);
      if (!next) return;
      tx.update(matchRef, {
        roundPairings: next.roundPairings,
        roundPhase: 'picking',
        roundStartedAt: next.roundStartedAt,
        updatedAt: serverTimestamp(),
      });
    });
  } catch {
    // local room already updated
  }
}

export async function submitRoundPick(
  matchId: string,
  uid: string,
  moveId: MoveId
): Promise<void> {
  const localMap = readLocalRoomsMap();
  if (localMap[matchId]) {
    const room = localMap[matchId];
    if (room.status === 'active' && room.roundPhase === 'picking' && !room.roundPicks[uid]) {
      writeLocalRoom({
        ...room,
        roundPicks: {
          ...room.roundPicks,
          [uid]: moveId,
        },
        updatedAt: new Date().toISOString(),
      });
    }
  }

  if (!auth.currentUser || isLocalArenaUid(auth.currentUser.uid)) return;

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
  } catch {
    // local room already updated
  }
}

export async function resolveRoundIfReady(
  matchId: string,
  expectedRound: number,
  forceTimeout = false
): Promise<void> {
  const computeNextRoundState = (room: MatchRoom): MatchRoom | null => {
    if (
      room.status !== 'active' ||
      room.currentRound !== expectedRound ||
      room.roundPhase !== 'picking'
    ) {
      return null;
    }

    const allPicked = room.participantUids.every((uid) => Boolean(room.roundPicks[uid]));
    if (!allPicked && !forceTimeout) return null;

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

    return {
      ...room,
      roundHistory: [...room.roundHistory, summary],
      teamAScore: nextAScore,
      teamBScore: nextBScore,
      currentRound: matchFinished ? room.currentRound : room.currentRound + 1,
      roundPhase: matchFinished ? room.roundPhase : nextRoundPhase,
      roundPairings: matchFinished ? pairings : nextPairings,
      roundPicks: matchFinished ? finalPicks : {},
      roundStartedAt: matchFinished ? Date.now() : Date.now() + 2900,
      status: matchFinished ? 'finished' : 'active',
      winnerTeam,
      updatedAt: new Date().toISOString(),
    };
  };

  const localMap = readLocalRoomsMap();
  if (localMap[matchId]) {
    const next = computeNextRoundState(localMap[matchId]);
    if (next) writeLocalRoom(next);
  }

  if (!auth.currentUser || isLocalArenaUid(auth.currentUser.uid)) return;

  const matchRef = doc(db, 'matches', matchId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(matchRef);
      if (!snap.exists()) return;
      const room = snap.data() as MatchRoom;
      const next = computeNextRoundState(room);
      if (!next) return;

      tx.update(matchRef, {
        roundHistory: next.roundHistory,
        teamAScore: next.teamAScore,
        teamBScore: next.teamBScore,
        currentRound: next.currentRound,
        roundPhase: next.roundPhase,
        roundPairings: next.roundPairings,
        roundPicks: next.roundPicks,
        roundStartedAt: next.roundStartedAt,
        status: next.status,
        winnerTeam: next.winnerTeam,
        updatedAt: serverTimestamp(),
      });
    });
  } catch {
    // local room already resolved
  }
}

// ============================================================================
// FRIENDS & INVITES (FIRESTORE + LOCAL ARENA PEER SUPPORT)
// ============================================================================

export function buildPairId(uidA: string, uidB: string): string {
  return uidA < uidB ? `${uidA}_${uidB}` : `${uidB}_${uidA}`;
}

function readLocalFriendships(uid: string): Friendship[] {
  try {
    const raw = localStorage.getItem(`${LOCAL_FRIENDS_PREFIX}${uid}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Friendship[]) : [];
  } catch {
    return [];
  }
}

function writeLocalFriendships(uid: string, list: Friendship[]): void {
  try {
    localStorage.setItem(`${LOCAL_FRIENDS_PREFIX}${uid}`, JSON.stringify(list));
  } catch {
    // ignore
  }
  notifyLocalStateChange();
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

  const allLocalCandidates = [
    ...SEEDED_IF_LEADERBOARD_PLAYERS,
    ...Object.values(readLocalProfilesMap()),
  ];
  const matchedLocalPeer = allLocalCandidates.find(
    (p) => p.nicknameLower === lower && p.uid !== currentPlayer.uid
  );

  if (isLocalArenaUid(currentPlayer.uid) || !auth.currentUser || matchedLocalPeer?.uid.startsWith('seed_if_')) {
    const targetPlayer: PlayerProfile = matchedLocalPeer ?? {
      uid: `peer_${lower}`,
      nickname: targetNickname.trim(),
      nicknameLower: lower,
      turma: 'INF2M',
      trophies: 1200,
      coins: 300,
      wins: 25,
      losses: 12,
      draws: 3,
      lossStreak: 0,
      lastDailyClaimAt: '',
      unlockedSkins: DEFAULT_UNLOCKED_SKINS,
      equippedSkins: DEFAULT_EQUIPPED_SKINS,
    };
    const pairId = buildPairId(currentPlayer.uid, targetPlayer.uid);
    const existingList = readLocalFriendships(currentPlayer.uid);
    if (existingList.some((f) => f.id === pairId)) {
      throw new Error('Vocês já são amigos na Arena!');
    }
    const newFriendship: Friendship = {
      id: pairId,
      users: [currentPlayer.uid, targetPlayer.uid].sort(),
      profiles: {
        [currentPlayer.uid]: {
          nickname: currentPlayer.nickname,
          turma: currentPlayer.turma,
          trophies: currentPlayer.trophies,
        },
        [targetPlayer.uid]: {
          nickname: targetPlayer.nickname,
          turma: targetPlayer.turma,
          trophies: targetPlayer.trophies,
        },
      },
      requesterUid: currentPlayer.uid,
      status: 'accepted',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    writeLocalFriendships(currentPlayer.uid, [newFriendship, ...existingList]);
    return;
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
  for (const uid of friendship.users) {
    const list = readLocalFriendships(uid);
    if (list.some((f) => f.id === friendship.id)) {
      writeLocalFriendships(
        uid,
        list.map((f) => (f.id === friendship.id ? { ...f, status: 'accepted' } : f))
      );
    }
  }
  if (!auth.currentUser || isLocalArenaUid(auth.currentUser.uid)) return;

  try {
    await updateDoc(doc(db, 'friendships', friendship.id), {
      status: 'accepted',
      updatedAt: serverTimestamp(),
    });
  } catch {
    // local state already updated
  }
}

export async function removeFriendship(pairId: string): Promise<void> {
  const localUser = getLocalArenaUser() ?? auth.currentUser;
  if (localUser) {
    const list = readLocalFriendships(localUser.uid);
    if (list.some((f) => f.id === pairId)) {
      writeLocalFriendships(
        localUser.uid,
        list.filter((f) => f.id !== pairId)
      );
    }
  }
  if (!auth.currentUser || isLocalArenaUid(auth.currentUser.uid)) return;

  try {
    await deleteDoc(doc(db, 'friendships', pairId));
  } catch {
    // local state already updated
  }
}

export function subscribeFriendships(
  uid: string,
  onData: (items: Friendship[]) => void
): () => void {
  let cloudList: Friendship[] = [];

  const emitMerged = () => {
    const byId = new Map<string, Friendship>();
    for (const f of readLocalFriendships(uid)) {
      byId.set(f.id, f);
    }
    for (const f of cloudList) {
      byId.set(f.id, f);
    }
    onData(Array.from(byId.values()));
  };

  const handleLocal = () => emitMerged();
  window.addEventListener(LOCAL_EVENT_NAME, handleLocal);
  window.addEventListener('storage', handleLocal);

  emitMerged();

  if (isLocalArenaUid(uid) || !auth.currentUser) {
    return () => {
      window.removeEventListener(LOCAL_EVENT_NAME, handleLocal);
      window.removeEventListener('storage', handleLocal);
    };
  }

  const q = query(
    collection(db, 'friendships'),
    where('users', 'array-contains', uid)
  );
  const unsubFirestore = onSnapshot(
    q,
    (snap) => {
      cloudList = snap.docs.map((d) => d.data() as Friendship);
      emitMerged();
    },
    () => {
      emitMerged();
    }
  );

  return () => {
    unsubFirestore();
    window.removeEventListener(LOCAL_EVENT_NAME, handleLocal);
    window.removeEventListener('storage', handleLocal);
  };
}

export async function sendDuelInvite(params: {
  fromPlayer: PlayerProfile;
  toUid: string;
  match: MatchRoom;
}): Promise<void> {
  if (
    isLocalArenaUid(params.fromPlayer.uid) ||
    !auth.currentUser ||
    params.toUid.startsWith('seed_if_') ||
    params.toUid.startsWith('peer_')
  ) {
    return;
  }

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
  } catch {
    // ignore if offline
  }
}

export async function respondDuelInvite(
  inviteId: string,
  status: 'accepted' | 'declined'
): Promise<void> {
  if (!auth.currentUser || isLocalArenaUid(auth.currentUser.uid)) return;
  try {
    await updateDoc(doc(db, 'duel_invites', inviteId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // ignore
  }
}

export function subscribeIncomingInvites(
  uid: string,
  onData: (invites: DuelInvite[]) => void
): () => void {
  if (isLocalArenaUid(uid) || !auth.currentUser) {
    onData([]);
    return () => {};
  }

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
    () => {
      onData([]);
    }
  );
}
