import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiSmartphone, FiMonitor, FiShare, FiCheckCircle, FiLogIn } from 'react-icons/fi';

import PublicHeader, { HeaderAction } from '@/components/PublicHeader';

/**
 * The front door.
 *
 * Rendered at "/" for anyone not signed in, so it is the first thing a new
 * colleague sees when they are sent the address. Its single job is to get the
 * app onto their device; everything that does not serve that is gone.
 *
 * The three options sit as tiles on a citron rail, which is the same device
 * the sidebar uses to mark the active item. Borrowing the product's own
 * vernacular is what stops this reading as a generic download page bolted onto
 * a warehouse tool.
 *
 * The hero inverts the palette: the app is lime on white, so the front door is
 * white on lime. White on #3f6212 measures 7.08:1, which is why that token
 * exists and why the inversion is safe rather than merely bold.
 *
 * No prose. Instructions exist, but only once someone asks for them by
 * pressing a tile, because iOS cannot be installed programmatically and a
 * silent tile there would be a dead end.
 */

/** What the browser will actually let us do, which is not the same everywhere. */
function useInstallState() {
  const [promptEvent, setPromptEvent] = useState(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
    if (standalone) setInstalled(true);

    // Chromium fires this when the app qualifies. Holding onto it is what lets
    // a real button exist: prompt() needs the saved event and cannot be
    // conjured on demand later.
    const onPrompt = (event) => {
      event.preventDefault();
      setPromptEvent(event);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  return { promptEvent, installed, setPromptEvent };
}

/** Coarse, and only used to decide which tile leads. */
function detectPlatform() {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  return 'desktop';
}

/**
 * One crate on the rack.
 *
 * The icon carries the meaning and the word underneath names it; there is no
 * third line, because a tile that explains itself is a tile nobody trusts at a
 * glance. The visitor's own device is the filled one, so the common case is
 * the loudest thing on the page.
 */
function InstallTile({ icon: Icon, label, active, current, onClick, index }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex flex-col items-center gap-3 rounded-2xl px-3 py-6 transition duration-200
        motion-safe:animate-[tile_500ms_ease-out_backwards]
        hover:-translate-y-1 focus-visible:-translate-y-1 sm:px-6 sm:py-8
        ${
          current
            ? 'bg-white text-sgs-primary shadow-lg shadow-black/20 ring-1 ring-white/60'
            : 'bg-white/10 text-white ring-1 ring-white/25 hover:bg-white/20'
        }
        ${active ? 'ring-2 ring-sgs-citron' : ''}`}
      style={{ animationDelay: `${120 + index * 90}ms` }}
    >
      <Icon
        className="size-9 shrink-0 transition-transform duration-200 group-hover:scale-110 sm:size-11"
        aria-hidden="true"
      />
      <span className="text-sm font-semibold tracking-tight sm:text-base">{label}</span>
    </button>
  );
}

export default function InstallPage() {
  const { t } = useTranslation(['install', 'auth']);
  const { promptEvent, installed, setPromptEvent } = useInstallState();
  const [platform] = useState(detectPlatform);
  const [hint, setHint] = useState(null);

  /**
   * One press installs. That is the whole interaction.
   *
   * Chromium only offers the prompt on the device it is running on, and only
   * over a secure origin with a registered worker. Where it has not offered
   * one - iOS, Firefox, or the dev server, which has no worker on purpose -
   * pressing leaves a single line saying what to do instead. A line, not a
   * numbered procedure: anyone who needs the long version is reading
   * docs/INSTALLATION_POSTE.md, not standing on a landing page.
   */
  const choose = async (target) => {
    if (target === platform && promptEvent) {
      setHint(null);
      promptEvent.prompt();
      await promptEvent.userChoice;
      // Single-use: Chromium will not let the same event prompt twice.
      setPromptEvent(null);
      return;
    }
    setHint(target);
  };
  const tiles = [
    { key: 'desktop', icon: FiMonitor, label: t('install:desktop.button') },
    { key: 'android', icon: FiSmartphone, label: t('install:android.button') },
    { key: 'ios', icon: FiShare, label: t('install:ios.button') },
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* The animation is declared here so the page carries its own motion and
          does not add a rule to the global stylesheet for one screen. */}
      <style>{`
        @keyframes tile { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        @keyframes rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) {
          [class*="animate-"] { animation: none !important; }
        }
      `}</style>

      <PublicHeader
        action={<HeaderAction to="/login" icon={FiLogIn} label={t('auth:login.submit')} />}
      />

      <main>
        <section className="flex min-h-[calc(100vh-4rem)] items-center bg-sgs-primary">
          <div className="mx-auto w-full max-w-5xl px-5 py-16 sm:py-20">
            <p className="motion-safe:animate-[rise_400ms_ease-out_backwards] font-mono text-xs uppercase tracking-[0.2em] text-sgs-citron">
              {t('install:eyebrow')}
            </p>
            <h1 className="motion-safe:animate-[rise_500ms_ease-out_backwards] mt-4 max-w-2xl text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-6xl">
              {t('install:headline')}
            </h1>

            {installed ? (
              <p className="mt-10 flex items-center gap-2.5 text-lime-100">
                <FiCheckCircle className="size-5 shrink-0" aria-hidden="true" />
                {t('install:alreadyInstalled')}
              </p>
            ) : (
              <div className="mt-10 sm:mt-14">
                <div className="grid max-w-2xl grid-cols-3 gap-3 sm:gap-5">
                  {tiles.map((tile, i) => (
                    <InstallTile
                      key={tile.key}
                      index={i}
                      icon={tile.icon}
                      label={tile.label}
                      current={platform === tile.key}
                      active={hint === tile.key}
                      onClick={() => choose(tile.key)}
                    />
                  ))}
                </div>

                {/* The rack the crates sit on, and the same citron rail the
                    sidebar uses to mark position. */}
                <div className="mt-4 h-1 max-w-2xl rounded-full bg-sgs-citron/70" />

                {/* One slot. Either the press could not install and says why in
                    a sentence, or the standing note about there being no file
                    to download. Never both, and never a procedure. */}
                <p
                  role={hint ? 'status' : undefined}
                  className="mt-5 max-w-md text-sm leading-relaxed text-lime-100/80"
                >
                  {hint ? t(`install:${hint}.hint`) : t('install:noBinary')}
                </p>
              </div>
            )}
          </div>
        </section>

      </main>
    </div>
  );
}
