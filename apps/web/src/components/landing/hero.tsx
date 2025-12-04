"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { motion, useInView } from "motion/react";
import { useEffect, useRef } from "react";
import { DoubleSide, type Mesh, Vector3 } from "three";
import { useGithubData } from "@/hooks/use-github-data";

interface ShaderPlaneProps {
  vertexShader: string;
  fragmentShader: string;
  uniforms: { [key: string]: { value: unknown } };
  isActive: boolean;
}

function ShaderPlane({
  vertexShader,
  fragmentShader,
  uniforms,
  isActive,
}: ShaderPlaneProps) {
  const meshRef = useRef<Mesh>(null);
  const { size, invalidate: requestFrame } = useThree();

  useFrame((state) => {
    if (!(isActive && meshRef.current)) return;

    const material = meshRef.current.material;
    material.uniforms.u_time.value = state.clock.elapsedTime * 0.5;
    material.uniforms.u_resolution.value.set(size.width, size.height, 1.0);

    // Request next frame for continuous animation
    requestFrame();
  });

  // Trigger initial render and continuous updates when active
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

interface ShaderBackgroundProps {
  vertexShader?: string;
  fragmentShader?: string;
  uniforms?: { [key: string]: { value: unknown } };
  className?: string;
  isActive?: boolean;
}

function ShaderBackground({
  vertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
    gl_Position = vec4(position, 1.0);
    }
  `,
  fragmentShader = `
    precision highp float;

    varying vec2 vUv;
    uniform float u_time;
    uniform vec3 u_resolution;
    uniform sampler2D iChannel0;

    #define STEP 64
    #define EPS .001

    float smin( float a, float b, float k )
    {
        float h = clamp( 0.5+0.5*(b-a)/k, 0.0, 1.0 );
        return mix( b, a, h ) - k*h*(1.0-h);
    }

    const mat2 m = mat2(.8,.6,-.6,.8);

    float noise( in vec2 x )
    {
      return sin(1.5*x.x)*sin(1.5*x.y);
    }

    float fbm4( vec2 p )
    {
        float f = 0.0;
        f += 0.500000*(0.5+0.5*noise( p )); p = m*p*2.02;
        f += 0.250000*(0.5+0.5*noise( p )); p = m*p*2.03;
        f += 0.125000*(0.5+0.5*noise( p )); p = m*p*2.01;
        f += 0.062500*(0.5+0.5*noise( p ));
        return f/0.9375;
    }


    mat2 getRot(float a)
    {
        float sa = sin(a), ca = cos(a);
        return mat2(ca,-sa,sa,ca);
    }


    vec3 _position;

    float sphere(vec3 center, float radius)
    {
        return distance(_position,center) - radius;
    }

    float swingPlane(float height)
    {
        vec3 pos = _position + vec3(0.,0.,u_time * 5.5);
        float def =  fbm4(pos.xz * .25) * 0.5;
        
        float way = pow(abs(pos.x) * 34. ,2.5) *.0000125;
        def *= way;
        
        float ch = height + def;
        return max(pos.y - ch,0.);
    }

    float map(vec3 pos)
    {
        _position = pos;
        
        float dist;
        dist = swingPlane(0.);
        
        float sminFactor = 5.25;
        dist = smin(dist,sphere(vec3(0.,-15.,80.),60.),sminFactor);
        return dist;
    }


    vec3 getNormal(vec3 pos)
    {
        vec3 nor = vec3(0.);
        vec3 vv = vec3(0.,1.,-1.)*.01;
        nor.x = map(pos + vv.zxx) - map(pos + vv.yxx);
        nor.y = map(pos + vv.xzx) - map(pos + vv.xyx);
        nor.z = map(pos + vv.xxz) - map(pos + vv.xxy);
        nor /= 2.;
        return normalize(nor);
    }

    void mainImage( out vec4 fragColor, in vec2 fragCoord )
    {
      vec2 uv = (fragCoord.xy-.5*u_resolution.xy)/u_resolution.y;
        
        vec3 rayOrigin = vec3(uv + vec2(0.,6.), -1. );
        
        vec3 rayDir = normalize(vec3(uv , 1.));
        
        rayDir.zy = getRot(.15) * rayDir.zy;
        
        vec3 position = rayOrigin;
        
        
        float curDist;
        int nbStep = 0;
        
        for(; nbStep < STEP;++nbStep)
        {
            curDist = map(position + (texture(iChannel0, position.xz) - .5).xyz * .005);
            
            if(curDist < EPS)
                break;
            position += rayDir * curDist * .5;
        }
        
        float f;
                
        float dist = distance(rayOrigin,position);
        f = dist /(98.);
        f = float(nbStep) / float(STEP);
        
        f *= .9;
        vec3 col = vec3(f);
                
        fragColor = vec4(col,1.0);
    }
    void main() {
      vec4 fragColor;
      vec2 fragCoord = vUv * u_resolution.xy;
      mainImage(fragColor, fragCoord);
      gl_FragColor = fragColor;
    }
  `,
  uniforms = {},
  className = "w-full h-full",
  isActive = true,
}: ShaderBackgroundProps) {
  const shaderUniforms = {
    u_time: { value: 0 },
    u_resolution: { value: new Vector3(1, 1, 1) },
    ...uniforms,
  };

  return (
    <div className={className}>
      <Canvas
        className={className}
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
          fragmentShader={fragmentShader}
          isActive={isActive}
          uniforms={shaderUniforms}
          vertexShader={vertexShader}
        />
      </Canvas>
    </div>
  );
}

export default function Hero() {
  const { version } = useGithubData();
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { margin: "100px" });

  return (
    <div
      className="mask-[linear-gradient(to_bottom,white_80%,transparent)] relative h-svh w-full overflow-hidden bg-black text-white"
      ref={containerRef}
    >
      <motion.div
        animate={{ opacity: isInView ? 1 : 0 }}
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        transition={{ duration: 1.5, ease: "easeInOut" }}
      >
        <ShaderBackground className="h-full w-full" isActive={isInView} />
      </motion.div>

      <div className="pointer-events-none absolute inset-0 [background:radial-gradient(120%_80%_at_50%_50%,transparent_40%,black_100%)]" />

      <div className="relative z-10 flex h-svh w-full items-center justify-center px-6">
        <div className="text-center">
          <motion.h1
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            className="mx-auto max-w-2xl font-extralight text-[clamp(2.25rem,6vw,4rem)] leading-[0.95] tracking-tight lg:max-w-4xl"
            initial={{ opacity: 0, y: 24, filter: "blur(8px)" }}
            transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
          >
            Echo. Private. Offline. Fast.
          </motion.h1>
          {version && (
            <motion.div
              animate={{ opacity: 1, scale: 1 }}
              className="mt-4 inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3 py-1 font-medium text-white text-xs backdrop-blur-md"
              initial={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.5, delay: 0.5 }}
            >
              <span>Latest Release: {version}</span>
            </motion.div>
          )}
          <motion.p
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            className="mx-auto mt-4 max-w-2xl font-light text-sm/6 text-white/70 tracking-tight md:text-balance md:text-base/7"
            initial={{ opacity: 0, y: 16, filter: "blur(6px)" }}
            transition={{ duration: 0.6, delay: 0.6, ease: "easeOut" }}
          >
            The ultimate speech-to-text tool for macOS, Windows, and Linux.
            Powered by Whisper, running entirely on your device.
          </motion.p>

          <div className="mt-8 flex flex-row items-center justify-center gap-4">
            <motion.a
              animate={{ opacity: 1, y: 0 }}
              className="group relative cursor-pointer overflow-hidden rounded-lg border border-white/30 bg-linear-to-r from-white/20 to-white/10 px-4 py-2 font-medium text-sm text-white tracking-wide backdrop-blur-sm transition-[border-color,background-color,box-shadow] duration-500 hover:border-white/50 hover:bg-white/20 hover:shadow-lg hover:shadow-white/10"
              href="#download"
              initial={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.6, delay: 0.8, ease: "easeOut" }}
            >
              Download Now
            </motion.a>

            <motion.a
              animate={{ opacity: 1, y: 0 }}
              className="group relative cursor-pointer px-4 py-2 font-medium text-sm text-white/90 tracking-wide transition-[filter,color] duration-500 hover:text-white hover:drop-shadow-[0_0_6px_rgba(255,255,255,0.6)]"
              href="https://github.com/damien-schneider/Echo"
              initial={{ opacity: 0, y: 16 }}
              rel="noopener noreferrer"
              target="_blank"
              transition={{ duration: 0.6, delay: 0.88, ease: "easeOut" }}
            >
              View on GitHub
            </motion.a>
          </div>
        </div>
      </div>
    </div>
  );
}
