import { createFileRoute } from "@tanstack/react-router";
import Download from "@/components/landing/download";
import { LandingFaq } from "@/components/landing/faq";
import Features from "@/components/landing/features";
import EchoFooter from "@/components/landing/footer";
import Hero from "@/components/landing/hero";
import InterfaceShowcase from "@/components/landing/interface-showcase";
import ModelsShowcase from "@/components/landing/models-showcase";
import PrivacyManifesto from "@/components/landing/privacy-manifesto";
import VoiceDemo from "@/components/landing/voice-demo";

export const Route = createFileRoute("/")({ component: App });

function App() {
  return (
    <div className="min-h-screen bg-background font-body text-foreground">
      <Hero />
      <VoiceDemo />
      <PrivacyManifesto />
      <div id="features">
        <InterfaceShowcase />
        <ModelsShowcase />
        <Features />
      </div>
      <Download />
      <LandingFaq />
      <EchoFooter />
    </div>
  );
}
