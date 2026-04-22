"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { format } from "date-fns"
import Papa from "papaparse"
import { AnimatePresence, motion } from "framer-motion"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import {
    ArrowDown,
    ArrowUp,
    BadgeCheck,
    Bell,
    CircleAlert,
    CircleCheck,
    Copy,
    CreditCard,
    Download,
    ExternalLink,
    Grid2x2,
    FileSpreadsheet,
    FolderSearch,
    Hash,
    Paperclip,
    KeyRound,
    LifeBuoy,
    LogOut,
    Menu,
    MessageSquarePlus,
    PanelRight,
    Search,
    SendHorizontal,
    Settings2,
    SlidersHorizontal,
    Database,
    ShieldCheck,
    ThumbsDown,
    ThumbsUp,
    UserCircle2,
    X,
    ChevronLeft,
    ChevronRight,
} from "lucide-react"

import { MarkdownRenderer } from "@/components/chat/markdown-renderer"
import { GmailInlinePanel } from "@/components/gmail/gmail-inline-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { getApiBaseUrl, getGoogleWorkspaceAuthStartUrl } from "@/lib/services/chat-service"
import { cn } from "@/lib/utils"
import { useAuthStore } from "@/store/auth-store"
import { useChatStore } from "@/store/chat-store"
import { useGmailStore, type GmailSession } from "@/store/gmail-store"
import type { AppSettings, ChatAttachment, ChatMessage, Conversation } from "@/types/chat"

const settingsSchema = z.object({
    theme: z.enum(["light", "dark", "system"]),
    accentColor: z.enum(["slate", "ocean", "forest", "sunset"]),
    language: z.enum(["en", "es", "fr", "de"]),
    spokenLanguage: z.enum(["english", "spanish", "french", "german"]),
    timezone: z.string().min(2, "Timezone is required"),
    responseStyle: z.enum(["balanced", "concise", "detailed"]),
    privacyMode: z.boolean(),
    keyboardHints: z.boolean(),
    notifications: z.object({
        email: z.boolean(),
        push: z.boolean(),
        productUpdates: z.boolean(),
        mentions: z.boolean(),
    }),
    account: z.object({
        displayName: z.string().trim().min(2, "Display name must be at least 2 characters"),
        email: z.string().trim().email("Enter a valid email address"),
        role: z.string().trim().min(2, "Role is required"),
        plan: z.enum(["starter", "growth", "enterprise"]),
    }),
    security: z.object({
        twoFactorEnabled: z.boolean(),
        activeSessions: z.number().min(1),
    }),
})

type SettingsForm = z.infer<typeof settingsSchema>

type SettingsTab =
    | "general"
    | "notifications"
    | "personalization"
    | "apps"
    | "data-controls"
    | "security"
    | "account"

const NEW_CHAT_DRAFT_KEY = "__new_chat__"

const STREAMING_THINKING_STEPS = [
    "Invoking agent…",
    "Thinking…",
    "Searching relevant rows…",
    "Checking CSV summary…",
    "Preparing concise answer…",
]

const TIMEZONE_OPTIONS = [
    "UTC",
    "America/New_York",
    "America/Chicago",
    "America/Los_Angeles",
    "Europe/London",
    "Europe/Berlin",
    "Asia/Kolkata",
    "Asia/Singapore",
] as const

const LANGUAGE_OPTIONS = [
    { value: "en", label: "English" },
    { value: "es", label: "Spanish" },
    { value: "fr", label: "French" },
    { value: "de", label: "German" },
] as const

const ACCENT_OPTIONS = [
    { value: "slate", label: "Slate" },
    { value: "ocean", label: "Ocean" },
    { value: "forest", label: "Forest" },
    { value: "sunset", label: "Sunset" },
] as const

type ToastType = "success" | "error"

interface UiToast {
    id: string
    type: ToastType
    title: string
    description?: string
}

function buildSettingsFormValues(
    settings: AppSettings,
    user: { email: string; display_name: string; two_factor_enabled: boolean } | null,
): SettingsForm {
    return {
        ...settings,
        account: {
            ...settings.account,
            displayName: (user?.display_name || settings.account.displayName || "").trim(),
            email: (user?.email || settings.account.email || "").trim(),
        },
        security: {
            ...settings.security,
            twoFactorEnabled: user?.two_factor_enabled ?? settings.security.twoFactorEnabled,
        },
    }
}

const HERO_PLACEHOLDERS = [
    "Ask about revenue trends...",
    "Upload a CSV...",
    "Find churn risks...",
] as const

const HERO_CARDS = [
    {
        title: "Summarize Data",
        description: "Get a crisp overview of key metrics, distributions, and outliers.",
        prompt: "Summarize this dataset with key metrics and anomalies",
        icon: Database,
    },
    {
        title: "Find Trends",
        description: "Detect growth, decline, and seasonal patterns across dimensions.",
        prompt: "Find important trends in this uploaded data",
        icon: Search,
    },
    {
        title: "Churn Risk",
        description: "Spot accounts and segments that indicate churn risk early.",
        prompt: "Identify churn risks and explain the strongest warning signals",
        icon: ShieldCheck,
    },
] as const

const BRAND_URL = "https://rev-opsly-aiui.vercel.app"

