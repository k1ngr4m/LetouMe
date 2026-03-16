import { createContext, useContext, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../api/client'
import type { AuthUser, LoginPayload, RegisterPayload } from '../types/api'

type AuthContextValue = {
  user: AuthUser | null
  isLoading: boolean
  isAuthenticated: boolean
  hasPermission: (permission: string) => boolean
  login: (payload: LoginPayload) => Promise<AuthUser | null>
  register: (payload: RegisterPayload) => Promise<AuthUser | null>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const currentUser = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      try {
        return (await apiClient.getCurrentUser()).user
      } catch {
        return null
      }
    },
    retry: false,
  })

  const loginMutation = useMutation({
    mutationFn: async (payload: LoginPayload) => (await apiClient.login(payload)).user,
    onSuccess: (user) => {
      queryClient.setQueryData(['auth', 'me'], user)
    },
  })

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiClient.logout()
      return null
    },
    onSuccess: () => {
      queryClient.setQueryData(['auth', 'me'], null)
      queryClient.removeQueries({ queryKey: ['current-predictions'] })
    },
  })
  const registerMutation = useMutation({
    mutationFn: async (payload: RegisterPayload) => (await apiClient.register(payload)).user,
    onSuccess: (user) => {
      queryClient.setQueryData(['auth', 'me'], user)
    },
  })

  const value = useMemo<AuthContextValue>(
    () => ({
      user: currentUser.data || null,
      isLoading: currentUser.isLoading,
      isAuthenticated: Boolean(currentUser.data),
      hasPermission: (permission) => Boolean(currentUser.data?.permissions?.includes(permission)),
      login: async (payload) => loginMutation.mutateAsync(payload),
      register: async (payload) => registerMutation.mutateAsync(payload),
      logout: async () => {
        await logoutMutation.mutateAsync()
      },
    }),
    [currentUser.data, currentUser.isLoading, loginMutation, logoutMutation, registerMutation],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
