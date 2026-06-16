import { useEffect, useState } from "react";

export function useStoredState<T>(key: string, defaultValue: T) {
    const [value, setValue] = useState<T>(defaultValue);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        let cancelled = false;

        window.electronAPI.storage.get(key)
            .then((stored) => {
                if (cancelled) return;
                if (stored !== undefined) {
                    setValue(stored as T);
                }
                setReady(true);
            })
            .catch(() => {
                if (!cancelled) {
                    setReady(true);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [key]);

    useEffect(() => {
        if (!ready) return;

        if (value === null) {
            window.electronAPI.storage.remove(key).catch(() => {});
            return;
        }

        window.electronAPI.storage.set(key, value).catch(() => {});
    }, [key, ready, value]);

    return [value, setValue, ready] as const;
}
