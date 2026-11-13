import React from 'react';
import { User } from 'firebase/auth';
import { CheckCircle2, AlertCircle, BookOpen, Zap } from 'lucide-react';
import { MOVE_ORDER, MOVES } from '../constants/gameData';
import {
  checkNicknameAvailable,
  createPlayerAccount,
  isLocalArenaUid,
} from '../firebase/services';
import { PlayerProfile, TURMAS, Turma } from '../types/game';

interface AuthOnboardingProps {
  firebaseUser: User | null;
  onSignIn: () => void;
  onEnterLocalArena?: () => void;
  authLoading: boolean;
  onAccountCreated: (profile: PlayerProfile) => void;
  onOpenRules: () => void;
}

export const AuthOnboarding: React.FC<AuthOnboardingProps> = ({
  firebaseUser,
  onSignIn,
  onEnterLocalArena,
  authLoading,
  onAccountCreated,
  onOpenRules,
}) => {
  const [nickname, setNickname] = React.useState('');
  const [turma, setTurma] = React.useState<Turma>('INF1M');
  const [nickStatus, setNickStatus] = React.useState<
    'idle' | 'checking' | 'available' | 'taken' | 'invalid'
  >('idle');
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState('');

  React.useEffect(() => {
    const trimmed = nickname.trim();
    if (!trimmed) {
      setNickStatus('idle');
      return;
    }
    if (
      trimmed.length < 3 ||
      trimmed.length > 20 ||
      !/^[a-zA-Z0-9_.-]+$/.test(trimmed)
    ) {
      setNickStatus('invalid');
      return;
    }

    let cancelled = false;
    setNickStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const available = await checkNicknameAvailable(trimmed);
        if (!cancelled) {
          setNickStatus(available ? 'available' : 'taken');
        }
      } catch {
        if (!cancelled) setNickStatus('idle');
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [nickname]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    setErrorMsg('');
    setSubmitting(true);
    try {
      const profile = await createPlayerAccount(firebaseUser, nickname, turma);
      onAccountCreated(profile);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Erro ao criar conta. Tente novamente.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-16">
      <div className="grid grid-cols-1 items-stretch gap-10 lg:grid-cols-12">
        {/* Left column: Hero & Setup */}
        <div className="flex flex-col justify-between gap-8 lg:col-span-6">
          <div className="space-y-5">
            <p className="text-xs font-semibold tracking-wide text-amber-400">
              INF1M–INF4T · ETM1M–ETM4T · ARENA OFICIAL
            </p>
            <h1 className="font-display text-4xl font-extrabold leading-tight text-white sm:text-5xl [text-wrap:balance]">
              Domine as 6 jogadas e leve sua turma ao topo.
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-slate-300">
              Jokenpo 2 une Papel, Parafal, Pedra, Gelo Invertido, Tesoura e Jegue em duelos
              1v1, Duplas e Trios (MD3 e MD5). Suba pelos 12 Elos de Novato até a Liga Pro,
              colecione skins com moedas diárias e dispute o Top Global, Regional e a Guerra das Turmas.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              {!firebaseUser && (
                <>
                  <button
                    type="button"
                    disabled={authLoading}
                    onClick={onSignIn}
                    className="rounded-lg bg-amber-500 px-6 py-3 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-60 transition-colors cursor-pointer"
                  >
                    {authLoading ? 'Conectando...' : 'Entrar com Google e Jogar'}
                  </button>
                  {onEnterLocalArena && (
                    <button
                      type="button"
                      onClick={onEnterLocalArena}
                      className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-5 py-3 text-sm font-bold text-emerald-300 hover:bg-emerald-500/25 transition-colors cursor-pointer"
                    >
                      <Zap className="h-4 w-4 text-emerald-400" />
                      <span>Entrar Direto (Nickname + Turma)</span>
                    </button>
                  )}
                </>
              )}
              <button
                type="button"
                onClick={onOpenRules}
                className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-[#131A26] px-5 py-3 text-sm font-semibold text-slate-200 hover:border-white/30 hover:text-white transition-colors cursor-pointer"
              >
                <BookOpen className="h-4 w-4 text-amber-400" />
                <span>Ver Diagrama do Hexágono</span>
              </button>
            </div>
          </div>

          {/* Onboarding Form if Google or Local Arena user is signed in without profile */}
          {firebaseUser ? (
            <form
              onSubmit={handleSubmit}
              className="rounded-2xl border border-amber-500/30 bg-[#131A26] p-6 space-y-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl font-bold text-white">
                    Finalize seu cadastro na Arena
                  </h2>
                  <p className="mt-1 text-xs text-slate-400">
                    Seu nickname é único na plataforma e será usado nos duelos, amizades e rankings.
                  </p>
                </div>
                {isLocalArenaUid(firebaseUser.uid) && (
                  <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                    Modo Direto
                  </span>
                )}
              </div>

              <div>
                <label
                  htmlFor="nickname-input"
                  className="block text-xs font-semibold text-slate-300"
                >
                  Nickname único
                </label>
                <input
                  id="nickname-input"
                  type="text"
                  required
                  minLength={3}
                  maxLength={20}
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="ex: enzo_inf2m"
                  className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0B0F17] px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                />
                <div className="mt-1.5 flex items-center gap-1.5 text-xs">
                  {nickStatus === 'checking' && (
                    <span className="text-slate-400">Verificando disponibilidade...</span>
                  )}
                  {nickStatus === 'available' && (
                    <span className="inline-flex items-center gap-1 text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Nickname disponível
                    </span>
                  )}
                  {nickStatus === 'taken' && (
                    <span className="inline-flex items-center gap-1 text-red-400">
                      <AlertCircle className="h-3.5 w-3.5" />
                      Este nickname já está em uso
                    </span>
                  )}
                  {nickStatus === 'invalid' && (
                    <span className="text-amber-400">
                      Use 3–20 caracteres (letras, números, _, . ou -)
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Selecione sua Turma
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {TURMAS.map((t) => {
                    const active = turma === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTurma(t)}
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

              {errorMsg && (
                <div className="rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-xs text-red-300">
                  {errorMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || nickStatus === 'taken' || nickStatus === 'invalid'}
                className="w-full rounded-lg bg-amber-500 py-3 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {submitting ? 'Criando perfil...' : 'Entrar na Arena (+150 moedas iniciais)'}
              </button>
            </form>
          ) : (
            <div className="grid grid-cols-3 gap-4 border-t border-white/10 pt-6">
              <div>
                <div className="font-mono-num text-2xl font-bold text-white">16</div>
                <div className="text-xs text-slate-400">Turmas INF & ETM</div>
              </div>
              <div>
                <div className="font-mono-num text-2xl font-bold text-amber-400">12 Elos</div>
                <div className="text-xs text-slate-400">Novato a Pro</div>
              </div>
              <div>
                <div className="font-mono-num text-2xl font-bold text-white">18</div>
                <div className="text-xs text-slate-400">Skins de jogadas</div>
              </div>
            </div>
          )}
        </div>

        {/* Right column: 6-Move Showcase */}
        <div className="lg:col-span-6 rounded-2xl border border-white/10 bg-[#131A26] p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div>
              <h2 className="font-display text-lg font-bold text-white">
                Arsenal das 6 Jogadas
              </h2>
              <p className="text-xs text-slate-400">
                Sistema simétrico: cada peça vence 2 e perde para 2
              </p>
            </div>
          </div>

          <div className="my-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {MOVE_ORDER.map((m) => {
              const meta = MOVES[m];
              return (
                <div
                  key={m}
                  className="overflow-hidden rounded-xl border border-white/10 bg-[#0B0F17]"
                >
                  <div className="aspect-square w-full overflow-hidden">
                    <img
                      src={meta.image}
                      alt={meta.name}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="p-2.5">
                    <div className="font-display text-sm font-bold text-white">
                      {meta.name}
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-400 line-clamp-2">
                      {meta.tagline}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
};
