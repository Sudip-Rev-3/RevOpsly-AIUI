"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuthStore } from "@/store/auth-store"
import type { ApiAuthUser } from "@/lib/services/chat-service"

interface AccessPendingScreenProps {
    user: ApiAuthUser | null
}

export function AccessPendingScreen({ user }: AccessPendingScreenProps) {
    const { logout } = useAuthStore()
    const [loading, setLoading] = useState(false)

    const requestedDate = user?.access_requested_at
        ? new Date(user.access_requested_at).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
          })
        : "today"
    const accessWasStopped = Boolean(user?.access_disabled_at)

    async function handleLogout() {
        setLoading(true)
        try {
            await logout()
        } catch {
            // Best effort
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 p-4">
            <Card className="w-full max-w-md border-slate-200">
                <CardHeader className="space-y-2 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                        <svg
                            className="h-6 w-6 text-slate-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                        </svg>
                    </div>
                    <CardTitle>Access Pending</CardTitle>
                    <CardDescription>
                        {accessWasStopped ? "Your access was stopped by an admin" : "Your request is awaiting admin approval"}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
                        <p className="font-medium text-slate-700">
                            {accessWasStopped ? "Access revoked" : "Access Request Submitted"}
                        </p>
                        <p className="mt-1">
                            {accessWasStopped
                                ? "An administrator has disabled your access. Please contact your RevOpsly administrator if you believe this is a mistake."
                                : "Your RevOpsly account has been created and your access request was submitted on "}
                            {!accessWasStopped && <span className="font-medium">{requestedDate}</span>}
                            {!accessWasStopped && "."}
                        </p>
                    </div>

                    <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-700 border border-blue-100">
                        <p className="font-medium">{accessWasStopped ? "What now?" : "What happens next?"}</p>
                        {accessWasStopped ? (
                            <p className="mt-2">You can sign in again only after an admin restores your access.</p>
                        ) : (
                            <ul className="mt-2 list-inside list-disc space-y-1">
                                <li>An admin will review your request</li>
                                <li>You'll be notified once approved</li>
                                <li>Please check back later or look for an email notification</li>
                            </ul>
                        )}
                    </div>

                    <div className="pt-2">
                        <Button
                            onClick={handleLogout}
                            disabled={loading}
                            variant="outline"
                            className="w-full"
                        >
                            {loading ? "Logging out..." : "Logout"}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
