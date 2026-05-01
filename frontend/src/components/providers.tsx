"use client"

import { useEffect } from "react"

import { TooltipProvider } from "@/components/ui/tooltip"
import { useChatStore } from "@/store/chat-store"

export function Providers({ children }: { children: React.ReactNode }) {
    const theme = useChatStore((state) => state.settings.theme)
    const accentColor = useChatStore((state) => state.settings.accentColor)
    const language = useChatStore((state) => state.settings.language)

    useEffect(() => {
        const root = document.documentElement
        root.classList.remove("dark")

        if (theme === "dark") {
            root.classList.add("dark")
            return
        }

        if (theme === "system") {
            const media = window.matchMedia("(prefers-color-scheme: dark)")
            if (media.matches) {
                root.classList.add("dark")
            }
        }
    }, [theme])

    useEffect(() => {
        const root = document.documentElement
        const accents: Record<typeof accentColor, { primary: string; ring: string }> = {
            slate: {
                primary: "oklch(0.205 0 0)",
                ring: "oklch(0.708 0 0)",
            },
            ocean: {
                primary: "oklch(0.52 0.17 244)",
                ring: "oklch(0.66 0.14 244)",
            },
            forest: {
                primary: "oklch(0.47 0.14 154)",
                ring: "oklch(0.64 0.12 154)",
            },
            sunset: {
                primary: "oklch(0.62 0.18 42)",
                ring: "oklch(0.74 0.15 42)",
            },
        }

        const selected = accents[accentColor]
        root.style.setProperty("--primary", selected.primary)
        root.style.setProperty("--ring", selected.ring)
    }, [accentColor])

    useEffect(() => {
        document.documentElement.lang = language
    }, [language])

    return <TooltipProvider>{children}</TooltipProvider>
}
