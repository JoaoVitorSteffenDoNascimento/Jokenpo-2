import papelImg from '../assets/images/move_papel_1794509644513.jpg';
import parafalImg from '../assets/images/move_parafal_1794509645415.jpg';
import pedraImg from '../assets/images/move_pedra_1794509644053.jpg';
import geloImg from '../assets/images/move_gelo_invertido_1794509645836.jpg';
import tesouraImg from '../assets/images/move_tesoura_1794509646455.jpg';
import jegueImg from '../assets/images/move_jegue_1794509646797.jpg';

import skinParafalOuroImg from '../assets/images/skin_parafal_ouro_veterano_1794511389055.jpg';
import skinPedraMeteoroImg from '../assets/images/skin_pedra_meteoro_cosmico_1794511391495.jpg';
import skinGeloRubiImg from '../assets/images/skin_gelo_invertido_rubi_1794511392680.jpg';
import skinTesouraPlasmaImg from '../assets/images/skin_tesoura_katana_plasma_1794511392888.jpg';
import skinJegueReiImg from '../assets/images/skin_jegue_rei_lendario_1794511393953.jpg';
import skinPapelArcanoImg from '../assets/images/skin_papel_pergaminho_arcano_1794511393993.jpg';

import {
  ArenaTableThemeId,
  CardAuraId,
  CharacterArchetypeId,
  CharacterCustomization,
  CharacterEyewearId,
  CharacterGunSkinId,
  CharacterHatId,
  CharacterOutfitId,
  CharacterPropId,
  EloTier,
  EquippedSkinsMap,
  MatchFormat,
  MatchMode,
  MoveId,
  SkinDefinition,
  TrophyMilestone,
  VictoryEmoteId,
} from '../types/game';

export interface MoveMeta {
  id: MoveId;
  name: string;
  shortName: string;
  image: string;
  accentHex: string;
  tagline: string;
  beats: [MoveId, MoveId];
  losesTo: [MoveId, MoveId];
  neutralWith: MoveId;
}

export const MOVE_ORDER: MoveId[] = [
  'papel',
  'parafal',
  'pedra',
  'gelo_invertido',
  'tesoura',
  'jegue',
];

export const MOVES: Record<MoveId, MoveMeta> = {
  papel: {
    id: 'papel',
    name: 'Papel',
    shortName: 'Papel',
    image: papelImg,
    accentHex: '#F59E0B',
    tagline: 'Embrulha a Pedra e trava o gatilho da Parafal.',
    beats: ['parafal', 'pedra'],
    losesTo: ['jegue', 'tesoura'],
    neutralWith: 'gelo_invertido',
  },
  parafal: {
    id: 'parafal',
    name: 'Parafal',
    shortName: 'Parafal',
    image: parafalImg,
    accentHex: '#EF4444',
    tagline: 'Mata o Jegue com um HS e explode a Pedra.',
    beats: ['jegue', 'pedra'],
    losesTo: ['papel', 'gelo_invertido'],
    neutralWith: 'tesoura',
  },
  pedra: {
    id: 'pedra',
    name: 'Pedra',
    shortName: 'Pedra',
    image: pedraImg,
    accentHex: '#F97316',
    tagline: 'Estilhaça o Gelo Invertido e esmaga a Tesoura.',
    beats: ['gelo_invertido', 'tesoura'],
    losesTo: ['parafal', 'papel'],
    neutralWith: 'jegue',
  },
  gelo_invertido: {
    id: 'gelo_invertido',
    name: 'Gelo Invertido',
    shortName: 'Gelo Inv.',
    image: geloImg,
    accentHex: '#38BDF8',
    tagline: 'Para o tiro da Parafal e quebra a Tesoura.',
    beats: ['parafal', 'tesoura'],
    losesTo: ['pedra', 'jegue'],
    neutralWith: 'papel',
  },
  tesoura: {
    id: 'tesoura',
    name: 'Tesoura',
    shortName: 'Tesoura',
    image: tesouraImg,
    accentHex: '#A855F7',
    tagline: 'Corta o Papel ao meio e derruba o Jegue.',
    beats: ['jegue', 'papel'],
    losesTo: ['gelo_invertido', 'pedra'],
    neutralWith: 'parafal',
  },
  jegue: {
    id: 'jegue',
    name: 'Jegue',
    shortName: 'Jegue',
    image: jegueImg,
    accentHex: '#10B981',
    tagline: 'Come o Papel e atropela o Gelo Invertido.',
    beats: ['papel', 'gelo_invertido'],
    losesTo: ['tesoura', 'parafal'],
    neutralWith: 'pedra',
  },
};

const CLASH_REASONS: Record<string, string> = {
  'papel>parafal': 'Papel travou o mecanismo da Parafal',
  'papel>pedra': 'Papel embrulhou a Pedra',
  'parafal>jegue': 'Parafal deu HS no Jegue',
  'parafal>pedra': 'Parafal explodiu a Pedra',
  'pedra>gelo_invertido': 'Pedra estilhaçou o Gelo Invertido',
  'pedra>tesoura': 'Pedra quebrou a Tesoura',
  'gelo_invertido>parafal': 'Gelo Invertido parou o tiro da Parafal',
  'gelo_invertido>tesoura': 'Gelo Invertido congelou e quebrou a Tesoura',
  'tesoura>jegue': 'Tesoura derrotou o Jegue',
  'tesoura>papel': 'Tesoura cortou o Papel',
  'jegue>papel': 'Jegue devorou o Papel',
  'jegue>gelo_invertido': 'Jegue atropelou o Gelo Invertido',
};

