"use client"

import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getGoogleAuthStartUrl } from "@/lib/services/chat-service"
import { useAuthStore } from "@/store/auth-store"

const BRAND_URL = "https://rev-opsly-aiui.vercel.app"

export function AuthScreen() {
    const { signup, login, loading, error, clearError } = useAuthStore()
    const [mode, setMode] = useState<"login" | "signup">("login")
    const [displayName, setDisplayName] = useState("")
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [oauthError, setOauthError] = useState<string | null>(null)

    const isSignup = mode === "signup"

    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const authError = params.get("auth_error")
        if (!authError) return

        setOauthError(authError)
        params.delete("auth_error")
        const query = params.toString()
        const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname
        window.history.replaceState({}, "", nextUrl)
    }, [])

    async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        clearError()
        setOauthError(null)
        try {
            if (isSignup) {
                await signup({
                    displayName: displayName.trim(),
                    email: email.trim(),
                    password,
                })
                return
            }

            await login({
                email: email.trim(),
                password,
            })
        } catch {
            // Auth store already captures and exposes user-friendly error text.
        }
    }

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_20%_20%,hsl(var(--primary)/0.2),transparent_45%),radial-gradient(circle_at_80%_80%,hsl(var(--primary)/0.12),transparent_42%),hsl(var(--background))] p-4">
            <Card className="w-full max-w-md border shadow-xl">
                <CardHeader className="space-y-1">
                    <CardTitle className="flex items-center gap-2 text-2xl tracking-tight">
                        <img
                            src="/revopsly-logo.svg"
                            alt="RevOpsly logo"
                            className="h-7 w-auto"
                        />
                        <span>RevOpsly</span>
                    </CardTitle>
                    <a
                        href={BRAND_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                        rev-opsly-aiui.vercel.app
                    </a>
                    <CardDescription>
                        {isSignup ? "Create your account to start chatting." : "Log in to continue your workspace."}
                    </CardDescription>
                    <div className="flex gap-2 pt-2">
                        <Button
                            type="button"
                            variant={mode === "login" ? "default" : "outline"}
                            className="flex-1"
                            onClick={() => {
                                clearError()
                                setOauthError(null)
                                setMode("login")
                            }}
                        >
                            Log in
                        </Button>
                        <Button
                            type="button"
                            variant={mode === "signup" ? "default" : "outline"}
                            className="flex-1"
                            onClick={() => {
                                clearError()
                                setOauthError(null)
                                setMode("signup")
                            }}
                        >
                            Sign up
                        </Button>
                    </div>
                </CardHeader>

                <CardContent>
                    <div className="space-y-3 pb-4">
                        <Button
                            type="button"
                            variant="outline"
                            className="w-full"
                            onClick={() => {
                                clearError()
                                setOauthError(null)
                                window.location.href = getGoogleAuthStartUrl()
                            }}
                            disabled={loading}
                        >
                            Continue with Google
                        </Button>
                        <div className="text-center text-xs text-muted-foreground">or continue with email</div>
                    </div>

                    <form className="space-y-4" onSubmit={(event) => { void onSubmit(event) }}>
                        {isSignup ? (
                            <div className="space-y-2">
                                <Label htmlFor="auth-display-name">Display name</Label>
                                <Input
                                    id="auth-display-name"
                                    value={displayName}
                                    onChange={(event) => setDisplayName(event.target.value)}
                                    placeholder="Your name"
                                    autoComplete="name"
                                    required
                                />
                            </div>
                        ) : null}

                        <div className="space-y-2">
                            <Label htmlFor="auth-email">Email</Label>
                            <Input
                                id="auth-email"
                                type="email"
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                placeholder="you@company.com"
                                autoComplete="email"
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="auth-password">Password</Label>
                            <Input
                                id="auth-password"
                                type="password"
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                placeholder={isSignup ? "Min 10 chars with upper/lower, number, symbol" : "Your password"}
                                autoComplete={isSignup ? "new-password" : "current-password"}
                                required
                            />
                            {isSignup ? (
                                <p className="text-xs text-muted-foreground">Use a unique password not used on other websites.</p>
                            ) : (
                                <p className="text-xs text-muted-foreground">If your browser warns about a breached password, change it immediately in Settings.</p>
                            )}
                        </div>

                        {error || oauthError ? <p className="text-sm text-destructive">{error || oauthError}</p> : null}

                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? "Please wait..." : isSignup ? "Create account" : "Continue"}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
