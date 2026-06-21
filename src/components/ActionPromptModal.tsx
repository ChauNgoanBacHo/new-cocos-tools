interface ActionPromptModalProps {
    open: boolean;
    title: string;
    description: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
}

export default function ActionPromptModal({
    open,
    title,
    description,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    onConfirm,
    onCancel,
}: ActionPromptModalProps) {
    if (!open) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <button
                type="button"
                aria-label="Close modal"
                onClick={onCancel}
                className="absolute inset-0 bg-[#090b10]/60 backdrop-blur-sm dark:bg-[#090b10]/75"
            />

            <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_24px_60px_rgba(148,163,184,0.3)] dark:border-white/10 dark:bg-[#202532] dark:shadow-[0_24px_60px_rgba(7,10,18,0.55)]">
                <div className="flex items-center gap-3 border-b border-slate-200 bg-[#f6f3ff] px-6 py-4 dark:border-white/5 dark:bg-white/5">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#7d6df7]/12 text-[#7d6df7] dark:bg-[#7d6df7]/15 dark:text-[#b7a8ff]">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008v.008H12v-.008zm8.25-3.758c0 4.554-3.696 8.25-8.25 8.25s-8.25-3.696-8.25-8.25 3.696-8.25 8.25-8.25 8.25 3.696 8.25 8.25z" />
                        </svg>
                    </div>
                    <div className="text-left">
                        <h3 className="text-base font-bold text-slate-900 dark:text-white">{title}</h3>
                        <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">Quick action</p>
                    </div>
                </div>

                <div className="space-y-6 px-6 py-6 text-left">
                    <p className="text-sm leading-6 text-slate-600 dark:text-zinc-300">
                        {description}
                    </p>

                    <div className="flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onCancel}
                            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-600 transition-all hover:bg-slate-100 hover:text-slate-900 cursor-pointer dark:border-white/8 dark:bg-white/5 dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white"
                        >
                            {cancelLabel}
                        </button>
                        <button
                            type="button"
                            onClick={onConfirm}
                            className="rounded-xl border border-[#8a7bff] bg-[#7d6df7] px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#7d6df7]/20 transition-all hover:bg-[#9387ff] cursor-pointer"
                        >
                            {confirmLabel}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
