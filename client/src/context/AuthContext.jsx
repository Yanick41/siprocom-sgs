import { createContext, useContext, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { authApi } from '@/api/resources';
import { can } from '@/lib/permissions';

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
  } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: authApi.me,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const user = isError ? null : data?.user ?? null;

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
    onSettled: () => queryClient.clear(),
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
      queryClient.setQueryData(['auth', 'me'], null);
    };
    window.addEventListener('sgs:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('sgs:unauthorized', handleUnauthorized);
  }, [queryClient]);

  const value = {
    user,
    isLoading,
    isAuthenticated: Boolean(user),
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
