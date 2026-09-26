"use client";

import { useEffect, useState } from "react";

type NavItem = {
  label: string;
  href: string;
};

type NavbarProps = {
  navItems: NavItem[];
  darkMode: boolean;
  onToggleTheme: () => void;
};

export function Navbar({ navItems, darkMode, onToggleTheme }: NavbarProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 8);

    onScroll();
    window.addEventListener("scroll", onScroll);

    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-20 border-b border-slate-200 bg-stone-50/80 backdrop-blur-md transition-all duration-300 dark:border-slate-700 dark:bg-slate-950/80 ${
        isScrolled ? "shadow-sm shadow-slate-200/80 dark:shadow-slate-950/60" : ""
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-sm font-bold text-white transition-transform duration-200 hover:scale-105 dark:bg-slate-100 dark:text-slate-900">
            N
          </div>
          <span className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
            Next Learning
          </span>
        </div>

        <nav className="hidden items-center gap-6 text-sm text-slate-600 md:flex dark:text-slate-300">
          {navItems.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="relative transition-all duration-200 hover:text-slate-900 dark:hover:text-white"
            >
              <span className="after:absolute after:-bottom-1 after:left-0 after:h-0.5 after:w-full after:origin-left after:scale-x-0 after:bg-indigo-500 after:transition-transform after:duration-200 after:content-[''] hover:after:scale-x-100 dark:after:bg-indigo-400">
                {item.label}
              </span>
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Toggle theme"
            onClick={onToggleTheme}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-lg shadow-sm transition-transform duration-200 hover:-translate-y-0.5 hover:border-slate-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          >
            {darkMode ? "☀️" : "🌙"}
          </button>

          <button className="hidden rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-700 md:inline-flex dark:bg-indigo-500 dark:hover:bg-indigo-400">
            Start now
          </button>

          <button
            type="button"
            aria-label="Toggle menu"
            aria-expanded={isMenuOpen}
            onClick={() => setIsMenuOpen((previous) => !previous)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-800 shadow-sm transition-transform duration-200 hover:-translate-y-0.5 md:hidden dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          >
            {isMenuOpen ? "✕" : "☰"}
          </button>
        </div>
      </div>

      <div
        className={`overflow-hidden border-t border-slate-200 bg-white transition-all duration-300 ease-out md:hidden dark:border-slate-700 dark:bg-slate-900 ${
          isMenuOpen ? "max-h-56 opacity-100" : "max-h-0 border-t-0 opacity-0"
        }`}
      >
        <nav className="mx-auto flex max-w-6xl flex-col px-6 py-4 text-sm text-slate-700 dark:text-slate-200">
          {navItems.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="py-2 transition hover:text-slate-900 dark:hover:text-white"
              onClick={() => setIsMenuOpen(false)}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
