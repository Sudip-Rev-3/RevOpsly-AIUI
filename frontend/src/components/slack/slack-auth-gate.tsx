"use client"

import { useEffect } from "react"

import { AuthScreen } from "@/components/auth/auth-screen"
import { SlackApp } from "@/components/slack/slack-app"
import { AUTH_EXPIRED_EVENT } from "@/lib/services/chat-service"
import { useAuthStore } from "@/store/auth-store"
import { useSlackStore } from "@/store/slack-store"

export function SlackAuthGate() {
    const { initialize, initialized, loading, isAuthenticated, user, handleAuthExpired } = useAuthStore()
    const initializeSlack = useSlackStore((state) => state.initialize)

    useEffect(() => {
        void initialize()
    }, [initialize])

    useEffect(() => {
        if (!initialized) return
        if (isAuthenticated && !user) return
        void initializeSlack(isAuthenticated ? (user?.id ?? null) : null)
    }, [initialized, initializeSlack, isAuthenticated, user, user?.id])

    useEffect(() => {
        function onAuthExpired() {
            handleAuthExpired()
        }

        window.addEventListener(AUTH_EXPIRED_EVENT, onAuthExpired)
        return () => {
            window.removeEventListener(AUTH_EXPIRED_EVENT, onAuthExpired)
        }
    }, [handleAuthExpired])

    if (!initialized || loading) {
        return <div className="grid h-screen place-items-center text-sm text-muted-foreground">Loading Slack workspace...</div>
    }

    if (!isAuthenticated) {
        return <AuthScreen />
    }

    return <SlackApp />
}
