"use client";

import { Cpu, Globe, HardDrive, Languages, Timer, Zap } from "lucide-react";
import { motion, useInView } from "motion/react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface ModelData {
  id: string;
  name: string;
  description: string;
  sizeMb: number;
  accuracyScore: number;
  speedScore: number;
  engine: "whisper" | "parakeet";
  features: string[];
  recommended?: boolean;
}

const models: ModelData[] = [
  {
    id: "parakeet-tdt-0.6b-v3",
    name: "Parakeet V3",
    description: "Fast and accurate with automatic language detection",
    sizeMb: 478,
    accuracyScore: 0.8,
    speedScore: 0.85,
    engine: "parakeet",
    features: ["Auto language detection", "CPU optimized", "Fast inference"],
    recommended: true,
  },
  {
    id: "parakeet-tdt-0.6b-v2",
    name: "Parakeet V2",
    description: "Best accuracy for English speakers",
    sizeMb: 473,
    accuracyScore: 0.85,
    speedScore: 0.85,
    engine: "parakeet",
    features: ["English only", "Highest accuracy", "CPU optimized"],
  },
  {
    id: "small",
    name: "Whisper Small",
    description: "Fast and fairly accurate",
    sizeMb: 487,
    accuracyScore: 0.6,
    speedScore: 0.85,
    engine: "whisper",
    features: ["Multi-language", "GPU accelerated", "Lightweight"],
  },
  {
    id: "medium",
    name: "Whisper Medium",
    description: "Good accuracy, medium speed",
    sizeMb: 492,
    accuracyScore: 0.75,
    speedScore: 0.6,
    engine: "whisper",
    features: ["Multi-language", "GPU accelerated", "Balanced"],
  },
  {
    id: "turbo",
    name: "Whisper Turbo",
    description: "Balanced accuracy and speed",
    sizeMb: 1600,
    accuracyScore: 0.8,
    speedScore: 0.4,
    engine: "whisper",
    features: ["Multi-language", "GPU accelerated", "High quality"],
  },
  {
    id: "large",
    name: "Whisper Large",
    description: "Highest accuracy for Whisper models",
    sizeMb: 1100,
    accuracyScore: 0.85,
    speedScore: 0.3,
    engine: "whisper",
    features: ["Multi-language", "GPU accelerated", "Best quality"],
  },
];

function ModelCard({
  model,
  index,
  isSelected,
  onClick,
}: {
  model: ModelData;
  index: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      animate={{ opacity: 1, y: 0 }}
      className={`relative w-full cursor-pointer rounded-xl border p-4 text-left transition-all duration-300 ${
        isSelected
          ? "border-primary/30 bg-secondary shadow-md shadow-primary/10"
          : "border-border bg-background hover:bg-secondary"
      }`}
      initial={{ opacity: 0, y: 20 }}
      onClick={onClick}
      transition={{ duration: 0.5, delay: index * 0.1 }}
    >
      {model.recommended && (
        <div className="absolute -top-2 -right-2 rounded-full bg-primary px-2 py-0.5 font-semibold text-[10px] text-primary-foreground">
          Recommended
        </div>
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-medium text-foreground">
              {model.name}
            </h3>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 font-medium text-[10px]",
                model.engine === "parakeet"
                  ? "bg-green-500/20 text-green-400"
                  : "bg-blue-500/20 text-blue-400"
              )}
            >
              {model.engine === "parakeet" ? "Parakeet" : "Whisper"}
            </span>
          </div>
          <p className="mt-1 line-clamp-1 text-muted-foreground text-xs">
            {model.description}
          </p>
        </div>
        <div className="whitespace-nowrap text-muted-foreground text-xs tabular-nums">
          {model.sizeMb >= 1000
            ? `${(model.sizeMb / 1000).toFixed(1)} GB`
            : `${model.sizeMb} MB`}
        </div>
      </div>

      {/* Stats bars */}
      <div className="mt-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="w-14 text-[10px] text-muted-foreground">
            Accuracy
          </span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
            <motion.div
              animate={{ width: `${model.accuracyScore * 100}%` }}
              className="h-full rounded-full bg-primary"
              initial={{ width: 0 }}
              transition={{ duration: 0.8, delay: index * 0.1 + 0.3 }}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-14 text-[10px] text-muted-foreground">Speed</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
            <motion.div
              animate={{ width: `${model.speedScore * 100}%` }}
              className="h-full rounded-full bg-green-500"
              initial={{ width: 0 }}
              transition={{ duration: 0.8, delay: index * 0.1 + 0.4 }}
            />
          </div>
        </div>
      </div>
    </motion.button>
  );
}

const getSpeedLabel = (score: number): string => {
  if (score >= 0.8) {
    return "Very Fast";
  }
  if (score >= 0.5) {
    return "Medium";
  }
  return "Slower";
};

