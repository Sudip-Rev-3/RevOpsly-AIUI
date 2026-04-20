"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Mail, Send } from "lucide-react"

import { MarkdownRenderer } from "@/components/chat/markdown-renderer"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { getGoogleWorkspaceAuthStartUrl, getGoogleWorkspaceStatusApi } from "@/lib/services/chat-service"
import { cn } from "@/lib/utils"
import { useGmailStore } from "@/store/gmail-store"

export function GmailInlinePanel() {
    const hydrated = useGmailStore((state) => state.hydrated)
    const processing = useGmailStore((state) => state.processing)
    const sessions = useGmailStore((state) => state.sessions)
    const activeSessionId = useGmailStore((state) => state.activeSessionId)
    const sendMessage = useGmailStore((state) => state.sendMessage)

    const [composerBySession, setComposerBySession] = useState<Record<string, string>>({})
    const [draftNoSession, setDraftNoSession] = useState("")
    const [authChecking, setAuthChecking] = useState(true)
    const [authError, setAuthError] = useState<string | null>(null)
    const [missingScopes, setMissingScopes] = useState<string[]>([])
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

        let cancelled = false
        setAuthChecking(true)
        setAuthError(null)
        setMissingScopes([])

        const ensureConnected = async () => {
            try {
                const status = await getGoogleWorkspaceStatusApi()
                if (cancelled) return
                if (!status.connected) {
                    window.location.assign(getGoogleWorkspaceAuthStartUrl())
                    return
                }
                setMissingScopes(Array.isArray(status.missing_scopes) ? status.missing_scopes : [])
                setAuthChecking(false)
            } catch (error) {
                if (cancelled) return
                const message = error instanceof Error ? error.message : "Unable to verify Google Workspace connection."
                setAuthError(message)
                setAuthChecking(false)
            }
        }

        void ensureConnected()
        return () => {
            cancelled = true
        }
    }, [hydrated])

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

    if (!hydrated) {
        return (
            <section className="flex h-full w-full items-center justify-center rounded-2xl border border-border bg-card text-sm text-muted-foreground">
                Loading Google Workspace...
            </section>
        )
    }

    if (authChecking) {
        return (
            <section className="flex h-full w-full items-center justify-center rounded-2xl border border-border bg-card text-sm text-muted-foreground">
                Connecting your Google Workspace...
            </section>
        )
    }

    if (authError) {
        return (
            <section className="flex h-full w-full flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-card p-6 text-center text-sm text-destructive">
                <p>{authError}</p>
                <button
                    type="button"
                    className="rounded bg-amber-200/70 px-2 py-1 font-semibold text-amber-900 underline underline-offset-2 hover:bg-amber-200"
                    onClick={() => {
                        window.location.assign(getGoogleWorkspaceAuthStartUrl(true))
                    }}
                >
                    Reconnect Google Permissions
                </button>
            </section>
        )
    }

    return (
        <section className="relative flex h-full w-full min-h-[70vh] flex-col overflow-hidden rounded-2xl border border-border bg-card">
            <header className="flex items-center gap-2 border-b border-border px-5 py-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Google Workspace Assistant</h2>
            </header>

            {missingScopes.length > 0 ? (
                <div className="flex items-center justify-between gap-3 border-b border-amber-300/40 bg-amber-50 px-5 py-3 text-xs text-amber-900">
                    <p>
                        Missing Google permissions detected ({missingScopes.length}). Reconnect once to grant all requested scopes.
                    </p>
                    <button
                        type="button"
                        className="rounded bg-amber-200/70 px-2 py-1 font-semibold underline underline-offset-2 hover:bg-amber-200"
                        onClick={() => {
                            window.location.assign(getGoogleWorkspaceAuthStartUrl(true))
                        }}
                    >
                        Allow Missing Permissions
                    </button>
                </div>
            ) : null}

            <div className="flex-1 overflow-y-auto px-5 py-4">
                {!activeSession || activeSession.messages.length === 0 ? (
                    <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center text-center">
                        <div className="mb-2 text-base font-semibold text-foreground">Ask Gmail anything</div>
                        <p className="mb-5 text-sm text-muted-foreground">
                            Ask about Gmail, Google Drive, or Calendar in one place.
                        </p>
                        <div className="flex flex-wrap justify-center gap-2">
                            {["Summarize unread emails", "Find my latest Drive files", "What meetings are scheduled tomorrow?"].map((suggestion) => (
                                <Button
                                    key={suggestion}
                                    variant="outline"
                                    className="h-8 rounded-full text-xs"
                                    onClick={() => onComposerChange(suggestion)}
                                >
                                    {suggestion}
                                </Button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
                        {activeSession.messages.map((message) => (
                            <div
                                key={message.id}
                                className={cn(
                                    "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                                    message.role === "user"
                                        ? "ml-auto rounded-br-md bg-blue-600 text-white"
                                        : "rounded-bl-md bg-muted text-foreground"
                                )}
                            >
                                <div className={cn("mb-1 text-[10px] uppercase tracking-wide", message.role === "user" ? "text-white/85" : "text-muted-foreground")}> 
                                    {message.role === "user" ? "You" : "Assistant"}
                                </div>
                                {message.role === "assistant" ? (
                                    <MarkdownRenderer
                                        content={message.content || (message.streaming ? "Thinking..." : "")}
                                        className="[&_*]:!text-inherit [&_p]:my-1.5 [&_li]:my-0.5"
                                    />
                                ) : (
                                    <p className="whitespace-pre-wrap">{message.content || (message.streaming ? "Thinking..." : "")}</p>
                                )}
                            </div>
                        ))}
                        <div ref={endRef} />
                    </div>
                )}
            </div>

            <footer className="border-t border-border px-4 py-3">
                <div className="mx-auto flex w-full max-w-3xl items-end gap-2">
                    <Textarea
                        value={composerValue}
                        onChange={(event) => onComposerChange(event.target.value)}
                        placeholder="Ask Google Workspace assistant..."
                        className="max-h-40 min-h-[44px] resize-none bg-background"
                        onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) {
                                event.preventDefault()
                                void submit()
                            }
                        }}
                    />
                    <Button onClick={() => void submit()} disabled={processing || !composerValue.trim()} size="icon">
                        <Send className="h-4 w-4" />
                    </Button>
                </div>
            </footer>
        </section>
    )
}
