import { createFileRoute } from "@tanstack/react-router";
import { Construction } from "lucide-react";
import EchoFooter from "@/components/landing/footer";
import { H1, Lead, P } from "@/components/ui/typography";

export const Route = createFileRoute("/roadmap")({
  component: RoadmapPage,
  head: () => ({
    meta: [
      { title: "Roadmap — Echo Speech-to-Text" },
      {
        content:
          "See what's coming next for Echo: planned features, upcoming improvements, and the future of private offline speech-to-text.",
        name: "description",
      },
      { content: "Roadmap — Echo Speech-to-Text", property: "og:title" },
      {
        content:
          "See what's coming next for Echo: planned features, upcoming improvements, and the future of private offline speech-to-text.",
        property: "og:description",
      },
    ],
  }),
});

function RoadmapPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background pt-24 font-sans text-foreground">
      <div className="container mx-auto flex flex-1 flex-col items-center justify-center px-4 pb-20 text-center">
        <div className="mb-6 rounded-full bg-secondary/50 p-6">
          <Construction className="h-16 w-16 text-primary" />
        </div>
        <H1 className="mb-4">Roadmap</H1>
        <Lead className="mx-auto mb-8 max-w-md">
          We are working hard to bring you the best offline speech-to-text
          experience. Our roadmap will be published here soon.
        </Lead>
        <P className="text-muted-foreground">
          In the meantime, check out our{" "}
          <a
            className="text-primary hover:underline"
            href="https://github.com/damien-schneider/Echo/issues"
          >
            GitHub Issues
          </a>{" "}
          to see what we're working on.
        </P>
      </div>
      <EchoFooter />
    </div>
  );
}