function formatFileSize(size: number) {
    if (size < 1024) return `${size} B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
    return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function resolveReportUrl(url: string | null | undefined) {
    const raw = typeof url === "string" ? url.trim() : ""
    if (!raw) {
        return null
    }
    if (/^https?:\/\//i.test(raw)) {
        return raw
    }
    const path = raw.startsWith("/") ? raw : `/${raw}`
    return `${getApiBaseUrl()}${path}`
}

function isImageReport(name: string | undefined, url: string | null) {
    const value = `${name ?? ""} ${url ?? ""}`.toLowerCase()
    return [".png", ".jpg", ".jpeg", ".webp", ".gif"].some((ext) => value.includes(ext))
}

function reportKind(name: string | undefined, url: string | null) {
    const value = `${name ?? ""} ${url ?? ""}`.toLowerCase()
    if (value.includes(".pdf")) return "pdf"
    if (value.includes(".html") || value.includes(".htm")) return "html"
    if (isImageReport(name, url)) return "image"
    return "file"
}

async function parseCsvFile(file: File): Promise<ChatAttachment> {
    return new Promise((resolve) => {
        const attachmentBase: ChatAttachment = {
            id: crypto.randomUUID(),
            chatId: "pending",
            name: file.name,
            size: file.size,
            mimeType: file.type || "text/csv",
            status: "processing",
            progress: 65,
            uploadedAt: new Date().toISOString(),
            rawFile: file,
        }

        Papa.parse<Record<string, string>>(file, {
            header: true,
            skipEmptyLines: true,
            complete: (result) => {
                if (result.errors.length > 0) {
                    resolve({
                        ...attachmentBase,
                        status: "error",
                        progress: 100,
                        dataset: {
                            tableName: file.name.replace(/\.[^.]+$/, ""),
                            columns: [],
                            inferredTypes: {},
                            sampleRows: [],
                            rowCount: 0,
                            parseError: result.errors[0]?.message || "CSV parsing failed",
                        },
                    })
                    return
                }

                const rows = result.data ?? []
                const columns = result.meta.fields ?? []

                if (rows.length === 0 || columns.length === 0) {
                    resolve({
                        ...attachmentBase,
                        status: "error",
                        progress: 100,
                        dataset: {
                            tableName: file.name.replace(/\.[^.]+$/, ""),
                            columns,
                            inferredTypes: {},
                            sampleRows: [],
                            rowCount: 0,
                            parseError: "Empty file or unsupported schema",
                        },
                    })
                    return
                }

                const inferredTypes = Object.fromEntries(
                    columns.map((column) => {
                        const firstValue = rows.find((row) => row[column])?.[column] ?? ""
                        const inferred = Number.isFinite(Number(firstValue)) ? "number" : "string"
                        return [column, inferred]
                    })
                )

                resolve({
                    ...attachmentBase,
                    status: "ready",
                    progress: 100,
                    dataset: {
                        tableName: file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_]/g, "_"),
                        columns,
                        inferredTypes,
                        sampleRows: rows.slice(0, 10),
                        rowCount: rows.length,
                    },
                })
            },
            error: (error) => {
                resolve({
                    ...attachmentBase,
                    status: "error",
                    progress: 100,
                    dataset: {
                        tableName: file.name.replace(/\.[^.]+$/, ""),
                        columns: [],
                        inferredTypes: {},
                        sampleRows: [],
                        rowCount: 0,
                        parseError: error.message,
                    },
                })
            },
        })
    })
}

function EmptyState({
    onPrompt,
    onUpload,
    onSubmit,
    value,
    onValueChange,
    processing,
}: {
    onPrompt: (prompt: string) => void
    onUpload: () => void
    onSubmit: (value: string) => void
    value: string
    onValueChange: (value: string) => void
    processing: boolean
}) {
    const [placeholderIndex, setPlaceholderIndex] = useState(0)

    useEffect(() => {
        const timer = window.setInterval(() => {
            setPlaceholderIndex((current) => (current + 1) % HERO_PLACEHOLDERS.length)
        }, 2300)
        return () => window.clearInterval(timer)
    }, [])

    return (
        <div className="mx-auto flex h-full w-full max-w-5xl flex-col items-center justify-center px-4 py-6">
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="w-full max-w-4xl rounded-2xl border border-border/70 bg-gradient-to-b from-background via-background to-muted/40 p-6 shadow-sm sm:p-8 dark:from-card dark:via-card dark:to-muted/20"
            >
                <div className="space-y-2 text-center">
                    <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Your RevOps AI Analyst</h1>
                    <p className="text-sm text-muted-foreground sm:text-base">Ask questions, upload data, and get insights instantly</p>
                </div>

                <div className="mt-6 rounded-2xl border border-border bg-card/85 p-2 shadow-sm transition-all duration-300 ease-out focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20">
                    <div className="flex items-end gap-2">
                        <Textarea
                            value={value}
                            onChange={(event) => onValueChange(event.target.value)}
                            rows={2}
                            className="min-h-20 flex-1 resize-none border-0 bg-transparent px-3 py-2 text-sm text-foreground shadow-none placeholder:text-muted-foreground focus-visible:ring-0"
                            placeholder={HERO_PLACEHOLDERS[placeholderIndex]}
                            onKeyDown={(event) => {
                                if (event.key === "Enter" && !event.shiftKey) {
                                    event.preventDefault()
                                    onSubmit(value)
                                }
                            }}
                        />

                        <div className="flex items-center gap-2 pb-1 pr-1">
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="rounded-xl border-border bg-background/85 text-foreground hover:bg-muted"
                                onClick={onUpload}
                            >
                                <Paperclip className="size-4" />
                                Upload CSV
                            </Button>
                            {processing ? (
                                <Button size="icon-sm" variant="destructive" className="rounded-xl" disabled>
                                    <X className="size-4" />
                                </Button>
                            ) : (
                                <Button
                                    type="button"
                                    size="icon-sm"
                                    className="rounded-xl"
                                    disabled={!value.trim()}
                                    onClick={() => onSubmit(value)}
                                    aria-label="Send message"
                                >
                                    <ArrowUp className="size-4" />
                                </Button>
                            )}
                        </div>
                    </div>
                </div>

                <motion.div
                    initial="hidden"
                    animate="visible"
                    variants={{
                        hidden: {},
                        visible: { transition: { staggerChildren: 0.07, delayChildren: 0.08 } },
                    }}
                    className="mt-6 grid gap-3 sm:grid-cols-3"
                >
                    {HERO_CARDS.map((card) => {
                        const Icon = card.icon
                        return (
                            <motion.button
                                key={card.title}
                                type="button"
                                variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
                                transition={{ duration: 0.24, ease: "easeOut" }}
                                onClick={() => onPrompt(card.prompt)}
                                className="rounded-2xl border border-border bg-card/90 p-4 text-left shadow-sm transition-all duration-200 ease-out hover:scale-[1.02] hover:bg-accent/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                            >
                                <div className="mb-3 inline-grid size-9 place-items-center rounded-xl bg-muted text-foreground">
                                    <Icon className="size-4" />
                                </div>
                                <p className="text-sm font-semibold text-foreground">{card.title}</p>
                                <p className="mt-1 text-xs text-muted-foreground">{card.description}</p>
                            </motion.button>
                        )
                    })}
                </motion.div>
            </motion.div>
        </div>
    )
}

function MessageRow({
    message,
    onEdit,
    onRetry,
    onFeedback,
}: {
    message: ChatMessage
    onEdit: (content: string) => void
    onRetry: () => void
    onFeedback: (value: "up" | "down") => void
}) {
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState(message.content)
    const [stepIndex, setStepIndex] = useState(0)

    const isAssistant = message.role === "assistant"
    const reportFile = isAssistant ? message.reportFile : undefined
    const legacyDownloadUrl = reportFile && "downloadUrl" in reportFile
        ? String((reportFile as unknown as { downloadUrl?: string }).downloadUrl ?? "")
        : ""
    const reportUrl = reportFile ? resolveReportUrl(reportFile.url || legacyDownloadUrl) : null
    const showImagePreview = isImageReport(reportFile?.name, reportUrl)
    const kind = reportKind(reportFile?.name, reportUrl)
    const seeLabel = kind === "html" ? "See Report" : kind === "pdf" ? "See PDF" : "See"
    const downloadLabel =
        kind === "html"
            ? "Download HTML"
            : kind === "pdf"
                ? "Download PDF"
                : showImagePreview
                    ? "Download Image"
                    : "Download File"
    const reportGeneratedAt = reportFile?.generatedAt
        ? (() => {
            const date = new Date(reportFile.generatedAt)
            return Number.isNaN(date.getTime()) ? null : format(date, "PPp")
        })()
        : null
    const executionDetails = message.executionDetails
    const hasExecutionDetails = Boolean(
        executionDetails
        && (
            executionDetails.steps.length > 0
            || executionDetails.observations.length > 0
            || Boolean(executionDetails.synthesizedOutput?.trim())
        )
    )

    useEffect(() => {
        if (!(isAssistant && message.streaming)) {
            setStepIndex(0)
            return
        }

        const timer = window.setInterval(() => {
            setStepIndex((current) => (current + 1) % STREAMING_THINKING_STEPS.length)
        }, 4500)

        return () => {
            window.clearInterval(timer)
        }
    }, [isAssistant, message.streaming])

    return (
        <div className={cn("w-full max-w-[88%]", isAssistant ? "mr-auto" : "ml-auto")}>
            <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                    "group rounded-xl border px-3 py-2.5 shadow-sm",
                    isAssistant
                        ? "border-border bg-card"
                        : "border-primary/20 bg-primary/5"
                )}
            >
                {editing && !isAssistant ? (
                    <div className="space-y-2">
                        <Textarea value={draft} onChange={(event) => setDraft(event.target.value)} className="min-h-28" />
                        <div className="flex gap-2">
                            <Button size="sm" onClick={() => { onEdit(draft); setEditing(false) }}>
                                Save edit
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => { setDraft(message.content); setEditing(false) }}>
                                Cancel
                            </Button>
                        </div>
                    </div>
                ) : (
                    <MarkdownRenderer content={message.content || (message.streaming ? "Thinking…" : "")} />
                )}

                {isAssistant && reportFile && reportUrl ? (
                    <div className="mt-3 overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-b from-primary/10 via-primary/5 to-transparent text-xs shadow-sm">
                        <div className="flex items-center justify-between border-b border-primary/15 px-3 py-2">
                            <div>
                                <p className="font-semibold text-foreground">{showImagePreview ? "Plot generated" : "Report ready"}</p>
                                <p className="mt-0.5 max-w-[240px] truncate text-muted-foreground">{reportFile.name}</p>
                            </div>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                    window.open(reportUrl, "_blank", "noopener,noreferrer")
                                }}
                            >
                                <ExternalLink className="size-3.5" />
                                {seeLabel}
                            </Button>
                        </div>

                        {showImagePreview ? (
                            <button
                                type="button"
                                className="block w-full bg-background/40 p-2 text-left"
                                onClick={() => {
                                    window.open(reportUrl, "_blank", "noopener,noreferrer")
                                }}
                            >
                                <img
                                    src={reportUrl}
                                    alt={reportFile.name || "Generated plot"}
                                    className="max-h-[280px] w-full rounded-lg border border-border/70 object-contain bg-card"
                                    loading="lazy"
                                />
                            </button>
                        ) : null}

                        <div className="flex items-center justify-between px-3 py-2 text-muted-foreground">
                            <p>
                                {formatFileSize(reportFile.sizeBytes)}
                                {reportGeneratedAt ? ` • ${reportGeneratedAt}` : ""}
                            </p>
                            <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                    void (async () => {
                                        try {
                                            const response = await fetch(reportUrl)
                                            if (!response.ok) {
                                                throw new Error(`Download failed (${response.status})`)
                                            }
                                            const blob = await response.blob()
                                            const blobUrl = window.URL.createObjectURL(blob)
                                            const link = document.createElement("a")
                                            link.href = blobUrl
                                            link.download = reportFile.name || (kind === "html" ? "report.html" : kind === "pdf" ? "report.pdf" : showImagePreview ? "plot.png" : "report")
                                            document.body.appendChild(link)
                                            link.click()
                                            link.remove()
                                            window.URL.revokeObjectURL(blobUrl)
                                        } catch {
                                            window.open(reportUrl, "_blank", "noopener,noreferrer")
                                        }
                                    })()
                                }}
                            >
                                <Download className="size-3.5" />
                                {downloadLabel}
                            </Button>
                        </div>
                    </div>
                ) : null}

                {isAssistant && message.streaming ? (
                    <div className="mt-2 rounded-md border bg-muted/30 px-2 py-1.5 text-xs text-muted-foreground">
                        <p className="font-medium text-foreground">Agent thinking</p>
                        <p className="mt-0.5">{STREAMING_THINKING_STEPS[stepIndex]}</p>
                    </div>
                ) : null}

                {isAssistant && hasExecutionDetails ? (
                    <details className="mt-2 rounded-md border border-border/80 bg-muted/20 px-2 py-1.5 text-xs">
                        <summary className="cursor-pointer select-none font-medium text-foreground">
                            Execution details
                        </summary>
                        <div className="mt-2 space-y-2 text-muted-foreground">
                            {executionDetails?.steps.length ? (
                                <div className="space-y-1">
                                    <p className="font-medium text-foreground">Tool steps</p>
                                    {executionDetails.steps.map((step) => (
                                        <div key={`exec-step-${step.step}`} className="rounded border bg-background/70 p-1.5">
                                            <p className="font-medium text-foreground">Step {step.step}{step.tool ? ` · ${step.tool}` : ""}</p>
                                            {step.action ? <p className="mt-1">Action: {step.action}</p> : null}
                                            {step.toolInput ? <p className="mt-1">Input: {step.toolInput}</p> : null}
                                            {step.observation ? <p className="mt-1">Observation: {step.observation}</p> : null}
                                        </div>
                                    ))}
                                </div>
                            ) : null}

                            {executionDetails?.observations.length ? (
                                <div className="space-y-1">
                                    <p className="font-medium text-foreground">Observations</p>
                                    <ul className="space-y-1">
                                        {executionDetails.observations.map((observation, index) => (
                                            <li key={`exec-observation-${index}`} className="rounded border bg-background/70 px-2 py-1">
                                                {observation}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : null}

                            {executionDetails?.synthesizedOutput ? (
                                <div className="space-y-1">
                                    <p className="font-medium text-foreground">Synthesized output</p>
                                    <p className="rounded border bg-background/70 px-2 py-1">
                                        {executionDetails.synthesizedOutput}
                                    </p>
                                </div>
                            ) : null}
                        </div>
                    </details>
                ) : null}
            </motion.div>

            {isAssistant ? (
                <div className="mt-1 flex items-center justify-end gap-1 px-1 text-[11px] text-muted-foreground">
                    <span>{format(new Date(message.createdAt), "p")}</span>
                    <Button size="icon-xs" variant={message.feedback === "up" ? "secondary" : "ghost"} onClick={() => onFeedback("up")} aria-label="Give positive feedback">
                        <ThumbsUp className="size-3" />
                    </Button>
                    <Button size="icon-xs" variant={message.feedback === "down" ? "secondary" : "ghost"} onClick={() => onFeedback("down")} aria-label="Give negative feedback">
                        <ThumbsDown className="size-3" />
                    </Button>
                    <Button size="icon-xs" variant="ghost" onClick={() => navigator.clipboard.writeText(message.content)} aria-label="Copy message">
                        <Copy className="size-3" />
                    </Button>
                    <Button size="icon-xs" variant="ghost" onClick={onRetry} aria-label="Retry response">
                        <ArrowDown className="size-3" />
                    </Button>
                </div>
            ) : (
                <div className="mt-1 flex justify-end px-1 text-[11px] text-muted-foreground">
                    <span>{format(new Date(message.createdAt), "p")}</span>
                </div>
            )}
        </div>
    )
}

export function ChatApp() {
    const { user, logout } = useAuthStore()
    const {
        hydrated,
        loading,
        processing,
        banner,
        conversations,
        activeConversationId,
        detailsOpen,
        mobileSidebarOpen,
        settingsOpen,
        shortcutsOpen,
        pendingAttachments,
        sessionFollowUps,
        settings,
        searchTerm,
        setSearchTerm,
        setMobileSidebarOpen,
        setDetailsOpen,
        setSettingsOpen,
        setShortcutsOpen,
        dismissBanner,
        startFreshChat,
        setActiveConversation,
        addPendingAttachment,
        removePendingAttachment,
        sendMessage,
        stopGenerating,
        retryLastAssistant,
        editUserMessage,
        setMessageFeedback,
        renameConversation,
        deleteConversation,
        updateSettings,
        saveAccountProfile,
        openBillingPortal,
        changePassword,
        setTwoFactorEnabled,
        refreshActiveSessions,
        signOutAllSessions,
        exportConversation,
        clearHistory,
    } = useChatStore()

    const gmailSessions = useGmailStore((state) => state.sessions)
    const activeGmailSessionId = useGmailStore((state) => state.activeSessionId)
    const initializeGmailStore = useGmailStore((state) => state.initialize)
    const setActiveGmailSession = useGmailStore((state) => state.setActiveSession)
    const createGmailSession = useGmailStore((state) => state.createSession)
    const renameGmailSession = useGmailStore((state) => state.renameSession)
    const deleteGmailSession = useGmailStore((state) => state.deleteSession)

    const [composerBySession, setComposerBySession] = useState<Record<string, string>>({})
    const [activeWorkspace, setActiveWorkspace] = useState<"chat" | "gworkspace">("chat")
    const [gmailSearchTerm, setGmailSearchTerm] = useState("")
    const [dropActive, setDropActive] = useState(false)
    const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(false)
    const [settingsTab, setSettingsTab] = useState<SettingsTab>("general")
    const [savingSettings, setSavingSettings] = useState(false)
    const [showSecurityNudge, setShowSecurityNudge] = useState(true)
    const [toasts, setToasts] = useState<UiToast[]>([])
    const messageEndRef = useRef<HTMLDivElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const prevHasUploadedDataRef = useRef(false)
    const toastTimersRef = useRef<Record<string, number>>({})

    const activeComposerKey = activeConversationId ?? NEW_CHAT_DRAFT_KEY
    const composerValue = composerBySession[activeComposerKey] ?? ""

    const setComposerValue = (value: string, key: string = activeComposerKey) => {
        setComposerBySession((current) => ({ ...current, [key]: value }))
    }

    const activeConversation = useMemo(
        () => conversations.find((conversation) => conversation.id === activeConversationId) ?? null,
        [activeConversationId, conversations]
    )

    const hasUploadedData = useMemo(() => {
        const pendingReady = pendingAttachments.some((attachment) => attachment.status !== "error")
        const hasConversationAttachments = (activeConversation?.attachments?.length ?? 0) > 0
        return pendingReady || hasConversationAttachments
    }, [activeConversation?.attachments, pendingAttachments])

    const activeFollowUps = useMemo(() => {
        if (!activeConversationId) return []
        return sessionFollowUps[activeConversationId] ?? []
    }, [activeConversationId, sessionFollowUps])

    const latestAssistantMessageId = useMemo(() => {
        if (!activeConversation) return null
        for (let i = activeConversation.messages.length - 1; i >= 0; i -= 1) {
            const message = activeConversation.messages[i]
            if (message.role === "assistant") {
                return message.id
            }
        }
        return null
    }, [activeConversation])

    const hasFirstAssistantResponse = useMemo(() => {
        if (!activeConversation) return false
        return activeConversation.messages.some(
            (message) => message.role === "assistant" && !message.streaming && Boolean(message.content.trim())
        )
    }, [activeConversation])

    const visibleConversations = useMemo(() => {
        const filtered = conversations
            .filter((conversation) => {
                if (!searchTerm.trim()) return true
                const q = searchTerm.toLowerCase()
                return conversation.title.toLowerCase().includes(q)
            })
            .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))

        return filtered
    }, [conversations, searchTerm])

    const visibleGmailSessions = useMemo(() => {
        const filtered = gmailSessions
            .filter((session) => {
                if (!gmailSearchTerm.trim()) return true
                const q = gmailSearchTerm.toLowerCase()
                return session.title.toLowerCase().includes(q)
            })
            .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))

        return filtered
    }, [gmailSearchTerm, gmailSessions])

    const profileDisplayName = user?.display_name ?? settings.account.displayName
    const profileEmail = user?.email ?? settings.account.email
    const profilePlanLabel = settings.account.plan
    const profileInitials = useMemo(() => {
        const pieces = profileDisplayName
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0]?.toUpperCase() ?? "")
            .join("")

        return pieces || "RA"
    }, [profileDisplayName])

    const settingsFormValues = useMemo(
        () => buildSettingsFormValues(settings, user),
        [settings, user]
    )

    useEffect(() => {
        messageEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
    }, [activeConversation?.messages.length, processing])

    useEffect(() => {
        void initializeGmailStore(user?.id ?? null)
    }, [initializeGmailStore, user?.id])

    useEffect(() => {
        const hadUploadedData = prevHasUploadedDataRef.current
        if (!hadUploadedData && hasUploadedData) {
            setDetailsOpen(true)
        }
        if (hadUploadedData && !hasUploadedData) {
            setDetailsOpen(false)
        }
        prevHasUploadedDataRef.current = hasUploadedData
    }, [hasUploadedData, setDetailsOpen])

    const settingsForm = useForm<SettingsForm>({
        resolver: zodResolver(settingsSchema),
        defaultValues: settingsFormValues,
        mode: "onBlur",
    })

    const hasUnsavedSettings = settingsForm.formState.isDirty

    useEffect(() => {
        if (!settingsOpen) return
        settingsForm.reset(settingsFormValues)
        setShowSecurityNudge(true)
    }, [settingsOpen, settingsFormValues, settingsForm])

    useEffect(() => {
        const timersRef = toastTimersRef
        return () => {
            Object.values(timersRef.current).forEach((id) => {
                window.clearTimeout(id)
            })
        }
    }, [])

    function pushToast(type: ToastType, title: string, description?: string) {
        const id = crypto.randomUUID()
        setToasts((current) => [...current, { id, type, title, description }])
        const timer = window.setTimeout(() => {
            setToasts((current) => current.filter((toast) => toast.id !== id))
            delete toastTimersRef.current[id]
        }, 4200)
        toastTimersRef.current[id] = timer
    }

    function dismissToast(id: string) {
        const timer = toastTimersRef.current[id]
        if (timer) {
            window.clearTimeout(timer)
            delete toastTimersRef.current[id]
        }
        setToasts((current) => current.filter((toast) => toast.id !== id))
    }

    function openSettingsAt(tab: SettingsTab) {
        setSettingsTab(tab)
        setSettingsOpen(true)
    }

    function handleSettingsOpenChange(nextOpen: boolean) {
        if (!nextOpen && hasUnsavedSettings) {
            const discard = window.confirm("You have unsaved settings changes. Discard them?")
            if (!discard) return
            settingsForm.reset(settingsFormValues)
        }
        setSettingsOpen(nextOpen)
    }

    function handleCancelSettings() {
        if (hasUnsavedSettings) {
            const discard = window.confirm("Discard your unsaved settings changes?")
            if (!discard) return
        }
        settingsForm.reset(settingsFormValues)
        setSettingsOpen(false)
    }

    async function handleFiles(fileList: FileList | File[]) {
        const files = Array.from(fileList)
        for (const file of files) {
            const pendingBase: ChatAttachment = {
                id: crypto.randomUUID(),
                chatId: activeConversationId ?? "pending",
                name: file.name,
                size: file.size,
                mimeType: file.type || "text/csv",
                status: "uploading",
                progress: 10,
                uploadedAt: new Date().toISOString(),
                rawFile: file,
            }
            addPendingAttachment(pendingBase)

            if (!file.name.toLowerCase().endsWith(".csv")) {
                removePendingAttachment(pendingBase.id)
                addPendingAttachment({
                    ...pendingBase,
                    id: `${pendingBase.id}-error`,
                    status: "error",
                    progress: 100,
                    dataset: {
                        tableName: file.name,
                        columns: [],
                        inferredTypes: {},
                        sampleRows: [],
                        rowCount: 0,
                        parseError: "Unsupported file type. Please upload CSV files only.",
                    },
                })
                continue
            }

            const parsed = await parseCsvFile(file)
            removePendingAttachment(pendingBase.id)
            addPendingAttachment({ ...parsed, id: pendingBase.id, chatId: activeConversationId ?? "pending" })
        }
    }

    async function submitMessage(text: string) {
        const prompt = text.trim()
        if (!prompt) return
        const sendKey = activeComposerKey
        setComposerValue("", sendKey)
        try {
            await sendMessage(prompt)
        } catch {
            // Restore the draft if sending fails so the user can retry quickly.
            setComposerValue(prompt, sendKey)
        }
    }

    async function onDrop(event: React.DragEvent<HTMLElement>) {
        event.preventDefault()
        setDropActive(false)
        if (!event.dataTransfer.files.length) return
        await handleFiles(event.dataTransfer.files)
    }

    function renderConversationActions(conversation: Conversation) {
        return (
            <DropdownMenu>
                <DropdownMenuTrigger render={<Button size="icon-xs" variant="ghost" aria-label="Conversation actions"><Settings2 className="size-3" /></Button>} />
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => {
                        const value = window.prompt("Rename conversation", conversation.title)
                        if (value) renameConversation(conversation.id, value)
                    }}>
                        Rename
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => {
                        if (window.confirm("Delete this conversation permanently?")) {
                            deleteConversation(conversation.id)
                        }
                    }}>
                        Delete
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        )
    }

    function renderGmailSessionActions(session: GmailSession) {
        return (
            <DropdownMenu>
                <DropdownMenuTrigger render={<Button size="icon-xs" variant="ghost" aria-label="Google session actions"><Settings2 className="size-3" /></Button>} />
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => {
                        const value = window.prompt("Rename Google session", session.title)
                        if (value) renameGmailSession(session.id, value)
                    }}>
                        Rename
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => {
                        if (window.confirm("Delete this Google session permanently?")) {
                            deleteGmailSession(session.id)
                        }
                    }}>
                        Delete
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        )
    }

    const sidebarContent = (
        <div className="flex h-full flex-col border-r bg-card/70 backdrop-blur">
            <div className="p-3">
                <Button
                    className="w-full justify-start"
                    onClick={() => {
                        if (activeWorkspace === "chat") {
                            startFreshChat()
                            return
                        }
                        createGmailSession()
                    }}
                >
                    <MessageSquarePlus className="size-4" />
                    {activeWorkspace === "chat" ? "New chat" : "New Google chat"}
                </Button>
            </div>

            <div className="px-3 pb-3">
                <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/60 p-1">
                    <Button
                        type="button"
                        size="sm"
                        variant={activeWorkspace === "chat" ? "secondary" : "ghost"}
                        className="justify-center"
                        onClick={() => setActiveWorkspace("chat")}
                    >
                        Conversations
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant={activeWorkspace === "gworkspace" ? "secondary" : "ghost"}
                        className="justify-center gap-1.5"
                        onClick={() => setActiveWorkspace("gworkspace")}
                    >
                        <img src="/google-logo.svg" alt="Google" className="h-3.5 w-3.5" />
                        Google
                    </Button>
                </div>
            </div>

            <div className="px-3 pb-3">
                <div className="relative">
                    <Search className="pointer-events-none absolute left-2 top-2.5 size-4 text-muted-foreground" />
                    <Input
                        placeholder={activeWorkspace === "chat" ? "Search conversations" : "Search Google sessions"}
                        value={activeWorkspace === "chat" ? searchTerm : gmailSearchTerm}
                        onChange={(event) => {
                            if (activeWorkspace === "chat") {
                                setSearchTerm(event.target.value)
                                return
                            }
                            setGmailSearchTerm(event.target.value)
                        }}
                        className="pl-8"
                    />
                </div>
            </div>

            <div className="px-3 pb-3">
                <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between border-primary/30 bg-primary/5 hover:bg-primary/10"
                    onClick={() => window.open("/slack", "_blank", "noopener,noreferrer")}
                >
                    <span className="inline-flex items-center gap-2">
                        <Hash className="size-4" />
                        Slack
                    </span>
                    <span className="text-[11px] text-muted-foreground">New tab</span>
                </Button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-2 pb-4">
                {activeWorkspace === "chat" ? (
                    <>
                        {visibleConversations.map((conversation) => (
                            <div
                                key={conversation.id}
                                className={cn(
                                    "group flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm hover:bg-muted",
                                    activeConversationId === conversation.id && "bg-muted"
                                )}
                            >
                                <button
                                    type="button"
                                    onClick={() => setActiveConversation(conversation.id)}
                                    className="min-w-0 flex-1 text-left"
                                >
                                    <p className="truncate font-medium">{conversation.title}</p>
                                    <p className="truncate text-xs text-muted-foreground">{format(new Date(conversation.updatedAt), "MMM d, p")}</p>
                                </button>
                                {renderConversationActions(conversation)}
                            </div>
                        ))}

                        {visibleConversations.length === 0 ? (
                            <p className="px-2 text-xs text-muted-foreground">No conversations yet. Start a new chat to begin.</p>
                        ) : null}
                    </>
                ) : (
                    <>
                        {visibleGmailSessions.map((session) => (
                            <div
                                key={session.id}
                                className={cn(
                                    "group flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm hover:bg-muted",
                                    activeGmailSessionId === session.id && "bg-muted"
                                )}
                            >
                                <button
                                    type="button"
                                    onClick={() => setActiveGmailSession(session.id)}
                                    className="min-w-0 flex-1 text-left"
                                >
                                    <p className="truncate font-medium">{session.title}</p>
                                    <p className="truncate text-xs text-muted-foreground">{format(new Date(session.updatedAt), "MMM d, p")}</p>
                                </button>
                                {renderGmailSessionActions(session)}
                            </div>
                        ))}

                        {visibleGmailSessions.length === 0 ? (
                            <p className="px-2 text-xs text-muted-foreground">No Google sessions yet. Start a new Google chat to begin.</p>
                        ) : null}
                    </>
                )}
            </div>

            <div className="border-t p-3">
                <DropdownMenu>
                    <DropdownMenuTrigger
                        render={
                            <Button
                                variant="outline"
                                className="h-auto w-full justify-start gap-3 px-2 py-2"
                                aria-label="Open profile menu"
                            />
                        }
                    >
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                            {profileInitials}
                        </span>
                        <span className="min-w-0 flex-1 text-left">
                            <span className="block truncate text-sm font-medium">{profileDisplayName}</span>
                            <span className="block truncate text-xs text-muted-foreground">{profileEmail}</span>
                        </span>
                        <Badge variant="secondary" className="capitalize">{profilePlanLabel}</Badge>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" side="top" className="min-w-56">
                        <DropdownMenuItem onClick={() => openSettingsAt("account")}>
                            <UserCircle2 className="size-4" />
                            View profile
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openSettingsAt("account")}>
                            <Settings2 className="size-4" />
                            Settings
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => pushToast("success", "Team workspace", "Team management panel will be available in a backend-connected release.")}>
                            <BadgeCheck className="size-4" />
                            Team
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => pushToast("success", "API keys", "API key management will be connected to secure backend endpoints soon.")}>
                            <KeyRound className="size-4" />
                            API keys
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onClick={async () => {
                                try {
                                    await openBillingPortal()
                                    pushToast("success", "Opening billing", "Billing and usage placeholder action completed.")
                                } catch (error) {
                                    pushToast("error", "Billing unavailable", error instanceof Error ? error.message : "Unable to open billing right now.")
                                }
                            }}
                        >
                            <CreditCard className="size-4" />
                            Billing & usage
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => pushToast("success", "Help center", "Support and documentation links will be integrated here.")}>
                            <LifeBuoy className="size-4" />
                            Help & support
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            variant="destructive"
                            onClick={async () => {
                                await logout()
                                pushToast("success", "Signed out", "You have been logged out.")
                            }}
                        >
                            <LogOut className="size-4" />
                            Sign out
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    )

    return (
        <div className="flex h-full overflow-hidden bg-background text-foreground">
            {desktopSidebarOpen ? (
                <aside className="hidden w-64 shrink-0 border-r lg:block xl:w-72">{sidebarContent}</aside>
            ) : null}

            <div className="flex min-w-0 flex-1 flex-col">
                <header className="flex h-14 items-center gap-2 border-b px-3 sm:px-4">
                    <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
                        <SheetTrigger
                            id="mobile-sidebar-trigger"
                            render={<Button size="icon-sm" variant="ghost" className="lg:hidden" aria-label="Open conversation sidebar"><Menu className="size-4" /></Button>}
                        />
                        <SheetContent side="left" className="p-0">
                            <SheetHeader>
                                <SheetTitle>Workspace</SheetTitle>
                                <SheetDescription>Switch between conversation and Google sessions.</SheetDescription>
                            </SheetHeader>
                            {sidebarContent}
                        </SheetContent>
                    </Sheet>

                    <Button
                        size="icon-sm"
                        variant="ghost"
                        className="hidden lg:inline-flex"
                        onClick={() => setDesktopSidebarOpen((current) => !current)}
                        aria-label={desktopSidebarOpen ? "Hide conversation history" : "Show conversation history"}
                    >
                        {desktopSidebarOpen ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
                    </Button>

                    <a
                        href={BRAND_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center rounded-md border border-border bg-white px-2 py-1"
                        aria-label="Open RevOpsly website"
                        title="RevOpsly"
                    >
                        <img
                            src="/revopsly-logo.svg"
                            alt="RevOpsly logo"
                            className="h-6 w-auto"
                        />
                    </a>

                    <div className="ml-auto flex items-center gap-2">
                        {activeWorkspace === "gworkspace" ? (
                            <button
                                type="button"
                                className="rounded bg-amber-200/70 px-2 py-1 text-xs font-semibold text-amber-900 underline underline-offset-2 hover:bg-amber-200"
                                onClick={() => {
                                    window.location.assign(getGoogleWorkspaceAuthStartUrl(true))
                                }}
                            >
                                Reconnect Google Permissions
                            </button>
                        ) : null}

                        <Button size="sm" variant="outline" className="hidden sm:inline-flex" onClick={async () => {
                            try {
                                await openBillingPortal()
                                pushToast("success", "Plan options", "Upgrade flow placeholder completed.")
                            } catch (error) {
                                pushToast("error", "Upgrade unavailable", error instanceof Error ? error.message : "Unable to open plan settings.")
                            }
                        }}>
                            <CreditCard className="size-4" />
                            Upgrade Plan
                        </Button>

                        {activeWorkspace === "chat" && hasUploadedData ? (
                            <Button size="icon-sm" variant="ghost" onClick={() => setDetailsOpen(!detailsOpen)} aria-label="Toggle details panel">
                                <PanelRight className="size-4" />
                            </Button>
                        ) : null}

                        <Button size="icon-sm" variant="ghost" onClick={() => setShortcutsOpen(true)} aria-label="Open keyboard shortcuts">
                            <FolderSearch className="size-4" />
                        </Button>

                        <Button size="icon-sm" variant="ghost" onClick={() => openSettingsAt("general")} aria-label="Open settings">
                            <Settings2 className="size-4" />
                        </Button>
                    </div>
                </header>

                {activeWorkspace === "chat" && banner ? (
                    <div className={cn("mx-4 mt-3 rounded-lg border px-3 py-2 text-sm", banner.type === "warning" ? "border-amber-500/40 bg-amber-500/10" : "border-destructive/40 bg-destructive/10")}>
                        <div className="flex items-center justify-between gap-2">
                            <p>{banner.message}</p>
                            <Button size="icon-xs" variant="ghost" onClick={dismissBanner} aria-label="Dismiss banner">
                                <X className="size-3" />
                            </Button>
                        </div>
                    </div>
                ) : null}

                <main
                    className="min-h-0 flex-1"
                    onDragOver={(event) => {
                        if (activeWorkspace !== "chat") return
                        event.preventDefault()
                        setDropActive(true)
                    }}
                    onDragLeave={() => {
                        if (activeWorkspace !== "chat") return
                        setDropActive(false)
                    }}
                    onDrop={(event) => {
                        if (activeWorkspace !== "chat") return
                        void onDrop(event)
                    }}
                >
                    <div className="flex h-full min-h-0">
                        {activeWorkspace === "chat" ? (
                            <>
                        <section className="flex min-w-0 flex-1 flex-col">
                            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8">
                                {!hydrated || loading ? (
                                    <div className="mx-auto max-w-3xl space-y-4">
                                        <Skeleton className="h-20 w-full" />
                                        <Skeleton className="h-20 w-[90%]" />
                                        <Skeleton className="h-20 w-full" />
                                    </div>
                                ) : activeConversation ? (
                                    <div className="mx-auto max-w-3xl space-y-4">
                                        {activeConversation.messages.map((message) => (
                                            <div key={message.id} className="space-y-1">
                                                <MessageRow
                                                    message={message}
                                                    onEdit={(value) => editUserMessage(activeConversation.id, message.id, value)}
                                                    onRetry={() => retryLastAssistant(activeConversation.id, message.id)}
                                                    onFeedback={(value) => setMessageFeedback(activeConversation.id, message.id, value)}
                                                />

                                                {hasFirstAssistantResponse && message.id === latestAssistantMessageId && activeFollowUps.length > 0 ? (
                                                    <div className="mr-auto w-full max-w-[88%] rounded-xl border border-primary/20 bg-primary/5 p-3">
                                                        <p className="text-xs font-semibold text-primary">Wanna deepdive it?</p>
                                                        <div className="mt-2 flex flex-wrap gap-2">
                                                            {activeFollowUps.map((followUp) => (
                                                                <Button
                                                                    key={followUp}
                                                                    size="sm"
                                                                    variant="outline"
                                                                    className="h-auto rounded-full px-3 py-1.5 text-xs"
                                                                    onClick={() => { void submitMessage(followUp) }}
                                                                    disabled={processing}
                                                                >
                                                                    {followUp}
                                                                </Button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ) : null}
                                            </div>
                                        ))}
                                        <div ref={messageEndRef} />
                                    </div>
                                ) : (
                                    <EmptyState
                                        onPrompt={(prompt) => setComposerValue(prompt)}
                                        onUpload={() => fileInputRef.current?.click()}
                                        onSubmit={(value) => { void submitMessage(value) }}
                                        value={composerValue}
                                        onValueChange={setComposerValue}
                                        processing={processing}
                                    />
                                )}
                            </div>

                            {activeConversation ? (
                                <div className="px-4 pb-3 pt-1 sm:px-8">
                                    <div className="mx-auto max-w-3xl space-y-2">
                                        {pendingAttachments.length ? (
                                            <div className="flex flex-wrap gap-2">
                                                {pendingAttachments.map((attachment) => (
                                                    <div key={attachment.id} className="flex items-center gap-2 rounded-full border px-3 py-1 text-xs">
                                                        <FileSpreadsheet className="size-3.5" />
                                                        <span>{attachment.name}</span>
                                                        <span className="text-muted-foreground">{formatFileSize(attachment.size)}</span>
                                                        <Badge variant={attachment.status === "ready" ? "secondary" : attachment.status === "error" ? "destructive" : "outline"}>
                                                            {attachment.status}
                                                        </Badge>
                                                        <button type="button" onClick={() => removePendingAttachment(attachment.id)} aria-label="Remove attachment">
                                                            <X className="size-3.5" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : null}

                                        <div className={cn("rounded-xl border bg-card px-2 py-1.5 shadow-sm", dropActive && "border-primary bg-primary/5")}>
                                            <div className="flex items-center gap-1.5">
                                                <Button size="icon-sm" variant="ghost" onClick={() => fileInputRef.current?.click()} aria-label="Upload file">
                                                    <Paperclip className="size-4" />
                                                </Button>

                                                <Textarea
                                                    value={composerValue}
                                                    onChange={(event) => setComposerValue(event.target.value)}
                                                    rows={1}
                                                    className="max-h-24 min-h-9 flex-1 resize-none border-0 bg-transparent px-0 py-1.5 shadow-none focus-visible:ring-0"
                                                    placeholder="Ask anything about your data..."
                                                    onKeyDown={(event) => {
                                                        if (event.key === "Enter" && !event.shiftKey) {
                                                            event.preventDefault()
                                                            void submitMessage(composerValue)
                                                        }
                                                    }}
                                                />

                                                {processing ? (
                                                    <Button size="icon-sm" variant="destructive" onClick={stopGenerating} aria-label="Stop generation">
                                                        <X className="size-4" />
                                                    </Button>
                                                ) : (
                                                    <Button
                                                        size="sm"
                                                        className="h-8 rounded-full px-2.5"
                                                        onClick={() => void submitMessage(composerValue)}
                                                        disabled={!composerValue.trim()}
                                                        aria-label="Send message"
                                                    >
                                                        <ArrowUp className="size-3.5" />
                                                        <SendHorizontal className="size-3" />
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : null}
                        </section>

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv,text/csv"
                            multiple
                            className="hidden"
                            onChange={async (event) => {
                                if (!event.target.files) return
                                await handleFiles(event.target.files)
                                event.target.value = ""
                            }}
                        />

                        <AnimatePresence>
                            {hasUploadedData && detailsOpen ? (
                                <motion.aside
                                    initial={{ opacity: 0, x: 24 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 24 }}
                                    transition={{ duration: 0.24, ease: "easeOut" }}
                                    className="hidden shrink-0 resize-x overflow-auto border-l bg-card/60 p-4 xl:block"
                                    style={{ width: "clamp(320px, 28vw, 520px)" }}
                                >
                                    <div className="space-y-4">
                                        <Card>
                                            <CardHeader>
                                                <CardTitle className="text-sm">Current chat context</CardTitle>
                                                <CardDescription>Files and metadata scoped to this conversation</CardDescription>
                                            </CardHeader>
                                            <CardContent className="space-y-3 text-xs">
                                                <p className="text-muted-foreground">Attached files in this conversation only.</p>
                                                {(activeConversation?.attachments ?? pendingAttachments).slice(0, 6).map((attachment) => (
                                                    <div key={attachment.id} className="rounded-md border p-2">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="truncate font-medium">{attachment.name}</span>
                                                            <Badge variant="outline">{attachment.status}</Badge>
                                                        </div>
                                                        <p className="mt-1 text-muted-foreground">{formatFileSize(attachment.size)}</p>
                                                        {attachment.dataset ? (
                                                            <div className="mt-2 space-y-2">
                                                                {(() => {
                                                                    const dataset = attachment.dataset
                                                                    return (
                                                                        <>
                                                                            <p className="font-medium">{dataset.tableName}</p>
                                                                            {dataset.parseError ? (
                                                                                <p className="text-destructive">{attachment.dataset.parseError}</p>
                                                                            ) : (
                                                                                <>
                                                                                    <p className="text-muted-foreground">
                                                                                        {dataset.columns.length} cols • {dataset.rowCount.toLocaleString()} rows
                                                                                    </p>
                                                                                    <div className="overflow-x-auto rounded border">
                                                                                        <table className="w-full text-[11px]">
                                                                                            <thead>
                                                                                                <tr>
                                                                                                    {dataset.columns.map((column) => (
                                                                                                        <th key={column} className="border-b px-2 py-1 text-left">{column}</th>
                                                                                                    ))}
                                                                                                </tr>
                                                                                            </thead>
                                                                                            <tbody>
                                                                                                {dataset.sampleRows.slice(0, 3).map((row, index) => (
                                                                                                    <tr key={index}>
                                                                                                        {dataset.columns.map((column) => (
                                                                                                            <td key={column} className="border-b px-2 py-1 text-muted-foreground">
                                                                                                                {String(row[column] ?? "")}
                                                                                                            </td>
                                                                                                        ))}
                                                                                                    </tr>
                                                                                                ))}
                                                                                            </tbody>
                                                                                        </table>
                                                                                    </div>
                                                                                </>
                                                                            )}
                                                                        </>
                                                                    )
                                                                })()}
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                ))}
                                            </CardContent>
                                        </Card>
                                    </div>
                                </motion.aside>
                            ) : null}
                        </AnimatePresence>
                            </>
                        ) : (
                            <section className="flex min-w-0 flex-1 flex-col p-4 sm:p-6">
                                <GmailInlinePanel />
                            </section>
                        )}
                    </div>
                </main>
            </div>

            <Dialog open={settingsOpen} onOpenChange={handleSettingsOpenChange}>
                <DialogContent className="h-[min(90vh,860px)] w-[calc(100vw-1rem)] max-w-none gap-0 overflow-hidden p-0 sm:h-[min(86vh,760px)] sm:w-[min(96vw,1100px)] sm:max-w-[min(96vw,1100px)]">
                    <form
                        className="flex h-full min-h-0 flex-col"
                        onSubmit={settingsForm.handleSubmit(async (values) => {
                            setSavingSettings(true)
                            try {
                                const dirtyAccount = settingsForm.formState.dirtyFields.account
                                if (dirtyAccount?.displayName || dirtyAccount?.email) {
                                    await saveAccountProfile({
                                        displayName: values.account.displayName,
                                        email: values.account.email,
                                    })
                                }

                                await updateSettings(values)
                                pushToast("success", "Settings saved", "Your profile and workspace preferences were updated.")
                                setSettingsOpen(false)
                            } catch (error) {
                                pushToast("error", "Unable to save settings", error instanceof Error ? error.message : "Please try again.")
                            } finally {
                                setSavingSettings(false)
                            }
                        })}
                    >
                        <DialogHeader className="border-b px-4 py-4 sm:px-6">
                            <DialogTitle className="flex items-center gap-2">
                                Workspace settings
                                {hasUnsavedSettings ? <Badge variant="outline">Unsaved changes</Badge> : null}
                            </DialogTitle>
                            <DialogDescription>
                                Manage account, security, notifications, and personalization in one place.
                            </DialogDescription>
                        </DialogHeader>

                        <Tabs
                            orientation="vertical"
                            className="min-h-0 flex-1 gap-0"
                            value={settingsTab}
                            onValueChange={(value) => setSettingsTab(value as SettingsTab)}
                        >
                            <aside className="border-b bg-muted/25 p-2 sm:w-56 sm:border-r sm:border-b-0 md:w-64">
                                <TabsList className="h-full w-full flex-col items-stretch justify-start rounded-none bg-transparent p-0">
                                    <TabsTrigger value="general" className="h-9 justify-start gap-2 px-3"><Settings2 className="size-4" />General</TabsTrigger>
                                    <TabsTrigger value="notifications" className="h-9 justify-start gap-2 px-3"><Bell className="size-4" />Notifications</TabsTrigger>
                                    <TabsTrigger value="personalization" className="h-9 justify-start gap-2 px-3"><SlidersHorizontal className="size-4" />Personalization</TabsTrigger>
                                    <TabsTrigger value="apps" className="h-9 justify-start gap-2 px-3"><Grid2x2 className="size-4" />Apps</TabsTrigger>
                                    <TabsTrigger value="data-controls" className="h-9 justify-start gap-2 px-3"><Database className="size-4" />Data controls</TabsTrigger>
                                    <TabsTrigger value="security" className="h-9 justify-start gap-2 px-3"><ShieldCheck className="size-4" />Security</TabsTrigger>
                                    <TabsTrigger value="account" className="h-9 justify-start gap-2 px-3"><UserCircle2 className="size-4" />Account</TabsTrigger>
                                </TabsList>
                            </aside>

                            <section className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
                                <TabsContent value="general" className="space-y-4">
                                    {showSecurityNudge ? (
                                        <div className="rounded-2xl border bg-card p-4">
                                            <div className="flex items-start justify-between gap-4">
                                                <div>
                                                    <p className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-4" />Secure your account</p>
                                                    <p className="mt-1 text-sm text-muted-foreground">Add multi-factor authentication to better protect your workspace login.</p>
                                                    <Button type="button" variant="outline" className="mt-3" onClick={() => openSettingsAt("security")}>
                                                        Set up MFA
                                                    </Button>
                                                </div>
                                                <Button type="button" size="icon-xs" variant="ghost" onClick={() => setShowSecurityNudge(false)} aria-label="Dismiss security recommendation">
                                                    <X className="size-3" />
                                                </Button>
                                            </div>
                                        </div>
                                    ) : null}

                                    <div className="rounded-2xl border">
                                        <div className="flex items-center justify-between gap-4 border-b px-4 py-3">
                                            <div>
                                                <p className="text-sm font-medium">Appearance</p>
                                            </div>
                                            <Select
                                                value={settingsForm.watch("theme")}
                                                onValueChange={(value) => settingsForm.setValue("theme", value as SettingsForm["theme"], { shouldDirty: true })}
                                            >
                                                <SelectTrigger id="settings-theme" className="w-44"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="light">Light</SelectItem>
                                                    <SelectItem value="dark">Dark</SelectItem>
                                                    <SelectItem value="system">System</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="flex items-center justify-between gap-4 border-b px-4 py-3">
                                            <p className="text-sm font-medium">Accent color</p>
                                            <Select
                                                value={settingsForm.watch("accentColor")}
                                                onValueChange={(value) => settingsForm.setValue("accentColor", value as SettingsForm["accentColor"], { shouldDirty: true })}
                                            >
                                                <SelectTrigger id="settings-accent" className="w-44"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    {ACCENT_OPTIONS.map((option) => (
                                                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="flex items-center justify-between gap-4 border-b px-4 py-3">
                                            <p className="text-sm font-medium">Language</p>
                                            <Select
                                                value={settingsForm.watch("language")}
                                                onValueChange={(value) => settingsForm.setValue("language", value as SettingsForm["language"], { shouldDirty: true })}
                                            >
                                                <SelectTrigger id="settings-language" className="w-44"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    {LANGUAGE_OPTIONS.map((option) => (
                                                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="flex items-center justify-between gap-4 border-b px-4 py-3">
                                            <p className="text-sm font-medium">Spoken language</p>
                                            <Select
                                                value={settingsForm.watch("spokenLanguage")}
                                                onValueChange={(value) => settingsForm.setValue("spokenLanguage", value as SettingsForm["spokenLanguage"], { shouldDirty: true })}
                                            >
                                                <SelectTrigger id="settings-spoken-language" className="w-44"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="english">English</SelectItem>
                                                    <SelectItem value="spanish">Spanish</SelectItem>
                                                    <SelectItem value="french">French</SelectItem>
                                                    <SelectItem value="german">German</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="flex items-center justify-between gap-4 px-4 py-3">
                                            <p className="text-sm font-medium">Timezone</p>
                                            <Select
                                                value={settingsForm.watch("timezone")}
                                                onValueChange={(value) => {
                                                    if (!value) return
                                                    settingsForm.setValue("timezone", value, { shouldDirty: true })
                                                }}
                                            >
                                                <SelectTrigger id="settings-timezone" className="w-56"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    {TIMEZONE_OPTIONS.map((timezone) => (
                                                        <SelectItem key={timezone} value={timezone}>{timezone}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </TabsContent>

                                <TabsContent value="notifications" className="space-y-3">
                                    <div className="rounded-xl border p-4">
                                        <div className="mb-3 flex items-center gap-2">
                                            <Bell className="size-4 text-primary" />
                                            <p className="font-medium">Notification preferences</p>
                                        </div>

                                        <div className="space-y-3 text-sm">
                                            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                                                <div>
                                                    <p className="font-medium">Email notifications</p>
                                                    <p className="text-xs text-muted-foreground">Receive account and report updates via email.</p>
                                                </div>
                                                <Switch
                                                    checked={settingsForm.watch("notifications.email")}
                                                    onCheckedChange={(value) => settingsForm.setValue("notifications.email", value, { shouldDirty: true })}
                                                />
                                            </div>

                                            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                                                <div>
                                                    <p className="font-medium">Push notifications</p>
                                                    <p className="text-xs text-muted-foreground">Get in-app alerts for important conversation events.</p>
                                                </div>
                                                <Switch
                                                    checked={settingsForm.watch("notifications.push")}
                                                    onCheckedChange={(value) => settingsForm.setValue("notifications.push", value, { shouldDirty: true })}
                                                />
                                            </div>

                                            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                                                <div>
                                                    <p className="font-medium">Product updates</p>
                                                    <p className="text-xs text-muted-foreground">Receive updates about new features and releases.</p>
                                                </div>
                                                <Switch
                                                    checked={settingsForm.watch("notifications.productUpdates")}
                                                    onCheckedChange={(value) => settingsForm.setValue("notifications.productUpdates", value, { shouldDirty: true })}
                                                />
                                            </div>

                                            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                                                <div>
                                                    <p className="font-medium">Mentions</p>
                                                    <p className="text-xs text-muted-foreground">Notify me when I am mentioned in shared spaces.</p>
                                                </div>
                                                <Switch
                                                    checked={settingsForm.watch("notifications.mentions")}
                                                    onCheckedChange={(value) => settingsForm.setValue("notifications.mentions", value, { shouldDirty: true })}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </TabsContent>

                                <TabsContent value="personalization" className="space-y-4">
                                    <div className="rounded-xl border p-4">
                                        <p className="font-medium">Assistant behavior</p>
                                        <p className="mt-1 text-xs text-muted-foreground">Customize how RevOpsly responds and guides you.</p>

                                        <div className="mt-4 space-y-3 text-sm">
                                            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                                                <div>
                                                    <p className="font-medium">Response style</p>
                                                </div>
                                                <Select
                                                    value={settingsForm.watch("responseStyle")}
                                                    onValueChange={(value) => settingsForm.setValue("responseStyle", value as SettingsForm["responseStyle"], { shouldDirty: true })}
                                                >
                                                    <SelectTrigger id="settings-response-style" className="w-44"><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="balanced">Balanced</SelectItem>
                                                        <SelectItem value="concise">Concise</SelectItem>
                                                        <SelectItem value="detailed">Detailed</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                                                <div>
                                                    <p className="font-medium">Keyboard hints</p>
                                                    <p className="text-xs text-muted-foreground">Show quick shortcuts near the composer.</p>
                                                </div>
                                                <Switch
                                                    checked={settingsForm.watch("keyboardHints")}
                                                    onCheckedChange={(value) => settingsForm.setValue("keyboardHints", value, { shouldDirty: true })}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </TabsContent>

                                <TabsContent value="apps" className="space-y-4">
                                    <div className="rounded-xl border p-4">
                                        <p className="font-medium">Connected apps</p>
                                        <p className="mt-1 text-sm text-muted-foreground">Connect Slack, HubSpot, Salesforce, and other tools in this section.</p>
                                        <div className="mt-4 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                                            App integrations are currently placeholder-only. Backend connector wiring can be added next.
                                        </div>
                                    </div>
                                </TabsContent>

                                <TabsContent value="data-controls" className="space-y-4">
                                    <div className="rounded-xl border p-4">
                                        <p className="font-medium">Data controls</p>
                                        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                                            <div>
                                                <p className="font-medium">Privacy mode</p>
                                                <p className="text-xs text-muted-foreground">Limit exposed context in generated answers.</p>
                                            </div>
                                            <Switch
                                                checked={settingsForm.watch("privacyMode")}
                                                onCheckedChange={(value) => settingsForm.setValue("privacyMode", value, { shouldDirty: true })}
                                            />
                                        </div>

                                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                                            <div>
                                                <p className="font-medium">Clear chat history</p>
                                                <p className="text-xs text-muted-foreground">Removes all persisted local conversation records.</p>
                                            </div>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={async () => {
                                                    try {
                                                        await clearHistory()
                                                        pushToast("success", "History cleared", "Local chat history has been reset.")
                                                    } catch (error) {
                                                        pushToast("error", "Unable to clear history", error instanceof Error ? error.message : "Please try again.")
                                                    }
                                                }}
                                            >
                                                Clear history
                                            </Button>
                                        </div>
                                    </div>
                                </TabsContent>

                                <TabsContent value="security" className="space-y-4">
                                    <div className="rounded-xl border p-4">
                                        <div className="mb-3 flex items-center gap-2">
                                            <ShieldCheck className="size-4 text-primary" />
                                            <p className="font-medium">Security controls</p>
                                        </div>

                                        <div className="space-y-3 text-sm">
                                            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                                                <div>
                                                    <p className="font-medium">Change password</p>
                                                    <p className="text-xs text-muted-foreground">Trigger password update flow.</p>
                                                </div>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    onClick={async () => {
                                                        try {
                                                            const currentPassword = window.prompt("Enter current password")
                                                            if (!currentPassword) return
                                                            const newPassword = window.prompt("Enter new password")
                                                            if (!newPassword) return
                                                            await changePassword(currentPassword, newPassword)
                                                            pushToast("success", "Password updated", "Your password has been changed.")
                                                        } catch (error) {
                                                            pushToast("error", "Password update failed", error instanceof Error ? error.message : "Unable to update password right now.")
                                                        }
                                                    }}
                                                >
                                                    Change password
                                                </Button>
                                            </div>

                                            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                                                <div>
                                                    <p className="font-medium">Two-factor authentication</p>
                                                    <p className="text-xs text-muted-foreground">Add another layer of account protection.</p>
                                                </div>
                                                <Switch
                                                    checked={settingsForm.watch("security.twoFactorEnabled")}
                                                    onCheckedChange={async (value) => {
                                                        try {
                                                            await setTwoFactorEnabled(value)
                                                            settingsForm.setValue("security.twoFactorEnabled", value, { shouldDirty: true })
                                                            pushToast("success", value ? "2FA enabled" : "2FA disabled", "Security preference updated.")
                                                        } catch (error) {
                                                            pushToast("error", "2FA update failed", error instanceof Error ? error.message : "Unable to update 2FA setting.")
                                                        }
                                                    }}
                                                />
                                            </div>

                                            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                                                <div>
                                                    <p className="font-medium">Active sessions</p>
                                                    <p className="text-xs text-muted-foreground">Currently {settingsForm.watch("security.activeSessions")} active session(s).</p>
                                                </div>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    onClick={async () => {
                                                        try {
                                                            const count = await refreshActiveSessions()
                                                            settingsForm.setValue("security.activeSessions", count, { shouldDirty: true })
                                                            pushToast("success", "Sessions refreshed", `${count} active session(s) detected.`)
                                                        } catch (error) {
                                                            pushToast("error", "Session refresh failed", error instanceof Error ? error.message : "Unable to fetch active sessions.")
                                                        }
                                                    }}
                                                >
                                                    Refresh
                                                </Button>
                                            </div>

                                            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                                                <div>
                                                    <p className="font-medium text-destructive">Sign out all sessions</p>
                                                    <p className="text-xs text-muted-foreground">Force sign out from all devices, including this one.</p>
                                                </div>
                                                <Button
                                                    type="button"
                                                    variant="destructive"
                                                    onClick={async () => {
                                                        const confirmed = window.confirm("Sign out all active sessions?")
                                                        if (!confirmed) return
                                                        try {
                                                            await signOutAllSessions()
                                                            settingsForm.setValue("security.activeSessions", 1, { shouldDirty: true })
                                                            pushToast("success", "Sessions signed out", "All secondary sessions were terminated.")
                                                        } catch (error) {
                                                            pushToast("error", "Unable to sign out sessions", error instanceof Error ? error.message : "Please try again.")
                                                        }
                                                    }}
                                                >
                                                    Sign out all
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </TabsContent>

                                <TabsContent value="account" className="space-y-4">
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <div className="space-y-2 sm:col-span-2">
                                            <Label htmlFor="account-display-name">Display name</Label>
                                            <Input
                                                id="account-display-name"
                                                value={settingsForm.watch("account.displayName")}
                                                onChange={(event) => settingsForm.setValue("account.displayName", event.target.value, { shouldDirty: true, shouldValidate: true })}
                                            />
                                            {settingsForm.formState.errors.account?.displayName ? (
                                                <p className="text-xs text-destructive">{settingsForm.formState.errors.account.displayName.message}</p>
                                            ) : null}
                                        </div>

                                        <div className="space-y-2 sm:col-span-2">
                                            <Label htmlFor="account-email">Email</Label>
                                            <Input
                                                id="account-email"
                                                type="email"
                                                value={settingsForm.watch("account.email")}
                                                onChange={(event) => settingsForm.setValue("account.email", event.target.value, { shouldDirty: true, shouldValidate: true })}
                                            />
                                            {settingsForm.formState.errors.account?.email ? (
                                                <p className="text-xs text-destructive">{settingsForm.formState.errors.account.email.message}</p>
                                            ) : null}
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="account-role">Role</Label>
                                            <Input
                                                id="account-role"
                                                value={settingsForm.watch("account.role")}
                                                onChange={(event) => settingsForm.setValue("account.role", event.target.value, { shouldDirty: true, shouldValidate: true })}
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="account-plan">Plan</Label>
                                            <Select
                                                value={settingsForm.watch("account.plan")}
                                                onValueChange={(value) => settingsForm.setValue("account.plan", value as SettingsForm["account"]["plan"], { shouldDirty: true })}
                                            >
                                                <SelectTrigger id="account-plan"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="starter">Starter</SelectItem>
                                                    <SelectItem value="growth">Growth</SelectItem>
                                                    <SelectItem value="enterprise">Enterprise</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between rounded-xl border p-4">
                                        <div>
                                            <p className="font-medium">Billing and usage</p>
                                            <p className="text-xs text-muted-foreground">Open billing portal placeholder for subscription management.</p>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={async () => {
                                                try {
                                                    await openBillingPortal()
                                                    pushToast("success", "Billing opened", "Billing portal placeholder action completed.")
                                                } catch (error) {
                                                    pushToast("error", "Billing unavailable", error instanceof Error ? error.message : "Unable to open billing right now.")
                                                }
                                            }}
                                        >
                                            <CreditCard className="size-4" />
                                            Open billing
                                        </Button>
                                    </div>
                                </TabsContent>
                            </section>
                        </Tabs>

                        <div className="flex flex-wrap items-center gap-2 border-t bg-muted/30 px-4 py-3 sm:px-6">
                            <div className="mr-auto flex items-center gap-2 text-xs text-muted-foreground">
                                <Badge variant="outline" className="gap-1">
                                    <ShieldCheck className="size-3" />
                                    Structured settings panel
                                </Badge>
                                <span>Layout updated to a vertical section navigator.</span>
                            </div>

                            <Button type="button" variant="outline" onClick={handleCancelSettings}>Cancel</Button>
                            <Button type="submit" disabled={!hasUnsavedSettings || savingSettings}>
                                {savingSettings ? "Saving..." : "Save changes"}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Keyboard shortcuts</DialogTitle>
                        <DialogDescription>Boost your speed with quick actions.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-2 text-sm">
                        <div className="flex items-center justify-between rounded-md border px-3 py-2"><span>Send message</span><kbd className="rounded bg-muted px-2 py-1 text-xs">Enter</kbd></div>
                        <div className="flex items-center justify-between rounded-md border px-3 py-2"><span>New line</span><kbd className="rounded bg-muted px-2 py-1 text-xs">Shift + Enter</kbd></div>
                        <div className="flex items-center justify-between rounded-md border px-3 py-2"><span>Open new chat</span><kbd className="rounded bg-muted px-2 py-1 text-xs">Ctrl + K</kbd></div>
                        <div className="flex items-center justify-between rounded-md border px-3 py-2"><span>Search history</span><kbd className="rounded bg-muted px-2 py-1 text-xs">Ctrl + /</kbd></div>
                    </div>
                </DialogContent>
            </Dialog>

            <div className="pointer-events-none fixed top-3 right-3 z-[60] flex max-w-sm flex-col gap-2" aria-live="polite" aria-atomic="true">
                {toasts.map((toast) => (
                    <motion.div
                        key={toast.id}
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className={cn(
                            "pointer-events-auto rounded-xl border bg-background p-3 shadow-lg",
                            toast.type === "error" ? "border-destructive/40" : "border-primary/30"
                        )}
                    >
                        <div className="flex items-start gap-2">
                            <span className={cn("mt-0.5", toast.type === "error" ? "text-destructive" : "text-primary")}>
                                {toast.type === "error" ? <CircleAlert className="size-4" /> : <CircleCheck className="size-4" />}
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium">{toast.title}</p>
                                {toast.description ? <p className="text-xs text-muted-foreground">{toast.description}</p> : null}
                            </div>
                            <Button
                                size="icon-xs"
                                variant="ghost"
                                className="-mt-1"
                                onClick={() => dismissToast(toast.id)}
                                aria-label="Dismiss notification"
                            >
                                <X className="size-3" />
                            </Button>
                        </div>
                    </motion.div>
                ))}
            </div>

            <div className="fixed bottom-3 right-3 hidden gap-2 md:flex">
                {activeWorkspace === "chat" && activeConversation ? (
                    <>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                                const text = exportConversation(activeConversation.id)
                                navigator.clipboard.writeText(text)
                            }}
                        >
                            <Download className="size-4" />
                            Export
                        </Button>
                    </>
                ) : null}
            </div>
        </div>
    )
}
