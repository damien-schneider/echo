import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import EchoFooter from "@/components/landing/footer";
import { type BlogPost, blogPosts } from "@/data/blog-posts";

export const Route = createFileRoute("/blog/$slug")({
  head: ({ params }) => {
    const post = blogPosts.find((p) => p.slug === params.slug);
    if (!post) {
      return { meta: [{ title: "Post Not Found - Echo Blog" }] };
    }
    return {
      meta: [
        { title: `${post.title} - Echo Blog` },
        { name: "description", content: post.description },
        { property: "og:title", content: `${post.title} - Echo Blog` },
        { property: "og:description", content: post.description },
        { property: "og:type", content: "article" },
        {
          property: "article:published_time",
          content: post.publishedAt,
        },
      ],
    };
  },
  component: BlogPostPage,
});

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

interface ContentNode {
  items?: string[];
  key: string;
  text?: string;
  type: "heading" | "paragraph" | "list";
}

function parseContent(raw: string): ContentNode[] {
  const nodes: ContentNode[] = [];
  const blocks = raw.split("\n\n");
  let nodeIndex = 0;

  for (const block of blocks) {
    const trimmed = block.trim();
    if (trimmed !== "") {
      if (trimmed.startsWith("## ")) {
        nodes.push({
          type: "heading",
          key: `heading-${nodeIndex}`,
          text: trimmed.slice(3),
        });
      } else {
        const lines = trimmed.split("\n");
        const allBullets = lines.every((line) => line.startsWith("- "));

        if (allBullets) {
          nodes.push({
            type: "list",
            key: `list-${nodeIndex}`,
            items: lines.map((line) => line.slice(2)),
          });
        } else {
          nodes.push({
            type: "paragraph",
            key: `para-${nodeIndex}`,
            text: trimmed,
          });
        }
      }
      nodeIndex += 1;
    }
  }

  return nodes;
}

function PostContent({ post }: { post: BlogPost }) {
  const nodes = parseContent(post.content);

  return (
    <div className="space-y-5">
      {nodes.map((node) => {
        if (node.type === "heading") {
          return (
            <h2
              className="mt-10 mb-3 font-bold font-display text-2xl text-foreground tracking-tight first:mt-0"
              key={node.key}
            >
              {node.text}
            </h2>
          );
        }

        if (node.type === "list") {
          return (
            <ul className="space-y-2 pl-2" key={node.key}>
              {(node.items ?? []).map((item) => (
                <li
                  className="flex gap-3 font-body text-base text-foreground/90 leading-relaxed"
                  key={item}
                >
                  <span aria-hidden="true" className="mt-2 shrink-0">
                    <span className="block h-1.5 w-1.5 rounded-full bg-brand" />
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p
            className="font-body text-base text-foreground/85 leading-[1.75]"
            key={node.key}
          >
            {node.text}
          </p>
        );
      })}
    </div>
  );
}

function DownloadCta() {
  return (
    <div className="my-12 rounded-2xl border border-brand/20 bg-card p-8 text-center">
      <h3 className="mb-2 font-bold font-display text-foreground text-xl tracking-tight">
        Try Echo Free
      </h3>
      <p className="mb-5 font-body text-muted-foreground text-sm">
        Private, offline speech-to-text for macOS, Windows, and Linux. No
        account, no cloud, no cost.
      </p>
      <a
        className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-6 font-body font-semibold text-primary-foreground text-sm transition-opacity hover:opacity-90"
        href="/#download"
      >
        Download Echo — it's free
      </a>
    </div>
  );
}

function BlogPostPage() {
  const { slug } = Route.useParams();
  const post = blogPosts.find((p) => p.slug === slug);

  if (!post) {
    return (
      <div className="flex min-h-screen flex-col bg-background font-body text-foreground">
        <main className="flex flex-1 flex-col items-center justify-center pt-24 text-center">
          <h1 className="mb-4 font-bold font-display text-4xl text-foreground">
            Post not found
          </h1>
          <p className="mb-8 text-muted-foreground">
            The article you're looking for doesn't exist.
          </p>
          <Link
            className="font-body font-semibold text-primary text-sm hover:underline"
            to="/blog"
          >
            ← Back to Blog
          </Link>
        </main>
        <EchoFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background font-body text-foreground">
      <main className="pt-24">
        <div className="mx-auto max-w-3xl px-4 py-12 md:border-border md:border-x">
          {/* Back link */}
          <motion.div
            animate={{ opacity: 1, x: 0 }}
            initial={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.4 }}
          >
            <Link
              className="mb-8 inline-flex items-center gap-1 font-body text-muted-foreground text-sm transition-colors hover:text-foreground"
              to="/blog"
            >
              ← All posts
            </Link>
          </motion.div>

          {/* Post header */}
          <motion.header
            animate={{ opacity: 1, y: 0 }}
            className="mb-10"
            initial={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-accent/30 bg-accent/15 px-2.5 py-0.5 font-body font-medium text-accent-foreground text-xs">
                {post.category}
              </span>
              <span className="font-body text-muted-foreground text-xs">
                {post.readingTime}
              </span>
            </div>

            <h1 className="mb-4 font-bold font-display text-[clamp(1.75rem,4vw,2.75rem)] text-foreground leading-tight tracking-[-0.02em]">
              {post.title}
            </h1>

            <p className="mb-5 font-body text-base text-muted-foreground leading-relaxed">
              {post.description}
            </p>

            <div className="flex items-center gap-2 border-border border-t pt-5">
              <time
                className="font-body text-muted-foreground text-sm"
                dateTime={post.publishedAt}
              >
                Published {formatDate(post.publishedAt)}
              </time>
            </div>
          </motion.header>

          {/* Post body */}
          <motion.article
            animate={{ opacity: 1, y: 0 }}
            initial={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.6, delay: 0.15, ease: "easeOut" }}
          >
            <PostContent post={post} />
          </motion.article>

          {/* Download CTA */}
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            initial={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <DownloadCta />
          </motion.div>

          {/* Tags */}
          <motion.footer
            animate={{ opacity: 1 }}
            className="mt-4 border-border border-t pt-8 pb-16"
            initial={{ opacity: 0 }}
            transition={{ duration: 0.4, delay: 0.4 }}
          >
            <div className="flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <span
                  className="rounded-md border border-border bg-muted px-2.5 py-1 font-body text-muted-foreground text-xs"
                  key={tag}
                >
                  {tag}
                </span>
              ))}
            </div>
          </motion.footer>
        </div>
      </main>

      <EchoFooter />
    </div>
  );
}
