import { createFileRoute } from "@tanstack/react-router";
import { Search, SearchSlash } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import EchoFooter from "@/components/landing/footer";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { H1, P } from "@/components/ui/typography";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/faq")({
  component: FaqPage,
});

function FaqPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");

  const categories = [
    { id: "all", label: "All" },
    { id: "general", label: "General" },
    { id: "technical", label: "Technical" },
    { id: "privacy", label: "Privacy & Security" },
    { id: "troubleshooting", label: "Troubleshooting" },
  ];

  const faqs = [
    {
      id: "gen-1",
      category: "general",
      title: "What is Echo?",
      content:
        "Echo is a private, offline, and fast speech-to-text application powered by OpenAI's Whisper model. It runs entirely on your device, ensuring your data remains private.",
    },
    {
      id: "gen-2",
      category: "general",
      title: "How do I install Echo?",
      content:
        "You can download the latest version of Echo from our website or GitHub releases page. We support macOS, Windows, and Linux.",
    },
    {
      id: "tech-1",
      category: "technical",
      title: "What are the system requirements?",
      content:
        "Echo requires a modern 64-bit processor. For optimal performance, we recommend a device with a dedicated GPU or Apple Silicon (M1/M2/M3).",
    },
    {
      id: "tech-2",
      category: "technical",
      title: "Which Whisper models are supported?",
      content:
        "Echo supports various Whisper models ranging from Tiny to Large. You can choose the model that best fits your hardware capabilities and accuracy needs.",
    },
    {
      id: "tech-3",
      category: "technical",
      title: "Can I use Echo with other applications?",
      content:
        "Yes, Echo works globally across your system. You can use it to dictate text into any application that accepts text input.",
    },
    {
      id: "priv-1",
      category: "privacy",
      title: "Does Echo store my audio recordings?",
      content:
        "No, Echo processes audio in real-time and does not store your audio recordings permanently. Temporary buffers are used for processing and are cleared immediately after transcription.",
    },
    {
      id: "priv-2",
      category: "privacy",
      title: "Is my data sent to any third-party servers?",
      content:
        "No, Echo operates entirely offline. No data is sent to OpenAI or any other third-party servers.",
    },
    {
      id: "trouble-1",
      category: "troubleshooting",
      title: "Echo is not transcribing my voice.",
      content:
        "Please ensure that you have selected the correct microphone in the settings and that Echo has permission to access your microphone.",
    },
    {
      id: "trouble-2",
      category: "troubleshooting",
      title: "Transcription is slow.",
      content:
        "Transcription speed depends on your hardware and the selected model. Try switching to a smaller model (e.g., Tiny or Base) for faster performance.",
    },
  ];

  const filtered = faqs.filter((faq) => {
    const matchesCategory =
      activeCategory === "all" || faq.category === activeCategory;
    const matchesSearch =
      faq.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      faq.content.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="flex min-h-screen flex-col bg-background pt-24 font-sans text-foreground">
      <div className="flex-1">
        <div className="mx-auto min-h-[calc(100vh-(--spacing(24)))] w-full max-w-3xl md:border-x">
          <div className="px-4 py-16 lg:px-6">
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              initial={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.5 }}
            >
              <H1 className="mb-4">Frequently Asked Questions</H1>
              <P className="mb-8 max-w-2xl text-muted-foreground">
                Find answers to common questions about Echo. Can't find what
                you're looking for? Check our GitHub repository.
              </P>
            </motion.div>

            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="relative max-w-sm"
              initial={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <input
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm ring-offset-background file:border-0 file:bg-transparent file:font-medium file:text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search FAQs..."
                value={searchTerm}
              />
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground">
                <Search className="h-4 w-4" />
              </div>
            </motion.div>
          </div>

          <div className="h-px w-full bg-border" />

          <div className="sticky top-0 z-10 flex flex-wrap gap-1 border-b bg-background/95 px-4 backdrop-blur supports-backdrop-filter:bg-background/60 md:gap-3">
            {categories.map((cat) => (
              <button
                className="flex flex-col"
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                type="button"
              >
                <span
                  className={cn(
                    "p-2 font-medium text-sm transition-colors hover:text-primary md:p-3 md:text-base",
                    activeCategory === cat.id
                      ? "text-primary"
                      : "text-muted-foreground"
                  )}
                >
                  {cat.label}
                </span>
                {activeCategory === cat.id && (
                  <motion.span
                    className="h-0.5 w-full rounded-full bg-primary"
                    layoutId="activeCategory"
                  />
                )}
              </button>
            ))}
          </div>

          <Accordion
            className="space-y-2 px-4 py-12 lg:px-6"
            collapsible
            defaultValue="gen-1"
            type="single"
          >
            {filtered.map((faq, index) => (
              <motion.div
                animate={{ opacity: 1, y: 0 }}
                initial={{ opacity: 0, y: 20 }}
                key={faq.id}
                transition={{ duration: 0.3, delay: index * 0.05 }}
              >
                <AccordionItem
                  className="rounded-md border bg-card/20 shadow outline-none last:border-b has-focus-visible:border-ring data-[state=open]:bg-card"
                  value={faq.id}
                >
                  <AccordionTrigger className="px-4 hover:no-underline focus-visible:ring-0">
                    {faq.title}
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pt-2 pb-4 text-muted-foreground">
                    {faq.content}
                  </AccordionContent>
                </AccordionItem>
              </motion.div>
            ))}
          </Accordion>

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-4 rounded-full bg-muted p-4">
                <Search className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-lg">
                No FAQs found matching your search.
              </h3>
              <div className="mt-4">
                <Button onClick={() => setSearchTerm("")} variant="outline">
                  <SearchSlash className="mr-2 h-4 w-4" />
                  Clear search
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-center border-t px-4 py-6 lg:px-6">
            <p className="text-muted-foreground">
              Can't find what you're looking for?{" "}
              <a
                className="text-primary hover:underline"
                href="https://github.com/damien-schneider/Echo/issues"
                rel="noreferrer"
                target="_blank"
              >
                Open an issue on GitHub
              </a>
            </p>
          </div>
        </div>
      </div>
      <EchoFooter />
    </div>
  );
}
