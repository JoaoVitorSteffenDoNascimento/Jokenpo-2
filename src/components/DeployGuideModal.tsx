import React from 'react';
import {
  Check,
  Copy,
  Download,
  Globe,
  Rocket,
  ShieldCheck,
  Smartphone,
  X,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface DeployGuideModalProps {
  open: boolean;
  onClose: () => void;
}

const GITHUB_WORKFLOW_YML = `name: Deploy Jokenpo 2 to GitHub Pages

on:
  push:
    branches: ["main", "master"]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js 22
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Install dependencies
        run: npm install --legacy-peer-deps

      - name: Build production bundle for GitHub Pages
        run: |
          npm run build
          cp dist/index.html dist/404.html
          touch dist/.nojekyll

      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist

  deploy:
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
`;

export const DeployGuideModal: React.FC<DeployGuideModalProps> = ({
  open,
  onClose,
}) => {
  const [activePlatform, setActivePlatform] = React.useState<
    'ghpages' | 'apk_playstore' | 'vercel'
  >('ghpages');
  const [copiedCmd, setCopiedCmd] = React.useState<string | null>(null);
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  if (!open) return null;

  const copyCommand = (cmd: string) => {
    navigator.clipboard?.writeText(cmd).catch(() => {});
    setCopiedCmd(cmd);
    setTimeout(() => setCopiedCmd(null), 1800);
  };

  const downloadTextFile = (
    filename: string,
    content: string,
    mime = 'text/yaml'
  ) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadTwaManifest = () => {
    const host = window.location.host || 'seu-usuario.github.io';
    const origin = window.location.origin || 'https://seu-usuario.github.io';
    downloadTextFile(
      'twa-manifest.json',
      JSON.stringify(
        {
          packageId: 'br.edu.jokenpo2.arena',
          host,
          name: 'Jokenpo 2',
          launcherName: 'Jokenpo 2',
          display: 'standalone',
          themeColor: '#0B0F17',
          navigationColor: '#0B0F17',
          backgroundColor: '#0B0F17',
          enableNotifications: true,
          startUrl: './',
          iconUrl: `${origin}/pwa-512x512.png`,
          maskableIconUrl: `${origin}/pwa-maskable-512x512.png`,
          appVersionName: '1.0.0',
          appVersionCode: 1,
          webManifestUrl: `${origin}/manifest.json`,
          fallbackType: 'customtabs',
          minSdkVersion: 21,
          orientation: 'default',
        },
        null,
        2
      ),
      'application/json'
    );
  };

  const ghCliCmd =
    'git init && git add . && git commit -m "Deploy Jokenpo 2" && git branch -M main && git remote add origin https://github.com/SEU-USUARIO/jokenpo-2.git && git push -u origin main';
  const npxGhPagesCmd = 'npm run build:ghpages && npx gh-pages -d dist --dotfiles';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-amber-500/35 bg-[#131A26] p-4 sm:p-6 shadow-2xl space-y-5">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-amber-400">
              <Rocket className="h-4 w-4" />
              <span>GitHub Pages + PWA + APK Android Prontos</span>
            </div>
            <h2 className="font-display text-xl sm:text-2xl font-extrabold text-white">
              Lançar no GitHub Pages, Vercel ou Play Store
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar guia"
            className="rounded-lg border border-white/15 bg-[#0B0F17] p-2 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Platform Switcher */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 rounded-xl bg-[#0B0F17] p-1.5">
          <button
            type="button"
            onClick={() => setActivePlatform('ghpages')}
            className={`rounded-lg py-2.5 px-3 text-xs font-bold transition-colors cursor-pointer ${
              activePlatform === 'ghpages'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            GitHub Pages (Automático)
          </button>
          <button
            type="button"
            onClick={() => setActivePlatform('apk_playstore')}
            className={`rounded-lg py-2.5 px-3 text-xs font-bold transition-colors cursor-pointer ${
              activePlatform === 'apk_playstore'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            APK Android & Play Store
          </button>
          <button
            type="button"
            onClick={() => setActivePlatform('vercel')}
            className={`rounded-lg py-2.5 px-3 text-xs font-bold transition-colors cursor-pointer ${
              activePlatform === 'vercel'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Deploy Vercel
          </button>
        </div>

        {activePlatform === 'ghpages' ? (
          <div className="space-y-4 text-xs sm:text-sm text-slate-300">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/35 bg-emerald-950/30 p-3.5 text-xs text-emerald-200">
              <span>
                O projeto já está 100% configurado para subpastas do GitHub Pages (
                <code className="font-mono-num font-bold text-white">base: &apos;./&apos;</code>,{' '}
                <code className="font-mono-num font-bold text-white">404.html</code>,{' '}
                <code className="font-mono-num font-bold text-white">.nojekyll</code> e{' '}
                <code className="font-mono-num font-bold text-white">.github/workflows/deploy.yml</code>).
              </span>
              <button
                type="button"
                onClick={() => downloadTextFile('deploy.yml', GITHUB_WORKFLOW_YML)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-[11px] font-extrabold text-slate-950 hover:bg-emerald-400 cursor-pointer shrink-0"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Baixar deploy.yml</span>
              </button>
            </div>

            {/* Option A: Direct from AI Studio Top Bar + GitHub Actions */}
            <div className="rounded-xl border border-white/10 bg-[#0B0F17] p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-sm font-extrabold text-amber-400">
                  Opção 1 (Sem Terminal): Exportar para o GitHub + GitHub Actions
                </span>
                <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                  Recomendado
                </span>
              </div>
              <ol className="space-y-2 list-decimal list-inside text-xs text-slate-300">
                <li>
                  Clique no ícone do <strong>GitHub / Exportar</strong> no topo direito do Google AI Studio (ou baixe o ZIP do projeto) e envie para um repositório (ex:{' '}
                  <code className="font-mono-num text-white">jokenpo-2</code>).
                </li>
                <li>
                  No seu repositório do GitHub, clique em <strong>Settings → Pages</strong> (no menu lateral esquerdo).
                </li>
                <li>
                  Em <strong>Build and deployment → Source</strong>, mude de <em>Deploy from a branch</em> para{' '}
                  <strong className="text-amber-300">GitHub Actions</strong>.
                </li>
                <li>
                  Pronto! O workflow <code className="font-mono-num text-white">Deploy Jokenpo 2 to GitHub Pages</code> vai rodar sozinho e publicar em:{' '}
                  <code className="font-mono-num text-emerald-300">
                    https://SEU-USUARIO.github.io/jokenpo-2/
                  </code>
                </li>
              </ol>
            </div>

            {/* Option B: Instant Terminal Push or npx gh-pages */}
            <div className="rounded-xl border border-white/10 bg-[#0B0F17] p-4 space-y-3">
              <div className="font-display text-sm font-extrabold text-sky-400">
                Opção 2 (Pelo Terminal / VS Code): Publicar com 1 Comando
              </div>
              <p className="text-xs text-slate-400">
                Se você baixou o projeto no computador, pode subir para o GitHub ou publicar direto na branch{' '}
                <code className="font-mono-num text-white">gh-pages</code>:
              </p>

              <div className="space-y-2">
                <div className="text-[11px] font-semibold text-slate-300">
                  A) Subir repositório para o GitHub (aciona o GitHub Actions automaticamente):
                </div>
                <div className="flex items-center justify-between gap-2 rounded-lg border border-white/15 bg-[#131A26] px-3 py-2 font-mono-num text-[11px] text-amber-300">
                  <span className="truncate">{ghCliCmd}</span>
                  <button
                    type="button"
                    onClick={() => copyCommand(ghCliCmd)}
                    className="inline-flex shrink-0 items-center gap-1 text-slate-300 hover:text-white cursor-pointer"
                  >
                    {copiedCmd === ghCliCmd ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    <span>{copiedCmd === ghCliCmd ? 'Copiado' : 'Copiar'}</span>
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-[11px] font-semibold text-slate-300">
                  B) Ou publicar a pasta <code className="font-mono-num text-white">dist</code> direto com{' '}
                  <code className="font-mono-num text-white">gh-pages</code>:
                </div>
                <div className="flex items-center justify-between gap-2 rounded-lg border border-white/15 bg-[#131A26] px-3 py-2 font-mono-num text-[11px] text-sky-300">
                  <span className="truncate">{npxGhPagesCmd}</span>
                  <button
                    type="button"
                    onClick={() => copyCommand(npxGhPagesCmd)}
                    className="inline-flex shrink-0 items-center gap-1 text-slate-300 hover:text-white cursor-pointer"
                  >
                    {copiedCmd === npxGhPagesCmd ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    <span>{copiedCmd === npxGhPagesCmd ? 'Copiado' : 'Copiar'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : activePlatform === 'apk_playstore' ? (
          <div className="space-y-4 text-xs sm:text-sm text-slate-300">
            {/* Instant WebAPK Install Box */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/35 bg-emerald-950/30 p-4">
              <div className="space-y-0.5">
                <div className="text-xs font-extrabold uppercase tracking-wider text-emerald-300">
                  Instalação Direta no Celular / PC (WebAPK Leve)
                </div>
                <p className="text-xs text-slate-300">
                  {isInstalled
                    ? 'O aplicativo Jokenpo 2 já está instalado neste dispositivo!'
                    : isIOS
                    ? 'No iPhone/iPad (Safari): toque em Compartilhar → Adicionar à Tela de Início.'
                    : 'O manifesto PWA e os ícones 192px/512px já estão ativos para instalar sem precisar de loja.'}
                </p>
              </div>

              {isInstallable && !isInstalled && (
                <button
                  type="button"
                  onClick={install}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-black text-slate-950 hover:bg-emerald-400 cursor-pointer"
                >
                  <Download className="h-4 w-4" />
                  <span>Instalar App Agora</span>
                </button>
              )}
            </div>

            {/* Method 1: PWABuilder (Works directly with GitHub Pages URL!) */}
            <div className="rounded-xl border border-white/10 bg-[#0B0F17] p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-sm font-extrabold text-amber-400">
                  Método 1: Gerar .APK e .AAB pelo PWABuilder usando seu link do GitHub Pages
                </span>
                <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                  1 Minuto
                </span>
              </div>
              <ol className="space-y-2 list-decimal list-inside text-xs text-slate-300">
                <li>
                  Publique no <strong>GitHub Pages</strong> (aba ao lado) para ter seu link HTTPS (ex:{' '}
                  <code className="font-mono-num text-amber-300">
                    https://seu-usuario.github.io/jokenpo-2/
                  </code>
                  ).
                </li>
                <li>
                  Acesse <strong>pwabuilder.com</strong>, cole o link do GitHub Pages e clique em{' '}
                  <strong>Start</strong>.
                </li>
                <li>
                  Clique em <strong>Package for stores → Android (Google Play) → Download Package</strong> para baixar o <strong className="text-white">Jokenpo2.apk</strong> e o{' '}
                  <strong className="text-white">Jokenpo2.aab</strong>.
                </li>
              </ol>
            </div>

            {/* Method 2: Official Google Bubblewrap CLI */}
            <div className="rounded-xl border border-white/10 bg-[#0B0F17] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-display text-sm font-extrabold text-sky-400">
                  Método 2 (Terminal): Gerar APK com Bubblewrap CLI Oficial do Google
                </span>
                <button
                  type="button"
                  onClick={handleDownloadTwaManifest}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-sky-400/40 bg-sky-500/10 px-2.5 py-1 text-[11px] font-bold text-sky-300 hover:bg-sky-500/20 cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Baixar twa-manifest.json</span>
                </button>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-white/15 bg-[#131A26] px-3.5 py-2.5 font-mono-num text-xs text-amber-300">
                <span className="truncate">
                  npx @bubblewrap/cli init --manifest=https://SEU-USUARIO.github.io/jokenpo-2/manifest.json && npx @bubblewrap/cli build
                </span>
                <button
                  type="button"
                  onClick={() =>
                    copyCommand(
                      'npx @bubblewrap/cli init --manifest=https://SEU-USUARIO.github.io/jokenpo-2/manifest.json && npx @bubblewrap/cli build'
                    )
                  }
                  className="ml-2 inline-flex shrink-0 items-center gap-1 text-slate-300 hover:text-white cursor-pointer"
                >
                  {copiedCmd?.includes('bubblewrap') ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  <span>{copiedCmd?.includes('bubblewrap') ? 'Copiado' : 'Copiar'}</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4 text-xs sm:text-sm text-slate-300">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-3.5 text-xs text-emerald-200">
              O arquivo <code className="font-mono-num font-bold text-white">vercel.json</code> já foi criado na raiz do projeto com redirecionamento SPA e build automático do Vite.
            </div>

            <ol className="space-y-3 list-decimal list-inside">
              <li>
                Suba este projeto para um repositório no seu <strong>GitHub</strong>.
              </li>
              <li>
                Acesse <strong>vercel.com/new</strong>, importe o repositório do <strong>Jokenpo 2</strong> e clique em <strong>Deploy</strong>.
              </li>
              <li>
                Ou publique direto pelo terminal usando a CLI da Vercel:
                <div className="mt-2 flex items-center justify-between rounded-lg border border-white/15 bg-[#0B0F17] px-3.5 py-2.5 font-mono-num text-xs text-amber-300">
                  <span>npx vercel --prod</span>
                  <button
                    type="button"
                    onClick={() => copyCommand('npx vercel --prod')}
                    className="inline-flex items-center gap-1 text-slate-300 hover:text-white cursor-pointer"
                  >
                    {copiedCmd === 'npx vercel --prod' ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    <span>{copiedCmd === 'npx vercel --prod' ? 'Copiado' : 'Copiar'}</span>
                  </button>
                </div>
              </li>
            </ol>
          </div>
        )}

        {/* Important Firebase Auth Domain Notice */}
        <div className="rounded-xl border border-amber-500/35 bg-[#0B0F17] p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-amber-400">
            <ShieldCheck className="h-4 w-4" />
            <span>Importante para Login com Google no GitHub Pages</span>
          </div>
          <p className="text-xs leading-relaxed text-slate-300">
            Assim que o site entrar no ar no GitHub Pages, adicione o domínio{' '}
            <code className="font-mono-num text-amber-300">seu-usuario.github.io</code> em{' '}
            <strong>Firebase Console → Authentication → Settings → Authorized domains</strong> do projeto{' '}
            <code className="font-mono-num text-white">gen-lang-client-0039091541</code> para liberar o login Google e o ranking online.
          </p>
        </div>

        <div className="flex items-center justify-between border-t border-white/10 pt-4">
          <div className="inline-flex items-center gap-1.5 text-xs text-slate-400">
            <Globe className="h-3.5 w-3.5 text-amber-400" />
            <span>GitHub Pages + PWA + Multiplayer 3D prontos</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-amber-500 px-5 py-2.5 text-xs font-extrabold text-slate-950 hover:bg-amber-400 cursor-pointer"
          >
            Entendi
          </button>
        </div>
      </div>
    </div>
  );
};
