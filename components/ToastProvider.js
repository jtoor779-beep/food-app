"use client";

import { createContext, useContext, useMemo, useState } from "react";

const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const api = useMemo(() => {
    return {
      show: (message, type = "info") => {
        const id = Math.random().toString(36).slice(2);
        setToasts((prev) => [...prev, { id, message, type }]);
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 2200);
      },
    };
  }, []);

  return (
    <ToastCtx.Provider value={api}>
      {children}

      <div className="fixed right-4 top-20 z-50 space-y-2">
        {toasts.map((t) => {
          const base =
            "rounded-2xl border px-4 py-3 text-sm shadow-sm backdrop-blur";
          const cls =
            t.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/60 dark:text-emerald-100"
              : t.type === "error"
              ? "border-red-200 bg-red-50 text-red-900 dark:border-red-900/50 dark:bg-red-950/60 dark:text-red-100"
              : "border-gray-200 bg-white/90 text-gray-900 dark:border-zinc-800 dark:bg-zinc-950/70 dark:text-zinc-100";

          return (
            <div key={t.id} className={`${base} ${cls}`}>
              {t.message}
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
