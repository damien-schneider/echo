"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { motion, useInView } from "motion/react";
import { useEffect, useRef } from "react";
import {
  type BufferGeometry,
  DoubleSide,
  type Mesh,
  type ShaderMaterial,
  Vector3,
} from "three";
import EchoLogo from "@/components/icons/echo-logo";
import { useGithubData } from "@/hooks/use-github-data";

/* ── Three.js shader background (black-and-white ray-march) ─────────── */

function ShaderPlane({
  vertexShader,
  fragmentShader,
  uniforms,
  isActive,
}: {
  vertexShader: string;
  fragmentShader: string;
  uniforms: { [key: string]: { value: unknown } };
  isActive: boolean;
}) {
  const meshRef = useRef<Mesh<BufferGeometry, ShaderMaterial>>(null);
  const { size, invalidate: requestFrame } = useThree();

  useFrame((state) => {
    if (!(isActive && meshRef.current)) {
      return;
    }
    const material = meshRef.current.material;
    material.uniforms.u_time.value = state.clock.elapsedTime * 0.5;
    material.uniforms.u_resolution.value.set(size.width, size.height, 1.0);
    requestFrame();
  });

  useEffect(() => {
    if (isActive) {
      requestFrame();
    }
  }, [isActive, requestFrame]);

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        depthTest={false}
        depthWrite={false}
        fragmentShader={fragmentShader}
        side={DoubleSide}
        uniforms={uniforms}
        vertexShader={vertexShader}
      />
    </mesh>
  );
}

const VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform float u_time;
  uniform vec3 u_resolution;
  #define STEP 64
  #define EPS .001
  float smin(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}
  const mat2 m=mat2(.8,.6,-.6,.8);
  float noise(in vec2 x){return sin(1.5*x.x)*sin(1.5*x.y);}
  float fbm4(vec2 p){float f=0.;f+=.5*(.5+.5*noise(p));p=m*p*2.02;f+=.25*(.5+.5*noise(p));p=m*p*2.03;f+=.125*(.5+.5*noise(p));p=m*p*2.01;f+=.0625*(.5+.5*noise(p));return f/.9375;}
  mat2 getRot(float a){float sa=sin(a),ca=cos(a);return mat2(ca,-sa,sa,ca);}
  vec3 _position;
  float sphere(vec3 center,float radius){return distance(_position,center)-radius;}
  float swingPlane(float height){vec3 pos=_position+vec3(0.,0.,u_time*5.5);float def=fbm4(pos.xz*.25)*.5;float way=pow(abs(pos.x)*34.,2.5)*.0000125;def*=way;float ch=height+def;return max(pos.y-ch,0.);}
  float map(vec3 pos){_position=pos;float dist=swingPlane(0.);float sminFactor=5.25;dist=smin(dist,sphere(vec3(0.,-15.,80.),60.),sminFactor);return dist;}
  vec3 getNormal(vec3 pos){vec3 nor=vec3(0.);vec3 vv=vec3(0.,1.,-1.)*.01;nor.x=map(pos+vv.zxx)-map(pos+vv.yxx);nor.y=map(pos+vv.xzx)-map(pos+vv.xyx);nor.z=map(pos+vv.xxz)-map(pos+vv.xxy);nor/=2.;return normalize(nor);}
  void main(){
    vec2 uv=(vUv*u_resolution.xy-.5*u_resolution.xy)/u_resolution.y;
    vec3 ro=vec3(uv+vec2(0.,6.),-1.);
    vec3 rd=normalize(vec3(uv,1.));
    rd.zy=getRot(.15)*rd.zy;
    vec3 pos=ro;
    float curDist;int nbStep=0;
    for(;nbStep<STEP;++nbStep){curDist=map(pos);if(curDist<EPS)break;pos+=rd*curDist*.5;}
    float f=float(nbStep)/float(STEP)*.9;
    gl_FragColor=vec4(vec3(f),1.0);
  }
