import type { AppSettings, PersistedAppState } from "@/types/chat"

export const AUTH_EXPIRED_EVENT = "revopsly:auth-expired"

const API_BASE_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000").replace(/\/$/, "")
const STORAGE_KEY_PREFIX = "revopsly:chat-state:v1"
const EXECUTION_DEBUG_KEY = "revopsly:execution-debug"

export interface ApiAuthUser {
    id: number
    email: string
    display_name: string
    two_factor_enabled: boolean
}

interface ApiAuthResponse {
    user: ApiAuthUser
}

interface ApiErrorPayload {
    detail?: string | { msg?: string }
    message?: string
}

export interface ApiSessionFile {
    file_id: number
    filename: string
    path: string
    uploaded_at: string
}

export interface ApiSessionResponse {
    id: number
    created_at: string
    user_id: number
    files: ApiSessionFile[]
}

export interface AskQuestionResponse {
    answer: string
    reason: string
    strategy_used: string
    confidence: string
    message_key: string
    follow_ups: string[]
    report_file?: {
        name: string
        url: string
        path: string
        size_bytes: number
        generated_at: string
    } | null
    execution_details?: unknown
}

export interface SlackHistoryMessage {
    role: "user" | "assistant"
    content: string
}

export interface SlackAskResponse {
    answer: string
    reason?: string
    strategy_used?: string
    confidence?: string
    sources?: string[]
}

export interface GmailHistoryMessage {
    role: "user" | "assistant"
    content: string
}

export interface GmailAskResponse {
    answer: string
    reason?: string
    strategy_used?: string
    confidence?: string
    sources?: string[]
}

export interface GoogleWorkspaceHistoryMessage {
    role: "user" | "assistant"
    content: string
}

export interface GoogleWorkspaceAskResponse {
    answer: string
    reason?: string
    strategy_used?: string
    confidence?: string
    sources?: string[]
    intent?: "GMAIL" | "GDRIVE" | "CALENDAR" | "OTHERS" | "KNOWN"
}

export interface GoogleWorkspaceStatusResponse {
    connected: boolean
    account_email?: string | null
    granted_scopes?: string | null
    required_scopes?: string[]
    granted_scope_list?: string[]
    missing_scopes?: string[]
    updated_at?: string | null
}

export const defaultSettings: AppSettings = {
    theme: "system",
    accentColor: "slate",
    language: "en",
    spokenLanguage: "english",
    timezone: "UTC",
    responseStyle: "balanced",
    privacyMode: false,
    keyboardHints: true,
    notifications: {
        email: true,
        push: true,
        productUpdates: false,
        mentions: true,
    },
    account: {
        displayName: "RevOps User",
        email: "",
        role: "Analyst",
        plan: "starter",
    },
    security: {
        twoFactorEnabled: false,
        activeSessions: 1,
    },
}

function emitAuthExpired() {
    if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
    }
}

export function getApiBaseUrl() {
    return API_BASE_URL
}

export function getGoogleAuthStartUrl() {
    return `${API_BASE_URL}/auth/google/start`
}

export function getGoogleWorkspaceAuthStartUrl(forceConsent = false) {
    return forceConsent
        ? `${API_BASE_URL}/auth/google-workspace/start?force_consent=true`
        : `${API_BASE_URL}/auth/google-workspace/start`
}

function stateStorageKey(workspaceUserId: number | null) {
    return `${STORAGE_KEY_PREFIX}:${workspaceUserId ?? "anon"}`
}

function getErrorMessage(payload: ApiErrorPayload | null, fallback: string): string {
    if (!payload) return fallback
    if (typeof payload.detail === "string") return payload.detail
    if (typeof payload.detail === "object" && payload.detail?.msg) return payload.detail.msg
    if (typeof payload.message === "string") return payload.message
    return fallback
}

async function parseJsonSafely(response: Response): Promise<ApiErrorPayload | Record<string, unknown> | null> {
    try {
        return (await response.json()) as ApiErrorPayload | Record<string, unknown>
    } catch {
        return null
    }
}

