'use client';

// Kimi "DocumentTunnel" WebGL background, ported verbatim from the Vite export
// into the Next.js app. React-18 / @react-three/fiber@8 compatible. Rendered
// client-side only (loaded via MktBackground with ssr:false) and gated on
// prefers-reduced-motion so it never blocks first paint or SEO.
import { useRef, useMemo, useEffect, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { EffectComposer, Bloom, ChromaticAberration, Noise, Vignette } from '@react-three/postprocessing';

// ─── Speed Particles ───
function SpeedParticles({ count = 2000 }: { count?: number }) {
  const pointsRef = useRef<THREE.Points>(null);
  const speedsRef = useRef<Float32Array>(new Float32Array(count));

  const { positions, initialZ } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const zArr = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 2 + Math.random() * 8;
      const z = -30 + Math.random() * 40;
      pos[i * 3] = Math.cos(angle) * radius;
      pos[i * 3 + 1] = Math.sin(angle) * radius * 0.6 + (Math.random() - 0.5) * 4;
      zArr[i] = z;
      pos[i * 3 + 2] = z;
    }
    return { positions: pos, initialZ: zArr };
  }, [count]);

  useMemo(() => {
    for (let i = 0; i < count; i++) {
      speedsRef.current[i] = 8 + Math.random() * 12;
    }
  }, [count]);

  useFrame((_, delta) => {
    if (!pointsRef.current) return;
    const posAttr = pointsRef.current.geometry.attributes.position;
    if (!posAttr) return;
    const posArray = posAttr.array as Float32Array;
    const speeds = speedsRef.current;
    for (let i = 0; i < count; i++) {
      const zi = i * 3 + 2;
      let z = (posArray[zi] ?? 0) + (speeds[i] ?? 0) * delta;
      if (z > 10) {
        z = initialZ[i] ?? 0;
        const angle = Math.random() * Math.PI * 2;
        const radius = 2 + Math.random() * 8;
        posArray[i * 3] = Math.cos(angle) * radius;
        posArray[i * 3 + 1] = Math.sin(angle) * radius * 0.6 + (Math.random() - 0.5) * 4;
      }
      posArray[zi] = z;
    }
    posAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        color="#7B61FF"
        size={0.03}
        transparent
        opacity={0.4}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

// ─── Debris Fragments ───
function DebrisFragments({ count = 80 }: { count?: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const rotations = useRef<number[]>([]);

  useMemo(() => {
    for (let i = 0; i < count; i++) {
      rotations.current.push((Math.random() - 0.5) * 0.5);
    }
  }, [count]);

  useMemo(() => {
    if (!meshRef.current) return;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 3 + Math.random() * 7;
      dummy.position.set(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius * 0.5 + (Math.random() - 0.5) * 3,
        -15 + Math.random() * 25
      );
      dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
  }, [count, dummy]);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    for (let i = 0; i < count; i++) {
      meshRef.current.getMatrixAt(i, dummy.matrix);
      dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
      const spin = rotations.current[i] ?? 0;
      dummy.rotation.x += spin * delta;
      dummy.rotation.y += spin * delta * 0.7;
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <planeGeometry args={[0.1, 0.15]} />
      <meshBasicMaterial
        color="#F5F0EB"
        transparent
        opacity={0.15}
        side={THREE.DoubleSide}
      />
    </instancedMesh>
  );
}

// ─── Settlement Card ───
interface CardData {
  id: number;
  x: number;
  y: number;
  z: number;
  speed: number;
  laneIndex: number;
  uvOffset: { x: number; y: number };
}

function ConveyorCards({
  layerScale = 1,
  speedMultiplier = 1,
  zRange = [-35, 2],
  laneSpread = 5,
  cardOpacity = 0.95,
}: {
  layerScale?: number;
  speedMultiplier?: number;
  zRange?: [number, number];
  laneSpread?: number;
  cardOpacity?: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const texture = useTexture('/images/settlement-card-atlas.jpg');
  const cardsRef = useRef<CardData[]>([]);
  const meshRefs = useRef<THREE.Mesh[]>([]);

  const cardCount = 16;

  useMemo(() => {
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
  }, [texture]);

  useMemo(() => {
    cardsRef.current = [];
    for (let i = 0; i < cardCount; i++) {
      const laneIndex = (i % 5) - 2;
      const card: CardData = {
        id: i,
        x: laneIndex * (laneSpread / 2) + (Math.random() - 0.5) * 1.5,
        y: (Math.random() - 0.5) * 3,
        z: zRange[0] + (i / cardCount) * (zRange[1] - zRange[0]),
        speed: (2 + Math.random() * 3) * speedMultiplier * (Math.abs(laneIndex) === 2 ? 0.7 : 1),
        laneIndex,
        uvOffset: {
          x: (i % 4) * 0.25,
          y: 1 - (Math.floor(i / 4) % 2 + 1) * 0.5,
        },
      };
      cardsRef.current.push(card);
    }
  }, [speedMultiplier, zRange, laneSpread]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const children = groupRef.current.children;
    cardsRef.current.forEach((card, i) => {
      if (i >= children.length) return;
      const mesh = children[i] as THREE.Mesh;
      card.z += card.speed * delta;
      if (card.z > zRange[1]) {
        card.z = zRange[0];
        card.x = card.laneIndex * (laneSpread / 2) + (Math.random() - 0.5) * 1.5;
        card.y = (Math.random() - 0.5) * 3;
      }
      mesh.position.set(card.x * layerScale, card.y * layerScale, card.z);
      mesh.rotation.y = card.laneIndex * 0.15;

      // Fade in/out based on Z
      const mat = mesh.material as THREE.MeshPhysicalMaterial;
      const z = card.z;
      let opacity = cardOpacity;
      if (z > zRange[1] - 4) {
        opacity *= THREE.MathUtils.smoothstep(zRange[1], zRange[1] - 4, z);
      }
      if (z < zRange[0] + 5) {
        opacity *= THREE.MathUtils.smoothstep(zRange[0] + 5, zRange[0], z);
      }
      mat.opacity = opacity;
    });
  });

  return (
    <group ref={groupRef}>
      {cardsRef.current.map((card, i) => (
        <mesh key={card.id} ref={(el) => { if (el) meshRefs.current[i] = el; }}>
          <planeGeometry args={[1.6 * layerScale, 2.2 * layerScale]} />
          <meshPhysicalMaterial
            map={texture}
            transparent
            opacity={cardOpacity}
            roughness={0.7}
            metalness={0}
            emissive="#7B61FF"
            emissiveIntensity={0.2}
            side={THREE.DoubleSide}
            clearcoat={0.3}
            alphaMap={texture}
            alphaTest={0.1}
          />
        </mesh>
      ))}
    </group>
  );
}

// ─── Camera Controller ───
function CameraController() {
  const { camera } = useThree();
  const mouseRef = useRef({ x: 0, y: 0 });
  const targetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = (e.clientX / window.innerWidth - 0.5) * 0.6;
      mouseRef.current.y = (e.clientY / window.innerHeight - 0.5) * 0.6;
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useFrame(() => {
    targetRef.current.x += (mouseRef.current.x - targetRef.current.x) * 0.05;
    targetRef.current.y += (mouseRef.current.y - targetRef.current.y) * 0.05;
    camera.position.x = targetRef.current.x;
    camera.position.y = targetRef.current.y;
    camera.lookAt(0, 0, 0);
  });

  return null;
}

// ─── Post Processing ───
function PostProcessing() {
  return (
    <EffectComposer>
      <Bloom
        intensity={0.8}
        luminanceThreshold={0.2}
        luminanceSmoothing={0.9}
        mipmapBlur
      />
      <ChromaticAberration
        offset={new THREE.Vector2(0.003, 0.003)}
        radialModulation={true}
        modulationOffset={0.5}
      />
      <Noise opacity={0.08} />
      <Vignette eskil={false} offset={0.4} darkness={0.6} />
    </EffectComposer>
  );
}

// ─── Scene ───
function Scene() {
  return (
    <>
      <color attach="background" args={['#050508']} />
      <fog attach="fog" args={['#050508', 5, 35]} />
      <CameraController />

      {/* Three depth layers */}
      <ConveyorCards
        layerScale={1}
        speedMultiplier={1}
        zRange={[-30, 8]}
        laneSpread={4}
        cardOpacity={0.95}
      />
      <ConveyorCards
        layerScale={0.85}
        speedMultiplier={0.75}
        zRange={[-35, 2]}
        laneSpread={5}
        cardOpacity={0.6}
      />
      <ConveyorCards
        layerScale={0.6}
        speedMultiplier={0.4}
        zRange={[-50, -15]}
        laneSpread={6}
        cardOpacity={0.3}
      />

      <SpeedParticles count={1500} />
      <DebrisFragments count={60} />

      {/* Ambient lighting */}
      <ambientLight intensity={0.3} />
      <pointLight position={[0, 5, -10]} intensity={0.5} color="#7B61FF" />
      <pointLight position={[0, -5, -5]} intensity={0.3} color="#4A90D9" />

      <PostProcessing />
    </>
  );
}

// ─── Main Export ───
export default function DocumentTunnel() {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
      }}
      aria-hidden="true"
    >
      <Canvas
        camera={{ position: [0, 0, 6], fov: 45 }}
        dpr={[1, 2]}
        gl={{
          powerPreference: 'high-performance',
          antialias: true,
        }}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>
    </div>
  );
}
