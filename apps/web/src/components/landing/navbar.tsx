"use client";

import { Link, useLocation } from "@tanstack/react-router";
import { Download, Menu, Moon, Sun, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import EchoLogo from "@/components/icons/echo-logo";
import { useLenis } from "@/components/smooth-scroll";
import { Button } from "@/components/ui/button";
import { useGithubData } from "@/hooks/use-github-data";

export default function Navbar() {
  const [isDark, setIsDark] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const lenis = useLenis();
  const { stars } = useGithubData();
  const location = useLocation();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const isDarkMode = document.documentElement.classList.contains("dark");
      setIsDark(isDarkMode);
    }
  }, []);

  useEffect(() => {
    if (location.hash) {
      if (location.hash === "top") {
        lenis?.scrollTo(0);
      } else {
        const element = document.querySelector(`#${location.hash}`);
        if (element) {
          lenis?.scrollTo(element as HTMLElement);
        }
      }
    }
  }, [location.hash, lenis]);

  const toggleTheme = () => {
    const newTheme = !isDark;
    setIsDark(newTheme);
    if (newTheme) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  return (
    <motion.nav
      animate={{ y: 0, opacity: 1 }}
      className="fixed inset-x-4 top-4 z-50 md:inset-x-auto md:left-1/2 md:w-full md:max-w-5xl md:-translate-x-1/2"
      initial={{ y: -100, opacity: 0 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
    >
      <div className="flex h-14 items-center justify-between rounded-full border border-border bg-background/80 pr-2.5 pl-6 shadow-lg backdrop-blur-md">
        <div className="flex items-center gap-2">
          <Link className="flex items-center gap-2" hash="top" to="/">
            <EchoLogo className="h-6 w-auto text-foreground" variant="full" />
          </Link>
        </div>

        {/* Desktop Menu */}
        <div className="hidden items-center gap-6 md:flex">
          <Link
            className="font-medium text-sm transition-colors hover:text-primary"
            hash="features"
            to="/"
          >
            Features
          </Link>
          <Link
            className="font-medium text-sm transition-colors hover:text-primary"
            to="/faq"
          >
            FAQ
          </Link>
          <Link
            className="font-medium text-sm transition-colors hover:text-primary"
            hash="download"
            to="/"
          >
            Download
          </Link>
          <a
            className="flex items-center gap-2 font-medium text-sm transition-colors hover:text-primary"
            href="https://github.com/damien-schneider/Echo"
            rel="noopener noreferrer"
            target="_blank"
          >
            GitHub
            {stars && (
              <motion.span
                animate={{ scale: 1 }}
                className="flex items-center justify-center rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground text-xs"
                initial={{ scale: 0 }}
              >
                {stars}
              </motion.span>
            )}
          </a>

          <div className="ml-4 flex items-center gap-2">
            <Button
              className="rounded-full"
              onClick={toggleTheme}
              size="icon"
              variant="ghost"
            >
              {isDark ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </Button>
            <Button asChild className="gap-2 rounded-full">
              <Link hash="download" to="/">
                <Download className="h-4 w-4" />
                Download
              </Link>
            </Button>
          </div>
        </div>

        {/* Mobile Menu Toggle */}
        <div className="flex items-center gap-4 md:hidden">
          <Button
            className="rounded-full"
            onClick={toggleTheme}
            size="icon"
            variant="ghost"
          >
            {isDark ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
          </Button>
          <button onClick={() => setIsMenuOpen(!isMenuOpen)} type="button">
            {isMenuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="absolute top-full right-0 left-0 mt-2 flex flex-col gap-4 rounded-2xl border border-border bg-background/95 p-4 shadow-xl backdrop-blur-md md:hidden"
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
          >
            <Link
              className="font-medium text-sm"
              hash="features"
              onClick={() => setIsMenuOpen(false)}
              to="/"
            >
              Features
            </Link>
            <Link
              className="font-medium text-sm"
              onClick={() => setIsMenuOpen(false)}
              to="/faq"
            >
              FAQ
            </Link>
            <Link
              className="font-medium text-sm"
              hash="download"
              onClick={() => setIsMenuOpen(false)}
              to="/"
            >
              Download
            </Link>
            <a
              className="flex items-center gap-2 font-medium text-sm"
              href="https://github.com/damien-schneider/Echo"
              onClick={() => setIsMenuOpen(false)}
              rel="noopener noreferrer"
              target="_blank"
            >
              GitHub
              {stars && (
                <span className="flex items-center justify-center rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground text-xs">
                  {stars}
                </span>
              )}
            </a>
            <Button asChild className="w-full gap-2 rounded-full">
              <Link hash="download" onClick={() => setIsMenuOpen(false)} to="/">
                <Download className="h-4 w-4" />
                Download
              </Link>
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}
