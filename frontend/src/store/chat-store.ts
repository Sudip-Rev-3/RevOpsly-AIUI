"use client"

import { create } from "zustand"

import {
    askQuestionApi,
    cancelSessionRunApi,
    clearAllHistory,
    changePasswordApi,
    createSessionApi,
    defaultSettings,
    delay,
    getSessionApi,
    healthApi,
    loadPersistedState,
    mergeSettings,
    openBillingPortalApi,
    refreshActiveSessionsApi,
    saveAccountProfileApi,
    savePersistedState,
    signOutAllSessionsApi,
    submitFeedbackApi,
    updateTwoFactorApi,
    uploadCsvApi,
    isExecutionDebugModeEnabled,
} from "@/lib/services/chat-service"
import { useAuthStore } from "@/store/auth-store"
import {
    buildMessageKey,
    clampText,
    createAssistantDraft,
    filterOwnedConversations,
    groupConversationUpdate,
    mergeAttachmentsFromBackend,
    normalizeExecutionDetails,
    nowIso,
    SUGGESTED_PROMPTS,
    toSessionId,
    toTitle,
} from "@/store/chat-store.helpers"
import type {
    AppSettings,
    ChatAttachment,
    ChatMessage,
    Conversation,
    MessageFeedback,
} from "@/types/chat"

let activeAbortController: AbortController | null = null

type BannerType = "error" | "warning" | "info"

interface BannerState {
    type: BannerType
    message: string
}

interface ChatStore {
    workspaceUserId: number | null
    hydrated: boolean
    loading: boolean
    processing: boolean
    error: string | null
    rateLimited: boolean
    banner: BannerState | null
    conversations: Conversation[]
    activeConversationId: string | null
    detailsOpen: boolean
    settingsOpen: boolean
    shortcutsOpen: boolean
    onboardingOpen: boolean
    mobileSidebarOpen: boolean
    searchTerm: string
    pendingAttachments: ChatAttachment[]
    sessionFollowUps: Record<string, string[]>
    settings: AppSettings
    initialize: (userId: number | null) => Promise<void>
    setActiveConversation: (conversationId: string | null) => void
    setSearchTerm: (value: string) => void
    setMobileSidebarOpen: (value: boolean) => void
    setDetailsOpen: (value: boolean) => void
    setSettingsOpen: (value: boolean) => void
    setShortcutsOpen: (value: boolean) => void
    setOnboardingOpen: (value: boolean) => void
    dismissBanner: () => void
    startFreshChat: () => void
    createConversation: (title?: string) => Promise<string>
    renameConversation: (conversationId: string, title: string) => void
    deleteConversation: (conversationId: string) => void
    archiveConversation: (conversationId: string) => void
    togglePinConversation: (conversationId: string) => void
    toggleShareConversation: (conversationId: string) => void
    setConversationTags: (conversationId: string, tags: string[]) => void
    addPendingAttachment: (attachment: ChatAttachment) => void
    removePendingAttachment: (attachmentId: string) => void
    clearPendingAttachments: () => void
    markAttachmentProgress: (attachmentId: string, progress: number, status?: ChatAttachment["status"]) => void
    sendMessage: (content: string) => Promise<void>
    stopGenerating: () => void
    retryLastAssistant: (conversationId: string, assistantMessageId: string) => Promise<void>
    editUserMessage: (conversationId: string, messageId: string, content: string) => void
    deleteMessage: (conversationId: string, messageId: string) => void
    setMessageFeedback: (conversationId: string, messageId: string, value: MessageFeedback) => void
    exportConversation: (conversationId: string) => string
    updateSettings: (next: Partial<AppSettings>) => Promise<void>
    saveAccountProfile: (payload: { displayName: string; email: string }) => Promise<void>
    openBillingPortal: () => Promise<void>
    changePassword: (currentPassword: string, newPassword: string) => Promise<void>
    setTwoFactorEnabled: (enabled: boolean) => Promise<void>
    refreshActiveSessions: () => Promise<number>
    signOutAllSessions: () => Promise<void>
    clearHistory: () => Promise<void>
}

