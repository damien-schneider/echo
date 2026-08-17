import { TanStackDevtools } from "@tanstack/react-devtools";
import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";

import Navbar from "../components/landing/navbar";
import SmoothScroll from "../components/smooth-scroll";

import appCss from "../styles.css?url";

const SITE_URL: string =
  import.meta.env.VITE_SITE_URL ?? "https://echo-app.site";

const schemaOrg = JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      applicationCategory: "UtilitiesApplication",
      applicationSubCategory: "Speech Recognition",
      description:
        "Echo is a free, private, offline speech-to-text application powered by multilingual OpenAI Whisper models. Transcribe your voice locally — no data ever leaves your device.",
      downloadUrl: "https://github.com/damien-schneider/Echo/releases/latest",
      featureList: [
        "100% offline processing — no cloud required",
        "OpenAI Whisper model support (100 languages)",
        "Three multilingual model sizes for different hardware",
        "Global keyboard shortcuts and push-to-talk",
        "Automatic text pasting into any application",
        "File transcription (audio and video)",
        "AI post-processing with LLM refinement",
        "Free and open source (MIT license)",
      ],
      keywords:
        "speech to text, voice transcription, offline, private, whisper, multilingual dictation, AI dictation, open source",
      license: "https://opensource.org/licenses/MIT",
      name: "Echo",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      operatingSystem: ["macOS", "Windows", "Linux"],
      softwareHelp: {
        "@type": "CreativeWork",
        url: "https://github.com/damien-schneider/Echo",
      },
      url: SITE_URL,
    },
    {
      "@type": "Organization",
      logo: `${SITE_URL}/logo192.png`,
      name: "Echo",
      sameAs: ["https://github.com/damien-schneider/Echo", SITE_URL],
      url: SITE_URL,
    },
  ],
});

export const Route = createRootRoute({
  head: () => ({
    links: [
      ...(SITE_URL ? [{ href: SITE_URL, rel: "canonical" }] : []),
      {
        href: "https://fonts.googleapis.com",
        rel: "preconnect",
      },
      {
        crossOrigin: "anonymous",
        href: "https://fonts.gstatic.com",
        rel: "preconnect",
      },
      {
        href: "https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Syne:wght@400;500;600;700;800&display=swap",
        rel: "stylesheet",
      },
      {
        href: appCss,
        rel: "stylesheet",
      },
    ],
    meta: [
      {
        charSet: "utf-8",
      },
      {
        content: "width=device-width, initial-scale=1",
        name: "viewport",
      },
      {
        title: "Echo — Free, Private, Offline Speech-to-Text App",
      },
      {
        content:
          "Echo is a free, open-source speech-to-text app powered by Whisper AI. Transcribe voice locally on macOS, Windows, and Linux — 100% private, no internet required.",
        name: "description",
      },
      {
        content:
          "speech to text, offline dictation, voice transcription, whisper AI, private speech recognition, local transcription, open source dictation, macOS dictation, Windows dictation",
        name: "keywords",
      },
      {
        content: "Echo",
        property: "og:site_name",
      },
      {
        content: "Echo — Free, Private, Offline Speech-to-Text App",
        property: "og:title",
      },
      {
        content:
          "Free, open-source speech-to-text powered by Whisper AI. 100% offline — your voice never leaves your device. Available for macOS, Windows, and Linux.",
        property: "og:description",
      },
      {
        content: `${SITE_URL}/opengraph-image.png`,
        property: "og:image",
      },
      ...(SITE_URL ? [{ content: SITE_URL, property: "og:url" }] : []),
      {
        content: "website",
        property: "og:type",
      },
      {
        content: "summary_large_image",
        name: "twitter:card",
      },
      {
        content: "Echo — Free, Private, Offline Speech-to-Text App",
        name: "twitter:title",
      },
      {
        content:
          "Free, open-source speech-to-text powered by Whisper AI. 100% offline — your voice never leaves your device. Available for macOS, Windows, and Linux.",
        name: "twitter:description",
      },
      {
        content: "/opengraph-image.png",
        name: "twitter:image",
      },
    ],
  }),

  shellComponent: RootDocument,
});

function JsonLdScript() {
  return (
    <script
      dangerouslySetInnerHTML={{ __html: schemaOrg }}
      type="application/ld+json"
    />
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html className="dark" lang="en">
      <head>
        <JsonLdScript />
        <HeadContent />
      </head>
      <body>
        <SmoothScroll>
          <Navbar />
          {children}
          <TanStackDevtools
            config={{
              position: "bottom-right",
            }}
            plugins={[
              {
                name: "Tanstack Router",
                render: <TanStackRouterDevtoolsPanel />,
              },
            ]}
          />
        </SmoothScroll>
        <Scripts />
      </body>
    </html>
  );
}