export function resolveMovePair(
  moveA: MoveId,
  moveB: MoveId
): { outcomeForA: 'win' | 'loss' | 'draw'; reason: string } {
  if (moveA === moveB) {
    return {
      outcomeForA: 'draw',
      reason: `Empate espelhado (${MOVES[moveA].name} x ${MOVES[moveB].name})`,
    };
  }
  if (MOVES[moveA].beats.includes(moveB)) {
    return {
      outcomeForA: 'win',
      reason: CLASH_REASONS[`${moveA}>${moveB}`] ?? `${MOVES[moveA].name} venceu ${MOVES[moveB].name}`,
    };
  }
  if (MOVES[moveB].beats.includes(moveA)) {
    return {
      outcomeForA: 'loss',
      reason: CLASH_REASONS[`${moveB}>${moveA}`] ?? `${MOVES[moveB].name} venceu ${MOVES[moveA].name}`,
    };
  }
  return {
    outcomeForA: 'draw',
    reason: `Jogadas neutras (${MOVES[moveA].name} x ${MOVES[moveB].name})`,
  };
}

export const ELO_TIERS: EloTier[] = [
  {
    id: 'novato',
    name: 'Novato',
    minTrophies: 0,
    maxTrophies: 499,
    accentHex: '#94A3B8',
    badgeTextClass: 'text-slate-300',
    borderClass: 'border-slate-500/40',
  },
  {
    id: 'bixo',
    name: 'Bixo',
    minTrophies: 500,
    maxTrophies: 999,
    accentHex: '#10B981',
    badgeTextClass: 'text-emerald-400',
    borderClass: 'border-emerald-500/40',
  },
  {
    id: 'segundoanista',
    name: 'Segundoanista',
    minTrophies: 1000,
    maxTrophies: 1499,
    accentHex: '#38BDF8',
    badgeTextClass: 'text-sky-400',
    borderClass: 'border-sky-500/40',
  },
  {
    id: 'terceiranista',
    name: 'Terceiranista',
    minTrophies: 1500,
    maxTrophies: 2249,
    accentHex: '#818CF8',
    badgeTextClass: 'text-indigo-400',
    borderClass: 'border-indigo-500/40',
  },
  {
    id: 'veterano',
    name: 'Veterano',
    minTrophies: 2250,
    maxTrophies: 2999,
    accentHex: '#A855F7',
    badgeTextClass: 'text-purple-400',
    borderClass: 'border-purple-500/40',
  },
  {
    id: 'municipal',
    name: 'Municipal',
    minTrophies: 3000,
    maxTrophies: 3999,
    accentHex: '#2DD4BF',
    badgeTextClass: 'text-teal-400',
    borderClass: 'border-teal-500/40',
  },
  {
    id: 'regional',
    name: 'Regional',
    minTrophies: 4000,
    maxTrophies: 4999,
    accentHex: '#22C55E',
    badgeTextClass: 'text-green-400',
    borderClass: 'border-green-500/40',
  },
  {
    id: 'estadual',
    name: 'Estadual',
    minTrophies: 5000,
    maxTrophies: 5999,
    accentHex: '#F97316',
    badgeTextClass: 'text-orange-400',
    borderClass: 'border-orange-500/40',
  },
  {
    id: 'nacional',
    name: 'Nacional',
    minTrophies: 6000,
    maxTrophies: 7499,
    accentHex: '#EF4444',
    badgeTextClass: 'text-red-400',
    borderClass: 'border-red-500/40',
  },
  {
    id: 'continental',
    name: 'Continental',
    minTrophies: 7500,
    maxTrophies: 7999,
    accentHex: '#EC4899',
    badgeTextClass: 'text-pink-400',
    borderClass: 'border-pink-500/40',
  },
  {
    id: 'global',
    name: 'Global',
    minTrophies: 8000,
    maxTrophies: 9999,
    accentHex: '#FBBF24',
    badgeTextClass: 'text-amber-300',
    borderClass: 'border-amber-400/50',
  },
  {
    id: 'pro',
    name: 'Pro',
    minTrophies: 10000,
    maxTrophies: null,
    accentHex: '#F59E0B',
    badgeTextClass: 'text-amber-400',
    borderClass: 'border-amber-400',
  },
];

export const TROPHY_ROAD_MILESTONES: TrophyMilestone[] = [
  { id: 'ms_250', trophies: 250, eloName: 'Novato II', coins: 80 },
  { id: 'ms_500', trophies: 500, eloName: 'Bixo', coins: 100 },
  { id: 'ms_1000', trophies: 1000, eloName: 'Segundoanista', coins: 120, skinId: 'papel_prova_surpresa' },
  { id: 'ms_1500', trophies: 1500, eloName: 'Terceiranista', coins: 150 },
  { id: 'ms_2250', trophies: 2250, eloName: 'Veterano', coins: 150, skinId: 'parafal_carmesim' },
  { id: 'ms_3000', trophies: 3000, eloName: 'Municipal', coins: 200 },
  { id: 'ms_4000', trophies: 4000, eloName: 'Regional', coins: 220, skinId: 'pedra_obsidiana' },
  { id: 'ms_5000', trophies: 5000, eloName: 'Estadual', coins: 250 },
  { id: 'ms_6000', trophies: 6000, eloName: 'Nacional', coins: 280, skinId: 'gelo_invertido_rubi' },
  { id: 'ms_7500', trophies: 7500, eloName: 'Continental', coins: 320 },
  { id: 'ms_8000', trophies: 8000, eloName: 'Global', coins: 350, skinId: 'tesoura_dourada' },
  { id: 'ms_10000', trophies: 10000, eloName: 'Pro (Temporada)', coins: 450, skinId: 'jegue_rei' },
];

export const TROPHY_MILESTONES = TROPHY_ROAD_MILESTONES;

