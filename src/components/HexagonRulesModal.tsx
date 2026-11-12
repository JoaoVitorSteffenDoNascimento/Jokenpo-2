import React from 'react';
import { X } from 'lucide-react';
import { MOVE_ORDER, MOVES } from '../constants/gameData';
import { MoveId } from '../types/game';

interface HexagonRulesModalProps {
  open: boolean;
  onClose: () => void;
}

const NODE_POSITIONS: Record<MoveId, { x: number; y: number }> = {
  papel: { x: 220, y: 48 },
  parafal: { x: 375, y: 138 },
  pedra: { x: 375, y: 312 },
  gelo_invertido: { x: 220, y: 402 },
  tesoura: { x: 65, y: 312 },
  jegue: { x: 65, y: 138 },
};

export const HexagonRulesModal: React.FC<HexagonRulesModalProps> = ({
  open,
  onClose,
}) => {
  const [focusedMove, setFocusedMove] = React.useState<MoveId>('parafal');

  if (!open) return null;

  const focused = MOVES[focusedMove];

  // Build all 12 directed victory edges
  const edges: { from: MoveId; to: MoveId }[] = [];
  for (const m of MOVE_ORDER) {
    edges.push({ from: m, to: MOVES[m].beats[0] });
    edges.push({ from: m, to: MOVES[m].beats[1] });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rules-title"
    >
      <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-white/15 bg-[#131A26] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <h2 id="rules-title" className="font-display text-xl font-bold text-white">
              Regras do Hexágono — Jokenpo 2
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Cada uma das 6 jogadas vence 2 oponentes, perde para 2 e empata com a oposta.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar regras"
            className="rounded-lg border border-white/10 p-2 text-slate-300 hover:bg-white/5 hover:text-white cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-12">
          {/* Interactive SVG Hexagon */}
          <div className="md:col-span-7 flex flex-col items-center justify-center rounded-xl border border-white/10 bg-[#0B0F17] p-4">
            <svg viewBox="0 0 440 450" className="w-full max-w-[380px] select-none">
              <defs>
                <marker
                  id="arrow-win"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#10B981" />
                </marker>
                <marker
                  id="arrow-lose"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#EF4444" />
                </marker>
                <marker
                  id="arrow-dim"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#334155" />
                </marker>
              </defs>

              {edges.map(({ from, to }) => {
                const p1 = NODE_POSITIONS[from];
                const p2 = NODE_POSITIONS[to];
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const len = Math.hypot(dx, dy);
                const offset = 36;
                const x1 = p1.x + (dx / len) * offset;
                const y1 = p1.y + (dy / len) * offset;
                const x2 = p2.x - (dx / len) * offset;
                const y2 = p2.y - (dy / len) * offset;

                const isWin = from === focusedMove;
                const isLoss = to === focusedMove;

                const stroke = isWin
                  ? '#10B981'
                  : isLoss
                  ? '#EF4444'
                  : '#1E293B';
                const marker = isWin
                  ? 'url(#arrow-win)'
                  : isLoss
                  ? 'url(#arrow-lose)'
                  : 'url(#arrow-dim)';

                return (
                  <line
                    key={`${from}-${to}`}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={stroke}
                    strokeWidth={isWin || isLoss ? 2.5 : 1.2}
                    strokeOpacity={isWin || isLoss ? 1 : 0.7}
                    markerEnd={marker}
                  />
                );
              })}

              {MOVE_ORDER.map((id) => {
                const pos = NODE_POSITIONS[id];
                const isSelected = id === focusedMove;
                const isBeat = focused.beats.includes(id);
                const isLoser = focused.losesTo.includes(id);

                let strokeColor = '#475569';
                let fillColor = '#131A26';
                if (isSelected) {
                  strokeColor = '#F59E0B';
                  fillColor = '#271E0B';
                } else if (isBeat) {
                  strokeColor = '#10B981';
                  fillColor = '#0A221B';
                } else if (isLoser) {
                  strokeColor = '#EF4444';
                  fillColor = '#281014';
                }

                return (
                  <g
                    key={id}
                    onClick={() => setFocusedMove(id)}
                    className="cursor-pointer"
                  >
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r={32}
                      fill={fillColor}
                      stroke={strokeColor}
                      strokeWidth={isSelected ? 3 : 2}
                    />
                    <text
                      x={pos.x}
                      y={pos.y + 4}
                      textAnchor="middle"
                      fill="#F8FAFC"
                      fontSize="11"
                      fontWeight="700"
                    >
                      {MOVES[id].shortName}
                    </text>
                  </g>
                );
              })}
            </svg>
            <p className="mt-2 text-xs text-slate-400">
              Clique em qualquer jogada no hexágono para inspecionar os confrontos.
            </p>
          </div>

          {/* Focused Move Details */}
          <div className="md:col-span-5 flex flex-col justify-between gap-4">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <img
                  src={focused.image}
                  alt={focused.name}
                  referrerPolicy="no-referrer"
                  className="h-14 w-14 rounded-xl border border-amber-400/40 object-cover"
                />
                <div>
                  <h3 className="font-display text-lg font-bold text-white">
                    {focused.name}
                  </h3>
                  <p className="text-xs text-slate-300">{focused.tagline}</p>
                </div>
              </div>

              <div className="space-y-3 border-t border-white/10 pt-4 text-sm">
                <div>
                  <div className="text-xs font-semibold text-emerald-400">
                    VENCE DE (2)
                  </div>
                  <div className="mt-1 text-slate-200">
                    {MOVES[focused.beats[0]].name} · {MOVES[focused.beats[1]].name}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-red-400">
                    PERDE PARA (2)
                  </div>
                  <div className="mt-1 text-slate-200">
                    {MOVES[focused.losesTo[0]].name} · {MOVES[focused.losesTo[1]].name}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-400">
                    EMPATA COM
                  </div>
                  <div className="mt-1 text-slate-300">
                    {focused.name} · {MOVES[focused.neutralWith].name}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#0B0F17] p-4 text-xs text-slate-300 space-y-1.5">
              <div className="font-semibold text-amber-400">
                Troféus, Caminho & Elos (Estilo Clash Royale)
              </div>
              <p>
                1v1: +10 a +20 (MD3) · +20 a +30 (MD5) · Duplas: +40 a +55 · Trios: +50 a +65
              </p>
              <p>
                Derrota: -10 a -20 (MD3) ou -20 a -30 (MD5) · 3 derrotas seguidas: +25 a +30 troféus.
              </p>
              <p className="text-slate-400 leading-relaxed">
                Novato (0) · Bixo (500) · Segundoanista (1000) · Terceiranista (1500) · Veterano (2250) · Municipal (3000) · Regional (4000) · Estadual (5000) · Nacional (6000) · Continental (7500) · Global (8000) · Pro (10000+ Temporada Mensal)
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
