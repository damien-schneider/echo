import { createFileRoute } from "@tanstack/react-router";
import GithubIcon from "@/components/icons/github-icon";
import EchoFooter from "@/components/landing/footer";
import { Button } from "@/components/ui/button";
import { H1, H2, InlineCode, List, P } from "@/components/ui/typography";

export const Route = createFileRoute("/contributing")({
  component: ContributingPage,
  head: () => ({
    meta: [
      { title: "Contributing — Echo Speech-to-Text" },
      {
        name: "description",
        content:
          "Help build Echo, the open-source offline speech-to-text app. Learn how to contribute code, report bugs, and improve the project.",
      },
      {
        property: "og:title",
        content: "Contributing — Echo Speech-to-Text",
      },
      {
        property: "og:description",
        content:
          "Help build Echo, the open-source offline speech-to-text app. Learn how to contribute code, report bugs, and improve the project.",
      },
    ],
  }),
});

function ContributingPage() {
  return (
    <div className="min-h-screen bg-background pt-24 font-sans text-foreground">
      <div className="container mx-auto max-w-3xl px-4 pb-20">
        <H1>Contributing to Echo</H1>
        <P>
          Thank you for your interest in contributing to Echo! We welcome
          contributions from the community to help make Echo better for
          everyone.
        </P>

        <H2 className="mt-10">How to Contribute</H2>
        <P>There are many ways you can contribute to Echo:</P>
        <List>
          <li>Reporting bugs and issues</li>
          <li>Suggesting new features</li>
          <li>Improving documentation</li>
          <li>Submitting pull requests with code changes</li>
        </List>

        <H2 className="mt-10">Getting Started</H2>
        <P>
          To get started with development, please visit our GitHub repository
          and read the <InlineCode>CONTRIBUTING.md</InlineCode> file (if
          available) or the <InlineCode>README.md</InlineCode> for setup
          instructions.
        </P>

        <div className="mt-8">
          <Button asChild className="gap-2" size="lg">
            <a
              href="https://github.com/damien-schneider/Echo"
              rel="noopener noreferrer"
              target="_blank"
            >
              <GithubIcon className="h-5 w-5" />
              Visit GitHub Repository
            </a>
          </Button>
        </div>
      </div>
      <EchoFooter />
    </div>
  );
}
