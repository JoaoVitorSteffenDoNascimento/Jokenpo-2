import React from 'react';
import { Crown, Trophy } from 'lucide-react';
import {
  getCurrentSeasonMonthKey,
  getDaysLeftInSeason,
  getEloInfo,
} from '../constants/gameData';
import { PlayerProfile, TURMAS, Turma } from '../types/game';

interface RankingsViewProps {
  players: PlayerProfile[];
  currentPlayer: PlayerProfile;
}

type RankingTab = 'global' | 'regional' | 'pro' | 'turmas';

function formatSeasonMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month) return monthKey;
  return new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, 1));
}

export const RankingsView: React.FC<RankingsViewProps> = ({
  players,
  currentPlayer,
}) => {
  const [tab, setTab] = React.useState<RankingTab>('global');
  const [selectedTurma, setSelectedTurma] = React.useState<Turma>(
    currentPlayer.turma
  );

  const regionalPlayers = React.useMemo(
    () => players.filter((p) => p.turma === selectedTurma),
    [players, selectedTurma]
  );

  const currentSeasonKey = getCurrentSeasonMonthKey();
  const daysLeftInSeason = getDaysLeftInSeason();

  const proSeasonPlayers = React.useMemo(() => {
    return players
      .filter((p) => p.trophies >= 10000)
      .sort((a, b) => {
        const aSeason =
          a.proSeasonMonth === currentSeasonKey
            ? a.proSeasonTrophies ?? Math.max(0, a.trophies - 10000)
            : Math.max(0, a.trophies - 10000);
        const bSeason =
          b.proSeasonMonth === currentSeasonKey
            ? b.proSeasonTrophies ?? Math.max(0, b.trophies - 10000)
            : Math.max(0, b.trophies - 10000);
        if (bSeason !== aSeason) return bSeason - aSeason;
        return b.trophies - a.trophies;
      });
  }, [players, currentSeasonKey]);

  const turmaStandings = React.useMemo(() => {
    const map = new Map<
      Turma,
      { turma: Turma; totalTrophies: number; memberCount: number; topPlayer: string }
    >();
    for (const t of TURMAS) {
      map.set(t, { turma: t, totalTrophies: 0, memberCount: 0, topPlayer: '—' });
    }
    for (const p of players) {
      const entry = map.get(p.turma);
      if (!entry) continue;
      if (entry.memberCount === 0) {
        entry.topPlayer = p.nickname;
      }
      entry.totalTrophies += p.trophies;
      entry.memberCount += 1;
    }
    return Array.from(map.values()).sort(
      (a, b) => b.totalTrophies - a.totalTrophies
    );
  }, [players]);

  const activeList =
    tab === 'global'
      ? players
      : tab === 'regional'
      ? regionalPlayers
      : proSeasonPlayers;

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-white">
            Rankings da Arena
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Classificação Top Global, Top Regional por Turma, Temporada Pro mensal e Guerra das Turmas.
          </p>
        </div>

        {/* Interactive segmented filter tabs */}
        <div className="flex flex-wrap items-center gap-1 rounded-xl bg-[#131A26] p-1 border border-white/10">
          <button
            type="button"
            onClick={() => setTab('global')}
            className={`rounded-lg px-4 py-2 text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              tab === 'global'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Top Global
          </button>
          <button
            type="button"
            onClick={() => setTab('regional')}
            className={`rounded-lg px-4 py-2 text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              tab === 'regional'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Top Regional (Turma)
          </button>
          <button
            type="button"
            onClick={() => setTab('pro')}
            className={`rounded-lg px-4 py-2 text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              tab === 'pro'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Temporada Pro
          </button>
          <button
            type="button"
            onClick={() => setTab('turmas')}
            className={`rounded-lg px-4 py-2 text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              tab === 'turmas'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Guerra das Turmas
          </button>
        </div>
      </div>

      {/* Turma Filter Grid for Regional Tab */}
      {tab === 'regional' && (
        <div className="rounded-2xl border border-white/10 bg-[#131A26] p-4">
          <div className="mb-2.5 text-xs font-semibold text-slate-400">
            Filtrar por Turma
          </div>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
            {TURMAS.map((t) => {
              const active = selectedTurma === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setSelectedTurma(t)}
                  className={`rounded-lg border py-2 text-xs font-bold transition-colors cursor-pointer ${
                    active
                      ? 'border-amber-400 bg-amber-500/20 text-amber-300'
                      : 'border-white/10 bg-[#0B0F17] text-slate-300 hover:border-white/25'
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Pro Monthly Season Banner */}
      {tab === 'pro' && (
        <div className="flex flex-col justify-between gap-3 rounded-2xl border border-amber-400/30 bg-[#131A26] p-5 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <Crown className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            <div>
              <h2 className="font-display text-base font-bold text-white capitalize">
                Temporada Pro · {formatSeasonMonthLabel(currentSeasonKey)}
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Jogadores a partir de 10.000 troféus competem por pontos extras da temporada. Todo mês o ranking Pro reinicia para 10.000 troféus.
              </p>
            </div>
          </div>
          <div className="font-mono-num shrink-0 text-xs font-bold text-amber-300">
            Reset em {daysLeftInSeason} {daysLeftInSeason === 1 ? 'dia' : 'dias'}
          </div>
        </div>
      )}

      {/* Player Table (Global, Regional & Pro Season) */}
      {tab !== 'turmas' ? (
        <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#131A26]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/10 bg-[#0B0F17] text-xs text-slate-400">
                <tr>
                  <th className="px-5 py-3.5 font-semibold">Pos.</th>
                  <th className="px-5 py-3.5 font-semibold">Jogador</th>
                  <th className="px-5 py-3.5 font-semibold">Turma</th>
                  <th className="px-5 py-3.5 font-semibold">Elo</th>
                  <th className="px-5 py-3.5 font-semibold text-right">V / D</th>
                  <th className="px-5 py-3.5 font-semibold text-right">
                    {tab === 'pro' ? 'Troféus Pro (Temporada)' : 'Troféus'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {activeList.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-12 text-center text-sm text-slate-400"
                    >
                      {tab === 'pro'
                        ? 'Nenhum jogador atingiu o elo Pro (10.000+ troféus) nesta temporada ainda.'
                        : 'Nenhum jogador cadastrado nesta turma ainda.'}
                    </td>
                  </tr>
                ) : (
                  activeList.map((p, index) => {
                    const rank = index + 1;
                    const elo = getEloInfo(p.trophies);
                    const isSelf = p.uid === currentPlayer.uid;
                    const seasonPts =
                      p.proSeasonMonth === currentSeasonKey
                        ? p.proSeasonTrophies ?? Math.max(0, p.trophies - 10000)
                        : Math.max(0, p.trophies - 10000);
                    return (
                      <tr
                        key={p.uid}
                        className={
                          isSelf ? 'bg-amber-500/10' : 'hover:bg-white/[0.02]'
                        }
                      >
                        <td className="font-mono-num px-5 py-3.5 font-bold">
                          <span
                            className={
                              rank === 1
                                ? 'text-amber-400'
                                : rank === 2
                                ? 'text-slate-200'
                                : rank === 3
                                ? 'text-orange-400'
                                : 'text-slate-400'
                            }
                          >
                            #{rank}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 font-semibold text-white">
                          {p.nickname}
                          {isSelf && (
                            <span className="ml-2 text-xs font-normal text-amber-400">
                              (Você)
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-xs font-semibold text-slate-300">
                          {p.turma}
                        </td>
                        <td className={`px-5 py-3.5 text-xs font-semibold ${elo.tier.badgeTextClass}`}>
                          {elo.tier.name}
                        </td>
                        <td className="font-mono-num px-5 py-3.5 text-right text-xs text-slate-300">
                          {p.wins} / {p.losses}
                        </td>
                        <td className="font-mono-num px-5 py-3.5 text-right font-bold text-amber-400">
                          <span className="inline-flex items-center justify-end gap-1.5">
                            <Trophy className="h-3.5 w-3.5" />
                            <span>
                              {tab === 'pro'
                                ? `+${seasonPts} (${p.trophies})`
                                : p.trophies}
                            </span>
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        /* Inter-Turmas Standings */
        <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#131A26]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/10 bg-[#0B0F17] text-xs text-slate-400">
                <tr>
                  <th className="px-5 py-3.5 font-semibold">Pos.</th>
                  <th className="px-5 py-3.5 font-semibold">Turma</th>
                  <th className="px-5 py-3.5 font-semibold">Líder da Turma</th>
                  <th className="px-5 py-3.5 font-semibold text-right">Alunos</th>
                  <th className="px-5 py-3.5 font-semibold text-right">Média</th>
                  <th className="px-5 py-3.5 font-semibold text-right">Total de Troféus</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {turmaStandings.map((row, index) => {
                  const isMyTurma = row.turma === currentPlayer.turma;
                  const avg =
                    row.memberCount > 0
                      ? Math.round(row.totalTrophies / row.memberCount)
                      : 0;
                  return (
                    <tr
                      key={row.turma}
                      className={
                        isMyTurma ? 'bg-amber-500/10' : 'hover:bg-white/[0.02]'
                      }
                    >
                      <td className="font-mono-num px-5 py-3.5 font-bold text-slate-300">
                        #{index + 1}
                      </td>
                      <td className="px-5 py-3.5 font-bold text-white">
                        {row.turma}
                        {isMyTurma && (
                          <span className="ml-2 text-xs font-normal text-amber-400">
                            (Sua Turma)
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-slate-300">
                        {row.topPlayer}
                      </td>
                      <td className="font-mono-num px-5 py-3.5 text-right text-slate-300">
                        {row.memberCount}
                      </td>
                      <td className="font-mono-num px-5 py-3.5 text-right text-slate-300">
                        {avg}
                      </td>
                      <td className="font-mono-num px-5 py-3.5 text-right font-bold text-amber-400">
                        {row.totalTrophies}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
};
