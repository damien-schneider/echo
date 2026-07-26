"use client";

import { AppleIcon, Monitor, Terminal } from "lucide-react";
import { motion, useInView, useScroll, useTransform } from "motion/react";
import { useRef } from "react";

import { Button } from "@/components/ui/button";
import { useGithubData } from "@/hooks/use-github-data";

const Download = () => {
  const { downloadLinks, stars } = useGithubData();
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { margin: "-100px", once: true });

  const { scrollYProgress } = useScroll({
    offset: ["start end", "end start"],
    target: ref,
  });

  const glowY = useTransform(scrollYProgress, [0, 1], ["20%", "-20%"]);

  const fallbackUrl =
    "https://github.com/damien-schneider/Echo/releases/latest";

  const platforms = [
    {
      icon: AppleIcon,
      name: "macOS",
      primary: { href: downloadLinks.macSilicon, label: "Apple Silicon" },
      req: "macOS 11.0+",
      secondary: { href: downloadLinks.macIntel, label: "Intel" },
    },
    {
      icon: Monitor,
      name: "Windows",
      primary: { href: downloadLinks.windows, label: "Download x64" },
      req: "Windows 10 (64-bit)",
    },
    {
      icon: Terminal,
      name: "Linux",
      primary: { href: downloadLinks.linuxAppImage, label: "AppImage" },
      req: "glibc \u2265 2.28",
      secondary: { href: downloadLinks.linuxDeb, label: ".deb" },
    },
  ];

  return (
    <section
      className="relative overflow-hidden bg-background py-24 text-foreground md:py-36"
      id="download"
      ref={ref}
    >
      {/* Subtle glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute bottom-0 left-1/2 h-[400px] w-[600px] -translate-x-1/2 rounded-full bg-brand/[0.04] blur-[120px]"
          style={{ y: glowY }}
        />
      </div>

      <div className="container relative z-10 mx-auto px-4">
        <motion.div
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
          className="mb-16 text-center"
          initial={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <h2 className="font-bold font-display text-[clamp(2rem,5vw,4rem)] leading-tight tracking-[-0.03em]">
            Download Echo{" "}
            <span className="font-display font-light text-muted-foreground italic">
              — it's free
            </span>
          </h2>
          <p className="mx-auto mt-4 max-w-md text-muted-foreground text-sm">
            No account. No tracking. No cloud. Free forever under the MIT
            license.
          </p>
          {stars != null && stars > 0 && (
            <p className="mt-3 text-muted-foreground/50 text-xs">
              {stars.toLocaleString()} stars on GitHub
            </p>
          )}
        </motion.div>

        <div className="mx-auto grid max-w-4xl gap-4 md:grid-cols-3">
          {platforms.map((platform, i) => (
            <motion.div
              animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              className="flex flex-col rounded-2xl border border-border/60 bg-card p-6 transition-colors hover:border-foreground/15"
              initial={{ opacity: 0, y: 20 }}
              key={platform.name}
              transition={{
                delay: 0.15 + i * 0.1,
                duration: 0.5,
                ease: "easeOut",
              }}
              whileHover={{ y: -3 }}
            >
              <div className="mb-6 flex items-center gap-3">
                <platform.icon className="h-6 w-6 text-foreground" />
                <span className="font-bold font-display text-foreground text-lg tracking-tight">
                  {platform.name}
                </span>
              </div>

              <div className="mb-4 flex-1 space-y-2">
                <Button asChild className="h-11 w-full">
                  <a href={platform.primary.href || fallbackUrl}>
                    {platform.primary.label}
                  </a>
                </Button>
                {platform.secondary && (
                  <Button asChild className="h-11 w-full" variant="outline">
                    <a href={platform.secondary.href || fallbackUrl}>
                      {platform.secondary.label}
                    </a>
                  </Button>
                )}
              </div>

              <p className="text-[11px] text-muted-foreground/60">
                {platform.req}
              </p>
            </motion.div>
          ))}
        </div>

        <motion.p
          animate={isInView ? { opacity: 1 } : { opacity: 0 }}
          className="mt-8 text-center text-muted-foreground text-sm"
          initial={{ opacity: 0 }}
          transition={{ delay: 0.5, duration: 0.6 }}
        >
          Looking for other versions?{" "}
          <a
            className="font-semibold text-foreground underline decoration-brand/40 underline-offset-2 hover:decoration-brand"
            href="https://github.com/damien-schneider/Echo/releases"
          >
            View all releases
          </a>
        </motion.p>
      </div>
    </section>
  );
};

export default Download;
