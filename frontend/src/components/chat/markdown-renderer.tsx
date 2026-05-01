"use client"

import { useMemo } from "react"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Check, Copy } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function normalizeMarkdownText(content: string): string {
    const normalized = content.replace(/\r\n/g, "\n")
    const withoutDividerNoise = normalized.replace(/^\s*\*{3,}\s*$/gm, "")
    return withoutDividerNoise.replace(/\n{3,}/g, "\n\n").trim()
}

function CodeBlock({ language, code }: { language: string; code: string }) {
    const copied = false

    return (
        <div className="my-3 overflow-hidden rounded-lg border bg-muted/50">
            <div className="flex items-center justify-between border-b bg-muted/70 px-3 py-2 text-xs text-muted-foreground">
                <span>{language || "code"}</span>
                <Button
                    size="xs"
                    variant="ghost"
                    onClick={async () => {
                        await navigator.clipboard.writeText(code)
                    }}
                >
                    {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                    Copy
                </Button>
            </div>
            <pre className="overflow-auto px-4 py-3 text-xs leading-6">
                <code>{code}</code>
            </pre>
        </div>
    )
}

export function MarkdownRenderer({ content, className }: { content: string; className?: string }) {
    const normalizedContent = useMemo(() => normalizeMarkdownText(content), [content])
    const components = useMemo(
        () => ({
            code(props: React.ComponentProps<"code"> & { inline?: boolean; className?: string }) {
                const { inline, className: codeClassName, children, ...rest } = props
                const text = String(children).replace(/\n$/, "")
                const match = /language-(\w+)/.exec(codeClassName || "")
                const shouldRenderInline =
                    inline === true ||
                    (!match && !text.includes("\n"))

                if (shouldRenderInline) {
                    return (
                        <code
                            className="rounded bg-muted px-1 py-0.5 text-[0.85em]"
                            {...rest}
                        >
                            {children}
                        </code>
                    )
                }

                return <CodeBlock language={match?.[1] ?? ""} code={text} />
            },
            table(props: React.ComponentProps<"table">) {
                return <table className="my-4 w-full border-collapse text-sm" {...props} />
            },
            th(props: React.ComponentProps<"th">) {
                return <th className="border-b px-3 py-2 text-left font-medium" {...props} />
            },
            td(props: React.ComponentProps<"td">) {
                return <td className="border-b px-3 py-2 align-top text-muted-foreground" {...props} />
            },
            ul(props: React.ComponentProps<"ul">) {
                return <ul className="my-3 list-disc space-y-1 pl-5" {...props} />
            },
            ol(props: React.ComponentProps<"ol">) {
                return <ol className="my-3 list-decimal space-y-1 pl-5" {...props} />
            },
            h3(props: React.ComponentProps<"h3">) {
                return <h3 className="mt-4 mb-2 text-base font-semibold" {...props} />
            },
            p(props: React.ComponentProps<"p">) {
                return <p className="my-2 leading-7" {...props} />
            },
            a(props: React.ComponentProps<"a">) {
                const href = props.href || ""
                const external = /^https?:\/\//i.test(href)
                return (
                    <a
                        {...props}
                        className={cn(
                            "rounded bg-amber-200/70 px-1.5 py-0.5 font-semibold text-amber-900 underline underline-offset-2 hover:bg-amber-200",
                            props.className,
                        )}
                        target={external ? "_blank" : props.target}
                        rel={external ? "noopener noreferrer" : props.rel}
                    />
                )
            },
        }),
        []
    )

    return (
        <div className={cn("prose prose-neutral dark:prose-invert max-w-none text-sm", className)}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                {normalizedContent}
            </ReactMarkdown>
        </div>
    )
}
