import { createContext, useContext, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { authApi } from '@/api/resources';
import { can } from '@/lib/permissions';
import { clearApiCache } from '@/lib/offline/register';
import { rememberUser, readRememberedUser, forgetUser } from '@/lib/offline/session';

// Exported so tests can mount a screen with a chosen role without standing up
// the whole provider and its /auth/me round trip.
export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const { i18n } = useTranslation();

  // The session lives in an httpOnly cookie we cannot read, so /auth/me is the
  // only way to know who is signed in.
  const {
    data,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: authApi.me,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  /**
   * "The network is down" and "you are not signed in" are different answers,
   * and treating them the same made offline mode useless: a reload with no
   * connection bounced the user to a login screen that also needs the server.
   *
   * A 401 is the server actually saying no, so the remembered identity is
   * dropped. A NETWORK_ERROR is no answer at all, so the last confirmed one
   * stands in until the server can be reached again. It authorises nothing:
   * every request still carries the cookie and the server still decides.
   */
  const isNetworkError = isError && (error?.code === 'NETWORK_ERROR' || error?.status === 0);

  useEffect(() => {
    if (data?.user) rememberUser(data.user);
    if (isError && !isNetworkError) forgetUser();
  }, [data, isError, isNetworkError]);

  const user = data?.user ?? (isNetworkError ? readRememberedUser() : null);

  /** True while the interface is running on a remembered, unverified identity. */
  const isSessionUnverified = Boolean(isNetworkError && user);

  const loginMutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: (result) => {
      queryClient.setQueryData(['auth', 'me'], result);
      if (result.user?.locale) i18n.changeLanguage(result.user.locale);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: authApi.logout,
    // Clear cached data either way: if the call failed the cookie may still be
    // gone, and keeping another user's data in cache would be worse.
    //
    // The service worker holds its own copy of the API responses, which
    // queryClient.clear() knows nothing about. Without the second call the next
    // person at this machine could read the previous session's stock levels and
    // purchase prices straight out of the HTTP cache.
    onSettled: () => {
      forgetUser();
      queryClient.clear();
      clearApiCache();
    },
  });

  // Adopt the signed-in user's stored language on first load.
  useEffect(() => {
    if (user?.locale && user.locale !== i18n.resolvedLanguage) {
      i18n.changeLanguage(user.locale);
    }
    // Only react to the stored preference, not to manual switches afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // The axios interceptor fires this when any request returns 401.
  useEffect(() => {
    const handleUnauthorized = () => {
      forgetUser();
      queryClient.setQueryData(['auth', 'me'], null);
    };
    window.addEventListener('sgs:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('sgs:unauthorized', handleUnauthorized);
  }, [queryClient]);

  const value = {
    user,
    isLoading,
    isAuthenticated: Boolean(user),
    isSessionUnverified,
    login: loginMutation.mutateAsync,
    isLoggingIn: loginMutation.isPending,
    loginError: loginMutation.error,
    logout: logoutMutation.mutateAsync,
    can: useCallback((permission) => can(user, permission), [user]),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Exported alongside the provider, which costs this file fast refresh: editing
 * it triggers a full reload rather than an HMR patch. Splitting the hook out
 * would touch the fifteen files that import it, for a file that is now stable
 * and rarely edited - not a trade worth making.
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