interface RequestOptions {
    retryAuth?: boolean
    emitAuthOn401?: boolean
}

async function apiRequest<T>(path: string, init: RequestInit = {}, options: RequestOptions = {}): Promise<T> {
    const { retryAuth = true, emitAuthOn401 = true } = options
    const headers = new Headers(init.headers || undefined)
    if (!(init.body instanceof FormData) && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json")
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        headers,
        credentials: "include",
    })

    if (response.status === 401 && retryAuth && path !== "/auth/refresh") {
        try {
            await refreshSessionApi()
            return apiRequest<T>(path, init, { retryAuth: false, emitAuthOn401 })
        } catch {
            if (emitAuthOn401) emitAuthExpired()
            throw new Error("Authentication required")
        }
    }

    if (!response.ok) {
        const payload = await parseJsonSafely(response)
        const message = getErrorMessage(payload as ApiErrorPayload | null, `Request failed (${response.status})`)
        if (response.status === 401 && emitAuthOn401) {
            emitAuthExpired()
        }
        throw new Error(message)
    }

    if (response.status === 204) {
        return {} as T
    }

    const payload = await parseJsonSafely(response)
    return (payload ?? {}) as T
}

export async function signupApi(payload: { email: string; password: string; display_name: string }) {
    return apiRequest<ApiAuthResponse>("/auth/signup", {
        method: "POST",
        body: JSON.stringify(payload),
    }, { emitAuthOn401: false })
}

export async function loginApi(payload: { email: string; password: string }) {
    return apiRequest<ApiAuthResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify(payload),
    }, { emitAuthOn401: false })
}

export async function meApi() {
    return apiRequest<ApiAuthResponse>("/auth/me", { method: "GET" })
}

export async function refreshSessionApi() {
    return apiRequest<ApiAuthResponse>("/auth/refresh", { method: "POST" }, { retryAuth: false })
}

export async function logoutApi() {
    return apiRequest<{ status: string }>("/auth/logout", { method: "POST" }, { retryAuth: false, emitAuthOn401: false })
}

export async function createSessionApi() {
    return apiRequest<{ id: number; created_at: string }>("/sessions", { method: "POST" })
}

export async function getSessionApi(sessionId: number) {
    return apiRequest<ApiSessionResponse>(`/sessions/${sessionId}`, { method: "GET" })
}

export async function uploadCsvApi(sessionId: number, file: File) {
    const formData = new FormData()
    formData.append("files", file)
    return apiRequest<{ session_id: number; files: ApiSessionFile[] }>(`/sessions/${sessionId}/upload`, {
        method: "POST",
        body: formData,
    })
}

export async function askQuestionApi(
    sessionId: number,
    question: string,
    options: { signal?: AbortSignal; debug?: boolean } = {}
) {
    return apiRequest<AskQuestionResponse>(`/sessions/${sessionId}/ask`, {
        method: "POST",
        body: JSON.stringify({ question, debug: Boolean(options.debug) }),
        signal: options.signal,
    })
}

export async function cancelSessionRunApi(sessionId: number) {
    return apiRequest<{ status: string }>(`/sessions/${sessionId}/cancel`, { method: "POST" })
}

export async function askSlackQuestionApi(question: string, history: SlackHistoryMessage[]) {
    return apiRequest<SlackAskResponse>("/slack/ask", {
        method: "POST",
        body: JSON.stringify({ question, history }),
    })
}

export async function askGmailQuestionApi(question: string, history: GmailHistoryMessage[]) {
    return apiRequest<GmailAskResponse>("/gmail/ask", {
        method: "POST",
        body: JSON.stringify({ question, history }),
    })
}

export async function askGoogleWorkspaceQuestionApi(question: string, history: GoogleWorkspaceHistoryMessage[]) {
    return apiRequest<GoogleWorkspaceAskResponse>("/gspace/ask", {
        method: "POST",
        body: JSON.stringify({ question, history }),
    })
}

