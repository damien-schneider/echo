import { createFileRoute } from "@tanstack/react-router";
import EchoFooter from "@/components/landing/footer";
import { H1, H2, P } from "@/components/ui/typography";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
  head: () => ({
    meta: [
      { title: "Privacy Policy — Echo Speech-to-Text" },
      {
        content:
          "Echo's privacy policy. Echo processes all audio locally on your device. No data is ever sent to any server — your voice stays yours.",
        name: "description",
      },
      {
        content: "noindex, follow",
        name: "robots",
      },
    ],
  }),
});

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background pt-24 font-sans text-foreground">
      <div className="container mx-auto max-w-3xl px-4 pb-20">
        <H1>Privacy Policy</H1>
        <P className="text-muted-foreground">Last updated: November 20, 2025</P>

        <H2 className="mt-10">1. Introduction</H2>
        <P>
          Echo ("we", "our", or "us") is committed to protecting your privacy.
          This Privacy Policy explains how your personal information is
          collected, used, and disclosed by Echo.
        </P>

        <H2 className="mt-10">2. Data Collection</H2>
        <P>
          Echo is designed to be a private, offline-first application. We do not
          collect, store, or transmit your voice data, transcriptions, or any
          other personal information to our servers or third parties.
        </P>
        <P>
          All speech processing happens locally on your device using the Whisper
          model.
        </P>

        <H2 className="mt-10">3. Analytics</H2>
        <P>
          We do not use any third-party analytics services that track your usage
          of the application.
        </P>

        <H2 className="mt-10">4. Updates</H2>
        <P>
          The application may check GitHub for updates. This process involves a
          standard HTTPS request to GitHub's servers, which may log your IP
          address in accordance with GitHub's privacy policy.
        </P>

        <H2 className="mt-10">5. Contact Us</H2>
        <P>
          If you have any questions about this Privacy Policy, please contact us
          via our GitHub repository.
        </P>
      </div>
      <EchoFooter />
    </div>
  );
}
