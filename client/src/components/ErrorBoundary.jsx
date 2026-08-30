import { Component } from 'react';

/**
 * Catches render errors anywhere below it.
 *
 * Without this, any throw during render unmounts the whole tree and leaves a
 * blank white page - the single hardest failure to diagnose, because it looks
 * identical to a server that never started, a wrong port, or a stale cache.
 *
 * Deliberately not translated: i18n itself is one of the things that can fail
 * here, and a fallback that depends on the failing subsystem is no fallback.
 * Both languages are shown instead.
 */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Keep the component stack in the console - it is what actually locates the bug.
    console.error('[SGS] Render error:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          fontFamily: 'system-ui, sans-serif',
          background: '#f1f5f9',
        }}
      >
        <div
          style={{
            maxWidth: '34rem',
            background: '#fff',
            borderRadius: '0.75rem',
            padding: '1.75rem',
            boxShadow: '0 1px 3px rgba(0,0,0,.1)',
          }}
        >
          <h1 style={{ margin: 0, fontSize: '1.1rem', color: '#b91c1c' }}>
            Une erreur est survenue · Something went wrong
          </h1>
          <p style={{ color: '#475569', fontSize: '.9rem', lineHeight: 1.5 }}>
            L'application n'a pas pu s'afficher. Rechargez la page ; si le problème persiste,
            transmettez le message ci-dessous à votre administrateur.
            <br />
            <span style={{ color: '#94a3b8' }}>
              The application could not render. Reload the page; if the problem persists, send the
              message below to your administrator.
            </span>
          </p>

          <pre
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '.5rem',
              padding: '.75rem',
              fontSize: '.75rem',
              color: '#334155',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: '12rem',
              overflow: 'auto',
            }}
          >
            {String(this.state.error?.message || this.state.error)}
          </pre>

          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: '1rem',
              minHeight: '44px',
              padding: '0 1.25rem',
              border: 0,
              borderRadius: '.5rem',
              background: '#3f6212',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Recharger · Reload
          </button>
        </div>
      </div>
    );
  }
}
