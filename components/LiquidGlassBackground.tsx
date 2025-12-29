'use client'

import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const vertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  uniform float uTime;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    
    vec3 pos = position;
    // Gentle, physical breathing motion
    pos.z += sin(pos.x * 0.1 + uTime * 0.03) * cos(pos.y * 0.1 + uTime * 0.04) * 1.5;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    vViewPosition = -mvPosition.xyz;
  }
`;

const fragmentShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  uniform float uTime;

  vec2 hash(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453123);
  }

  // 2D Noise
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f*f*(3.0-2.0*f);
    float res = mix(mix(hash(i + vec2(0,0)).x, hash(i + vec2(1,0)).x, f.x),
                    mix(hash(i + vec2(0,1)).x, hash(i + vec2(1,1)).x, f.x), f.y);
    return res;
  }

  // Voronoi: Returns vec3(minDist, cellId.x, cellId.y)
  vec3 voronoi(vec2 x) {
    vec2 n = floor(x);
    vec2 f = fract(x);
    vec2 mg, mr;
    float md = 8.0;
    
    // First pass
    for(int j=-1; j<=1; j++)
    for(int i=-1; i<=1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 o = hash(n + g);
        o = 0.5 + 0.5 * sin(uTime * 0.05 + 6.2831 * o);
        vec2 r = g + o - f;
        float d = dot(r, r);
        if(d < md) {
            md = d;
            mr = r;
            mg = g;
        }
    }
    
    // Second pass to ensure correct cell ID at edges
    md = 8.0;
    for(int j=-2; j<=2; j++)
    for(int i=-2; i<=2; i++) {
        vec2 g = mg + vec2(float(i), float(j));
        vec2 o = hash(n + g);
        o = 0.5 + 0.5 * sin(uTime * 0.05 + 6.2831 * o);
        vec2 r = g + o - f;
        if(dot(mr-r, mr-r) > 0.00001)
            md = min(md, dot(0.5*(mr+r), normalize(r-mr)));
    }
    
    return vec3(md, n + mg);
  }

  void main() {
    vec2 uv = vUv * 36.0; // High density pattern (increased from 24.0)
    vec3 v = voronoi(uv);
    float dist = v.x;
    vec2 cellId = v.yz;
    
    // --- MATERIAL PHYSICS ---
    
    // 1. Surface Bump Mapping
    // Real stained glass is "pillowed" - thicker in center, thinner at edges
    // We calculate a pseudo-normal based on the gradient of the 'dist'
    // 'dist' increases towards center. 
    vec2 cellCenter = cellId + 0.5; // Approximate center
    vec2 dirToCenter = uv - (cellId + hash(cellId)); // Rough vector relative to feature point
    
    // Perturb normal based on distance field (simple derivative approximation)
    vec3 surfaceNormal = normalize(vec3(dirToCenter * 4.0, 1.0));
    
    // Add "Wavy" Glass imperfection (Antique Glass Texture)
    float wave = noise(uv * 4.0 + uTime * 0.1);
    surfaceNormal = normalize(surfaceNormal + vec3(wave * 0.2, wave * 0.2, 0.0));

    // 2. Lighting Calculation (Blinn-Phong)
    vec3 lightPos = vec3(5.0, 5.0, 10.0);
    vec3 lightDir = normalize(lightPos);
    vec3 viewDir = normalize(vViewPosition);
    vec3 halfDir = normalize(lightDir + viewDir);

    float diffuse = max(dot(surfaceNormal, lightDir), 0.0);
    float specular = pow(max(dot(surfaceNormal, halfDir), 0.0), 64.0); // Sharp gloss
    float fresnel = pow(1.0 - max(dot(surfaceNormal, viewDir), 0.0), 3.0); // Rim lighting

    // 3. Color Palette (Medallion + Grayscale)
    float h = hash(cellId).x;
    
    vec3 cyan = vec3(0.0, 0.6, 0.75);
    vec3 blue = vec3(0.1, 0.25, 0.65);
    vec3 amber = vec3(1.0, 0.7, 0.15);
    vec3 red = vec3(0.85, 0.25, 0.15);
    vec3 purple = vec3(0.45, 0.1, 0.55);
    
    // Clear/Grayscale Glass (Dark/Neutral)
    vec3 clear = vec3(0.2); 
    
    vec3 baseColor;
    // 40% chance of being grayscale/clear to make color sparse
    if (h < 0.4) baseColor = clear; 
    else if (h < 0.52) baseColor = cyan;
    else if (h < 0.64) baseColor = blue;
    else if (h < 0.76) baseColor = amber;
    else if (h < 0.88) baseColor = red;
    else baseColor = purple;
    
    // 4. Composition
    // Base color transmits through the glass
    // Restored "seeds/bubbles" as requested
    float seeds = noise(uv * 20.0);
    
    vec3 glassColor = baseColor * (0.8 + 0.2 * diffuse); // Diffuse contribution
    // Removed sharp specular "white dot" glints
    glassColor += baseColor * fresnel * 0.8; // Glowing edges
    glassColor += vec3(0.08) * seeds; // Micro-imperfections (Seeds)
    
    // 5. Border Logic (Lead Caming)
    // Lead leads are matte black, distinct, non-reflective
    // Adjusted thresholds (0.003 - 0.008) for finer scale
    float borderFactor = smoothstep(0.003, 0.008, dist);
    
    vec3 finalColor = mix(vec3(0.01), glassColor, borderFactor);
    
    // 6. Final Alpha
    float alpha = mix(1.0, 0.45, borderFactor); // Lead lines opaque, glass semi-transparent

    gl_FragColor = vec4(finalColor, alpha);
  }
`;

const StainedGlassMesh: React.FC = () => {
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
  }), []);

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.getElapsedTime();
    }
  });

  return (
    <mesh position={[0, 0, -5]}>
      <planeGeometry args={[80, 60, 128, 128]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent={true}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
};

const LiquidGlassBackground: React.FC = () => {
  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden select-none bg-transparent backdrop-blur-md">
      <Canvas camera={{ position: [0, 0, 20], fov: 45 }}>
        <StainedGlassMesh />
        <ambientLight intensity={1.0} />
      </Canvas>
    </div>
  );
};

export default LiquidGlassBackground;
