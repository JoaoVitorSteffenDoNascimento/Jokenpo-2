import React from 'react';
import { Swords, UserPlus, UserX, Check, X } from 'lucide-react';
import { getEloInfo } from '../constants/gameData';
import {
  acceptFriendRequest,
  createMatchRoom,
  removeFriendship,
  sendDuelInvite,
  sendFriendRequestByNickname,
} from '../firebase/services';
import {
  Friendship,
  MatchFormat,
  MatchMode,
  PlayerProfile,
} from '../types/game';

interface FriendsViewProps {
  player: PlayerProfile;
  friendships: Friendship[];
  allPlayers: PlayerProfile[];
  onEnterOnlineMatch: (matchId: string) => void;
}

export const FriendsView: React.FC<FriendsViewProps> = ({
  player,
  friendships,
  allPlayers,
  onEnterOnlineMatch,
}) => {
  const [searchNick, setSearchNick] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [challengeMode, setChallengeMode] = React.useState<MatchMode>('1v1');
  const [challengeFormat, setChallengeFormat] = React.useState<MatchFormat>('MD3');
  const [challengeFriendly, setChallengeFriendly] = React.useState(true);
  const [feedback, setFeedback] = React.useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const pendingIncoming = friendships.filter(
    (f) => f.status === 'pending' && f.requesterUid !== player.uid
  );
  const pendingSent = friendships.filter(
    (f) => f.status === 'pending' && f.requesterUid === player.uid
  );
  const accepted = friendships.filter((f) => f.status === 'accepted');

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setBusy(true);
    try {
      await sendFriendRequestByNickname(player, searchNick);
      setSearchNick('');
      setFeedback({
        type: 'success',
        text: 'Solicitação de amizade enviada!',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Erro ao enviar solicitação.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleChallengeFriend = async (friendUid: string) => {
    setFeedback(null);
    setBusy(true);
    try {
      const room = await createMatchRoom({
        player,
        mode: challengeMode,
        format: challengeFormat,
        isFriendly: challengeFriendly,
        isPublicQueue: false,
      });
      await sendDuelInvite({
        fromPlayer: player,
        toUid: friendUid,
        match: room,
      });
      onEnterOnlineMatch(room.id);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Erro ao desafiar amigo.',
      });
    } finally {
      setBusy(false);
    }
  };

  const resolveFriendProfile = (f: Friendship) => {
    const otherUid = f.users.find((u) => u !== player.uid) ?? '';
    const live = allPlayers.find((p) => p.uid === otherUid);
    const snap = f.profiles?.[otherUid];
    return {
      uid: otherUid,
      nickname: live?.nickname ?? snap?.nickname ?? 'Jogador',
      turma: live?.turma ?? snap?.turma ?? 'INF1M',
      trophies: live?.trophies ?? snap?.trophies ?? 0,
    };
  };

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold text-white">
          Amigos & Duelos Diretos
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Adicione colegas pelo nickname único e envie convites diretos para duelos amistosos, em duplas ou trios.
        </p>
      </div>

      {/* Add Friend Form */}
      <section className="rounded-2xl border border-white/10 bg-[#131A26] p-6 space-y-4">
        <form
          onSubmit={handleAddFriend}
          className="flex flex-col gap-3 sm:flex-row sm:items-center"
        >
          <input
            type="text"
            value={searchNick}
            onChange={(e) => setSearchNick(e.target.value)}
            placeholder="Digite o nickname único do amigo (ex: enzo_inf2m)"
            className="flex-1 rounded-xl border border-white/15 bg-[#0B0F17] px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || searchNick.trim().length < 3}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            <UserPlus className="h-4 w-4" />
            <span>Adicionar Amigo</span>
          </button>
        </form>

        {feedback && (
          <div
            className={`rounded-lg border px-4 py-2.5 text-xs font-medium ${
              feedback.type === 'success'
                ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300'
                : 'border-red-500/40 bg-red-950/40 text-red-300'
            }`}
          >
            {feedback.text}
          </div>
        )}
      </section>

      {/* Pending Requests */}
      {pendingIncoming.length > 0 && (
        <section className="rounded-2xl border border-amber-500/30 bg-[#131A26] p-5 space-y-3">
          <h2 className="font-display text-base font-bold text-amber-400">
            Solicitações Recebidas ({pendingIncoming.length})
          </h2>
          <div className="divide-y divide-white/10">
            {pendingIncoming.map((f) => {
              const other = resolveFriendProfile(f);
              return (
                <div
                  key={f.id}
                  className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                >
                  <div>
                    <div className="font-bold text-white">{other.nickname}</div>
                    <div className="text-xs text-slate-400">
                      {other.turma} · {other.trophies} troféus
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => acceptFriendRequest(f)}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-emerald-400 cursor-pointer"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Aceitar
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFriendship(f.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                      Recusar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Challenge Config Bar + Accepted Friends */}
      <section className="rounded-2xl border border-white/10 bg-[#131A26] p-6 space-y-5">
        <div className="flex flex-col justify-between gap-4 border-b border-white/10 pb-4 md:flex-row md:items-center">
          <div>
            <h2 className="font-display text-lg font-bold text-white">
              Lista de Amigos ({accepted.length})
            </h2>
            <p className="text-xs text-slate-400">
              Configure o formato abaixo para desafiar um amigo diretamente
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={challengeMode}
              onChange={(e) => setChallengeMode(e.target.value as MatchMode)}
              className="rounded-lg border border-white/15 bg-[#0B0F17] px-3 py-1.5 text-xs font-semibold text-white"
            >
              <option value="1v1">1v1 Solo</option>
              <option value="2v2">Duplas 2v2</option>
              <option value="3v3">Trios 3v3</option>
            </select>

            <select
              value={challengeFormat}
              onChange={(e) => setChallengeFormat(e.target.value as MatchFormat)}
              className="rounded-lg border border-white/15 bg-[#0B0F17] px-3 py-1.5 text-xs font-semibold text-white"
            >
              <option value="MD3">MD3</option>
              <option value="MD5">MD5</option>
            </select>

            <button
              type="button"
              onClick={() => setChallengeFriendly((v) => !v)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                challengeFriendly
                  ? 'border-sky-400/60 bg-sky-500/15 text-sky-300'
                  : 'border-amber-400/60 bg-amber-500/15 text-amber-300'
              }`}
            >
              {challengeFriendly ? 'Amistoso' : 'Ranqueado'}
            </button>
          </div>
        </div>

        {accepted.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-[#0B0F17]/60 p-8 text-center text-sm text-slate-400">
            Você ainda não adicionou amigos. Busque pelo nickname acima para começar.
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {accepted.map((f) => {
              const other = resolveFriendProfile(f);
              const elo = getEloInfo(other.trophies);
              return (
                <div
                  key={f.id}
                  className="flex flex-col justify-between gap-3 py-3.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center"
                >
                  <div>
                    <div className="font-bold text-white">{other.nickname}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
                      <span className="font-semibold text-slate-300">{other.turma}</span>
                      <span aria-hidden="true">·</span>
                      <span className={elo.tier.badgeTextClass}>{elo.tier.name}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-num text-amber-400">
                        {other.trophies} troféus
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleChallengeFriend(other.uid)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3.5 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 cursor-pointer"
                    >
                      <Swords className="h-3.5 w-3.5" />
                      <span>Desafiar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFriendship(f.id)}
                      aria-label={`Remover ${other.nickname}`}
                      className="rounded-lg border border-white/10 p-2 text-slate-400 hover:border-red-400/50 hover:text-red-400 cursor-pointer"
                    >
                      <UserX className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {pendingSent.length > 0 && (
          <div className="border-t border-white/10 pt-4">
            <div className="text-xs font-semibold text-slate-400 mb-2">
              Pedidos enviados aguardando resposta
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-slate-300">
              {pendingSent.map((f) => {
                const other = resolveFriendProfile(f);
                return (
                  <div
                    key={f.id}
                    className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#0B0F17] px-3 py-1.5"
                  >
                    <span>{other.nickname}</span>
                    <button
                      type="button"
                      onClick={() => removeFriendship(f.id)}
                      className="text-slate-500 hover:text-red-400 cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </main>
  );
};
