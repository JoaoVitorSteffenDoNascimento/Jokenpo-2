import React from 'react';
import { Box, Check, Coins, Lock, Sparkles, User } from 'lucide-react';
import { MOVE_ORDER, MOVES, SKINS_CATALOG } from '../constants/gameData';
import {
  buySkin,
  equipSkin,
  saveCharacterCustomization,
} from '../firebase/services';
import { MoveId, PlayerProfile, SkinDefinition } from '../types/game';
import { soundFx } from '../utils/soundFx';
import { MoveCard } from './MoveCard';
import { CharacterCustomizer3D } from './three/CharacterCustomizer3D';
import { SkinInspector3D } from './three/SkinInspector3D';

interface SkinsShopViewProps {
  player: PlayerProfile;
}

export const SkinsShopView: React.FC<SkinsShopViewProps> = ({ player }) => {
  const [studioTab, setStudioTab] = React.useState<'character' | 'moves'>('character');
  const [filterMove, setFilterMove] = React.useState<'all' | MoveId>('all');
  const [inspectedSkinId, setInspectedSkinId] = React.useState<string>(
    () =>
      player.equippedSkins.parafal !== 'parafal_default'
        ? player.equippedSkins.parafal
        : 'parafal_ouro_real'
  );
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [errorMsg, setErrorMsg] = React.useState('');

  const filteredSkins = React.useMemo(
    () =>
      filterMove === 'all'
        ? SKINS_CATALOG
        : SKINS_CATALOG.filter((s) => s.moveId === filterMove),
    [filterMove]
  );

  const inspectedSkin = React.useMemo(
    () =>
      SKINS_CATALOG.find((s) => s.id === inspectedSkinId) ??
      filteredSkins[0] ??
      SKINS_CATALOG[0],
    [inspectedSkinId, filteredSkins]
  );

  const handleBuy = async (skin: SkinDefinition) => {
    setErrorMsg('');
    setBusyId(skin.id);
    try {
      await buySkin(player, skin);
      soundFx.playCoin();
      setInspectedSkinId(skin.id);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao comprar skin.');
    } finally {
      setBusyId(null);
    }
  };

  const handleEquip = async (skin: SkinDefinition) => {
    setErrorMsg('');
    setBusyId(skin.id);
    try {
      await equipSkin(player, skin.moveId, skin.id);
      soundFx.playSelect();
      setInspectedSkinId(skin.id);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao equipar skin.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-white">
            Vestiário de Personagem & Arsenal 3D
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Troque a skin do seu personagem 3D, chapéus, óculos, trajes, revólver de mesa e as skins das 6 jogadas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Studio Mode Switcher */}
          <div className="inline-flex rounded-xl border border-white/15 bg-[#131A26] p-1">
            <button
              type="button"
              onClick={() => setStudioTab('character')}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-colors cursor-pointer ${
                studioTab === 'character'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <User className="h-4 w-4" />
              <span>Skins de Personagem 3D</span>
            </button>
            <button
              type="button"
              onClick={() => setStudioTab('moves')}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-colors cursor-pointer ${
                studioTab === 'moves'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Box className="h-4 w-4" />
              <span>Skins das 6 Jogadas</span>
            </button>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-[#131A26] px-4 py-2.5">
            <Coins className="h-4 w-4 text-amber-400" />
            <span className="text-xs text-slate-400">Saldo:</span>
            <span className="font-mono-num text-base font-bold text-amber-300">
              {player.coins} moedas
            </span>
          </div>
        </div>
      </div>

      {/* 1. 3D Character Customizer */}
      {studioTab === 'character' ? (
        <CharacterCustomizer3D
          player={player}
          onSaveCustomization={async (custom) => {
            await saveCharacterCustomization(player.uid, custom);
          }}
        />
      ) : (
        /* 2. 3D Card & Totem Showcase */
        <SkinInspector3D skin={inspectedSkin} />
      )}

      {/* Move Cards Catalog Section */}
      <div className="space-y-4 pt-2">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <h2 className="font-display text-xl font-extrabold text-white">
            Catálogo de Skins das 6 Jogadas ({SKINS_CATALOG.length})
          </h2>

          {/* Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-white/10 bg-[#131A26] p-1">
            <button
              type="button"
              onClick={() => setFilterMove('all')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                filterMove === 'all'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Todas ({SKINS_CATALOG.length})
            </button>
            {MOVE_ORDER.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setFilterMove(m);
                  setStudioTab('moves');
                  const firstForMove = SKINS_CATALOG.find(
                    (s) => s.moveId === m && s.cost > 0
                  );
                  if (firstForMove) setInspectedSkinId(firstForMove.id);
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                  filterMove === m
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {MOVES[m].name}
              </button>
            ))}
          </div>
        </div>

        {errorMsg && (
          <div className="rounded-lg border border-red-500/40 bg-red-950/40 px-4 py-2.5 text-xs text-red-300">
            {errorMsg}
          </div>
        )}

        {/* Skins Grid */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filteredSkins.map((skin) => {
            const isUnlocked = player.unlockedSkins.includes(skin.id);
            const isEquipped = player.equippedSkins[skin.moveId] === skin.id;
            const isInspected = inspectedSkin.id === skin.id;
            const canAfford = player.coins >= skin.cost;

            return (
              <div
                key={skin.id}
                onClick={() => {
                  setStudioTab('moves');
                  setInspectedSkinId(skin.id);
                }}
                className={`flex flex-col justify-between rounded-2xl border p-4 space-y-4 transition-all cursor-pointer ${
                  isInspected && studioTab === 'moves'
                    ? 'border-amber-400 bg-[#172030] ring-1 ring-amber-400/50 shadow-lg shadow-amber-500/10'
                    : 'border-white/10 bg-[#131A26] hover:border-white/25'
                }`}
              >
                <div className="flex flex-col sm:flex-row gap-3.5 items-stretch sm:items-start">
                  <div className="w-full max-w-[168px] mx-auto sm:mx-0 sm:w-[116px] shrink-0 overflow-hidden">
                    <MoveCard
                      moveId={skin.moveId}
                      skinId={skin.id}
                      selected={isInspected && studioTab === 'moves'}
                      compact
                      onClick={() => {
                        setStudioTab('moves');
                        setInspectedSkinId(skin.id);
                      }}
                    />
                  </div>
                  <div className="flex-1 min-w-0 overflow-hidden space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <span
                        className="text-xs font-bold break-words"
                        style={{ color: skin.accentColor }}
                      >
                        {skin.rarity} · {MOVES[skin.moveId].name}
                      </span>
                      {skin.customImage && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-300 shrink-0">
                          <Sparkles className="h-3 w-3" />
                          Arte Exclusiva
                        </span>
                      )}
                    </div>
                    <h3 className="font-display text-base font-bold text-white break-words">
                      {skin.name}
                    </h3>
                    <p className="text-xs leading-relaxed text-slate-400 break-words">
                      {skin.description}
                    </p>
                    <div className="pt-1 text-[11px] font-medium text-slate-300 flex items-center gap-1.5 min-w-0">
                      <Box className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                      <span className="break-words">{skin.material3d?.finishLabel ?? 'Acabamento 3D'}</span>
                    </div>
                  </div>
                </div>

                <div
                  className="flex items-center justify-between border-t border-white/10 pt-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="font-mono-num text-sm font-bold text-amber-300">
                    {skin.cost === 0 ? 'Grátis' : `${skin.cost} moedas`}
                  </div>

                  {isEquipped ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                      <Check className="h-4 w-4" />
                      Equipada
                    </span>
                  ) : isUnlocked ? (
                    <button
                      type="button"
                      disabled={busyId === skin.id}
                      onClick={() => handleEquip(skin)}
                      className="rounded-lg border border-white/20 bg-[#0B0F17] px-4 py-2 text-xs font-bold text-white hover:border-amber-400 cursor-pointer"
                    >
                      Equipar
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={!canAfford || busyId === skin.id}
                      onClick={() => handleBuy(skin)}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold transition-colors ${
                        canAfford
                          ? 'bg-amber-500 text-slate-950 hover:bg-amber-400 cursor-pointer'
                          : 'border border-white/10 bg-[#0B0F17] text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      {!canAfford && <Lock className="h-3.5 w-3.5" />}
                      <span>{busyId === skin.id ? 'Comprando...' : 'Comprar Skin'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
};