export async function getGoogleWorkspaceStatusApi() {
    return apiRequest<GoogleWorkspaceStatusResponse>("/auth/google-workspace/status", { method: "GET" })
}

export async function disconnectGoogleWorkspaceApi() {
    return apiRequest<{ status: string }>("/auth/google-workspace/disconnect", { method: "POST" })
}

export async function submitFeedbackApi(payload: {
    message_key: string
    feedback: "up" | "down"
    question?: string
    answer?: string
    strategy_used?: string
}) {
    return apiRequest<{ status?: string }>("/feedback", {
        method: "POST",
        body: JSON.stringify(payload),
    })
}

export async function saveAccountProfileApi(payload: { displayName: string; email: string }) {
    return apiRequest<ApiAuthResponse>("/auth/profile", {
        method: "PATCH",
        body: JSON.stringify({ display_name: payload.displayName, email: payload.email }),
    })
}

export async function changePasswordApi(payload: { currentPassword: string; newPassword: string }) {
    return apiRequest<{ status: string }>("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ current_password: payload.currentPassword, new_password: payload.newPassword }),
    })
}

export async function updateTwoFactorApi(enabled: boolean) {
    return apiRequest<ApiAuthResponse>("/auth/two-factor", {
        method: "POST",
        body: JSON.stringify({ enabled }),
    })
}

export async function refreshActiveSessionsApi() {
    const response = await apiRequest<{ active_sessions: number }>("/auth/active-sessions", { method: "GET" })
    return Number(response.active_sessions || 1)
}

export async function signOutAllSessionsApi() {
    return apiRequest<{ status: string }>("/auth/logout-all", { method: "POST" })
}

export async function openBillingPortalApi() {
    return Promise.resolve({ status: "ok" })
}

export async function healthApi() {
    return apiRequest<{ status: string }>("/health", { method: "GET" }, { retryAuth: false, emitAuthOn401: false })
}

export function mergeSettings(current: AppSettings, next: Partial<AppSettings>): AppSettings {
    return {
        ...current,
        ...next,
        notifications: {
            ...current.notifications,
            ...(next.notifications || {}),
        },
        account: {
            ...current.account,
            ...(next.account || {}),
        },
        security: {
            ...current.security,
            ...(next.security || {}),
        },
    }
}

export function delay(ms: number) {
    return new Promise<void>((resolve) => {
        window.setTimeout(resolve, ms)
    })
}

export async function loadPersistedState(workspaceUserId: number | null): Promise<PersistedAppState> {
    if (typeof window === "undefined") {
        return {
            conversations: [],
            settings: defaultSettings,
            onboardingSeen: false,
        }
    }

    const raw = window.localStorage.getItem(stateStorageKey(workspaceUserId))
    if (!raw) {
        return {
            conversations: [],
            settings: defaultSettings,
            onboardingSeen: false,
        }
    }

    try {
        const parsed = JSON.parse(raw) as Partial<PersistedAppState>
        return {
            conversations: Array.isArray(parsed.conversations) ? parsed.conversations : [],
            settings: mergeSettings(defaultSettings, parsed.settings || {}),
            onboardingSeen: Boolean(parsed.onboardingSeen),
        }
    } catch {
        return {
            conversations: [],
            settings: defaultSettings,
            onboardingSeen: false,
        }
    }
}

export async function savePersistedState(state: PersistedAppState, workspaceUserId: number | null): Promise<void> {
    if (typeof window === "undefined") return
    window.localStorage.setItem(stateStorageKey(workspaceUserId), JSON.stringify(state))
}

export async function clearAllHistory(workspaceUserId: number | null): Promise<void> {
    if (typeof window === "undefined") return
    window.localStorage.removeItem(stateStorageKey(workspaceUserId))
}

export function isExecutionDebugModeEnabled(): boolean {
    if (typeof window === "undefined") return false
    return window.localStorage.getItem(EXECUTION_DEBUG_KEY) === "1"
}
