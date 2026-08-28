import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  FiDownload,
  FiSmartphone,
  FiMonitor,
  FiCheckCircle,
  FiWifiOff,
  FiZap,
  FiShare,
} from 'react-icons/fi';

/**
 * Install page, shared as a link with the team.
 *
 * There is no APK and no .exe to hand out, and the page says so rather than
 * pretending otherwise. The SGS installs from the browser: same code, same
 * URL, updates itself, nothing to sign and nothing for SmartScreen to warn
 * about. What people actually want from a "download" - an icon that opens the
 * app in its own window and works without signal - is exactly what installing
 * gives them.
 *
 * Public on purpose. Someone being onboarded has no account yet, and sending
 * them to a page behind the login they cannot pass would be useless.
 */

/** What the browser will actually let us do, which is not the same everywhere. */
function useInstallState() {
  const [promptEvent, setPromptEvent] = useState(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Already running as an installed app: no point offering to install it.
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
    if (standalone) setInstalled(true);

    /**
     * Chromium fires this when the app qualifies. Holding onto it is what lets
     * a real button exist: calling prompt() later requires the saved event, and
     * the browser will not let us conjure one on demand.
     */
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

/** Coarse, and only used to put the right instructions first. */
function detectPlatform() {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  return 'desktop';
}

function Step({ children }) {
  return <li className="leading-relaxed text-slate-600">{children}</li>;
}

function PlatformCard({ icon: Icon, title, steps, highlighted }) {
  return (
    <section
      className={`card p-5 ${highlighted ? 'ring-2 ring-sgs-accent' : ''}`}
      aria-current={highlighted ? 'true' : undefined}
    >
      <header className="mb-3 flex items-center gap-2">
        <Icon className="size-5 shrink-0 text-sgs-primary" aria-hidden="true" />
        <h2 className="font-semibold text-slate-900">{title}</h2>
      </header>
      <ol className="list-decimal space-y-1.5 pl-5 text-sm">{steps.map((s, i) => <Step key={i}>{s}</Step>)}</ol>
    </section>
  );
}

export default function InstallPage() {
  const { t } = useTranslation(['install', 'common']);
  const { promptEvent, installed, setPromptEvent } = useInstallState();
  const [platform] = useState(detectPlatform);
  const [dismissed, setDismissed] = useState(false);

  const install = async () => {
    if (!promptEvent) return;
    promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    // The event is single-use: Chromium will not let the same one prompt twice.
    setPromptEvent(null);
    if (outcome === 'dismissed') setDismissed(true);
  };

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="text-center">
          <img src="/icon.svg" alt="" width="72" height="72" className="mx-auto mb-3 rounded-2xl" />
          <h1 className="text-2xl font-bold text-sgs-primary">{t('install:title')}</h1>
          <p className="mx-auto mt-2 max-w-xl text-slate-600">{t('install:subtitle')}</p>
        </header>

        {installed ? (
          <div role="status" className="card flex items-start gap-3 p-5">
            <FiCheckCircle className="mt-0.5 size-6 shrink-0 text-sgs-accent" aria-hidden="true" />
            <div>
              <p className="font-semibold text-slate-900">{t('install:alreadyInstalled')}</p>
              <p className="mt-1 text-sm text-slate-600">{t('install:alreadyInstalledHint')}</p>
            </div>
          </div>
        ) : (
          <div className="card p-5 text-center">
            {promptEvent ? (
              <>
                <button type="button" onClick={install} className="btn-primary mx-auto text-base">
                  <FiDownload className="size-5" />
                  {t('install:installNow')}
                </button>
                <p className="mt-3 text-sm text-slate-500">{t('install:installNowHint')}</p>
              </>
            ) : (
              <p className="text-sm text-slate-600">
                {dismissed ? t('install:dismissed') : t('install:useStepsBelow')}
              </p>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <PlatformCard
            icon={FiMonitor}
            title={t('install:desktop.title')}
            highlighted={platform === 'desktop'}
            steps={[
              t('install:desktop.step1'),
              t('install:desktop.step2'),
              t('install:desktop.step3'),
              t('install:desktop.step4'),
            ]}
          />
          <PlatformCard
            icon={FiSmartphone}
            title={t('install:android.title')}
            highlighted={platform === 'android'}
            steps={[
              t('install:android.step1'),
              t('install:android.step2'),
              t('install:android.step3'),
              t('install:android.step4'),
            ]}
          />
        </div>

        {/* iOS never fires beforeinstallprompt and hides the action in the share
            sheet, so it needs saying rather than leaving people hunting. */}
        <section className="card p-5">
          <header className="mb-2 flex items-center gap-2">
            <FiShare className="size-5 shrink-0 text-sgs-primary" aria-hidden="true" />
            <h2 className="font-semibold text-slate-900">{t('install:ios.title')}</h2>
          </header>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm">
            <Step>{t('install:ios.step1')}</Step>
            <Step>{t('install:ios.step2')}</Step>
            <Step>{t('install:ios.step3')}</Step>
          </ol>
        </section>

        <section className="card p-5">
          <h2 className="mb-3 font-semibold text-slate-900">{t('install:why.title')}</h2>
          <ul className="space-y-3 text-sm">
            <li className="flex items-start gap-2.5">
              <FiWifiOff className="mt-0.5 size-4 shrink-0 text-sgs-accent" aria-hidden="true" />
              <span className="text-slate-600">{t('install:why.offline')}</span>
            </li>
            <li className="flex items-start gap-2.5">
              <FiZap className="mt-0.5 size-4 shrink-0 text-sgs-accent" aria-hidden="true" />
              <span className="text-slate-600">{t('install:why.updates')}</span>
            </li>
            <li className="flex items-start gap-2.5">
              <FiMonitor className="mt-0.5 size-4 shrink-0 text-sgs-accent" aria-hidden="true" />
              <span className="text-slate-600">{t('install:why.window')}</span>
            </li>
          </ul>
          <p className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-500">
            {t('install:why.noBinary')}
          </p>
        </section>

        <p className="text-center text-sm">
          <Link to="/login" className="text-sgs-accent hover:underline">
            {t('install:backToLogin')}
          </Link>
        </p>
      </div>
    </main>
  );
}
