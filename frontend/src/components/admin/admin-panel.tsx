"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    approveAccessApi,
    deleteUserApi,
    getAccessRequestsApi,
    getAllUsersApi,
    setAdminRoleApi,
    stopUserAccessApi,
} from "@/lib/services/chat-service"
import type { ApiAuthUser } from "@/lib/services/chat-service"

interface AccessRequest {
    id: number
    email: string
    display_name: string
    access_requested_at: string | null
    is_admin: boolean
}

interface User {
    id: number
    email: string
    display_name: string
    is_admin: boolean
    access_approved: boolean
    access_requested_at: string | null
    access_approved_at: string | null
    access_disabled_at: string | null
    created_at: string
}

interface AdminPanelProps {
    user: ApiAuthUser | null
}

type ConfirmActionType = "stop-access" | "delete-user"

interface ConfirmActionState {
    type: ConfirmActionType
    user: User
}

export function AdminPanel({ user }: AdminPanelProps) {
    const [activeTab, setActiveTab] = useState<"requests" | "users">("requests")
    const [requests, setRequests] = useState<AccessRequest[]>([])
    const [users, setUsers] = useState<User[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [approving, setApproving] = useState<Set<number>>(new Set())
    const [denyingRequest, setDenyingRequest] = useState<Set<number>>(new Set())
    const [updatingRole, setUpdatingRole] = useState<Set<number>>(new Set())
    const [processingUserAction, setProcessingUserAction] = useState<Set<number>>(new Set())
    const [confirmAction, setConfirmAction] = useState<ConfirmActionState | null>(null)
    const [refreshing, setRefreshing] = useState(false)

    useEffect(() => {
        const loadActiveTabData = async () => {
            setLoading(true)
            setError(null)
            try {
                if (activeTab === "requests") {
                    const response = await getAccessRequestsApi()
                    setRequests(response.requests)
                } else {
                    const response = await getAllUsersApi()
                    setUsers(response.users)
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to load data")
            } finally {
                setLoading(false)
            }
        }
        void loadActiveTabData()
    }, [activeTab])

    async function reloadRequests() {
        const response = await getAccessRequestsApi()
        setRequests(response.requests)
    }

    async function reloadUsers() {
        const response = await getAllUsersApi()
        setUsers(response.users)
    }

    async function refreshCurrentTab() {
        setRefreshing(true)
        setError(null)
        try {
            if (activeTab === "requests") {
                await reloadRequests()
            } else {
                await reloadUsers()
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to refresh data")
        } finally {
            setRefreshing(false)
        }
    }

    async function handleApprove(userId: number) {
        setApproving((prev) => new Set([...prev, userId]))
        try {
            await approveAccessApi(userId, true)
            await Promise.all([reloadRequests(), reloadUsers()])
            setActiveTab("users")
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to approve request")
        } finally {
            setApproving((prev) => {
                const next = new Set(prev)
                next.delete(userId)
                return next
            })
        }
    }

    async function handleDeny(userId: number) {
        setDenyingRequest((prev) => new Set([...prev, userId]))
        try {
            await approveAccessApi(userId, false)
            await Promise.all([reloadRequests(), reloadUsers()])
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to deny request")
        } finally {
            setDenyingRequest((prev) => {
                const next = new Set(prev)
                next.delete(userId)
                return next
            })
        }
    }

    async function handleToggleAdmin(userId: number, currentValue: boolean) {
        setUpdatingRole((prev) => new Set([...prev, userId]))
        try {
            await setAdminRoleApi(userId, !currentValue)
            await reloadUsers()
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to update role")
        } finally {
            setUpdatingRole((prev) => {
                const next = new Set(prev)
                next.delete(userId)
                return next
            })
        }
    }

    function openConfirmAction(type: ConfirmActionType, targetUser: User) {
        setConfirmAction({ type, user: targetUser })
    }

    function closeConfirmAction() {
        if (processingUserAction.size > 0) {
            return
        }
        setConfirmAction(null)
    }

    async function handleConfirmAction() {
        if (!confirmAction) return

        const userId = confirmAction.user.id
        setProcessingUserAction((prev) => new Set([...prev, userId]))
        setError(null)
        try {
            if (confirmAction.type === "stop-access") {
                await stopUserAccessApi(userId)
            } else {
                await deleteUserApi(userId)
            }
            setConfirmAction(null)
            await Promise.all([reloadRequests(), reloadUsers()])
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to complete the action")
        } finally {
            setProcessingUserAction((prev) => {
                const next = new Set(prev)
                next.delete(userId)
                return next
            })
        }
    }

    if (!user?.is_admin) {
        return (
            <Card className="border-red-200 bg-red-50">
                <CardContent className="pt-6">
                    <p className="text-sm text-red-700">You do not have admin access.</p>
                </CardContent>
            </Card>
        )
    }

    const confirmTitle = confirmAction?.type === "delete-user" ? "Delete user" : "Stop access"
    const confirmDescription =
        confirmAction?.type === "delete-user"
            ? "This permanently removes the user and their linked data. This cannot be undone. Click confirm only if you are sure."
            : "This immediately removes access to RevOpsly without deleting the account. Click confirm only if you are sure."
    const confirmUser = confirmAction?.user ?? null
    const isConfirmBusy = confirmUser ? processingUserAction.has(confirmUser.id) : false

    return (
        <div className="space-y-6">
            {error && (
                <Card className="border-red-200 bg-red-50">
                    <CardContent className="pt-6">
                        <p className="text-sm text-red-700">{error}</p>
                    </CardContent>
                </Card>
            )}

            <div className="flex items-center justify-between gap-2 border-b">
                <div className="flex gap-2">
                <button
                    type="button"
                    onClick={() => setActiveTab("requests")}
                    className={`px-4 py-2 font-medium text-sm transition-colors ${
                        activeTab === "requests"
                            ? "text-primary border-b-2 border-primary -mb-[2px]"
                            : "text-muted-foreground hover:text-foreground"
                    }`}
                >
                    Access Requests
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab("users")}
                    className={`px-4 py-2 font-medium text-sm transition-colors ${
                        activeTab === "users"
                            ? "text-primary border-b-2 border-primary -mb-[2px]"
                            : "text-muted-foreground hover:text-foreground"
                    }`}
                >
                    Users
                </button>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={() => void refreshCurrentTab()} disabled={refreshing || loading}>
                    {refreshing ? "Refreshing..." : "Refresh"}
                </Button>
            </div>

            {loading ? (
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-sm text-muted-foreground">Loading...</p>
                    </CardContent>
                </Card>
            ) : activeTab === "requests" ? (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Pending Access Requests</CardTitle>
                        <CardDescription>Review and approve/deny access requests from new users</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {requests.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No pending access requests</p>
                        ) : (
                            <div className="space-y-3">
                                {requests.map((req) => (
                                    <div key={req.id} className="flex items-center justify-between rounded-lg border p-3">
                                        <div className="flex-1">
                                            <p className="font-medium text-sm">{req.display_name}</p>
                                            <p className="text-xs text-muted-foreground">{req.email}</p>
                                            {req.access_requested_at && (
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    Requested: {" "}
                                                    {new Date(req.access_requested_at).toLocaleDateString("en-US", {
                                                        year: "numeric",
                                                        month: "short",
                                                        day: "numeric",
                                                        hour: "2-digit",
                                                        minute: "2-digit",
                                                    })}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                type="button"
                                                size="sm"
                                                onClick={() => handleApprove(req.id)}
                                                disabled={approving.has(req.id)}
                                            >
                                                {approving.has(req.id) ? "Approving..." : "Approve"}
                                            </Button>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleDeny(req.id)}
                                                disabled={denyingRequest.has(req.id)}
                                            >
                                                {denyingRequest.has(req.id) ? "Denying..." : "Deny"}
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Users</CardTitle>
                        <CardDescription>Manage user roles, access, and account records</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {users.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No users found</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="border-b">
                                        <tr>
                                            <th className="text-left py-2 px-3 font-medium">Name</th>
                                            <th className="text-left py-2 px-3 font-medium">Email</th>
                                            <th className="text-left py-2 px-3 font-medium">Status</th>
                                            <th className="text-center py-2 px-3 font-medium">Admin</th>
                                            <th className="text-right py-2 px-3 font-medium">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {users.map((u) => {
                                            const canManageSelf = u.id !== user?.id
                                            const isStopped = Boolean(u.access_disabled_at)
                                            const isBusy = processingUserAction.has(u.id)
                                            const statusLabel = u.access_approved
                                                ? "Approved"
                                                : isStopped
                                                  ? "Access stopped"
                                                  : u.access_requested_at
                                                    ? "Pending"
                                                    : "Not requested"
                                            const statusClass = u.access_approved
                                                ? "bg-green-100 text-green-700"
                                                : isStopped
                                                  ? "bg-red-100 text-red-700"
                                                  : u.access_requested_at
                                                    ? "bg-yellow-100 text-yellow-700"
                                                    : "bg-gray-100 text-gray-700"

                                            return (
                                                <tr key={u.id} className="border-b hover:bg-muted/50">
                                                    <td className="py-2 px-3">{u.display_name}</td>
                                                    <td className="py-2 px-3 text-xs text-muted-foreground">{u.email}</td>
                                                    <td className="py-2 px-3">
                                                        <span
                                                            className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${statusClass}`}
                                                        >
                                                            {statusLabel}
                                                        </span>
                                                    </td>
                                                    <td className="py-2 px-3 text-center">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleToggleAdmin(u.id, u.is_admin)}
                                                            disabled={updatingRole.has(u.id) || u.id === user?.id}
                                                            className={`inline-flex items-center justify-center w-5 h-5 rounded border transition-colors ${
                                                                u.is_admin
                                                                    ? "bg-blue-500 border-blue-600 text-white"
                                                                    : "border-gray-300 hover:border-gray-400"
                                                            } ${updatingRole.has(u.id) ? "opacity-50 cursor-not-allowed" : ""}`}
                                                            title={u.id === user?.id ? "Cannot remove your own admin role" : "Toggle admin role"}
                                                        >
                                                            {u.is_admin && (
                                                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                                                    <path
                                                                        fillRule="evenodd"
                                                                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                                                        clipRule="evenodd"
                                                                    />
                                                                </svg>
                                                            )}
                                                        </button>
                                                    </td>
                                                    <td className="py-2 px-3 text-right">
                                                        <div className="flex flex-wrap justify-end gap-2">
                                                            <Button
                                                                type="button"
                                                                size="sm"
                                                                variant="outline"
                                                                className="border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                                                                onClick={() => openConfirmAction("stop-access", u)}
                                                                disabled={!canManageSelf || isBusy}
                                                            >
                                                                Stop access
                                                            </Button>
                                                            <Button
                                                                type="button"
                                                                size="sm"
                                                                variant="destructive"
                                                                onClick={() => openConfirmAction("delete-user", u)}
                                                                disabled={!canManageSelf || isBusy}
                                                            >
                                                                Delete
                                                            </Button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            <Dialog open={confirmAction !== null} onOpenChange={(open) => (!open ? closeConfirmAction() : undefined)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{confirmTitle}</DialogTitle>
                        <DialogDescription>{confirmDescription}</DialogDescription>
                    </DialogHeader>
                    {confirmUser && (
                        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                            <p className="font-medium">{confirmUser.display_name}</p>
                            <p className="text-xs text-muted-foreground">{confirmUser.email}</p>
                        </div>
                    )}
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={closeConfirmAction} disabled={processingUserAction.size > 0}>
                            Cancel
                        </Button>
                        <Button type="button" variant="destructive" onClick={() => void handleConfirmAction()} disabled={isConfirmBusy}>
                            Confirm
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
