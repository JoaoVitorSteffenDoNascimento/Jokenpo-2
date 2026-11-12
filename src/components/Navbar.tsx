import React from 'react';
import {
  Download,
  LogOut,
  Menu,
  Shield,
  Smartphone,
  Swords,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { PlayerProfile } from '../types/game';
import { vibrateTap } from '../utils/haptics';

export type AppTab = 'arena' | 'rankings' | 'skins' | 'friends';

interface NavbarProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  player: PlayerProfile | null;
  onSignIn: () => void;
  onSignOut: () => void;
  onOpenDeployGuide: () => void;
  authLoading: boolean;
  hideMobileBottomNav?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onSelectTab,
  player,
  onSignIn,
  onSignOut,
  onOpenDeployGuide,
  authLoading,
  hideMobileBottomNav = false,
}) => {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const { isInstallable, isInstalled, install } = usePWAInstall();

  const navItems: {
    id: AppTab;
    label: string;
    shortLabel: string;
    Icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: 'arena', label: 'Mesa 3D & Lobby', shortLabel: 'Arena', Icon: Swords },
    { id: 'rankings', label: 'Rankings', shortLabel: 'Rankings', Icon: Trophy },
    { id: 'skins', label: 'Arsenal 3D & Skins', shortLabel: 'Arsenal', Icon: Shield },
    { id: 'friends', label: 'Amigos', shortLabel: 'Amigos', Icon: Users },
  ];

  return (
    <>
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0B0F17]">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-4 py-3.5 sm:px-6">
        {/* Zone 1: Single-element Brand Wordmark */}
        <button
          type="button"
          onClick={() => onSelectTab('arena')}
          className="font-display text-xl font-extrabold tracking-tight text-white whitespace-nowrap shrink-0 cursor-pointer hover:text-amber-400 transition-colors"
        >
          Jokenpo 2
        </button>

        {/* Zone 2: 4 clean single-line text nav links */}
        {player ? (
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  className={`relative py-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    active
                      ? 'text-amber-400 font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {item.label}
                  {active && (
                    <span className="absolute inset-x-0 -bottom-[15px] h-0.5 bg-amber-400" />
                  )}
                </button>
              );
            })}
          </nav>
        ) : (
          <div className="hidden md:block" />
        )}

        {/* Zone 3: Install App + APK / Play Store / Deploy + Auth */}
        <div className="flex items-center gap-2 shrink-0">
          {isInstallable && !isInstalled && (
            <button
              type="button"
              onClick={install}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-extrabold text-slate-950 hover:bg-emerald-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Instalar App</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenDeployGuide}
            className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-300 hover:border-amber-400 hover:bg-amber-500/20 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Smartphone className="h-3.5 w-3.5" />
            <span>GitHub Pages / APK</span>
          </button>

          {player ? (
            <>
              <button
                type="button"
                onClick={onSignOut}
                className="hidden md:inline-flex items-center gap-2 rounded-lg border border-white/15 bg-[#131A26] px-4 py-2 text-xs font-semibold text-slate-200 hover:border-white/30 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Sair</span>
              </button>
              <button
                type="button"
                onClick={() => setMobileOpen((v) => !v)}
                aria-label="Abrir menu"
                className="inline-flex md:hidden items-center justify-center rounded-lg border border-white/15 bg-[#131A26] p-2 text-slate-200 hover:text-white cursor-pointer"
              >
                {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={authLoading}
              onClick={onSignIn}
              className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {authLoading ? 'Conectando...' : 'Entrar com Google'}
            </button>
          )}
        </div>
      </div>

      {/* Mobile drawer */}
      {player && mobileOpen && (
        <div className="border-t border-white/10 bg-[#0B0F17] px-4 py-3 md:hidden">
          <div className="flex flex-col gap-1">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelectTab(item.id);
                    setMobileOpen(false);
                  }}
                  className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-left cursor-pointer ${
                    active
                      ? 'bg-[#1A2333] text-amber-400'
                      : 'text-slate-300 hover:bg-[#131A26]'
                  }`}
                >
                  <span>{item.label}</span>
                </button>
              );
            })}
            {isInstallable && !isInstalled && (
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  install();
                }}
                className="mt-1 flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-2.5 text-sm font-extrabold text-slate-950 cursor-pointer"
              >
                <Download className="h-4 w-4" />
                <span>Instalar Aplicativo no Celular</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                onOpenDeployGuide();
              }}
              className="mt-1 flex items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2.5 text-sm font-semibold text-amber-300 cursor-pointer"
            >
              <Smartphone className="h-4 w-4" />
              <span>Gerar APK Android / Play Store / Deploy</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                onSignOut();
              }}
              className="mt-1 flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2.5 text-sm font-medium text-slate-300 hover:text-white cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              <span>Sair da conta</span>
            </button>
          </div>
        </div>
      )}
    </header>

      {/* Mobile fixed thumb-zone bottom bar (hidden during live 3D match) */}
      {player && !hideMobileBottomNav && (
        <nav
          aria-label="Navegação principal mobile"
          className="fixed bottom-0 inset-x-0 z-30 border-t border-white/10 bg-[#0B0F17]/95 md:hidden pb-[env(safe-area-inset-bottom)]"
        >
          <div className="grid grid-cols-4">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              const Icon = item.Icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    vibrateTap();
                    setMobileOpen(false);
                    onSelectTab(item.id);
                  }}
                  className={`flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 py-1.5 text-[11px] font-semibold transition-colors active:scale-95 cursor-pointer ${
                    active ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Icon className={`h-5 w-5 ${active ? 'text-amber-400' : 'text-slate-400'}`} />
                  <span className="truncate">{item.shortLabel}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </>
  );
};
