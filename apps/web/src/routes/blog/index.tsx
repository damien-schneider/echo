import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import EchoFooter from "@/components/landing/footer";
import { blogPosts } from "@/data/blog-posts";

export const Route = createFileRoute("/blog/")({
  component: BlogIndexPage,
  head: () => ({
    meta: [
      {
        title: "Blog — Offline Speech-to-Text Guides, Tips & News | Echo",
      },
      {
        content:
          "Guides, comparisons, and tips on private offline voice dictation, Whisper AI models, and privacy-first speech recognition — from the Echo team.",
        name: "description",
      },
      {
        content: "Blog — Offline Speech-to-Text Guides & News | Echo",
        property: "og:title",
      },
      {
        content:
          "Guides, comparisons, and tips on private offline voice dictation, Whisper AI models, and privacy-first speech recognition — from the Echo team.",
        property: "og:description",
      },
    ],
  }),
});

const CATEGORY_COLORS: Record<string, string> = {
  Comparison: "bg-accent/15 text-accent-foreground border-accent/30",
  Guide: "bg-primary/10 text-primary border-primary/20",
  Privacy: "bg-brand/10 text-foreground border-brand/20",
  Technical: "bg-muted text-muted-foreground border-border",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function getCategoryClasses(category: string): string {
  return (
    CATEGORY_COLORS[category] ?? "bg-muted text-muted-foreground border-border"
  );
}

function BlogIndexPage() {
  return (
    <div className="min-h-screen bg-background font-body text-foreground">
      <main className="pt-24">
        {/* Header */}
        <div className="mx-auto max-w-5xl px-4 pt-12 pb-16">
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            initial={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="mb-4 inline-block rounded-full border border-brand/30 bg-brand/10 px-3 py-1 font-body text-foreground text-sm">
              Echo Blog
            </span>
            <h1 className="font-bold font-display text-[clamp(2.25rem,5vw,3.5rem)] text-foreground leading-tight tracking-[-0.03em]">
              Privacy, Voice, and{" "}
              <span className="font-display font-light text-muted-foreground italic">
                local AI
              </span>
            </h1>
            <p className="mt-4 max-w-xl text-base text-muted-foreground">
              Guides, comparisons, and deep dives on offline speech recognition,
              AI model selection, and keeping your voice data on your own
              machine.
            </p>
          </motion.div>
        </div>

        {/* Divider */}
        <div className="mx-auto max-w-5xl border-border border-t px-4" />

        {/* Posts grid */}
        <div className="mx-auto max-w-5xl px-4 py-16">
          <div className="grid gap-6 md:grid-cols-2">
            {blogPosts.map((post, index) => (
              <motion.div
                animate={{ opacity: 1, y: 0 }}
                initial={{ opacity: 0, y: 20 }}
                key={post.slug}
                transition={{
                  delay: 0.1 + index * 0.08,
                  duration: 0.5,
                  ease: "easeOut",
                }}
              >
                <Link
                  className="group flex h-full flex-col rounded-2xl border border-border/60 bg-card p-6 transition-all duration-200 hover:border-foreground/15 hover:shadow-sm"
                  params={{ slug: post.slug }}
                  to="/blog/$slug"
                >
                  {/* Category + reading time */}
                  <div className="mb-4 flex items-center justify-between">
                    <span
                      className={`rounded-full border px-2.5 py-0.5 font-body font-medium text-xs ${getCategoryClasses(post.category)}`}
                    >
                      {post.category}
                    </span>
                    <span className="font-body text-muted-foreground text-xs">
                      {post.readingTime}
                    </span>
                  </div>

                  {/* Title */}
                  <h2 className="mb-2 font-bold font-display text-foreground text-xl leading-snug tracking-tight transition-colors group-hover:text-primary">
                    {post.title}
                  </h2>

                  {/* Description */}
                  <p className="mb-6 flex-1 font-body text-muted-foreground text-sm leading-relaxed">
                    {post.description}
                  </p>

                  {/* Footer */}
                  <div className="flex items-center justify-between border-border/50 border-t pt-4">
                    <time
                      className="font-body text-muted-foreground text-xs"
                      dateTime={post.publishedAt}
                    >
                      {formatDate(post.publishedAt)}
                    </time>
                    <span className="font-body font-medium text-primary text-xs transition-opacity group-hover:opacity-70">
                      Read more →
                    </span>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto max-w-5xl px-4 pb-24"
          initial={{ opacity: 0, y: 20 }}
          transition={{ delay: 0.5, duration: 0.5 }}
        >
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-border/60 bg-card px-8 py-12 text-center">
            <h2 className="font-bold font-display text-2xl text-foreground tracking-tight md:text-3xl">
              Ready to try private dictation?
            </h2>
            <p className="max-w-sm font-body text-muted-foreground text-sm">
              Echo is free, open-source, and runs 100% on your device. No
              account. No cloud. No tracking.
            </p>
            <a
              className="mt-2 inline-flex h-11 items-center justify-center rounded-xl bg-primary px-6 font-body font-semibold text-primary-foreground text-sm transition-opacity hover:opacity-90"
              href="/#download"
            >
              Download Echo — it's free
            </a>
          </div>
        </motion.div>
      </main>

      <EchoFooter />
    </div>
  );
}
