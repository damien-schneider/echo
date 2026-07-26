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
      "Yes. Echo runs entirely on your device using local AI models (Whisper and Parakeet). No audio data, transcription results, or metadata are ever sent to any server. The only network requests are optional: checking for app updates and downloading new models.",
    question: "Is Echo really 100% offline?",
  },
  {
    answer:
      "Whisper models support over 100 languages including English, Spanish, French, German, Chinese, Japanese, Korean, Arabic, and many more. Parakeet V3 supports automatic language detection for the most common languages, while Parakeet V2 is optimized specifically for English with the highest accuracy.",
    question: "Which languages does Echo support?",
  },
  {
    answer:
      "For most users, Parakeet V3 is the best starting point — it's fast, accurate, and works on CPU without GPU requirements. If you only transcribe English, Parakeet V2 offers the highest accuracy. For multi-language needs with a capable GPU, Whisper models provide excellent results across 100+ languages.",
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
      "Parakeet models are CPU-optimized and run well on most modern computers. Whisper models benefit from GPU acceleration but the smaller models (Small, Medium) work fine on CPU too. Echo is built with Rust for minimal resource usage.",
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