async function persistSnapshot(
    conversations: Conversation[],
    settings: AppSettings,
    onboardingSeen: boolean,
    workspaceUserId: number | null,
) {
    const currentAuthUserId = useAuthStore.getState().user?.id ?? null
    if (currentAuthUserId !== workspaceUserId) {
        return
    }

    const sanitizedConversations = conversations.map((conversation) => ({
        ...conversation,
        attachments: conversation.attachments.map((attachment) => {
            const cloned = { ...(attachment as ChatAttachment & { rawFile?: File }) }
            delete cloned.rawFile
            return cloned
        }),
    }))
    await savePersistedState({ conversations: sanitizedConversations, settings, onboardingSeen }, workspaceUserId)
}

export const useChatStore = create<ChatStore>((set, get) => ({
    workspaceUserId: null,
    hydrated: false,
    loading: false,
    processing: false,
    error: null,
    rateLimited: false,
    banner: null,
    conversations: [],
    activeConversationId: null,
    detailsOpen: false,
    settingsOpen: false,
    shortcutsOpen: false,
    onboardingOpen: false,
    mobileSidebarOpen: false,
    searchTerm: "",
    pendingAttachments: [],
    sessionFollowUps: {},
    settings: defaultSettings,

    initialize: async (userId) => {
        const nextWorkspaceUserId = typeof userId === "number" && Number.isFinite(userId) ? userId : null
        const previousWorkspaceUserId = get().workspaceUserId
        const userChanged = previousWorkspaceUserId !== nextWorkspaceUserId

        if (activeAbortController) {
            activeAbortController.abort()
            activeAbortController = null
        }

        if (userChanged) {
            set({
                workspaceUserId: nextWorkspaceUserId,
                hydrated: false,
                loading: true,
                processing: false,
                error: null,
                rateLimited: false,
                banner: null,
                conversations: [],
                activeConversationId: null,
                detailsOpen: false,
                settingsOpen: false,
                shortcutsOpen: false,
                onboardingOpen: false,
                mobileSidebarOpen: false,
                searchTerm: "",
                pendingAttachments: [],
                sessionFollowUps: {},
                settings: defaultSettings,
            })
        } else {
            set({ loading: true, error: null, workspaceUserId: nextWorkspaceUserId })
        }

        try {
            const persisted = await loadPersistedState(nextWorkspaceUserId)
            let backendOnline = true

            try {
                await healthApi()
            } catch {
                backendOnline = false
            }

            set({
                hydrated: true,
                loading: false,
                workspaceUserId: nextWorkspaceUserId,
                conversations: persisted.conversations ?? [],
                settings: persisted.settings,
                onboardingOpen: false,
                activeConversationId: null,
                banner: backendOnline ? null : { type: "warning", message: "Backend is offline. Realtime chat requests may fail." },
            })

            if (backendOnline && nextWorkspaceUserId !== null && persisted.conversations.length > 0) {
                void (async () => {
                    const scopedUserId = nextWorkspaceUserId
                    const ownedConversations = await filterOwnedConversations(persisted.conversations)
                    if (ownedConversations.length === persisted.conversations.length) {
                        return
                    }
                    if (get().workspaceUserId !== scopedUserId) {
                        return
                    }

                    set({ conversations: ownedConversations, activeConversationId: null })
                    await persistSnapshot(
                        ownedConversations,
                        get().settings,
                        !get().onboardingOpen,
                        get().workspaceUserId,
                    )
                })()
            }
        } catch {
            set({ loading: false, error: "Failed to load chat state." })
        }
    },

    setActiveConversation: (conversationId) => {
        set({
            activeConversationId: conversationId,
            mobileSidebarOpen: false,
            pendingAttachments: [],
        })

        if (!conversationId) {
            return
        }

        void (async () => {
            try {
                const session = await getSessionApi(toSessionId(conversationId))
                const updatedConversations = groupConversationUpdate(get().conversations, conversationId, (conversation) =>
                    mergeAttachmentsFromBackend(conversation, session.files)
                )
                set({ conversations: updatedConversations })
                await persistSnapshot(updatedConversations, get().settings, !get().onboardingOpen, get().workspaceUserId)
            } catch {
                // session sync is best-effort
            }
        })()
    },

    setSearchTerm: (value) => set({ searchTerm: value }),
    setMobileSidebarOpen: (value) => set({ mobileSidebarOpen: value }),
    setDetailsOpen: (value) => set({ detailsOpen: value }),
    setSettingsOpen: (value) => set({ settingsOpen: value }),
    setShortcutsOpen: (value) => set({ shortcutsOpen: value }),
    setOnboardingOpen: (value) => {
        set({ onboardingOpen: value })
        const state = get()
        void persistSnapshot(state.conversations, state.settings, !value, state.workspaceUserId)
    },
    dismissBanner: () => set({ banner: null, rateLimited: false }),

    startFreshChat: () => {
        set({ activeConversationId: null, pendingAttachments: [], error: null, banner: null })
    },

    createConversation: async (title) => {
        const created = await createSessionApi()
        const nextTitle = title?.trim() || "New Chat"
        const conversation: Conversation = {
            id: String(created.id),
            title: nextTitle,
            createdAt: created.created_at,
            updatedAt: created.created_at,
            archived: false,
            pinned: false,
            tags: [],
            shared: false,
            messages: [],
            attachments: [],
        }

        const nextConversations = [conversation, ...get().conversations.filter((item) => item.id !== conversation.id)]
        set({ conversations: nextConversations, activeConversationId: conversation.id })
        await persistSnapshot(nextConversations, get().settings, !get().onboardingOpen, get().workspaceUserId)
        return conversation.id
    },

    renameConversation: (conversationId, title) => {
        const cleaned = title.trim()
        if (!cleaned) return
        const nextConversations = groupConversationUpdate(get().conversations, conversationId, (conversation) => ({
            ...conversation,
            title: cleaned,
            updatedAt: nowIso(),
        }))
        set({ conversations: nextConversations })
        void persistSnapshot(nextConversations, get().settings, !get().onboardingOpen, get().workspaceUserId)
    },

    deleteConversation: (conversationId) => {
        const nextConversations = get().conversations.filter((conversation) => conversation.id !== conversationId)
        const nextActive = get().activeConversationId === conversationId ? null : get().activeConversationId
        const nextFollowUps = { ...get().sessionFollowUps }
        delete nextFollowUps[conversationId]
        set({ conversations: nextConversations, activeConversationId: nextActive, sessionFollowUps: nextFollowUps })
        void persistSnapshot(nextConversations, get().settings, !get().onboardingOpen, get().workspaceUserId)
    },

    archiveConversation: (conversationId) => {
        const nextConversations = groupConversationUpdate(get().conversations, conversationId, (conversation) => ({
            ...conversation,
            archived: !conversation.archived,
            updatedAt: nowIso(),
        }))
        set({ conversations: nextConversations })
        void persistSnapshot(nextConversations, get().settings, !get().onboardingOpen, get().workspaceUserId)
    },

    togglePinConversation: (conversationId) => {
        const nextConversations = groupConversationUpdate(get().conversations, conversationId, (conversation) => ({
            ...conversation,
            pinned: !conversation.pinned,
            updatedAt: nowIso(),
        }))
        set({ conversations: nextConversations })
        void persistSnapshot(nextConversations, get().settings, !get().onboardingOpen, get().workspaceUserId)
    },

    toggleShareConversation: (conversationId) => {
        const nextConversations = groupConversationUpdate(get().conversations, conversationId, (conversation) => ({
            ...conversation,
            shared: !conversation.shared,
            updatedAt: nowIso(),
        }))
        set({ conversations: nextConversations })
        void persistSnapshot(nextConversations, get().settings, !get().onboardingOpen, get().workspaceUserId)
    },

    setConversationTags: (conversationId, tags) => {
        const normalized = tags.map((tag) => tag.trim()).filter(Boolean)
        const nextConversations = groupConversationUpdate(get().conversations, conversationId, (conversation) => ({
            ...conversation,
            tags: normalized,
            updatedAt: nowIso(),
        }))
        set({ conversations: nextConversations })
        void persistSnapshot(nextConversations, get().settings, !get().onboardingOpen, get().workspaceUserId)
    },

    addPendingAttachment: (attachment) => {
        set((state) => ({ pendingAttachments: [attachment, ...state.pendingAttachments] }))
    },

    removePendingAttachment: (attachmentId) => {
        set((state) => ({ pendingAttachments: state.pendingAttachments.filter((attachment) => attachment.id !== attachmentId) }))
    },

    clearPendingAttachments: () => set({ pendingAttachments: [] }),

    markAttachmentProgress: (attachmentId, progress, status) => {
        set((state) => ({
            pendingAttachments: state.pendingAttachments.map((attachment) => {
                if (attachment.id !== attachmentId) return attachment
                return {
                    ...attachment,
                    progress,
                    status: status ?? attachment.status,
                }
            }),
        }))
    },

    stopGenerating: () => {
        const activeConversationId = get().activeConversationId
        if (activeConversationId) {
            void cancelSessionRunApi(toSessionId(activeConversationId)).catch(() => {
                // backend cancel is best-effort
            })
        }

        if (activeAbortController) {
            activeAbortController.abort()
            activeAbortController = null
        }
        set((state) => {
            if (!state.processing) {
                return state
            }

            const updatedConversations = state.activeConversationId
                ? groupConversationUpdate(state.conversations, state.activeConversationId, (conversation) => ({
                    ...conversation,
                    updatedAt: nowIso(),
                    messages: [...conversation.messages].reverse().map((message, index) => {
                        if (index > 0) return message
                        if (message.role !== "assistant" || !message.streaming) return message
                        return {
                            ...message,
                            streaming: false,
                            content: message.content || "Response stopped.",
                            createdAt: nowIso(),
                        }
                    }).reverse(),
                }))
                : state.conversations

            return {
                ...state,
                processing: false,
                conversations: updatedConversations,
                banner: { type: "info", message: "Generation stopped." },
            }
        })
    },

    sendMessage: async (content) => {
        const question = content.trim()
        if (!question || get().processing) return

        if (question.toLowerCase().includes("rate limit")) {
            set({ rateLimited: true, banner: { type: "warning", message: "Rate limit simulated. Please retry in a moment." } })
            return
        }

        set({ processing: true, error: null, banner: null })

        let conversationId = get().activeConversationId
        if (!conversationId) {
            try {
                conversationId = await get().createConversation(toTitle(question))
            } catch (error) {
                set({
                    processing: false,
                    banner: {
                        type: "error",
                        message: error instanceof Error ? error.message : "Failed to create conversation.",
                    },
                })
                return
            }
        }

        const pending = get().pendingAttachments
        const userMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: "user",
            content: question,
            createdAt: nowIso(),
        }

        const assistantMessage = createAssistantDraft()

        let updatedConversations = groupConversationUpdate(get().conversations, conversationId, (conversation) => ({
            ...conversation,
            title: conversation.messages.length === 0 ? toTitle(question) : conversation.title,
            updatedAt: nowIso(),
            attachments: [
                ...pending.map((file) => ({
                    ...file,
                    chatId: conversation.id,
                    status: file.status === "error" ? "error" as const : "processing" as const,
                    progress: file.status === "error" ? 100 : 70,
                })),
                ...conversation.attachments,
            ],
            messages: [...conversation.messages, userMessage, assistantMessage],
        }))

        set({ conversations: updatedConversations, pendingAttachments: [] })

        set((state) => ({
            sessionFollowUps: {
                ...state.sessionFollowUps,
                [conversationId]: [],
            },
        }))

        await persistSnapshot(updatedConversations, get().settings, !get().onboardingOpen, get().workspaceUserId)
        if (pending.length > 0) {
            await delay(420)
        }

        const validCsvAttachments = pending.filter(
            (attachment) => attachment.status !== "error" && Boolean((attachment as ChatAttachment & { rawFile?: File }).rawFile)
        )

        if (validCsvAttachments.length > 1) {
            set({
                banner: {
                    type: "warning",
                    message: "Backend currently accepts one CSV per chat message. Only the first file was used.",
                },
            })
        }

        const csvAttachment = validCsvAttachments[0] as (ChatAttachment & { rawFile?: File }) | undefined

        if (csvAttachment?.rawFile) {
            try {
                const uploaded = await uploadCsvApi(toSessionId(conversationId), csvAttachment.rawFile)
                const uploadedFile = uploaded.files.find((file) => file.filename === csvAttachment.name) ?? uploaded.files[0]
                updatedConversations = groupConversationUpdate(updatedConversations, conversationId, (conversation) => ({
                    ...conversation,
                    attachments: conversation.attachments.map((attachment) =>
                        attachment.id === csvAttachment.id
                            ? {
                                ...attachment,
                                status: "ready",
                                progress: 100,
                                dataset: {
                                    ...(attachment.dataset ?? {
                                        tableName: uploadedFile?.filename ?? attachment.name,
                                        columns: [],
                                        inferredTypes: {},
                                        sampleRows: [],
                                        rowCount: 0,
                                    }),
                                    tableName: uploadedFile?.filename ?? attachment.name,
                                    rowCount: attachment.dataset?.rowCount ?? 0,
                                },
                            }
                            : attachment
                    ),
                }))
                set({ conversations: updatedConversations })
            } catch (error) {
                updatedConversations = groupConversationUpdate(updatedConversations, conversationId, (conversation) => ({
                    ...conversation,
                    attachments: conversation.attachments.map((attachment) =>
                        attachment.id === csvAttachment.id
                            ? {
                                ...attachment,
                                status: "error",
                                progress: 100,
                                dataset: {
                                    ...(attachment.dataset ?? {
                                        tableName: attachment.name,
                                        columns: [],
                                        inferredTypes: {},
                                        sampleRows: [],
                                        rowCount: 0,
                                    }),
                                    parseError: error instanceof Error ? error.message : "Upload failed",
                                },
                            }
                            : attachment
                    ),
                }))
                set({
                    conversations: updatedConversations,
                    banner: { type: "error", message: error instanceof Error ? error.message : "CSV upload failed." },
                })
            }
        }

        const abortController = new AbortController()
        activeAbortController = abortController
        let backendResponse: Awaited<ReturnType<typeof askQuestionApi>>
        const debugExecution = isExecutionDebugModeEnabled()
        try {
            backendResponse = await askQuestionApi(toSessionId(conversationId), question, {
                signal: abortController.signal,
                debug: debugExecution,
            })
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") {
                activeAbortController = null
                updatedConversations = groupConversationUpdate(updatedConversations, conversationId, (conversation) => ({
                    ...conversation,
                    messages: conversation.messages.map((message) =>
                        message.id === assistantMessage.id
                            ? {
                                ...message,
                                streaming: false,
                                content: message.content || "Response stopped.",
                                createdAt: nowIso(),
                            }
                            : message
                    ),
                }))
                set({
                    processing: false,
                    conversations: updatedConversations,
                })
                await persistSnapshot(updatedConversations, get().settings, !get().onboardingOpen, get().workspaceUserId)
                return
            }
            activeAbortController = null
            updatedConversations = groupConversationUpdate(updatedConversations, conversationId, (conversation) => ({
                ...conversation,
                messages: conversation.messages.map((message) =>
                    message.id === assistantMessage.id
                        ? {
                            ...message,
                            streaming: false,
                            error: error instanceof Error ? error.message : "Failed to get response from backend.",
                            content: "I couldn't generate a response right now. Please try again.",
                            createdAt: nowIso(),
                        }
                        : message
                ),
            }))
            set({
                processing: false,
                conversations: updatedConversations,
                banner: { type: "error", message: error instanceof Error ? error.message : "Backend request failed." },
            })
            await persistSnapshot(updatedConversations, get().settings, !get().onboardingOpen, get().workspaceUserId)
            return
        }
        activeAbortController = null

        const rawAnswerText = typeof backendResponse.answer === "string" ? backendResponse.answer : ""
        const fallbackAnswerText = clampText(backendResponse.reason, 600)
        const answerText = rawAnswerText.trim() || fallbackAnswerText || "I couldn't generate a response right now. Please try again."
        const followUps = Array.isArray(backendResponse.follow_ups)
            ? backendResponse.follow_ups.map((item) => String(item).trim()).filter(Boolean).slice(0, 4)
            : []

        const reasoning = {
            strategyUsed: backendResponse.strategy_used,
            reason: backendResponse.reason,
            confidence: backendResponse.confidence,
        }

        const reportFile = (() => {
            const payload = backendResponse.report_file
            if (!payload || typeof payload !== "object") {
                return undefined
            }

            const name = clampText(payload.name, 180)
            const url = clampText(payload.url, 500)
            const path = clampText(payload.path, 500)
            const generatedAt = clampText(payload.generated_at, 80)
            const parsedSize = Number(payload.size_bytes)
            const sizeBytes = Number.isFinite(parsedSize) && parsedSize >= 0 ? Math.floor(parsedSize) : 0

            if (!name || !url) {
                return undefined
            }

            return {
                name,
                url,
                path,
                sizeBytes,
                generatedAt,
            }
        })()

        const executionDetails = normalizeExecutionDetails(backendResponse.execution_details)
        const shouldAnimateStreaming =
            backendResponse.reason !== "Small-talk shortcut response." &&
            answerText.length > 0

        const chars = [...answerText]
        let index = 0

        if (shouldAnimateStreaming) {
            while (index < chars.length) {
                if (!get().processing) {
                    break
                }
                index += Math.max(1, Math.floor(Math.random() * 8))
                const chunk = chars.slice(0, index).join("")
                updatedConversations = groupConversationUpdate(updatedConversations, conversationId, (conversation) => ({
                    ...conversation,
                    updatedAt: nowIso(),
                    messages: conversation.messages.map((message) =>
                        message.id === assistantMessage.id
                            ? {
                                ...message,
                                content: chunk,
                                streaming: true,
                            }
                            : message
                    ),
                }))

                set({ conversations: updatedConversations })
                await delay(20)
            }
        }

        updatedConversations = groupConversationUpdate(updatedConversations, conversationId, (conversation) => ({
            ...conversation,
            updatedAt: nowIso(),
            messages: conversation.messages.map((message) =>
                message.id === assistantMessage.id
                    ? {
                        ...message,
                        content: answerText,
                        streaming: false,
                        createdAt: nowIso(),
                        messageKey: backendResponse.message_key,
                        reasoning,
                        reportFile,
                        executionDetails,
                    }
                    : message
            ),
            attachments: conversation.attachments.map((attachment) => {
                const cloned = { ...(attachment as ChatAttachment & { rawFile?: File }) }
                delete cloned.rawFile
                return cloned
            }),
        }))

        set((state) => ({
            processing: false,
            conversations: updatedConversations,
            sessionFollowUps: {
                ...state.sessionFollowUps,
                [conversationId]: followUps,
            },
        }))
        await persistSnapshot(updatedConversations, get().settings, !get().onboardingOpen, get().workspaceUserId)
    },

    retryLastAssistant: async (conversationId, assistantMessageId) => {
        const conversation = get().conversations.find((item) => item.id === conversationId)
        if (!conversation) return

        const targetIndex = conversation.messages.findIndex((message) => message.id === assistantMessageId)
        if (targetIndex <= 0) return

        const previousUser = [...conversation.messages.slice(0, targetIndex)].reverse().find((message) => message.role === "user")
        if (!previousUser) return

        const withoutTarget = groupConversationUpdate(get().conversations, conversationId, (currentConversation) => ({
            ...currentConversation,
            messages: currentConversation.messages.filter((message) => message.id !== assistantMessageId),
            updatedAt: nowIso(),
        }))

        set({ conversations: withoutTarget, activeConversationId: conversationId })
        await persistSnapshot(withoutTarget, get().settings, !get().onboardingOpen, get().workspaceUserId)
        await get().sendMessage(previousUser.content)
    },

    editUserMessage: (conversationId, messageId, content) => {
        const nextConversations = groupConversationUpdate(get().conversations, conversationId, (conversation) => ({
            ...conversation,
            updatedAt: nowIso(),
            messages: conversation.messages.map((message) =>
                message.id === messageId
                    ? {
                        ...message,
                        content,
                    }
                    : message
            ),
        }))

        set({ conversations: nextConversations })
        void persistSnapshot(nextConversations, get().settings, !get().onboardingOpen, get().workspaceUserId)
    },

    deleteMessage: (conversationId, messageId) => {
        const nextConversations = groupConversationUpdate(get().conversations, conversationId, (conversation) => ({
            ...conversation,
            updatedAt: nowIso(),
            messages: conversation.messages.filter((message) => message.id !== messageId),
        }))
        set({ conversations: nextConversations })
        void persistSnapshot(nextConversations, get().settings, !get().onboardingOpen, get().workspaceUserId)
    },

    setMessageFeedback: (conversationId, messageId, value) => {
        if (value === null) {
            return
        }

        const conversation = get().conversations.find((item) => item.id === conversationId)
        const message = conversation?.messages.find((item) => item.id === messageId)
        if (!conversation || !message || message.role !== "assistant") {
            return
        }

        const messageIndex = conversation.messages.findIndex((item) => item.id === messageId)
        const previousUserMessage =
            messageIndex > 0
                ? [...conversation.messages.slice(0, messageIndex)].reverse().find((item) => item.role === "user")
                : undefined

        const nextConversations = groupConversationUpdate(get().conversations, conversationId, (conversation) => ({
            ...conversation,
            messages: conversation.messages.map((message) =>
                message.id === messageId
                    ? {
                        ...message,
                        feedback: value,
                    }
                    : message
            ),
        }))
        set({ conversations: nextConversations })
        void persistSnapshot(nextConversations, get().settings, !get().onboardingOpen, get().workspaceUserId)

        void (async () => {
            try {
                const computedMessageKey =
                    message.messageKey ??
                    (await buildMessageKey(
                        previousUserMessage?.content ?? "",
                        message.content,
                        message.reasoning?.strategyUsed ?? "assistant"
                    ))

                await submitFeedbackApi({
                    message_key: computedMessageKey,
                    feedback: value,
                    question: previousUserMessage?.content,
                    answer: message.content,
                    strategy_used: message.reasoning?.strategyUsed,
                })
            } catch (error) {
                set({
                    banner: {
                        type: "error",
                        message: error instanceof Error ? error.message : "Failed to save feedback.",
                    },
                })
            }
        })()
    },

    exportConversation: (conversationId) => {
        const conversation = get().conversations.find((item) => item.id === conversationId)
        if (!conversation) return ""

        return conversation.messages
            .map((message) => `${message.role.toUpperCase()}\n${message.content}`)
            .join("\n\n")
    },

    updateSettings: async (next) => {
        const merged = mergeSettings(get().settings, next)
        set({ settings: merged })
        await persistSnapshot(get().conversations, merged, !get().onboardingOpen, get().workspaceUserId)
    },

    saveAccountProfile: async (payload) => {
        await saveAccountProfileApi(payload)
        const authState = useAuthStore.getState()
        if (authState.user) {
            authState.setUser({
                ...authState.user,
                display_name: payload.displayName,
                email: payload.email,
            })
        }
        const merged = mergeSettings(get().settings, {
            account: {
                ...get().settings.account,
                displayName: payload.displayName,
                email: payload.email,
            },
        })
        set({ settings: merged })
        await persistSnapshot(get().conversations, merged, !get().onboardingOpen, get().workspaceUserId)
    },

    openBillingPortal: async () => {
        await openBillingPortalApi()
    },

    changePassword: async (currentPassword, newPassword) => {
        await changePasswordApi({ currentPassword, newPassword })
    },

    setTwoFactorEnabled: async (enabled) => {
        await updateTwoFactorApi(enabled)
        const authState = useAuthStore.getState()
        if (authState.user) {
            authState.setUser({
                ...authState.user,
                two_factor_enabled: enabled,
            })
        }
        const merged = mergeSettings(get().settings, {
            security: {
                ...get().settings.security,
                twoFactorEnabled: enabled,
            },
        })
        set({ settings: merged })
        await persistSnapshot(get().conversations, merged, !get().onboardingOpen, get().workspaceUserId)
    },

    refreshActiveSessions: async () => {
        const count = await refreshActiveSessionsApi()
        const merged = mergeSettings(get().settings, {
            security: {
                ...get().settings.security,
                activeSessions: count,
            },
        })
        set({ settings: merged })
        await persistSnapshot(get().conversations, merged, !get().onboardingOpen, get().workspaceUserId)
        return count
    },

    signOutAllSessions: async () => {
        await signOutAllSessionsApi()
        useAuthStore.getState().handleAuthExpired()
        const merged = mergeSettings(get().settings, {
            security: {
                ...get().settings.security,
                activeSessions: 1,
            },
        })
        set({ settings: merged })
        await persistSnapshot(get().conversations, merged, !get().onboardingOpen, get().workspaceUserId)
    },

    clearHistory: async () => {
        try {
            await clearAllHistory(get().workspaceUserId)
            set({
                conversations: [],
                activeConversationId: null,
                pendingAttachments: [],
                sessionFollowUps: {},
                banner: { type: "info", message: "Chat history cleared." },
            })
        } catch (error) {
            set({ banner: { type: "error", message: error instanceof Error ? error.message : "Failed to clear history." } })
        }
    },
}))

export const suggestedPrompts = SUGGESTED_PROMPTS

