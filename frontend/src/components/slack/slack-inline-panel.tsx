"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import { format } from "date-fns"
import { Loader2, MessageSquarePlus, Send } from "lucide-react"

import { MarkdownRenderer } from "@/components/chat/markdown-renderer"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { getSlackAuthStatusApi, getSlackAuthStartUrl, disconnectSlackApi } from "@/lib/services/chat-service"
import { cn } from "@/lib/utils"
import { useSlackStore } from "@/store/slack-store"

const SLACK_AUTH_STATUS_TTL_MS = 60_000
const slackAuthCache = new Map<number | null, { connected: boolean; error: string | null; expiresAt: number }>()

export function SlackInlinePanel() {
    const hydrated = useSlackStore((state) => state.hydrated)
    const workspaceUserId = useSlackStore((state) => state.workspaceUserId)
    const processing = useSlackStore((state) => state.processing)
    const sessions = useSlackStore((state) => state.sessions)
    const activeSessionId = useSlackStore((state) => state.activeSessionId)
    const createSession = useSlackStore((state) => state.createSession)
    const setActiveSession = useSlackStore((state) => state.setActiveSession)
    const sendMessage = useSlackStore((state) => state.sendMessage)

    const [composerBySession, setComposerBySession] = useState<Record<string, string>>({})
    const [draftNoSession, setDraftNoSession] = useState("")
    const [authChecking, setAuthChecking] = useState(true)
    const [authError, setAuthError] = useState<string | null>(null)
    const [connected, setConnected] = useState(false)
    const [disconnecting, setDisconnecting] = useState(false)
    const endRef = useRef<HTMLDivElement | null>(null)

    const activeSession = useMemo(
        () => sessions.find((session) => session.id === activeSessionId) ?? null,
        [sessions, activeSessionId]
    )

    const composerValue = activeSession ? composerBySession[activeSession.id] ?? "" : draftNoSession

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
    }, [activeSession?.messages.length, processing])

    useEffect(() => {
        if (!hydrated) return

        const now = Date.now()
        const cached = slackAuthCache.get(workspaceUserId)
        if (cached && cached.expiresAt > now) {
            setConnected(cached.connected)
            setAuthError(cached.error)
            setAuthChecking(false)
            return
        }

        let cancelled = false
        setAuthChecking(true)
        setAuthError(null)

        const checkStatus = async () => {
            try {
                const status = await getSlackAuthStatusApi()
                if (cancelled) return
                const nextConnected = Boolean(status.connected)
                setConnected(nextConnected)
                slackAuthCache.set(workspaceUserId, {
                    connected: nextConnected,
                    error: null,
                    expiresAt: Date.now() + SLACK_AUTH_STATUS_TTL_MS,
                })
                setAuthChecking(false)
            } catch (error) {
                if (cancelled) return
                const message = error instanceof Error ? error.message : "Unable to check Slack connection."
                setAuthError(message)
                slackAuthCache.set(workspaceUserId, {
                    connected: false,
                    error: message,
                    expiresAt: Date.now() + 8_000,
                })
                setAuthChecking(false)
            }
        }

        void checkStatus()
        return () => {
            cancelled = true
        }
    }, [hydrated, workspaceUserId])

    const onComposerChange = (value: string) => {
        if (!activeSession) {
            setDraftNoSession(value)
            return
        }
        setComposerBySession((prev) => ({ ...prev, [activeSession.id]: value }))
    }

    const submit = async () => {
        const prompt = composerValue.trim()
        if (!prompt || processing) return

        const currentSessionId = activeSession?.id ?? null
        if (currentSessionId) {
            setComposerBySession((prev) => ({ ...prev, [currentSessionId]: "" }))
        } else {
            setDraftNoSession("")
        }

        try {
            await sendMessage(prompt)
        } catch {
            if (currentSessionId) {
                setComposerBySession((prev) => ({ ...prev, [currentSessionId]: prompt }))
            } else {
                setDraftNoSession(prompt)
            }
        }
    }

    const handleNewSession = async () => {
        const newSessionId = createSession()
        setActiveSession(newSessionId)
        setComposerBySession((prev) => ({ ...prev, [newSessionId]: "" }))
    }

    const handleStartAuth = () => {
        window.location.assign(getSlackAuthStartUrl())
    }

    const handleDisconnect = async () => {
        try {
            setDisconnecting(true)
            await disconnectSlackApi()
            setConnected(false)
            slackAuthCache.set(workspaceUserId, {
                connected: false,
                error: null,
                expiresAt: Date.now() + SLACK_AUTH_STATUS_TTL_MS,
            })
        } catch (error) {
            console.error("Failed to disconnect Slack:", error)
        } finally {
            setDisconnecting(false)
        }
    }

    if (authChecking) {
        return (
            <div className="flex h-full items-center justify-center">
                <div className="text-center">
                    <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
                    <p className="mt-2 text-sm text-muted-foreground">Checking Slack connection…</p>
                </div>
            </div>
        )
    }

    if (!connected) {
        return (
            <div className="flex h-full flex-col items-center justify-center px-4 text-center">
                <Image src="/slack-logo.png" alt="Slack" width={48} height={48} className="mb-4 opacity-50" />
                <h2 className="text-lg font-semibold">Connect Slack</h2>
                <p className="mt-1 text-sm text-muted-foreground">Authorize Slack to get started with workspace chat.</p>
                {authError && (
                    <p className="mt-2 text-xs text-destructive">{authError}</p>
                )}
                <Button className="mt-4" onClick={handleStartAuth}>
                    Connect Slack Workspace
                </Button>
            </div>
        )
    }

    if (!hydrated) {
        return (
            <div className="flex h-full items-center justify-center">
                <div className="text-center">
                    <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
                    <p className="mt-2 text-sm text-muted-foreground">Loading Slack sessions…</p>
                </div>
            </div>
        )
    }

    return (
        <div className="flex h-full flex-col">
            {/* Header */}
            <div className="border-b px-4 py-3 sm:px-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Image src="/slack-logo.png" alt="Slack" width={20} height={20} />
                        <div>
                            <h2 className="text-sm font-semibold">Slack Chat</h2>
                            <p className="text-xs text-muted-foreground">Workspace messages and search</p>
                        </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={handleDisconnect} disabled={disconnecting}>
                        {disconnecting ? "Disconnecting…" : "Disconnect"}
                    </Button>
                </div>
            </div>

            {/* Messages Area */}
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
                {!activeSession ? (
                    <div className="flex h-full flex-col items-center justify-center text-center">
                        <p className="text-sm text-muted-foreground">No Slack session yet.</p>
                        <Button size="sm" className="mt-3 gap-2" onClick={handleNewSession}>
                            <MessageSquarePlus className="size-4" />
                            New Slack Chat
                        </Button>
                    </div>
                ) : (
                    <div className="max-w-3xl space-y-4">
                        {activeSession.messages.length === 0 ? (
                            <div className="flex h-full flex-col items-center justify-center text-center py-8">
                                <p className="text-sm text-muted-foreground">Start a conversation with Slack.</p>
                                <p className="mt-1 text-xs text-muted-foreground">Try asking about recent messages or searching for info.</p>
                            </div>
                        ) : (
                            <>
                                {activeSession.messages.map((message) => (
                                    <div
                                        key={message.id}
                                        className={cn(
                                            "w-full max-w-[88%] rounded-xl border px-3 py-2.5 shadow-sm",
                                            message.role === "assistant"
                                                ? "mr-auto border-border bg-card"
                                                : "ml-auto border-primary/20 bg-primary/5"
                                        )}
                                    >
                                        <MarkdownRenderer content={message.content} />
                                        <p className="mt-2 text-xs text-muted-foreground">
                                            {format(new Date(message.createdAt), "p")}
                                        </p>
                                    </div>
                                ))}
                                {processing && (
                                    <div className="mr-auto w-full max-w-[88%] rounded-xl border border-border bg-card px-3 py-2.5">
                                        <div className="flex items-center gap-2">
                                            <Loader2 className="size-4 animate-spin" />
                                            <p className="text-sm text-muted-foreground">Slack is thinking…</p>
                                        </div>
                                    </div>
                                )}
                                <div ref={endRef} />
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Composer */}
            {activeSession && (
                <div className="border-t px-4 py-3 sm:px-6">
                    <div className="flex gap-2">
                        <Textarea
                            value={composerValue}
                            onChange={(e) => onComposerChange(e.target.value)}
                            placeholder="Ask about Slack messages…"
                            rows={2}
                            className="resize-none"
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault()
                                    void submit()
                                }
                            }}
                        />
                        <Button
                            size="icon"
                            onClick={() => void submit()}
                            disabled={!composerValue.trim() || processing}
                            className="self-end"
                        >
                            <Send className="size-4" />
                        </Button>
                    </div>
                </div>
            )}

            {/* New Session Button (when not in a session) */}
            {!activeSession && (
                <div className="border-t px-4 py-3 sm:px-6">
                    <Button className="w-full" onClick={handleNewSession}>
                        <MessageSquarePlus className="size-4" />
                        Start New Slack Chat
                    </Button>
                </div>
            )}
        </div>
    )
}
