import { getSessionApi } from "@/lib/services/chat-service"
import type { ChatExecutionDetails, ChatMessage, Conversation } from "@/types/chat"

export const SUGGESTED_PROMPTS = [
    "Summarize this CSV for me",
    "Find unusual trends in my uploaded data",
    "Help me understand this sales report",
    "Which customers are at risk of churn?",
    "Explain the main changes in this dataset",
]

export function nowIso() {
    return new Date().toISOString()
}

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("")
}

export async function buildMessageKey(question: string, answer: string, strategyUsed: string): Promise<string> {
    const digestInput = `${question.trim()}||${answer.trim()}||${strategyUsed.trim()}`
    const encoder = new TextEncoder()
    const inputBytes = encoder.encode(digestInput)

    if (typeof globalThis.crypto?.subtle?.digest === "function") {
        const digestBuffer = await globalThis.crypto.subtle.digest("SHA-256", inputBytes)
        return bytesToHex(new Uint8Array(digestBuffer))
    }

    let hash = 0
    for (const value of inputBytes) {
        hash = (hash << 5) - hash + value
        hash |= 0
    }
    return Math.abs(hash).toString(16).padStart(64, "0")
}

export function toTitle(text: string) {
    const value = text.trim()
    if (!value) return "New Chat"
    return value.length <= 48 ? value : `${value.slice(0, 47)}…`
}

export function clampText(value: unknown, limit: number): string {
    const text = String(value ?? "").trim()
    if (!text) return ""
    return text.length <= limit ? text : `${text.slice(0, limit).trimEnd()}...`
}

export function normalizeExecutionDetails(payload: unknown): ChatExecutionDetails | undefined {
    if (!payload || typeof payload !== "object") {
        return undefined
    }
    const maybePayload = payload as {
        steps?: unknown
        observations?: unknown
        synthesized_output?: unknown
    }

    const steps: ChatExecutionDetails["steps"] = Array.isArray(maybePayload.steps)
        ? maybePayload.steps
            .slice(0, 8)
            .map((step, index) => {
                if (!step || typeof step !== "object") return null
                const typedStep = step as Record<string, unknown>
                const normalized = {
                    step: Number(typedStep.step) || index + 1,
                    tool: clampText(typedStep.tool, 80) || undefined,
                    action: clampText(typedStep.action, 260) || undefined,
                    toolInput: clampText(typedStep.tool_input, 260) || undefined,
                    observation: clampText(typedStep.observation, 700) || undefined,
                }
                return normalized
            })
            .filter((item): item is NonNullable<typeof item> => item !== null)
        : []

    const observations = Array.isArray(maybePayload.observations)
        ? maybePayload.observations
            .slice(0, 8)
            .map((item) => clampText(item, 700))
            .filter(Boolean)
        : []

    const synthesizedOutput = clampText(maybePayload.synthesized_output, 1400) || undefined

    if (steps.length === 0 && observations.length === 0 && !synthesizedOutput) {
        return undefined
    }

    return {
        steps,
        observations,
        synthesizedOutput,
    }
}

export function createAssistantDraft(): ChatMessage {
    return {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        createdAt: nowIso(),
        streaming: true,
        feedback: null,
    }
}

export function mergeAttachmentsFromBackend(
    conversation: Conversation,
    files: Array<{ file_id: number; filename: string; path: string; uploaded_at: string }>
): Conversation {
    const mergedAttachments = files.map((file) => {
        const existing = conversation.attachments.find(
            (attachment) => attachment.name === file.filename && attachment.uploadedAt === file.uploaded_at
        )

        return {
            id: existing?.id ?? `backend-${file.file_id}`,
            chatId: conversation.id,
            name: file.filename,
            size: existing?.size ?? 0,
            mimeType: existing?.mimeType ?? "text/csv",
            status: existing?.status ?? "ready",
            progress: existing?.progress ?? 100,
            uploadedAt: file.uploaded_at,
            dataset: existing?.dataset,
        }
    })

    return {
        ...conversation,
        attachments: mergedAttachments,
    }
}

export function toSessionId(conversationId: string): number {
    const parsed = Number(conversationId)
    if (!Number.isFinite(parsed)) {
        throw new Error("Invalid conversation identifier")
    }
    return parsed
}

function isSessionMissingError(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false
    }

    const message = error.message.toLowerCase()
    return message.includes("session not found") || message.includes("404")
}

export async function filterOwnedConversations(conversations: Conversation[]): Promise<Conversation[]> {
    const checks = await Promise.all(
        conversations.map(async (conversation) => {
            let sessionId: number
            try {
                sessionId = toSessionId(conversation.id)
            } catch {
                return null
            }

            try {
                await getSessionApi(sessionId)
                return conversation
            } catch (error) {
                if (isSessionMissingError(error)) {
                    return null
                }
                return conversation
            }
        })
    )

    return checks.filter((conversation): conversation is Conversation => conversation !== null)
}

export function groupConversationUpdate(
    conversations: Conversation[],
    conversationId: string,
    updater: (conversation: Conversation) => Conversation
): Conversation[] {
    return conversations.map((conversation) => {
        if (conversation.id !== conversationId) {
            return conversation
        }
        return updater(conversation)
    })
}
