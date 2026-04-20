"use client"

import { useEffect, useRef } from "react"

import { ChatApp } from "@/components/chat/chat-app"
import { AUTH_EXPIRED_EVENT } from "@/lib/services/chat-service"
import { useAuthStore } from "@/store/auth-store"
import { useChatStore } from "@/store/chat-store"
import { AuthScreen } from "@/components/auth/auth-screen"

export function AuthGate() {
    const { initialize, initialized, loading, isAuthenticated, user, handleAuthExpired } = useAuthStore()
    const initializeChat = useChatStore((state) => state.initialize)
    const previousWorkspaceUserIdRef = useRef<number | null | undefined>(undefined)

    useEffect(() => {
        void initialize()
    }, [initialize])

    useEffect(() => {
        if (!initialized) return
        if (isAuthenticated && !user) return

        const currentWorkspaceUserId = isAuthenticated ? (user?.id ?? null) : null
        if (previousWorkspaceUserIdRef.current === currentWorkspaceUserId) {
            return
        }

        previousWorkspaceUserIdRef.current = currentWorkspaceUserId
        void initializeChat(currentWorkspaceUserId)
    }, [initialized, initializeChat, isAuthenticated, user, user?.id])

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
        return <div className="grid h-screen place-items-center text-sm text-muted-foreground">Loading workspace...</div>
    }

    if (!isAuthenticated) {
        return <AuthScreen />
    }

    return <ChatApp />
}
