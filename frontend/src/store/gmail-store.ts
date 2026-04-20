"use client"

import { create } from "zustand"

import { askGoogleWorkspaceQuestionApi, type GoogleWorkspaceHistoryMessage } from "@/lib/services/chat-service"

export type GmailMessageRole = "user" | "assistant"

export interface GmailMessage {
    id: string
    role: GmailMessageRole
    content: string
    createdAt: string
    streaming?: boolean
}

export interface GmailSession {
    id: string
    title: string
    createdAt: string
    updatedAt: string
    messages: GmailMessage[]
}

interface GmailStore {
    workspaceUserId: number | null
    hydrated: boolean
    processing: boolean
    sessions: GmailSession[]
    activeSessionId: string | null
    initialize: (userId: number | null) => Promise<void>
    setActiveSession: (sessionId: string | null) => void
    createSession: (title?: string) => string
    renameSession: (sessionId: string, title: string) => void
    deleteSession: (sessionId: string) => void
    sendMessage: (content: string) => Promise<void>
}

const STORAGE_KEY_PREFIX = "revopsly:gmail-state:v1"

function storageKey(workspaceUserId: number | null): string {
    return `${STORAGE_KEY_PREFIX}:${workspaceUserId ?? "anon"}`
}

function nowIso(): string {
    return new Date().toISOString()
}

function toTitle(text: string): string {
    const cleaned = text.trim()
    if (!cleaned) return "New Google Workspace Chat"
    return cleaned.length <= 52 ? cleaned : `${cleaned.slice(0, 51)}...`
}

function updateSession(
    sessions: GmailSession[],
    sessionId: string,
    updater: (session: GmailSession) => GmailSession
): GmailSession[] {
    return sessions.map((session) => (session.id === sessionId ? updater(session) : session))
}

function toGmailHistory(messages: GmailMessage[]): GoogleWorkspaceHistoryMessage[] {
    return messages
        .filter((message) => message.role === "user" || message.role === "assistant")
        .map((message) => ({
            role: message.role,
            content: message.content,
        }))
        .slice(-10)
}

async function loadPersistedSessions(workspaceUserId: number | null): Promise<GmailSession[]> {
    if (typeof window === "undefined") return []
    const raw = window.localStorage.getItem(storageKey(workspaceUserId))
    if (!raw) return []

    try {
        const parsed = JSON.parse(raw) as { sessions?: GmailSession[] }
        return Array.isArray(parsed.sessions) ? parsed.sessions : []
    } catch {
        return []
    }
}

async function savePersistedSessions(sessions: GmailSession[], workspaceUserId: number | null): Promise<void> {
    if (typeof window === "undefined") return
    window.localStorage.setItem(storageKey(workspaceUserId), JSON.stringify({ sessions }))
}

export const useGmailStore = create<GmailStore>((set, get) => ({
    workspaceUserId: null,
    hydrated: false,
    processing: false,
    sessions: [],
    activeSessionId: null,

    initialize: async (userId) => {
        const workspaceUserId = typeof userId === "number" && Number.isFinite(userId) ? userId : null
        const sessions = await loadPersistedSessions(workspaceUserId)

        set({
            workspaceUserId,
            hydrated: true,
            processing: false,
            sessions,
            activeSessionId: sessions[0]?.id ?? null,
        })
    },

    setActiveSession: (sessionId) => {
        set({ activeSessionId: sessionId })
    },

    createSession: (title) => {
        const session: GmailSession = {
            id: crypto.randomUUID(),
            title: toTitle(title ?? ""),
            createdAt: nowIso(),
            updatedAt: nowIso(),
            messages: [],
        }

        const nextSessions = [session, ...get().sessions]
        set({ sessions: nextSessions, activeSessionId: session.id })
        void savePersistedSessions(nextSessions, get().workspaceUserId)
        return session.id
    },

    renameSession: (sessionId, title) => {
        const cleaned = title.trim()
        if (!cleaned) return

        const nextSessions = updateSession(get().sessions, sessionId, (session) => ({
            ...session,
            title: toTitle(cleaned),
            updatedAt: nowIso(),
        }))

        set({ sessions: nextSessions })
        void savePersistedSessions(nextSessions, get().workspaceUserId)
    },

    deleteSession: (sessionId) => {
        const nextSessions = get().sessions.filter((session) => session.id !== sessionId)
        const nextActive = get().activeSessionId === sessionId ? (nextSessions[0]?.id ?? null) : get().activeSessionId

        set({ sessions: nextSessions, activeSessionId: nextActive })
        void savePersistedSessions(nextSessions, get().workspaceUserId)
    },

    sendMessage: async (content) => {
        const question = content.trim()
        if (!question || get().processing) return

        let sessionId = get().activeSessionId
        if (!sessionId) {
            sessionId = get().createSession(question)
        }

        const userMessage: GmailMessage = {
            id: crypto.randomUUID(),
            role: "user",
            content: question,
            createdAt: nowIso(),
        }

        const assistantDraft: GmailMessage = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "",
            createdAt: nowIso(),
            streaming: true,
        }

        const currentSession = get().sessions.find((session) => session.id === sessionId)
        const history = toGmailHistory(currentSession?.messages ?? [])

        let nextSessions = updateSession(get().sessions, sessionId, (session) => ({
            ...session,
            title: session.messages.length === 0 ? toTitle(question) : session.title,
            updatedAt: nowIso(),
            messages: [...session.messages, userMessage, assistantDraft],
        }))

        set({ sessions: nextSessions, processing: true, activeSessionId: sessionId })
        await savePersistedSessions(nextSessions, get().workspaceUserId)

        let reply = ""
        try {
            const response = await askGoogleWorkspaceQuestionApi(question, history)
            const fromAnswer = typeof response.answer === "string" ? response.answer.trim() : ""
            const fromReason = typeof response.reason === "string" ? response.reason.trim() : ""
            reply = fromAnswer || fromReason || "Google Workspace request completed, but no text response was returned."
        } catch (error) {
            reply = error instanceof Error
                ? `Google Workspace request failed: ${error.message}`
                : "Google Workspace request failed. Please retry."
        }

        const chars = [...reply]
        for (let i = 1; i <= chars.length; i += Math.max(1, Math.floor(Math.random() * 5))) {
            const chunk = chars.slice(0, i).join("")
            nextSessions = updateSession(nextSessions, sessionId, (session) => ({
                ...session,
                updatedAt: nowIso(),
                messages: session.messages.map((message) =>
                    message.id === assistantDraft.id
                        ? {
                            ...message,
                            content: chunk,
                            streaming: true,
                        }
                        : message
                ),
            }))
            set({ sessions: nextSessions })
            await new Promise<void>((resolve) => {
                window.setTimeout(resolve, 16)
            })
        }

        nextSessions = updateSession(nextSessions, sessionId, (session) => ({
            ...session,
            updatedAt: nowIso(),
            messages: session.messages.map((message) =>
                message.id === assistantDraft.id
                    ? {
                        ...message,
                        content: reply,
                        streaming: false,
                        createdAt: nowIso(),
                    }
                    : message
            ),
        }))

        set({ sessions: nextSessions, processing: false })
        await savePersistedSessions(nextSessions, get().workspaceUserId)
    },
}))
