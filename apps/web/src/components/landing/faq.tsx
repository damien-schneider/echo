import { motion } from "motion/react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    question: "Is Echo really offline?",
    answer:
      "Yes! Echo uses the Whisper model running locally on your device. No audio data is ever sent to the cloud.",
  },
  {
    question: "Which languages does Echo support?",
    answer:
      "Echo supports over 100 languages including English, Spanish, French, German, Chinese, Japanese, and many more.",
  },
  {
    question: "Does it work on all operating systems?",
    answer:
      "Echo is available for macOS (Apple Silicon & Intel), Windows, and Linux.",
  },
  {
    question: "Is it free?",
    answer:
      "Echo is open-source software. You can download and use it for free.",
  },
];

export function LandingFaq() {
  return (
    <section className="bg-background py-20 text-foreground">
      <div className="container mx-auto max-w-3xl px-4">
        <motion.h2
          className="mb-10 w-full text-center font-medium text-4xl tracking-tighter"
          initial={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
          whileInView={{ opacity: 1, y: 0 }}
        >
          Frequently Asked Questions
        </motion.h2>
        <Accordion className="w-full" collapsible type="single">
          {faqs.map((faq, index) => (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              key={faq.question}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              viewport={{ once: true, margin: "-50px" }}
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
