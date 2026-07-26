import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";

const STATIC_ROUTES = [
  { changefreq: "weekly", path: "/", priority: "1.0" },
  { changefreq: "weekly", path: "/blog", priority: "0.9" },
  {
    changefreq: "monthly",
    path: "/blog/best-offline-speech-to-text-apps-2026",
    priority: "0.8",
  },
  {
    changefreq: "monthly",
    path: "/blog/how-to-transcribe-audio-without-internet",
    priority: "0.8",
  },
  {
    changefreq: "monthly",
    path: "/blog/whisper-vs-parakeet-models-compared",
    priority: "0.8",
  },
  {
    changefreq: "monthly",
    path: "/blog/voice-dictation-privacy-guide",
    priority: "0.8",
  },
  { changefreq: "monthly", path: "/vs", priority: "0.8" },
  { changefreq: "monthly", path: "/vs/otter-ai", priority: "0.8" },
  { changefreq: "monthly", path: "/vs/whisper-desktop", priority: "0.8" },
  { changefreq: "monthly", path: "/vs/apple-dictation", priority: "0.7" },
  { changefreq: "monthly", path: "/vs/super-whisper", priority: "0.8" },
  { changefreq: "monthly", path: "/vs/wispr-flow", priority: "0.8" },
  { changefreq: "monthly", path: "/vs/macwhisper", priority: "0.8" },
  { changefreq: "monthly", path: "/vs/dragon", priority: "0.8" },
  { changefreq: "monthly", path: "/vs/buzz", priority: "0.7" },
  { changefreq: "monthly", path: "/vs/handy", priority: "0.7" },
  { changefreq: "monthly", path: "/vs/voiceink", priority: "0.7" },
  { changefreq: "monthly", path: "/faq", priority: "0.8" },
  { changefreq: "monthly", path: "/roadmap", priority: "0.7" },
  { changefreq: "monthly", path: "/contributing", priority: "0.5" },
  { changefreq: "yearly", path: "/privacy", priority: "0.3" },
  { changefreq: "yearly", path: "/terms", priority: "0.3" },
  { changefreq: "yearly", path: "/license", priority: "0.3" },
];

function buildSitemap(baseUrl: string): string {
  const urls = STATIC_ROUTES.map(
    (route) => `  <url>
    <loc>${baseUrl}${route.path}</loc>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority}</priority>
  </url>`
  ).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: ({ request }: { request: Request }) => {
        const { origin } = new URL(request.url);
        const xml = buildSitemap(origin);
        return new Response(xml, {
          headers: { "Content-Type": "application/xml; charset=utf-8" },
        });
      },
    },
  },
});

export default json({});