const getFeatureIcon = (feature: string) => {
  if (feature.includes("language") || feature.includes("English")) {
    return <Languages className="h-3 w-3" />;
  }
  if (feature.includes("CPU") || feature.includes("GPU")) {
    return <Cpu className="h-3 w-3" />;
  }
  return <Globe className="h-3 w-3" />;
};

function ModelDetail({ model }: { model: ModelData }) {
  return (
    <motion.div
      animate={{ opacity: 1, x: 0 }}
      className="flex h-full flex-col"
      exit={{ opacity: 0, x: -20 }}
      initial={{ opacity: 0, x: 20 }}
      key={model.id}
      transition={{ duration: 0.3 }}
    >
      {/* Header */}
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-3">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-lg ${
              model.engine === "parakeet" ? "bg-green-500/20" : "bg-blue-500/20"
            }`}
          >
            {model.engine === "parakeet" ? (
              <Cpu className="h-5 w-5 text-green-400" />
            ) : (
              <Zap className="h-5 w-5 text-blue-400" />
            )}
          </div>
          <div>
            <h3 className="font-medium text-foreground text-xl">
              {model.name}
            </h3>
            <p className="text-muted-foreground text-sm">{model.description}</p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="mb-6 grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-white/5 bg-secondary/30 p-4">
          <div className="mb-2 flex items-center gap-2 text-muted-foreground">
            <HardDrive className="h-4 w-4" />
            <span className="text-xs">Download Size</span>
          </div>
          <p className="font-medium text-foreground text-lg tabular-nums">
            {model.sizeMb >= 1000
              ? `${(model.sizeMb / 1000).toFixed(1)} GB`
              : `${model.sizeMb} MB`}
          </p>
        </div>
        <div className="rounded-lg border border-white/5 bg-secondary/30 p-4">
          <div className="mb-2 flex items-center gap-2 text-muted-foreground">
            <Timer className="h-4 w-4" />
            <span className="text-xs">Processing</span>
          </div>
          <p className="font-medium text-foreground text-lg">
            {getSpeedLabel(model.speedScore)}
          </p>
        </div>
      </div>

      {/* Features */}
      <div className="flex-1">
        <h4 className="mb-3 font-medium text-foreground text-sm">Features</h4>
        <div className="flex flex-wrap gap-2">
          {model.features.map((feature, i) => (
            <motion.span
              animate={{ opacity: 1, scale: 1 }}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/5 bg-secondary/50 px-3 py-1.5 text-foreground text-xs"
              initial={{ opacity: 0, scale: 0.9 }}
              key={feature}
              transition={{ duration: 0.3, delay: i * 0.1 }}
            >
              {getFeatureIcon(feature)}
              {feature}
            </motion.span>
          ))}
        </div>
      </div>

      {/* Engine badge */}
      <div className="mt-6 border-white/5 border-t pt-4">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs">Engine</span>
          <span
            className={`rounded-md px-2 py-1 font-medium text-xs ${
              model.engine === "parakeet"
                ? "bg-green-500/20 text-green-400"
                : "bg-blue-500/20 text-blue-400"
            }`}
          >
            {model.engine === "parakeet" ? "NVIDIA Parakeet" : "OpenAI Whisper"}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

export default function ModelsShowcase() {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, margin: "-100px" });
  const [selectedModel, setSelectedModel] = useState<ModelData>(models[0]);

  return (
    <section
      className="overflow-hidden bg-background py-20 text-foreground"
      ref={containerRef}
    >
      <div className="container mx-auto px-4">
        <motion.div
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
          className="mb-12 text-center"
          initial={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          <h2 className="mb-4 font-medium text-3xl lg:text-5xl">
            Choose Your Model
          </h2>
          <p className="mx-auto max-w-2xl font-light text-muted-foreground text-sm md:text-base">
            Echo supports multiple transcription engines. Pick the one that best
            fits your needs — from lightning-fast CPU models to high-accuracy
            GPU-accelerated options.
          </p>
        </motion.div>

        <motion.div
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 32 }}
          className="mx-auto max-w-5xl"
          initial={{ opacity: 0, y: 32 }}
          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
        >
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            {/* Model List */}
            <div className="order-2 grid gap-3 sm:grid-cols-2 lg:order-1">
              {models.map((model, index) => (
                <ModelCard
                  index={index}
                  isSelected={selectedModel.id === model.id}
                  key={model.id}
                  model={model}
                  onClick={() => setSelectedModel(model)}
                />
              ))}
            </div>

            {/* Selected Model Detail */}
            <div className="order-1 h-fit rounded-2xl border border-white/5 bg-secondary/20 p-6 lg:sticky lg:top-24 lg:order-2">
              <ModelDetail model={selectedModel} />
            </div>
          </div>
        </motion.div>

        {/* Bottom note */}
        <motion.p
          animate={isInView ? { opacity: 1 } : { opacity: 0 }}
          className="mt-8 text-center text-muted-foreground text-xs"
          initial={{ opacity: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
        >
          All models run 100% locally on your device. No cloud processing, no
          data sent anywhere.
        </motion.p>
      </div>
    </section>
  );
}
