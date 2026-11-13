import type { PlayerProfile, Turma } from '../../../src/types/game';

// ============================================================================
// PERFIS DE JOGADOR REPRESENTATIVOS PARA TESTES E2E
// ============================================================================

export const mockNovatoZero: PlayerProfile = {
  uid: 'local_arena_test_novato_0',
  nickname: 'NovatoZero',
  turma: 'INF1M',
  trophies: 0,
  coins: 150,
  lossStreak: 0,
  unlockedSkins: [],
  claimedMilestones: [],
  equippedSkins: {},
  characterCustomization: { archetypeId: 'dom_jegue' },
  createdAt: Date.now(),
  lastLoginDate: '2026-11-12',
};

export const mockNovato5: PlayerProfile = {
  ...mockNovatoZero,
  uid: 'local_arena_test_novato_5',
  nickname: 'Novato5Trophies',
  trophies: 5,
};

export const mockNovato15: PlayerProfile = {
  ...mockNovatoZero,
  uid: 'local_arena_test_novato_15',
  nickname: 'Novato15Trophies',
  trophies: 15,
};

export const mockNovato20: PlayerProfile = {
  ...mockNovatoZero,
  uid: 'local_arena_test_novato_20',
  nickname: 'Novato20Trophies',
  trophies: 20,
};

export const mockNovato21: PlayerProfile = {
  ...mockNovatoZero,
  uid: 'local_arena_test_novato_21',
  nickname: 'Novato21Trophies',
  trophies: 21,
};

export const mockNovatoTiltCandidate: PlayerProfile = {
  ...mockNovatoZero,
  uid: 'local_arena_test_tilt_candidate',
  nickname: 'TiltRiskPlayer',
  trophies: 35,
  coins: 100,
  lossStreak: 2,
};

export const mockBixo: PlayerProfile = {
  uid: 'local_arena_test_bixo',
  nickname: 'BixoCompetitivo',
  turma: 'INF2M',
  trophies: 500,
  coins: 200,
  lossStreak: 0,
  unlockedSkins: [],
  claimedMilestones: [],
  equippedSkins: {},
  characterCustomization: { archetypeId: 'mestre_parafal' },
  createdAt: Date.now(),
  lastLoginDate: '2026-11-12',
};

export const mockSegundoanista: PlayerProfile = {
  ...mockBixo,
  uid: 'local_arena_test_segundoanista',
  nickname: 'SegundoanistaIF',
  turma: 'INF3M',
  trophies: 1000,
  coins: 350,
};

export const mockVeterano: PlayerProfile = {
  ...mockBixo,
  uid: 'local_arena_test_veterano',
  nickname: 'VeteranoETM',
  turma: 'ETM1M',
  trophies: 2250,
  coins: 500,
};

export const mockPro: PlayerProfile = {
  ...mockBixo,
  uid: 'local_arena_test_pro',
  nickname: 'ProLendario',
  turma: 'INF4T',
  trophies: 10050,
  coins: 2500,
};

export const mockRivalA: PlayerProfile = {
  uid: 'local_arena_test_rival_a',
  nickname: 'RivalAlpha',
  turma: 'ETM2M',
  trophies: 320,
  coins: 150,
  lossStreak: 0,
  unlockedSkins: [],
  claimedMilestones: [],
  equippedSkins: {},
  characterCustomization: { archetypeId: 'pedra_raiz' },
  createdAt: Date.now(),
  lastLoginDate: '2026-11-12',
};

export const mockRivalB: PlayerProfile = {
  uid: 'local_arena_test_rival_b',
  nickname: 'RivalBeta',
  turma: 'ETM3M',
  trophies: 650,
  coins: 200,
  lossStreak: 0,
  unlockedSkins: [],
  claimedMilestones: [],
  equippedSkins: {},
  characterCustomization: { archetypeId: 'gelo_mistico' },
  createdAt: Date.now(),
  lastLoginDate: '2026-11-12',
};

// ============================================================================
// DATA DE VALIDAÇÃO DE NICKNAME E TURMAS
// ============================================================================
export const NICKNAME_TEST_CASES = {
  valid: [
    'abc',
    'Duelista_01',
    'pro-player.if',
    '12345678901234567890', // 20 chars
    'User_Name-123',
    'dom_jegue',
  ],
  invalidTooShort: ['', 'a', 'ab', '  '],
  invalidTooLong: [
    '123456789012345678901', // 21 chars
    'super_long_nickname_do_instituto_federal',
  ],
  invalidCharacters: [
    'joao@123',
    'user#name',
    'pro player', // espaço
    'nick!bom',
    'teste$money',
    'nome(if)',
  ],
};

export const VALID_TURMAS: Turma[] = [
  'INF1M', 'INF2M', 'INF3M', 'INF4M',
  'INF1T', 'INF2T', 'INF3T', 'INF4T',
  'ETM1M', 'ETM2M', 'ETM3M', 'ETM4M',
  'ETM1T', 'ETM2T', 'ETM3T', 'ETM4T',
];

export const INVALID_TURMAS = [
  'ADM1M',
  'INF5M',
  'ETM5T',
  '3ANO',
  'TURMA_TESTE',
  '',
  'inf1m', // case-sensitive check
];

// Helper para criar times com pontuações específicas
export function createTeamMembers(prefix: string, trophiesList: number[], turma: Turma = 'INF1M'): PlayerProfile[] {
  return trophiesList.map((trophies, idx) => ({
    uid: `${prefix}_member_${idx + 1}`,
    nickname: `${prefix}_Player_${idx + 1}`,
    turma,
    trophies,
    coins: 100,
    lossStreak: 0,
    unlockedSkins: [],
    claimedMilestones: [],
    equippedSkins: {},
    characterCustomization: { archetypeId: 'dom_jegue' },
    createdAt: Date.now(),
    lastLoginDate: '2026-11-12',
  }));
}
