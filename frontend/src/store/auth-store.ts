"use client"

import { create } from "zustand"

import type { ApiAuthUser } from "@/lib/services/chat-service"
import { loginApi, logoutApi, meApi, refreshSessionApi, signupApi } from "@/lib/services/chat-service"

interface AuthStore {
    user: ApiAuthUser | null
    isAuthenticated: boolean
    loading: boolean
    initialized: boolean
    error: string | null
    initialize: () => Promise<void>
    signup: (payload: { email: string; password: string; displayName: string }) => Promise<void>
    login: (payload: { email: string; password: string }) => Promise<void>
    logout: () => Promise<void>
    setUser: (user: ApiAuthUser) => void
    handleAuthExpired: () => void
    clearError: () => void
}

export const useAuthStore = create<AuthStore>((set, get) => ({
    user: null,
    isAuthenticated: false,
    loading: false,
    initialized: false,
    error: null,

    initialize: async () => {
        if (get().loading) return

        set({ loading: true, error: null })
        try {
            const payload = await meApi()
            set({
                user: payload.user,
                isAuthenticated: true,
                loading: false,
                initialized: true,
                error: null,
            })
        } catch {
            try {
                const refreshed = await refreshSessionApi()
                set({
                    user: refreshed.user,
                    isAuthenticated: true,
                    loading: false,
                    initialized: true,
                    error: null,
                })
            } catch {
                set({
                    user: null,
                    isAuthenticated: false,
                    loading: false,
                    initialized: true,
                    error: null,
                })
            }
        }
    },

    signup: async ({ email, password, displayName }) => {
        set({ loading: true, error: null })
        try {
            const payload = await signupApi({ email, password, display_name: displayName })
            set({
                user: payload.user,
                isAuthenticated: true,
                loading: false,
                initialized: true,
                error: null,
            })
        } catch (error) {
            set({
                loading: false,
                error: error instanceof Error ? error.message : "Unable to sign up right now.",
            })
            throw error
        }
    },

    login: async ({ email, password }) => {
        set({ loading: true, error: null })
        try {
            const payload = await loginApi({ email, password })
            set({
                user: payload.user,
                isAuthenticated: true,
                loading: false,
                initialized: true,
                error: null,
            })
        } catch (error) {
            set({
                loading: false,
                error: error instanceof Error ? error.message : "Unable to log in right now.",
            })
            throw error
        }
    },

    logout: async () => {
        try {
            await logoutApi()
        } catch {
            // best effort logout
        }
        set({
            user: null,
            isAuthenticated: false,
            loading: false,
            initialized: true,
            error: null,
        })
    },

    setUser: (user) => {
        set({ user, isAuthenticated: true, initialized: true, error: null })
    },

    handleAuthExpired: () => {
        set({
            user: null,
            isAuthenticated: false,
            loading: false,
            initialized: true,
            error: "Your session expired. Please log in again.",
        })
    },

    clearError: () => set({ error: null }),
}))