export function getCurrentSeasonMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function getDaysLeftInSeason(): number {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return Math.max(1, Math.ceil((nextMonth.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
}

export function getEloInfo(trophies: number): {
  tier: EloTier;
  nextTier: EloTier | null;
  progressPercent: number;
  trophiesToNext: number;
} {
  let current = ELO_TIERS[0];
  let idx = 0;
  for (let i = 0; i < ELO_TIERS.length; i++) {
    if (trophies >= ELO_TIERS[i].minTrophies) {
      current = ELO_TIERS[i];
      idx = i;
    }
  }
  const nextTier = idx < ELO_TIERS.length - 1 ? ELO_TIERS[idx + 1] : null;
  if (!nextTier) {
    return {
      tier: current,
      nextTier: null,
      progressPercent: 100,
      trophiesToNext: 0,
    };
  }
  const span = nextTier.minTrophies - current.minTrophies;
  const gained = trophies - current.minTrophies;
  const progressPercent = Math.max(0, Math.min(100, Math.round((gained / span) * 100)));
  return {
    tier: current,
    nextTier,
    progressPercent,
    trophiesToNext: Math.max(0, nextTier.minTrophies - trophies),
  };
}

export const DEFAULT_EQUIPPED_SKINS: EquippedSkinsMap = {
  papel: 'papel_default',
  parafal: 'parafal_default',
  pedra: 'pedra_default',
  gelo_invertido: 'gelo_invertido_default',
  tesoura: 'tesoura_default',
  jegue: 'jegue_default',
};

export const DEFAULT_UNLOCKED_SKINS = Object.values(DEFAULT_EQUIPPED_SKINS);

export const SKINS_CATALOG: SkinDefinition[] = [
  // PAPEL
  {
    id: 'papel_default',
    moveId: 'papel',
    name: 'Papel Clássico',
    rarity: 'Padrão',
    cost: 0,
    description: 'Pergaminho tático padrão da arena em linho fosco.',
    frameClass: 'border-slate-700 bg-[#131A26]',
    imageFilterClass: '',
    accentColor: '#94A3B8',
    material3d: {
      metalness: 0.12,
      roughness: 0.78,
      cardTintHex: '#D6C7A9',
      finishLabel: 'Linho Tático 3D',
    },
  },
  {
    id: 'papel_prova_surpresa',
    moveId: 'papel',
    name: 'Prova Surpresa',
    rarity: 'Rara',
    cost: 120,
    description: 'Folha dourada selada a cera imperial que trava o gatilho inimigo.',
    frameClass: 'border-amber-400/70 bg-gradient-to-b from-amber-950/60 to-[#131A26]',
    imageFilterClass: 'sepia-[0.22] contrast-110 brightness-105',
    accentColor: '#F59E0B',
    material3d: {
      metalness: 0.68,
      roughness: 0.28,
      clearcoat: 0.6,
      emissiveHex: '#92400E',
      emissiveIntensity: 0.25,
      cardTintHex: '#F59E0B',
      finishLabel: 'Selo Dourado PBR',
    },
  },
  {
    id: 'papel_holografico',
    moveId: 'papel',
    name: 'Pergaminho Arcano',
    rarity: 'Épica',
    cost: 240,
    description: 'Grimório rúnico flutuante com origamis de cristal e selos arcanos.',
    frameClass: 'border-cyan-400/80 bg-gradient-to-b from-cyan-950/70 via-[#151E30] to-[#131A26]',
    imageFilterClass: '',
    accentColor: '#22D3EE',
    customImage: skinPapelArcanoImg,
    material3d: {
      metalness: 0.82,
      roughness: 0.18,
      clearcoat: 0.95,
      emissiveHex: '#06B6D4',
      emissiveIntensity: 0.45,
      cardTintHex: '#22D3EE',
      finishLabel: 'Runa Holográfica 3D',
    },
  },
  // PARAFAL
  {
    id: 'parafal_default',
    moveId: 'parafal',
    name: 'Parafal Padrão',
    rarity: 'Padrão',
    cost: 0,
    description: 'Fuzil de calibre pesado com acabamento em aço escovado de fábrica.',
    frameClass: 'border-slate-700 bg-[#131A26]',
    imageFilterClass: '',
    accentColor: '#94A3B8',
    material3d: {
      metalness: 0.72,
      roughness: 0.42,
      cardTintHex: '#64748B',
      finishLabel: 'Aço Escovado 3D',
    },
  },
  {
    id: 'parafal_carmesim',
    moveId: 'parafal',
    name: 'Parafal Fúria Carmesim',
    rarity: 'Rara',
    cost: 150,
    description: 'Cano anodizado em carmesim anodizado de alto impacto tático.',
    frameClass: 'border-red-500/80 bg-gradient-to-b from-red-950/70 to-[#131A26]',
    imageFilterClass: 'hue-rotate-[-25deg] saturate-150 contrast-115',
    accentColor: '#EF4444',
    material3d: {
      metalness: 0.85,
      roughness: 0.24,
      clearcoat: 0.8,
      emissiveHex: '#991B1B',
      emissiveIntensity: 0.3,
      cardTintHex: '#EF4444',
      finishLabel: 'Cromo Carmesim 3D',
    },
  },
  {
    id: 'parafal_ouro_real',
    moveId: 'parafal',
    name: 'Parafal Ouro Veterano',
    rarity: 'Lendária',
    cost: 380,
    description: 'Fuzil entalhado em ouro maciço 24k com cápsulas incandescentes.',
    frameClass: 'border-amber-300 bg-gradient-to-b from-amber-900/75 via-[#1E1910] to-[#131A26]',
    imageFilterClass: '',
    accentColor: '#FBBF24',
    customImage: skinParafalOuroImg,
    material3d: {
      metalness: 0.96,
      roughness: 0.14,
      clearcoat: 1.0,
      emissiveHex: '#D97706',
      emissiveIntensity: 0.4,
      cardTintHex: '#FBBF24',
      finishLabel: 'Ouro Maciço 24K 3D',
    },
  },
  // PEDRA
  {
    id: 'pedra_default',
    moveId: 'pedra',
    name: 'Basalto Padrão',
    rarity: 'Padrão',
    cost: 0,
    description: 'Rocha vulcânica bruta com fissuras de impacto.',
    frameClass: 'border-slate-700 bg-[#131A26]',
    imageFilterClass: '',
    accentColor: '#94A3B8',
    material3d: {
      metalness: 0.18,
      roughness: 0.86,
      cardTintHex: '#78716C',
      finishLabel: 'Basalto Bruto 3D',
    },
  },
  {
    id: 'pedra_esmeralda',
    moveId: 'pedra',
    name: 'Cristal Radioativo',
    rarity: 'Rara',
    cost: 140,
    description: 'Geodo esmeralda enriquecido com núcleo de energia verde.',
    frameClass: 'border-emerald-400/80 bg-gradient-to-b from-emerald-950/70 to-[#131A26]',
    imageFilterClass: 'hue-rotate-90 saturate-150 brightness-110',
    accentColor: '#10B981',
    material3d: {
      metalness: 0.45,
      roughness: 0.22,
      clearcoat: 0.85,
      emissiveHex: '#059669',
      emissiveIntensity: 0.38,
      cardTintHex: '#10B981',
      finishLabel: 'Geodo Esmeralda 3D',
    },
  },
  {
    id: 'pedra_obsidiana',
    moveId: 'pedra',
    name: 'Meteoro Cósmico',
    rarity: 'Épica',
    cost: 280,
    description: 'Fragmento de asteroide obsidiana com veios de magma e nébula violeta.',
    frameClass: 'border-purple-400/80 bg-gradient-to-b from-purple-950/75 via-[#1B122C] to-[#131A26]',
    imageFilterClass: '',
    accentColor: '#C084FC',
    customImage: skinPedraMeteoroImg,
    material3d: {
      metalness: 0.62,
      roughness: 0.25,
      clearcoat: 0.9,
      emissiveHex: '#9333EA',
      emissiveIntensity: 0.55,
      cardTintHex: '#C084FC',
      finishLabel: 'Obsidiana & Magma 3D',
    },
  },
  // GELO INVERTIDO
  {
    id: 'gelo_invertido_default',
    moveId: 'gelo_invertido',
    name: 'Gelo Invertido Padrão',
    rarity: 'Padrão',
    cost: 0,
    description: 'Barreira glacial de gravidade reversa da arena.',
    frameClass: 'border-slate-700 bg-[#131A26]',
    imageFilterClass: '',
    accentColor: '#94A3B8',
    material3d: {
      metalness: 0.25,
      roughness: 0.16,
      clearcoat: 1.0,
      cardTintHex: '#38BDF8',
      finishLabel: 'Cristal Glacial 3D',
    },
  },
  {
    id: 'gelo_invertido_aurora',
    moveId: 'gelo_invertido',
    name: 'Gelo Aurora Polar',
    rarity: 'Rara',
    cost: 140,
    description: 'Estalactites turquesa banhadas pela luz boreal.',
    frameClass: 'border-teal-400/80 bg-gradient-to-b from-teal-950/70 to-[#131A26]',
    imageFilterClass: 'hue-rotate-[-35deg] saturate-150 brightness-110',
    accentColor: '#2DD4BF',
    material3d: {
      metalness: 0.4,
      roughness: 0.14,
      clearcoat: 1.0,
      emissiveHex: '#0D9488',
      emissiveIntensity: 0.35,
      cardTintHex: '#2DD4BF',
      finishLabel: 'Prisma Boreal 3D',
    },
  },
  {
    id: 'gelo_invertido_rubi',
    moveId: 'gelo_invertido',
    name: 'Gelo Invertido Rubi',
    rarity: 'Lendária',
    cost: 360,
    description: 'Cristais de gelo sanguíneo com runas escarlates flutuando em gravidade zero.',
    frameClass: 'border-rose-400 bg-gradient-to-b from-rose-950/80 via-[#25101A] to-[#131A26]',
    imageFilterClass: '',
    accentColor: '#FB7185',
    customImage: skinGeloRubiImg,
    material3d: {
      metalness: 0.55,
      roughness: 0.1,
      clearcoat: 1.0,
      emissiveHex: '#E11D48',
      emissiveIntensity: 0.58,
      cardTintHex: '#FB7185',
      finishLabel: 'Rubi Criogênico 3D',
    },
  },
  // TESOURA
  {
    id: 'tesoura_default',
    moveId: 'tesoura',
    name: 'Tesoura Tática',
    rarity: 'Padrão',
    cost: 0,
    description: 'Lâminas duplas forjadas em aço temperado.',
    frameClass: 'border-slate-700 bg-[#131A26]',
    imageFilterClass: '',
    accentColor: '#94A3B8',
    material3d: {
      metalness: 0.8,
      roughness: 0.32,
      cardTintHex: '#94A3B8',
      finishLabel: 'Aço Temperado 3D',
    },
  },
  {
    id: 'tesoura_katana',
    moveId: 'tesoura',
    name: 'Katanas de Plasma',
    rarity: 'Épica',
    cost: 240,
    description: 'Par de katanas cibernéticas cruzadas com fio de plasma ciano e esmeralda.',
    frameClass: 'border-emerald-400/80 bg-gradient-to-b from-emerald-950/75 via-[#102428] to-[#131A26]',
    imageFilterClass: '',
    accentColor: '#34D399',
    customImage: skinTesouraPlasmaImg,
    material3d: {
      metalness: 0.88,
      roughness: 0.16,
      clearcoat: 0.95,
      emissiveHex: '#10B981',
      emissiveIntensity: 0.52,
      cardTintHex: '#34D399',
      finishLabel: 'Lâmina de Plasma 3D',
    },
  },
  {
    id: 'tesoura_dourada',
    moveId: 'tesoura',
    name: 'Tesoura Imperial',
    rarity: 'Lendária',
    cost: 350,
    description: 'Lâminas reais banhadas a ouro reluzente com empunhadura de veludo.',
    frameClass: 'border-amber-400 bg-gradient-to-b from-amber-950/70 to-[#131A26]',
    imageFilterClass: 'sepia-[0.7] saturate-200 brightness-115',
    accentColor: '#F59E0B',
    material3d: {
      metalness: 0.95,
      roughness: 0.15,
      clearcoat: 1.0,
      emissiveHex: '#B45309',
      emissiveIntensity: 0.35,
      cardTintHex: '#F59E0B',
      finishLabel: 'Ouro Imperial 3D',
    },
  },
  // JEGUE
  {
    id: 'jegue_default',
    moveId: 'jegue',
    name: 'Jegue Blindado',
    rarity: 'Padrão',
    cost: 0,
    description: 'Mascote blindado em bronze tradicional das turmas.',
    frameClass: 'border-slate-700 bg-[#131A26]',
    imageFilterClass: '',
    accentColor: '#94A3B8',
    material3d: {
      metalness: 0.55,
      roughness: 0.48,
      cardTintHex: '#CD7F32',
      finishLabel: 'Bronze de Arena 3D',
    },
  },
  {
    id: 'jegue_cyber',
    moveId: 'jegue',
    name: 'Jegue INF Turbo',
    rarity: 'Épica',
    cost: 260,
    description: 'Blindagem cibernética azul neon forjada pelos veteranos de Informática.',
    frameClass: 'border-sky-400/80 bg-gradient-to-b from-sky-950/70 to-[#131A26]',
    imageFilterClass: 'hue-rotate-[175deg] saturate-175 brightness-110',
    accentColor: '#38BDF8',
    material3d: {
      metalness: 0.85,
      roughness: 0.2,
      clearcoat: 0.9,
      emissiveHex: '#0284C7',
      emissiveIntensity: 0.45,
      cardTintHex: '#38BDF8',
      finishLabel: 'Titânio Cyber 3D',
    },
  },
  {
    id: 'jegue_rei',
    moveId: 'jegue',
    name: 'Dom Jegue Rei do Saloon',
    rarity: 'Lendária',
    cost: 400,
    description: 'Chefe supremo da mesa com coroa cravejada, ferraduras de ouro e colete de gala.',
    frameClass: 'border-amber-300 bg-gradient-to-b from-orange-950/80 via-amber-950/60 to-[#131A26]',
    imageFilterClass: '',
    accentColor: '#FBBF24',
    customImage: skinJegueReiImg,
    material3d: {
      metalness: 0.94,
      roughness: 0.14,
      clearcoat: 1.0,
      emissiveHex: '#D97706',
      emissiveIntensity: 0.48,
      cardTintHex: '#FBBF24',
      finishLabel: 'Realeza do Saloon 3D',
    },
  },
];

export function getSkinById(skinId?: string): SkinDefinition {
  return SKINS_CATALOG.find((s) => s.id === skinId) ?? SKINS_CATALOG[0];
}

export function randomIntInclusive(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export const DAILY_REWARD_COINS = 150;
export const ROUND_DURATION_SECONDS = 24;

export interface MatchRewardResult {
  trophyDelta: number;
  coinsEarned: number;
  newTrophies: number;
  newLossStreak: number;
  streakRecoveryTriggered: boolean;
}

export function calculateMatchReward(params: {
  outcome: 'win' | 'loss' | 'draw';
  mode: MatchMode;
  format: MatchFormat;
  isFriendly: boolean;
  currentTrophies: number;
  currentLossStreak: number;
}): MatchRewardResult {
  const { outcome, mode, format, isFriendly, currentTrophies, currentLossStreak } = params;

  if (isFriendly) {
    return {
      trophyDelta: 0,
      coinsEarned: outcome === 'win' ? 25 : 10,
      newTrophies: currentTrophies,
      newLossStreak: currentLossStreak,
      streakRecoveryTriggered: false,
    };
  }

  if (outcome === 'win') {
    let trophyGain: number;
    if (mode === '3v3') {
      trophyGain = format === 'MD5' ? randomIntInclusive(55, 65) : randomIntInclusive(50, 60);
    } else if (mode === '2v2') {
      trophyGain = format === 'MD5' ? randomIntInclusive(45, 55) : randomIntInclusive(40, 50);
    } else {
      trophyGain = format === 'MD5' ? randomIntInclusive(20, 30) : randomIntInclusive(10, 20);
    }
    const coinsEarned =
      mode === '3v3' ? 80 : mode === '2v2' ? 65 : format === 'MD5' ? 55 : 40;
    return {
      trophyDelta: trophyGain,
      coinsEarned,
      newTrophies: currentTrophies + trophyGain,
      newLossStreak: 0,
      streakRecoveryTriggered: false,
    };
  }

  if (outcome === 'draw') {
    return {
      trophyDelta: 0,
      coinsEarned: 20,
      newTrophies: currentTrophies,
      newLossStreak: currentLossStreak,
      streakRecoveryTriggered: false,
    };
  }

  // Loss in ranked match
  const nextStreak = currentLossStreak + 1;
  if (nextStreak >= 3) {
    // 3 consecutive losses grants +25 to +30 trophies recovery!
    const recoveryTrophies = randomIntInclusive(25, 30);
    return {
      trophyDelta: recoveryTrophies,
      coinsEarned: 30,
      newTrophies: currentTrophies + recoveryTrophies,
      newLossStreak: 0,
      streakRecoveryTriggered: true,
    };
  }

  // MD3 loses 10-20, MD5 loses 20-30
  const penalty =
    format === 'MD5' ? randomIntInclusive(20, 30) : randomIntInclusive(10, 20);
  const clampedNewTrophies = Math.max(0, currentTrophies - penalty);
  return {
    trophyDelta: clampedNewTrophies - currentTrophies,
    coinsEarned: 15,
    newTrophies: clampedNewTrophies,
    newLossStreak: nextStreak,
    streakRecoveryTriggered: false,
  };
}

export const DEFAULT_CHARACTER_CUSTOMIZATION: CharacterCustomization = {
  archetypeId: 'dom_jegue',
  hatId: 'fedora_saloon',
  eyewearId: 'none',
  outfitId: 'couro_saloon',
  propId: 'charuto_chefe',
  gunSkinId: 'aco_azulado',
  tableThemeId: 'saloon_mogno',
  cardAuraId: 'chama_real',
  victoryEmoteId: 'saudacao_real',
};

export const CHARACTER_ARCHETYPES: {
  id: CharacterArchetypeId;
  name: string;
  subtitle: string;
  skinColorHex: number;
  accentHex: string;
  isCyber?: boolean;
}[] = [
  {
    id: 'dom_jegue',
    name: 'Dom Jegue Imperial',
    subtitle: 'Chefe supremo da mesa com orelhas longas e pose de magnata',
    skinColorHex: 0x5c4338,
    accentHex: '#F59E0B',
  },
  {
    id: 'minotauro_chef',
    name: 'Dom Minotauro',
    subtitle: 'Touro veterano do Saloon com chifres curvados e argola de ouro',
    skinColorHex: 0x4e3224,
    accentHex: '#EF4444',
  },
  {
    id: 'mecha_camaleao',
    name: 'Mecha-Camaleão',
    subtitle: 'Ciborgue camaleão iridescente com crista e olhos de torreta',
    skinColorHex: 0x0f766e,
    accentHex: '#22D3EE',
    isCyber: true,
  },
  {
    id: 'raposa_dama',
    name: 'Dama Raposa',
    subtitle: 'Atiradora astuta do Saloon com orelhas vulpinas e brincos reais',
    skinColorHex: 0xa85229,
    accentHex: '#FB7185',
  },
  {
    id: 'lobo_cyber',
    name: 'Lobo Mercenário',
    subtitle: 'Estrategista lupino de pelagem prateada e instinto implacável',
    skinColorHex: 0x475569,
    accentHex: '#38BDF8',
  },
  {
    id: 'urso_pardo',
    name: 'Barão Urso Pardo',
    subtitle: 'Veterano peso-pesado com garras de obsidiana e presença imponente',
    skinColorHex: 0x3f271d,
    accentHex: '#10B981',
  },
];

export const CHARACTER_HATS: {
  id: CharacterHatId;
  name: string;
  badge: string;
}[] = [
  { id: 'none', name: 'Sem Chapéu', badge: 'Natural' },
  { id: 'fedora_saloon', name: 'Fedora do Saloon', badge: 'Clássico' },
  { id: 'coroa_imperial', name: 'Coroa Real 24K', badge: 'Lendário' },
  { id: 'cartola_magnata', name: 'Cartola de Magnata', badge: 'Gala' },
  { id: 'halo_cyber', name: 'Auréola Cyber-Neon', badge: 'Holográfico' },
  { id: 'capacete_tatico', name: 'Elmo Tático Parafal', badge: 'Blindado' },
  { id: 'chapeu_cauboi', name: 'Chapéu Xerife do Oeste', badge: 'Saloon' },
];

export const CHARACTER_EYEWEAR: {
  id: CharacterEyewearId;
  name: string;
  badge: string;
}[] = [
  { id: 'none', name: 'Olhar Natural', badge: 'Padrão' },
  { id: 'visor_mecha', name: 'Visor Laser Cyber', badge: 'Neon' },
  { id: 'monoculo_ouro', name: 'Monóculo Imperial', badge: 'Realeza' },
  { id: 'oculos_escuros', name: 'Óculos de Chefe', badge: 'Máfia' },
  { id: 'tapa_olho', name: 'Tapa-Olho Tático', badge: 'Veterano' },
  { id: 'olhos_chama', name: 'Olhos de Brasa Viva', badge: 'Épico' },
];

export const CHARACTER_OUTFITS: {
  id: CharacterOutfitId;
  name: string;
  vestHex: number;
  shirtHex: number;
  trimHex: string;
}[] = [
  {
    id: 'couro_saloon',
    name: 'Couro Mogno do Saloon',
    vestHex: 0x261510,
    shirtHex: 0xd6cfc2,
    trimHex: '#F59E0B',
  },
  {
    id: 'gala_imperial',
    name: 'Gala Carmesim & Ouro',
    vestHex: 0x450a0a,
    shirtHex: 0xfef3c7,
    trimHex: '#FBBF24',
  },
  {
    id: 'cyber_neon',
    name: 'Armadura Cyber INF',
    vestHex: 0x0f172a,
    shirtHex: 0x1e293b,
    trimHex: '#22D3EE',
  },
  {
    id: 'esmeralda_etm',
    name: 'Traje Esmeralda ETM',
    vestHex: 0x064e3b,
    shirtHex: 0xd1fae5,
    trimHex: '#10B981',
  },
  {
    id: 'obsidiana_noite',
    name: 'Sombra Obsidiana',
    vestHex: 0x181028,
    shirtHex: 0x2e1065,
    trimHex: '#C084FC',
  },
  {
    id: 'platina_pro',
    name: 'Almirante Platina Pro',
    vestHex: 0xdbeafe,
    shirtHex: 0x1e293b,
    trimHex: '#F59E0B',
  },
];

export const CHARACTER_PROPS: {
  id: CharacterPropId;
  name: string;
}[] = [
  { id: 'none', name: 'Sem Acessório' },
  { id: 'charuto_chefe', name: 'Charuto do Saloon' },
  { id: 'rosa_dourada', name: 'Rosa de Ouro' },
  { id: 'mascara_oni', name: 'Respirador Mecha' },
  { id: 'bigode_barao', name: 'Bigode de Barão' },
];

export const CHARACTER_GUN_SKINS: {
  id: CharacterGunSkinId;
  name: string;
  steelHex: number;
  cylHex: number;
  gripHex: number;
}[] = [
  {
    id: 'aco_azulado',
    name: 'Aço Azulado & Nogueira',
    steelHex: 0x262c36,
    cylHex: 0xd97706,
    gripHex: 0x5c2812,
  },
  {
    id: 'ouro_imperial',
    name: 'Ouro Maciço 24K',
    steelHex: 0xeab308,
    cylHex: 0xfef08a,
    gripHex: 0x29150c,
  },
  {
    id: 'carmesim_furia',
    name: 'Carmesim Anodizado',
    steelHex: 0x18181b,
    cylHex: 0xef4444,
    gripHex: 0x450a0a,
  },
  {
    id: 'cyber_plasma',
    name: 'Cromo & Ciano Cyber',
    steelHex: 0xcbd5e1,
    cylHex: 0x06b6d4,
    gripHex: 0x0f172a,
  },
];

export const ARENA_TABLE_THEMES: {
  id: ArenaTableThemeId;
  name: string;
  subtitle: string;
  rimHex: number;
  feltHex: number;
  ringHex: number;
  fogHex: number;
  accentCss: string;
}[] = [
  {
    id: 'saloon_mogno',
    name: 'Saloon Mogno Imperial',
    subtitle: 'Mesa clássica entalhada em mogno com anel de esmeralda e brasas',
    rimHex: 0x4a1d0d,
    feltHex: 0x2c1209,
    ringHex: 0x10b981,
    fogHex: 0x120806,
    accentCss: '#F59E0B',
  },
  {
    id: 'cyber_neon',
    name: 'Cyber-Grid INF Neon',
    subtitle: 'Arena holográfica de fibra de carbono com circuitos ciano e plasma',
    rimHex: 0x0f172a,
    feltHex: 0x091326,
    ringHex: 0x06b6d4,
    fogHex: 0x050b16,
    accentCss: '#22D3EE',
  },
  {
    id: 'obsidiana_imperial',
    name: 'Cripta Obsidiana & Magma',
    subtitle: 'Rocha vulcânica negra polida com runas de magma carmesim e violeta',
    rimHex: 0x181024,
    feltHex: 0x12091c,
    ringHex: 0xf43f5e,
    fogHex: 0x0c0612,
    accentCss: '#FB7185',
  },
  {
    id: 'esmeralda_etm',
    name: 'Cassino Real Esmeralda',
    subtitle: 'Feltro verde esmeralda de luxo com filigrana de ouro maciço 24K',
    rimHex: 0x3b1a0e,
    feltHex: 0x063729,
    ringHex: 0xfbbf24,
    fogHex: 0x071410,
    accentCss: '#10B981',
  },
  {
    id: 'saloon_rustico',
    name: 'Saloon Rústico Clássico',
    subtitle: 'Carvalho envelhecido, ferraduras de ferro forjado e lanterna âmbar',
    rimHex: 0x3d2314,
    feltHex: 0x24140b,
    ringHex: 0xd97706,
    fogHex: 0x0f0905,
    accentCss: '#D97706',
  },
  {
    id: 'cyber_neon_vip',
    name: 'Cyber Neon VIP',
    subtitle: 'Fibra de carbono preta com circuitos magenta/ciano pulsantes',
    rimHex: 0x180b2b,
    feltHex: 0x0d061a,
    ringHex: 0xe879f9,
    fogHex: 0x080312,
    accentCss: '#E879F9',
  },
  {
    id: 'ouro_cassino',
    name: 'Ouro Real de Cassino',
    subtitle: 'Feltro veludo carmesim de luxo e filigrana de ouro maciço 24K',
    rimHex: 0x450a0a,
    feltHex: 0x350808,
    ringHex: 0xfacc15,
    fogHex: 0x140404,
    accentCss: '#FACC15',
  },
  {
    id: 'templo_cosmico',
    name: 'Templo Cósmico',
    subtitle: 'Mármore sideral azul-marinho com runas astrais bioluminescentes',
    rimHex: 0x1e1b4b,
    feltHex: 0x0f172a,
    ringHex: 0x818cf8,
    fogHex: 0x070a14,
    accentCss: '#818CF8',
  },
];

export const CARD_AURAS: {
  id: CardAuraId;
  name: string;
  badge: string;
  colorHex: number;
  cssColor: string;
}[] = [
  {
    id: 'chama_real',
    name: 'Chama Imperial',
    badge: 'Fogo & Ouro',
    colorHex: 0xf59e0b,
    cssColor: '#F59E0B',
  },
  {
    id: 'plasma_ciano',
    name: 'Pulso de Plasma',
    badge: 'Cyber INF',
    colorHex: 0x06b6d4,
    cssColor: '#22D3EE',
  },
  {
    id: 'relampago_ouro',
    name: 'Tempestade Esmeralda',
    badge: 'Energia ETM',
    colorHex: 0x10b981,
    cssColor: '#10B981',
  },
  {
    id: 'sombra_arcana',
    name: 'Névoa Carmesim',
    badge: 'Lendário',
    colorHex: 0xf43f5e,
    cssColor: '#FB7185',
  },
  {
    id: 'chamas_carmesim',
    name: 'Chamas Carmesim',
    badge: 'Inferno Vulcânico',
    colorHex: 0xef4444,
    cssColor: '#EF4444',
  },
  {
    id: 'relampago_eletrico',
    name: 'Relâmpago Elétrico',
    badge: 'Alta Tensão 24K',
    colorHex: 0xfacc15,
    cssColor: '#FACC15',
  },
  {
    id: 'void_cosmico',
    name: 'Void Cósmico',
    badge: 'Abismo Astral',
    colorHex: 0xa855f7,
    cssColor: '#A855F7',
  },
  {
    id: 'glitch_cyberpunk',
    name: 'Glitch Holográfico',
    badge: 'Matrix INF',
    colorHex: 0x10b981,
    cssColor: '#10B981',
  },
];

export const VICTORY_EMOTES: {
  id: VictoryEmoteId;
  name: string;
  icon: string;
  phrase: string;
}[] = [
  {
    id: 'saudacao_real',
    name: 'Rei da Mesa',
    icon: '👑',
    phrase: 'Respeita o Rei da Mesa!',
  },
  {
    id: 'giro_revolver',
    name: 'Na Mira da Parafal',
    icon: '🎯',
    phrase: 'Leitura fria, HS limpo!',
  },
  {
    id: 'rugido_chefe',
    name: 'Blefe Implacável',
    icon: '🔥',
    phrase: 'Caiu no blefe do Saloon!',
  },
  {
    id: 'holograma_gg',
    name: 'GG Calculado',
    icon: '⚡',
    phrase: 'Tudo calculado no hexágono!',
  },
  {
    id: 'palmas_taticas',
    name: 'Aplauso Estratégico',
    icon: '👏',
    phrase: 'Bela jogada, mas foi prevista!',
  },
  {
    id: 'fogo_intenso',
    name: 'Mesa em Chamas',
    icon: '🔥',
    phrase: 'A pressão aqui derrete ferro!',
  },
  {
    id: 'caveira_fatal',
    name: 'Xeque-Mate do Hexágono',
    icon: '💀',
    phrase: 'Um erro aqui é fatal!',
  },
  {
    id: 'blefe_absoluto',
    name: 'Mestre do Blefe',
    icon: '🃏',
    phrase: 'Quem tem coragem bate na mesa!',
  },
  {
    id: 'oculos_mito',
    name: 'Cálculo de Pro Player',
    icon: '😎',
    phrase: 'Zero sorte, pura frieza!',
  },
  {
    id: 'espanto_total',
    name: 'Reviravolta Épica',
    icon: '😱',
    phrase: 'Que duelo inacreditável!',
  },
];

export const CHARACTER_PRESETS: {
  id: string;
  name: string;
  badge: string;
  config: CharacterCustomization;
}[] = [
  {
    id: 'rei_saloon',
    name: 'Dom Jegue Rei 24K',
    badge: 'Realeza',
    config: {
      archetypeId: 'dom_jegue',
      hatId: 'coroa_imperial',
      eyewearId: 'monoculo_ouro',
      outfitId: 'gala_imperial',
      propId: 'charuto_chefe',
      gunSkinId: 'ouro_imperial',
      tableThemeId: 'saloon_mogno',
      cardAuraId: 'chama_real',
      victoryEmoteId: 'saudacao_real',
    },
  },
  {
    id: 'cyber_inf',
    name: 'Mecha-Camaleão INF',
    badge: 'Cyberpunk',
    config: {
      archetypeId: 'mecha_camaleao',
      hatId: 'halo_cyber',
      eyewearId: 'visor_mecha',
      outfitId: 'cyber_neon',
      propId: 'mascara_oni',
      gunSkinId: 'cyber_plasma',
      tableThemeId: 'cyber_neon',
      cardAuraId: 'plasma_ciano',
      victoryEmoteId: 'holograma_gg',
    },
  },
  {
    id: 'chefe_obsidiana',
    name: 'Minotauro Carmesim',
    badge: 'Intimidador',
    config: {
      archetypeId: 'minotauro_chef',
      hatId: 'chapeu_cauboi',
      eyewearId: 'olhos_chama',
      outfitId: 'obsidiana_noite',
      propId: 'charuto_chefe',
      gunSkinId: 'carmesim_furia',
      tableThemeId: 'obsidiana_imperial',
      cardAuraId: 'sombra_arcana',
      victoryEmoteId: 'rugido_chefe',
    },
  },
  {
    id: 'dama_cassino',
    name: 'Dama Raposa de Gala',
    badge: 'Elegância',
    config: {
      archetypeId: 'raposa_dama',
      hatId: 'cartola_magnata',
      eyewearId: 'oculos_escuros',
      outfitId: 'esmeralda_etm',
      propId: 'rosa_dourada',
      gunSkinId: 'ouro_imperial',
      tableThemeId: 'esmeralda_etm',
      cardAuraId: 'relampago_ouro',
      victoryEmoteId: 'giro_revolver',
    },
  },
];

export function resolveCharacterCustomization(
  custom?: Partial<CharacterCustomization> | null,
  fallbackIndex = 0
): CharacterCustomization {
  const arch =
    CHARACTER_ARCHETYPES[fallbackIndex % CHARACTER_ARCHETYPES.length].id;
  const hat = CHARACTER_HATS[(fallbackIndex + 1) % CHARACTER_HATS.length].id;
  const eye = CHARACTER_EYEWEAR[fallbackIndex % CHARACTER_EYEWEAR.length].id;
  const outfit = CHARACTER_OUTFITS[fallbackIndex % CHARACTER_OUTFITS.length].id;
  const prop = CHARACTER_PROPS[fallbackIndex % CHARACTER_PROPS.length].id;
  const gun = CHARACTER_GUN_SKINS[fallbackIndex % CHARACTER_GUN_SKINS.length].id;
  const table =
    ARENA_TABLE_THEMES[fallbackIndex % ARENA_TABLE_THEMES.length].id;
  const aura = CARD_AURAS[fallbackIndex % CARD_AURAS.length].id;
  const emote = VICTORY_EMOTES[fallbackIndex % VICTORY_EMOTES.length].id;

  return {
    archetypeId: custom?.archetypeId ?? arch,
    hatId: custom?.hatId ?? hat,
    eyewearId: custom?.eyewearId ?? eye,
    outfitId: custom?.outfitId ?? outfit,
    propId: custom?.propId ?? prop,
    gunSkinId: custom?.gunSkinId ?? gun,
    tableThemeId: custom?.tableThemeId ?? table,
    cardAuraId: custom?.cardAuraId ?? aura,
    victoryEmoteId: custom?.victoryEmoteId ?? emote,
  };
}

