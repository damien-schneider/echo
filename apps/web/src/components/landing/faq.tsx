"use client";

import { motion } from "motion/react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    answer:
      "Yes. Echo runs entirely on your device using local Whisper models. No audio data, transcription results, or metadata are ever sent to any server. The only network requests are optional: checking for app updates and downloading new models.",
    question: "Is Echo really 100% offline?",
  },
  {
    answer:
      "Every model available in Echo supports 100 languages, including English, Spanish, French, German, Chinese, Japanese, Korean, Arabic, and many more. Auto Detect identifies the spoken language from the recording; selecting a language explicitly gives the most predictable result for short clips.",
    question: "Which languages does Echo support?",
  },
  {
    answer:
      "Medium is the recommended balance of multilingual accuracy and speed. Choose Small for lower memory use and faster transcription, or Large for the highest accuracy when your computer has enough memory. All three models support the same languages.",
    question: "Which model should I use?",
  },
  {
    answer:
      "Echo supports macOS (both Apple Silicon and Intel), Windows (x64), and Linux (AppImage and .deb packages). macOS requires Big Sur or later, Windows requires Windows 10 64-bit, and Linux requires glibc 2.28 or later.",
    question: "Does it work on all operating systems?",
  },
  {
    answer:
      "Echo is completely free and open source under the MIT license. There are no hidden fees, premium tiers, or usage limits. You can download, use, modify, and distribute it freely.",
    question: "Is it really free?",
  },
  {
    answer:
      "You configure a keyboard shortcut (like Ctrl+Shift+E) that works system-wide. Press it in any application to start recording, press again to stop. Echo transcribes your speech and automatically pastes the text where your cursor is. You can also use push-to-talk mode where you hold the key to record and release to transcribe.",
    question: "How does the global shortcut work?",
  },
  {
    answer:
      "Whisper benefits from GPU acceleration, but Small and Medium work well on many modern CPUs too. Start with Small on lower-memory computers; choose Medium or Large when accuracy matters more than speed.",
    question: "Do I need a powerful computer?",
  },
];

const faqSchema = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((faq) => ({
    "@type": "Question",
    acceptedAnswer: {
      "@type": "Answer",
      text: faq.answer,
    },
    name: faq.question,
  })),
});

export function LandingFaq() {
  return (
    <section className="bg-background py-20 text-foreground">
      <script
        dangerouslySetInnerHTML={{ __html: faqSchema }}
        type="application/ld+json"
      />
      <div className="container mx-auto max-w-3xl px-4">
        <motion.h2
          className="mb-12 w-full text-center font-bold font-display text-[clamp(1.8rem,4vw,3.2rem)] leading-tight tracking-[-0.03em]"
          initial={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
          whileInView={{ opacity: 1, y: 0 }}
        >
          Common{" "}
          <span className="font-display font-light text-muted-foreground italic">
            questions
          </span>
        </motion.h2>
        <Accordion className="w-full" collapsible type="single">
          {faqs.map((faq, index) => (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              key={faq.question}
              transition={{ delay: index * 0.08, duration: 0.5 }}
              viewport={{ margin: "-50px", once: true }}
              whileInView={{ opacity: 1, y: 0 }}
            >
              <AccordionItem value={`item-${index}`}>
                <AccordionTrigger>{faq.question}</AccordionTrigger>
                <AccordionContent>{faq.answer}</AccordionContent>
              </AccordionItem>
            </motion.div>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
