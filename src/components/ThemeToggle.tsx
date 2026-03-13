"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { FaMoon, FaSun } from "react-icons/fa";

export function ThemeToggle() {
    const { resolvedTheme, setTheme } = useTheme();
    const [mounted, setMounted] = React.useState(false);

    React.useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return <div className="w-10 h-10" />;
    }

    const isDark = resolvedTheme === "dark";

    return (
        <button
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className="p-3 rounded-xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-md shadow-sm border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all active:scale-95"
            aria-label="Toggle dark mode"
            title={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
        >
            {isDark ? <FaSun className="text-lg" /> : <FaMoon className="text-lg" />}
        </button>
    );
}
