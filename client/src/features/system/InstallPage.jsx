import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FiSmartphone, FiMonitor, FiShare, FiCheckCircle, FiLogIn } from 'react-icons/fi';

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
      aria-expanded={active}
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

function Steps({ title, steps }) {
  return (
    <section className="mx-auto w-full max-w-2xl px-5 pb-16">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-sgs-accent">{title}</h2>
        <ol className="space-y-3">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-3 text-sm leading-relaxed text-slate-700">
              {/* Numbered because installing genuinely is a sequence: step 3
                  makes no sense before step 1. */}
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-lime-100 font-mono text-xs font-bold text-sgs-primary">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export default function InstallPage() {
  const { t } = useTranslation(['install', 'auth']);
  const { promptEvent, installed, setPromptEvent } = useInstallState();
  const [platform] = useState(detectPlatform);
  const [open, setOpen] = useState(null);

  /**
   * One press, two meanings: install where the browser offered a prompt, open
   * the steps everywhere else. Pressing always does something, which is why
   * these are buttons.
   */
  const choose = async (target) => {
    setOpen((current) => (current === target ? null : target));
    if (target !== platform || !promptEvent) return;

    promptEvent.prompt();
    await promptEvent.userChoice;
    // Single-use: Chromium will not let the same event prompt twice.
    setPromptEvent(null);
  };

  const tiles = [
    { key: 'desktop', icon: FiMonitor, label: t('install:desktop.button') },
    { key: 'android', icon: FiSmartphone, label: t('install:android.button') },
    { key: 'ios', icon: FiShare, label: t('install:ios.button') },
  ];

  const steps = open
    ? {
        title: t(`install:${open}.title`),
        steps:
          open === 'ios'
            ? [t('install:ios.step1'), t('install:ios.step2'), t('install:ios.step3')]
            : [
                t(`install:${open}.step1`),
                t(`install:${open}.step2`),
                t(`install:${open}.step3`),
                t(`install:${open}.step4`),
              ],
      }
    : null;

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

      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur">
        <nav className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-5">
          <span className="flex items-center gap-2.5">
            <img src="/icon.svg" alt="" width="32" height="32" className="rounded-lg" />
            <span className="text-sm font-bold tracking-tight text-slate-900 sm:text-base">
              {t('install:brand')}
            </span>
          </span>

          <Link
            to="/login"
            className="flex min-h-11 items-center gap-2 rounded-xl bg-sgs-primary px-4 text-sm font-semibold text-white transition hover:bg-sgs-primary-dark"
          >
            <FiLogIn className="size-4" aria-hidden="true" />
            {t('auth:login.submit')}
          </Link>
        </nav>
      </header>

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
                      active={open === tile.key}
                      onClick={() => choose(tile.key)}
                    />
                  ))}
                </div>

                {/* The rack the crates sit on, and the same citron rail the
                    sidebar uses to mark position. */}
                <div className="mt-4 h-1 max-w-2xl rounded-full bg-sgs-citron/70" />

                <p className="mt-5 max-w-md text-sm leading-relaxed text-lime-100/80">
                  {t('install:noBinary')}
                </p>
              </div>
            )}
          </div>
        </section>

        {steps && <div className="pt-10">{<Steps {...steps} />}</div>}
      </main>
    </div>
  );
}
