/**
 * The break-glass screen.
 *
 * Two things matter here and neither is the happy path. The warning has to be
 * on screen before anyone types, because this page bypasses the invitation
 * rules and the person opening it may not know that. And a refusal has to read
 * as "wrong secret, or the feature is off" rather than as a broken app: the
 * server deliberately answers 404 to both, so this screen must not invent a
 * distinction the server refused to make.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/api/client', () => {
  class ApiError extends Error {
    constructor(code, details, status) {
      super(code);
      this.code = code;
      this.details = details;
      this.status = status;
    }
  }
  return {
    default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
    ApiError,
  };
});

import api, { ApiError } from '@/api/client';
import BootstrapAdminPage from '@/features/auth/BootstrapAdminPage';
import { AuthContext } from '@/context/AuthContext';

/**
 * The page signs the new administrator in on success, so it needs the auth
 * context. `login` is a spy rather than the real mutation: what matters here is
 * that the page calls it with the credentials just typed, not that a round trip
 * to a server nobody started would have worked.
 */
const login = vi.fn().mockResolvedValue({ user: { id: 'u1', role: 'ADMIN' } });

const renderPage = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const auth = {
    user: null,
    isLoading: false,
    isAuthenticated: false,
    login,
    logout: vi.fn(),
    can: () => false,
  };

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AuthContext.Provider value={auth}>
          <BootstrapAdminPage />
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

/** Fills the form through the DOM and submits, without user-event. */
function submit(container, values = {}) {
  const filled = {
    secret: 'a-secret',
    name: 'Nom Complet',
    email: 'admin@siprocom.com',
    password: 'unMotDePasseLong1',
    confirm: 'unMotDePasseLong1',
    ...values,
  };

  for (const [name, value] of Object.entries(filled)) {
    const input = container.querySelector(`[name="${name}"]`);
    if (!input) continue;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

beforeEach(() => {
  vi.clearAllMocks();
  login.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN' } });
});

describe('break-glass admin screen', () => {
  it('warns that it bypasses the invitation rules, before anything is typed', () => {
    const { container } = renderPage();

    expect(container.textContent).toMatch(/Récupération du compte administrateur/);
    expect(container.textContent).toMatch(/contourne la procédure d'invitation/);
    // The warning is an alert, not decoration, so a screen reader announces it.
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('asks for the secret, and never puts it in the URL or the body', async () => {
    api.post.mockResolvedValue({
      user: { id: 'u1', name: 'Nom Complet', email: 'admin@siprocom.com', role: 'ADMIN', locale: 'fr' },
      replacedExistingAccount: false,
    });

    const { container } = renderPage();
    submit(container);

    await waitFor(() => expect(api.post).toHaveBeenCalled());

    const [url, body, options] = api.post.mock.calls[0];
    expect(url).toBe('/auth/bootstrap-admin');
    expect(options.headers['x-bootstrap-secret']).toBe('a-secret');
    // A secret in the body would end up in request logs the same way a query
    // string does, and the confirmation field is not the server's business.
    expect(body).not.toHaveProperty('secret');
    expect(body).not.toHaveProperty('confirm');
  });

  it('reads a 404 as "wrong secret or switched off", not as a broken app', async () => {
    api.post.mockRejectedValue(new ApiError('NOT_FOUND', undefined, 404));

    const { container } = renderPage();
    submit(container);

    await waitFor(() =>
      expect(container.textContent).toMatch(/Secret invalide, ou la récupération n'est pas activée/)
    );
  });

  it('tells the operator to switch the secret off again once it has worked', async () => {
    api.post.mockResolvedValue({
      user: { id: 'u1', name: 'Nom Complet', email: 'admin@siprocom.com', role: 'ADMIN', locale: 'fr' },
      replacedExistingAccount: true,
    });

    const { container } = renderPage();
    submit(container);

    await waitFor(() => expect(container.textContent).toMatch(/Compte existant remplacé/));
    expect(container.textContent).toMatch(/Désactivez la récupération maintenant/);
  });

  it('signs the new administrator in with the credentials just typed', async () => {
    api.post.mockResolvedValue({
      user: { id: 'u1', name: 'Nom Complet', email: 'admin@siprocom.com', role: 'ADMIN', locale: 'fr' },
      replacedExistingAccount: false,
    });

    const { container } = renderPage();
    submit(container);

    // The endpoint issues no cookie on purpose, so the page has to sign in
    // through the ordinary route. Passing anything but what was typed would
    // hand back a session for a password that was never proven to work.
    await waitFor(() =>
      expect(login).toHaveBeenCalledWith({
        email: 'admin@siprocom.com',
        password: 'unMotDePasseLong1',
      })
    );
  });

  it('offers the dashboard immediately, and says the redirect is coming', async () => {
    api.post.mockResolvedValue({
      user: { id: 'u1', name: 'Nom Complet', email: 'admin@siprocom.com', role: 'ADMIN', locale: 'fr' },
      replacedExistingAccount: false,
    });

    const { container } = renderPage();
    submit(container);

    await waitFor(() =>
      expect(within(container).getByRole('button', { name: /tableau de bord/i })).toBeTruthy()
    );
    // Counted down on screen rather than jumping, so the warning above it is
    // read as an instruction instead of glimpsed.
    expect(container.textContent).toMatch(/Redirection dans/);
  });

  it('falls back to the login link when the automatic sign-in fails', async () => {
    api.post.mockResolvedValue({
      user: { id: 'u1', name: 'Nom Complet', email: 'admin@siprocom.com', role: 'ADMIN', locale: 'fr' },
      replacedExistingAccount: false,
    });
    login.mockRejectedValue(new ApiError('NETWORK_ERROR', undefined, 0));

    const { container } = renderPage();
    submit(container);

    // The account exists either way; only the sign-in failed. Reporting a
    // failure that did not happen would send someone creating it a second time.
    await waitFor(() => expect(container.textContent).toMatch(/la connexion automatique a échoué/));
    expect(within(container).getByRole('link', { name: /connexion/i })).toBeTruthy();
    expect(container.textContent).not.toMatch(/Redirection dans/);
  });
});
