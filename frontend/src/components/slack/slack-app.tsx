"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { format } from "date-fns"
import {
    ChevronLeft,
    ChevronRight,
    ExternalLink,
    Hash,
    Menu,
    MessageSquarePlus,
    Search,
    SendHorizontal,
    Sparkles,
    Trash2,
} from "lucide-react"

import { MarkdownRenderer } from "@/components/chat/markdown-renderer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { useAuthStore } from "@/store/auth-store"
import { useSlackStore } from "@/store/slack-store"

const SLACK_SUGGESTIONS = [
    "Give me the last 3 messages from #demo-2",
    "Summarize today conversations in #sales",
    "Which threads need follow-up in #support?",
] as const

function SlackEmptyState({ onPrompt }: { onPrompt: (prompt: string) => void }) {
    return (
        <div className="mx-auto flex h-full w-full max-w-4xl items-center justify-center px-4 py-6">
            <div className="w-full rounded-3xl border border-border/80 bg-gradient-to-b from-background to-muted/35 p-6 shadow-sm sm:p-8">
                <div className="space-y-2 text-center">
                    <p className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                        <Sparkles className="size-3.5" />
                        Slack Workspace
                    </p>
                    <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Slack Chat Workspace</h1>
                    <p className="text-sm text-muted-foreground sm:text-base">
                        Keep thread-like history and run Slack-focused prompts in a dedicated space.
                    </p>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                    {SLACK_SUGGESTIONS.map((prompt) => (
                        <button
                            key={prompt}
                            type="button"
                            onClick={() => onPrompt(prompt)}
                            className="rounded-2xl border bg-card/80 p-4 text-left text-sm transition hover:-translate-y-0.5 hover:bg-accent/60"
                        >
                            <p className="font-medium">{prompt}</p>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    )
}

export function SlackApp() {
    const { user } = useAuthStore()
    const {
        hydrated,
        processing,
        sessions,
        activeSessionId,
        setActiveSession,
        createSession,
        renameSession,
        deleteSession,
        sendMessage,
    } = useSlackStore()

    const [searchTerm, setSearchTerm] = useState("")
    const [composerBySession, setComposerBySession] = useState<Record<string, string>>({})
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
    const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true)
    const messageEndRef = useRef<HTMLDivElement>(null)

    const activeComposerKey = activeSessionId ?? "__slack_new__"
    const composerValue = composerBySession[activeComposerKey] ?? ""

    const setComposerValue = (value: string, key: string = activeComposerKey) => {
        setComposerBySession((current) => ({ ...current, [key]: value }))
    }

    const activeSession = useMemo(
        () => sessions.find((session) => session.id === activeSessionId) ?? null,
        [activeSessionId, sessions]
    )

    const visibleSessions = useMemo(() => {
        const q = searchTerm.trim().toLowerCase()
        return sessions
            .filter((session) => (!q ? true : session.title.toLowerCase().includes(q)))
            .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
    }, [searchTerm, sessions])

    useEffect(() => {
        messageEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
    }, [activeSession?.messages.length, processing])

    async function submitMessage(value: string) {
        const text = value.trim()
        if (!text) return
        const key = activeComposerKey
        await sendMessage(text)
        setComposerValue("", key)
    }

    const sidebarContent = (
        <div className="flex h-full flex-col border-r bg-card/70 backdrop-blur">
            <div className="p-3">
                <Button className="w-full justify-start" onClick={() => createSession()}>
                    <MessageSquarePlus className="size-4" />
                    New Slack Chat
                </Button>
            </div>

            <div className="px-3 pb-3">
                <div className="relative">
                    <Search className="pointer-events-none absolute left-2 top-2.5 size-4 text-muted-foreground" />
                    <Input
                        placeholder="Search Slack sessions"
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        className="pl-8"
                    />
                </div>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-3">
                {visibleSessions.map((session) => (
                    <div
                        key={session.id}
                        className={cn(
                            "group flex items-center gap-1 rounded-xl px-2 py-2 hover:bg-muted",
                            activeSessionId === session.id && "bg-muted"
                        )}
                    >
                        <button
                            type="button"
                            onClick={() => {
                                setActiveSession(session.id)
                                setMobileSidebarOpen(false)
                            }}
                            className="min-w-0 flex-1 text-left"
                        >
                            <p className="truncate text-sm font-medium">{session.title}</p>
                            <p className="truncate text-[11px] text-muted-foreground">
                                {format(new Date(session.updatedAt), "MMM d, p")}
                            </p>
                        </button>
                        <Button
                            size="icon-xs"
                            variant="ghost"
                            onClick={() => {
                                const value = window.prompt("Rename Slack session", session.title)
                                if (value) renameSession(session.id, value)
                            }}
                            aria-label="Rename session"
                        >
                            <Hash className="size-3" />
                        </Button>
                        <Button
                            size="icon-xs"
                            variant="ghost"
                            onClick={() => {
                                if (window.confirm("Delete this Slack session?")) {
                                    deleteSession(session.id)
                                }
                            }}
                            aria-label="Delete session"
                        >
                            <Trash2 className="size-3" />
                        </Button>
                    </div>
                ))}

                {!visibleSessions.length ? (
                    <p className="px-2 text-xs text-muted-foreground">No Slack sessions yet.</p>
                ) : null}
            </div>

            <div className="border-t p-3">
                <div className="rounded-xl border bg-background/70 p-3">
                    <p className="text-xs font-medium text-foreground">Signed in as</p>
                    <p className="mt-1 truncate text-sm">{user?.display_name ?? "RevOps User"}</p>
                    <p className="truncate text-xs text-muted-foreground">{user?.email ?? ""}</p>
                </div>
            </div>
        </div>
    )

    return (
        <div className="flex h-full overflow-hidden bg-background text-foreground">
            {desktopSidebarOpen ? (
                <aside className="hidden w-72 shrink-0 border-r lg:block">{sidebarContent}</aside>
            ) : null}

            <div className="flex min-w-0 flex-1 flex-col">
                <header className="flex h-14 items-center gap-2 border-b px-3 sm:px-4">
                    <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
                        <SheetTrigger
                            render={<Button size="icon-sm" variant="ghost" className="lg:hidden" aria-label="Open Slack session sidebar"><Menu className="size-4" /></Button>}
                        />
                        <SheetContent side="left" className="p-0">
                            <SheetHeader>
                                <SheetTitle>Slack Sessions</SheetTitle>
                                <SheetDescription>Open previous Slack prompts quickly.</SheetDescription>
                            </SheetHeader>
                            {sidebarContent}
                        </SheetContent>
                    </Sheet>

                    <Button
                        size="icon-sm"
                        variant="ghost"
                        className="hidden lg:inline-flex"
                        onClick={() => setDesktopSidebarOpen((current) => !current)}
                        aria-label={desktopSidebarOpen ? "Hide sidebar" : "Show sidebar"}
                    >
                        {desktopSidebarOpen ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
                    </Button>

                    <div className="flex items-center gap-2">
                        <span className="inline-grid size-7 place-items-center rounded-lg bg-primary/10 text-primary">
                            <Hash className="size-4" />
                        </span>
                        <div>
                            <p className="text-sm font-semibold tracking-tight">Slack Workspace</p>
                            <p className="text-[11px] text-muted-foreground">RevOpsly AI + Slack</p>
                        </div>
                    </div>

                    <div className="ml-auto flex items-center gap-2">
                        <Badge variant="outline" className="hidden sm:inline-flex">Thread-style sessions</Badge>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => window.open("/", "_blank", "noopener,noreferrer")}
                        >
                            Open Main Chat
                            <ExternalLink className="size-3.5" />
                        </Button>
                    </div>
                </header>

                <main className="min-h-0 flex-1">
                    <div className="flex h-full min-h-0 flex-col">
                        <section className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8">
                            {!hydrated ? (
                                <div className="grid h-full place-items-center text-sm text-muted-foreground">Loading Slack workspace...</div>
                            ) : activeSession && activeSession.messages.length > 0 ? (
                                <div className="mx-auto max-w-3xl space-y-4">
                                    {activeSession.messages.map((message) => {
                                        const isAssistant = message.role === "assistant"
                                        return (
                                            <div key={message.id} className={cn("w-full max-w-[88%]", isAssistant ? "mr-auto" : "ml-auto") }>
                                                <div
                                                    className={cn(
                                                        "rounded-2xl border px-3 py-2.5 shadow-sm",
                                                        isAssistant ? "border-border bg-card" : "border-primary/30 bg-primary/8"
                                                    )}
                                                >
                                                    <MarkdownRenderer content={message.content || (message.streaming ? "Thinking..." : "")} />
                                                </div>
                                                <p className={cn("mt-1 px-1 text-[11px] text-muted-foreground", isAssistant ? "text-left" : "text-right")}>
                                                    {format(new Date(message.createdAt), "p")}
                                                </p>
                                            </div>
                                        )
                                    })}
                                    <div ref={messageEndRef} />
                                </div>
                            ) : (
                                <SlackEmptyState onPrompt={(prompt) => setComposerValue(prompt)} />
                            )}
                        </section>

                        <div className="border-t bg-background/75 px-4 py-3 sm:px-8">
                            <div className="mx-auto max-w-3xl rounded-2xl border bg-card px-2 py-2 shadow-sm">
                                <div className="flex items-center gap-2">
                                    <Textarea
                                        value={composerValue}
                                        onChange={(event) => setComposerValue(event.target.value)}
                                        rows={1}
                                        placeholder="Ask about Slack channels, threads, and activity..."
                                        className="max-h-24 min-h-9 flex-1 resize-none border-0 bg-transparent px-1 py-1.5 shadow-none focus-visible:ring-0"
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter" && !event.shiftKey) {
                                                event.preventDefault()
                                                void submitMessage(composerValue)
                                            }
                                        }}
                                    />
                                    <Button
                                        size="sm"
                                        className="h-8 rounded-full px-3"
                                        onClick={() => void submitMessage(composerValue)}
                                        disabled={!composerValue.trim() || processing}
                                    >
                                        <SendHorizontal className="size-3.5" />
                                        {processing ? "Sending..." : "Send"}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    )
}
