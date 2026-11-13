export const TURMAS = [
  'INF1M', 'INF2M', 'INF3M', 'INF4M',
  'INF1T', 'INF2T', 'INF3T', 'INF4T',
  'ETM1M', 'ETM2M', 'ETM3M', 'ETM4M',
  'ETM1T', 'ETM2T', 'ETM3T', 'ETM4T',
] as const;

export type Turma = (typeof TURMAS)[number];

export type MoveId =
  | 'papel'
  | 'parafal'
  | 'pedra'
  | 'gelo_invertido'
  | 'tesoura'
  | 'jegue';

export type MatchMode = '1v1' | '2v2' | '3v3';
export type MatchFormat = 'MD3' | 'MD5';

export interface EloTier {
  id: string;
  name: string;
  minTrophies: number;
  maxTrophies: number | null;
  accentHex: string;
  badgeTextClass: string;
  borderClass: string;
}

export interface SkinMaterial3D {
  metalness: number;
  roughness: number;
  clearcoat?: number;
  emissiveHex?: string;
  emissiveIntensity?: number;
  cardTintHex: string;
  finishLabel: string;
}

export interface SkinDefinition {
  id: string;
  moveId: MoveId;
  name: string;
  rarity: 'Padrão' | 'Rara' | 'Épica' | 'Lendária';
  cost: number;
  description: string;
  frameClass: string;
  imageFilterClass: string;
  accentColor: string;
  customImage?: string;
  material3d?: SkinMaterial3D;
}

export type EquippedSkinsMap = Record<MoveId, string>;

export type CharacterArchetypeId =
  | 'minotauro_chef'
  | 'mecha_camaleao'
  | 'raposa_dama'
  | 'dom_jegue'
  | 'lobo_cyber'
  | 'urso_pardo';

export type CharacterHatId =
  | 'none'
  | 'fedora_saloon'
  | 'coroa_imperial'
  | 'cartola_magnata'
  | 'halo_cyber'
  | 'capacete_tatico'
  | 'chapeu_cauboi';

export type CharacterEyewearId =
  | 'none'
  | 'visor_mecha'
  | 'monoculo_ouro'
  | 'oculos_escuros'
  | 'tapa_olho'
  | 'olhos_chama';

export type CharacterOutfitId =
  | 'couro_saloon'
  | 'gala_imperial'
  | 'cyber_neon'
  | 'esmeralda_etm'
  | 'obsidiana_noite'
  | 'platina_pro';

export type CharacterPropId =
  | 'none'
  | 'charuto_chefe'
  | 'rosa_dourada'
  | 'mascara_oni'
  | 'bigode_barao';

export type CharacterGunSkinId =
  | 'aco_azulado'
  | 'ouro_imperial'
  | 'carmesim_furia'
  | 'cyber_plasma';

export type ArenaTableThemeId =
  | 'saloon_mogno'
  | 'cyber_neon'
  | 'obsidiana_imperial'
  | 'esmeralda_etm'
  | 'saloon_rustico'
  | 'cyber_neon_vip'
  | 'ouro_cassino'
  | 'templo_cosmico';

export type CardAuraId =
  | 'chama_real'
  | 'plasma_ciano'
  | 'relampago_ouro'
  | 'sombra_arcana'
  | 'chamas_carmesim'
  | 'relampago_eletrico'
  | 'void_cosmico'
  | 'glitch_cyberpunk';

export type VictoryEmoteId =
  | 'saudacao_real'
  | 'giro_revolver'
  | 'rugido_chefe'
  | 'holograma_gg'
  | 'palmas_taticas'
  | 'fogo_intenso'
  | 'caveira_fatal'
  | 'blefe_absoluto'
  | 'oculos_mito'
  | 'espanto_total';

export interface CharacterCustomization {
  archetypeId: CharacterArchetypeId;
  hatId: CharacterHatId;
  eyewearId: CharacterEyewearId;
  outfitId: CharacterOutfitId;
  propId: CharacterPropId;
  gunSkinId: CharacterGunSkinId;
  tableThemeId?: ArenaTableThemeId;
  cardAuraId?: CardAuraId;
  victoryEmoteId?: VictoryEmoteId;
}

export interface PlayerProfile {
  uid: string;
  nickname: string;
  nicknameLower: string;
  turma: Turma;
  trophies: number;
  coins: number;
  wins: number;
  losses: number;
  draws: number;
  lossStreak: number;
  lastDailyClaimAt: string;
  unlockedSkins: string[];
  equippedSkins: EquippedSkinsMap;
  characterCustomization?: CharacterCustomization;
  claimedMilestones?: string[];
  proSeasonMonth?: string;
  proSeasonTrophies?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface MatchParticipant {
  uid: string;
  nickname: string;
  turma: Turma;
  trophies: number;
  equippedSkins: EquippedSkinsMap;
  characterCustomization?: CharacterCustomization;
  isBot?: boolean;
}

export interface PairClashResult {
  slotIndex: number;
  playerAName: string;
  playerBName: string;
  moveA: MoveId;
  moveB: MoveId;
  skinA: string;
  skinB: string;
  outcomeForA: 'win' | 'loss' | 'draw';
  reason: string;
}

export interface RoundSummary {
  roundNumber: number;
  winnerTeam: 'A' | 'B' | 'DRAW';
  teamAPoints: number;
  teamBPoints: number;
  clashes: PairClashResult[];
}

export interface MatchRoom {
  id: string;
  code: string;
  creatorUid: string;
  mode: MatchMode;
  format: MatchFormat;
  isFriendly: boolean;
  isPublicQueue: boolean;
  status: 'waiting' | 'active' | 'finished' | 'cancelled';
  teamSize: 1 | 2 | 3;
  teamA: MatchParticipant[];
  teamB: MatchParticipant[];
  participantUids: string[];
  currentRound: number;
  roundPhase: 'pairing' | 'picking';
  roundPairings: string[];
  roundStartedAt: number;
  teamAScore: number;
  teamBScore: number;
  roundPicks: Record<string, MoveId>;
  roundHistory: RoundSummary[];
  winnerTeam: 'A' | 'B' | 'DRAW' | '';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Friendship {
  id: string;
  users: string[];
  profiles: Record<string, { nickname: string; turma: Turma; trophies: number }>;
  requesterUid: string;
  status: 'pending' | 'accepted';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface DuelInvite {
  id: string;
  fromUid: string;
  fromNickname: string;
  fromTurma: Turma;
  toUid: string;
  matchId: string;
  matchCode: string;
  mode: MatchMode;
  format: MatchFormat;
  isFriendly: boolean;
  status: 'pending' | 'accepted' | 'declined';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface TrophyProgressFeedback {
  previousTrophies: number;
  newTrophies: number;
  delta: number;
  streakRecoveryTriggered: boolean;
  promotedTo: string | null;
  timestamp: number;
}

export interface MatchHistoryEntry {
  id: string;
  uid: string;
  outcome: 'win' | 'loss' | 'draw';
  opponentName: string;
  opponentTurma: string;
  mode: MatchMode;
  format: MatchFormat;
  isFriendly: boolean;
  scoreText: string;
  trophyDelta: number;
  playedAt: string;
  createdAt?: unknown;
}

export interface TrophyMilestone {
  id: string;
  trophies: number;
  eloName: string;
  coins: number;
  skinId?: string;
}
