export type MessageRole = "user" | "assistant" | "system"

export type MessageFeedback = "up" | "down" | null

export type AttachmentStatus = "uploading" | "processing" | "ready" | "error"

export interface DatasetPreview {
    tableName: string
    columns: string[]
    inferredTypes: Record<string, string>
    sampleRows: Array<Record<string, string | number | null>>
    rowCount: number
    parseError?: string
}

export interface ChatAttachment {
    id: string
    chatId: string
    name: string
    size: number
    mimeType: string
    status: AttachmentStatus
    progress: number
    uploadedAt: string
    dataset?: DatasetPreview
    rawFile?: File
}

export interface ChatTrace {
    title: string
    content: string
}

export interface ChatReasoning {
    strategyUsed: string
    reason: string
    confidence: string
    queryRoute?: string
    queryReason?: string
    datasetRows?: number
}

export interface ChatExecutionStep {
    step: number
    tool?: string
    action?: string
    toolInput?: string
    observation?: string
}

export interface ChatExecutionDetails {
    steps: ChatExecutionStep[]
    observations: string[]
    synthesizedOutput?: string
}

export interface ChatReportFile {
    name: string
    url: string
    path: string
    sizeBytes: number
    generatedAt: string
}

export interface ChatMessage {
    id: string
    role: MessageRole
    content: string
    createdAt: string
    messageKey?: string
    error?: string
    streaming?: boolean
    feedback?: MessageFeedback
    traces?: ChatTrace[]
    reasoning?: ChatReasoning
    executionDetails?: ChatExecutionDetails
    reportFile?: ChatReportFile
}

export interface Conversation {
    id: string
    title: string
    createdAt: string
    updatedAt: string
    archived: boolean
    pinned: boolean
    tags: string[]
    shared: boolean
    messages: ChatMessage[]
    attachments: ChatAttachment[]
}

export interface AppSettings {
    theme: "light" | "dark" | "system"
    accentColor: "slate" | "ocean" | "forest" | "sunset"
    language: "en" | "es" | "fr" | "de"
    spokenLanguage: "english" | "spanish" | "french" | "german"
    timezone: string
    responseStyle: "balanced" | "concise" | "detailed"
    privacyMode: boolean
    notifications: {
        email: boolean
        push: boolean
        productUpdates: boolean
        mentions: boolean
    }
    keyboardHints: boolean
    account: {
        displayName: string
        email: string
        role: string
        plan: "starter" | "growth" | "enterprise"
    }
    security: {
        twoFactorEnabled: boolean
        activeSessions: number
    }
}

export interface PersistedAppState {
    conversations: Conversation[]
    settings: AppSettings
    onboardingSeen: boolean
}