`;

function ShaderBackground({ isActive }: { isActive: boolean }) {
  const uniforms = {
    u_time: { value: 0 },
    u_resolution: { value: new Vector3(1, 1, 1) },
  };

  return (
    <Canvas
      className="h-full w-full"
      dpr={1}
      frameloop="demand"
      gl={{
        powerPreference: "high-performance",
        antialias: false,
        stencil: false,
        depth: false,
      }}
    >
      <ShaderPlane
        fragmentShader={FRAG}
        isActive={isActive}
        uniforms={uniforms}
        vertexShader={VERT}
      />
    </Canvas>
  );
}

/* ── Animated waveform bar ─────────────────────────────────────────── */

const BAR_COUNT = 28;

function WaveBar({ index }: { index: number }) {
  const center = (BAR_COUNT - 1) / 2;
  const dist = Math.abs(index - center) / (BAR_COUNT / 2);
  const maxH = 100 * Math.max(0.15, 1 - dist ** 1.5);
  const minH = maxH * 0.25;
  const dur = 0.8 + (index % 5) * 0.15;
  const del = index * 0.03;

  return (
    <motion.div
      animate={{ height: [`${minH}%`, `${maxH}%`, `${minH}%`] }}
      className="w-[3px] rounded-full bg-white/60"
      transition={{
        duration: dur,
        repeat: Number.POSITIVE_INFINITY,
        ease: "easeInOut",
        delay: del,
      }}
    />
  );
}

/* ── Hero notch — the product's signature UI ───────────────────────── */

function HeroNotch() {
  return (
    <motion.div
      animate={{ y: 0, opacity: 1, scale: 1 }}
      className="relative mx-auto"
      initial={{ y: -60, opacity: 0, scale: 0.92 }}
      transition={{ duration: 1, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
    >
      <div
        className="relative mx-auto flex items-center gap-[3px] overflow-hidden rounded-[24px] bg-black/80 px-8 py-4 shadow-[0_0_100px_rgba(200,150,100,0.05)] backdrop-blur-xl"
        style={{ width: "min(420px, 80vw)" }}
      >
        <EchoLogo
          className="absolute left-4 h-4 w-4 text-white/40"
          variant="sm"
        />
        <div className="mx-auto flex h-8 items-center gap-[3px]">
          {Array.from({ length: BAR_COUNT }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static bar count, never reorders
            <WaveBar index={i} key={`wb-${i}`} />
          ))}
        </div>

        {/* Sweep line */}
        <div className="absolute bottom-0 left-0 h-[1.5px] w-full overflow-hidden">
          <motion.div
            animate={{ x: ["-100%", "500%"] }}
            className="h-full w-1/4"
            style={{
              background:
                "linear-gradient(90deg, transparent, rgba(200,150,100,0.5), transparent)",
            }}
            transition={{
              duration: 3.5,
              repeat: Number.POSITIVE_INFINITY,
              ease: "easeInOut",
            }}
          />
        </div>
      </div>
    </motion.div>
  );
}

/* ── Hero section ──────────────────────────────────────────────────── */

export default function Hero() {
  const { version } = useGithubData();
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { margin: "100px" });

  return (
    <div
      className="mask-[linear-gradient(to_bottom,white_82%,transparent)] relative flex min-h-svh w-full flex-col items-center justify-center overflow-hidden bg-black px-6 text-white"
      ref={ref}
    >
      {/* Three.js shader — black/white ray-march landscape */}
      <motion.div
        animate={{ opacity: isInView ? 1 : 0 }}
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        transition={{ duration: 1.5, ease: "easeInOut" }}
      >
        <ShaderBackground isActive={isInView} />
      </motion.div>

      {/* Radial dark vignette over shader */}
      <div className="pointer-events-none absolute inset-0 [background:radial-gradient(120%_80%_at_50%_50%,transparent_40%,black_100%)]" />

      <div className="relative z-10 flex w-full max-w-4xl flex-col items-center">
        {/* Floating notch — the hook */}
        <HeroNotch />

        {/* Tag line */}
        <motion.p
          animate={{ opacity: 1, y: 0 }}
          className="mt-12 text-[11px] text-white/25 uppercase tracking-[0.3em]"
          initial={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.5, delay: 0.7 }}
        >
          Free &amp; open source speech-to-text
          {version && (
            <span className="ml-3 font-medium text-white/40">{version}</span>
          )}
        </motion.p>

        {/* Main headline */}
        <motion.h1
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          className="mt-6 text-center"
          initial={{ opacity: 0, y: 36, filter: "blur(10px)" }}
          transition={{
            duration: 1.1,
            delay: 0.9,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          <span className="block font-display font-extrabold text-[clamp(3.2rem,9vw,8rem)] leading-[0.88] tracking-[-0.04em]">
            Speak
          </span>
          <span className="block font-display font-light text-[clamp(3.2rem,9vw,8rem)] text-white/40 italic leading-[0.88] tracking-[-0.02em]">
            freely.
          </span>
        </motion.h1>

        {/* Description */}
        <motion.p
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          className="mt-8 max-w-md text-center text-[15px]/7 text-white/35"
          initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
          transition={{ duration: 0.7, delay: 1.3, ease: "easeOut" }}
        >
          Press a shortcut. Speak naturally. Text appears where your cursor
          is&nbsp;&mdash; transcribed by on&#8209;device AI that never phones
          home.
        </motion.p>

        {/* CTA #1 */}
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="mt-10 flex flex-col items-center gap-5"
          initial={{ opacity: 0, y: 14 }}
          transition={{ duration: 0.6, delay: 1.6, ease: "easeOut" }}
        >
          <a
            className="cursor-pointer rounded-full border border-white/15 bg-white px-8 py-3.5 font-bold font-display text-black text-sm tracking-tight transition-all duration-300 hover:shadow-[0_0_50px_rgba(255,255,255,0.1)] active:scale-[0.98]"
            href="#download"
          >
            Download Echo &mdash; it&rsquo;s free
          </a>
          <div className="flex items-center gap-3 text-[11px] text-white/20">
            <span>macOS</span>
            <span className="h-2.5 w-px bg-white/10" />
            <span>Windows</span>
            <span className="h-2.5 w-px bg-white/10" />
            <span>Linux</span>
            <span className="mx-0.5 h-2.5 w-px bg-white/10" />
            <span>No account needed</span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
