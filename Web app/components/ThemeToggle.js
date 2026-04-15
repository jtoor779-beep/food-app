"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setMounted(true);

    try {
      const saved = localStorage.getItem("theme");
      const dark = saved === "dark";
      document.documentElement.classList.toggle("dark", dark);
      setIsDark(dark);
    } catch {}
  }, []);

  if (!mounted) return null;

  return (
    <button
      onClick={() => {
        const next = !isDark;
        setIsDark(next);
        document.documentElement.classList.toggle("dark", next);
        try {
          localStorage.setItem("theme", next ? "dark" : "light");
        } catch {}
      }}
      className="ml-1 rounded-xl border bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
      title="Toggle theme"
    >
      {isDark ? "☀️" : "🌙"}
    </button>
  );
}
