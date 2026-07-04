import { useRef, useState, useEffect, useMemo } from 'react'
import { Canvas, useFrame, useLoader } from '@react-three/fiber'
import { Environment, Lightformer, Text, RoundedBox, Sparkles } from '@react-three/drei'
import * as THREE from 'three'
import './App.css'

// ---- The Cosmetic Engine: material library ----
// Every material is real PBR — no fake video effects. pulse/sparkle/auraColor
// are physical behaviors wired into the physics loop (flick harder = flare harder).
const MATERIALS = {
  // 💎 Luxe
  obsidian: {
    label: 'Obsidian', collection: 'Luxe',
    props: { color: '#0a0a0c', metalness: 0.1, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.06, reflectivity: 1 },
  },
  holographic: {
    label: 'Holographic', collection: 'Luxe',
    props: { color: '#1a1a22', metalness: 0.85, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.1, iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [100, 800] },
  },
  chrome: {
    label: 'Chrome', collection: 'Luxe',
    props: { color: '#c8ccd4', metalness: 1, roughness: 0.06, clearcoat: 0.6, clearcoatRoughness: 0.04 },
  },
  oilslick: {
    label: 'Oil Slick', collection: 'Luxe',
    props: { color: '#050506', metalness: 0.4, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08, iridescence: 1, iridescenceIOR: 1.3, iridescenceThicknessRange: [300, 1400] },
  },
  titanium: {
    label: 'Anodized Titanium', collection: 'Luxe',
    props: { color: '#8a7690', metalness: 1, roughness: 0.32, clearcoat: 0.3, clearcoatRoughness: 0.2, iridescence: 0.45, iridescenceIOR: 1.8, iridescenceThicknessRange: [200, 600] },
  },
  gold: {
    label: 'Liquid Gold', collection: 'Luxe',
    props: { color: '#d4a437', metalness: 1, roughness: 0.1, clearcoat: 0.6, clearcoatRoughness: 0.12 },
  },
  diamond: {
    label: 'Diamond Dust', collection: 'Luxe', sparkle: '#ffffff',
    props: { color: '#dfdfea', metalness: 0.45, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.03 },
  },
  // 🌌 Void
  eventhorizon: {
    label: 'Event Horizon', collection: 'Void', sparkle: '#6a6a8a',
    props: { color: '#000000', metalness: 0.2, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.3 },
  },
  phantom: {
    label: 'Phantom', collection: 'Void',
    props: { color: '#aeb4c4', metalness: 0, roughness: 0.1, transmission: 0.9, thickness: 0.4, transparent: true, opacity: 0.6, clearcoat: 1, clearcoatRoughness: 0.1 },
  },
  frozenvoid: {
    label: 'Frozen Void', collection: 'Void',
    props: { color: '#dff2ff', metalness: 0, roughness: 0.07, transmission: 1, thickness: 0.6, ior: 1.31, clearcoat: 1, clearcoatRoughness: 0.05 },
  },
  // 🔥 Forge
  ember: {
    label: 'Cooling Ember', collection: 'Forge', pulse: { color: '#ff5a00', base: 0.22, beat: 1.4 },
    props: { color: '#170d08', metalness: 0.15, roughness: 0.62, clearcoat: 0.15, clearcoatRoughness: 0.5, emissive: '#ff5a00', emissiveIntensity: 0.2 },
  },
  bloodglass: {
    label: 'Blood Glass', collection: 'Alchemy', pulse: { color: '#ff0022', base: 0.1, beat: 1.1 },
    props: { color: '#6a000f', metalness: 0, roughness: 0.14, transmission: 0.85, thickness: 1.2, clearcoat: 1, clearcoatRoughness: 0.1, emissive: '#3a0008', emissiveIntensity: 0.1 },
  },
  // ✨ SSS — Ghost Rare × 5-star pull. Dichroic glass, captured starlight inside.
  sss: {
    label: 'SSS · Divine', collection: 'SSS', pulse: { color: '#8a5fff', base: 0.22, beat: 0.5 },
    props: {
      color: '#241a2e', metalness: 0.9, roughness: 0.07,
      clearcoat: 1, clearcoatRoughness: 0.04,
      iridescence: 1, iridescenceIOR: 2.2, iridescenceThicknessRange: [400, 1600],
      emissive: '#4a3060', emissiveIntensity: 0.22,
    },
  },
}

const TIER_COLORS = { S: '#ffd700' }

// ---- Material auras: the space around the object belongs to the material too ----
// fall = snow/dust sinking · drip = slides down the glass, then drops off · rise = embers/wisps floating up · orbit = holograms circling
const AURAS = {
  holographic: { type: 'orbit', color: '#7ff6ff', count: 90, size: 0.045 },
  oilslick: { type: 'orbit', color: '#c98fff', count: 70, size: 0.04 },
  gold: { type: 'fall', color: '#ffdf8a', count: 80, size: 0.03 },
  frozenvoid: { type: 'fall', color: '#cfeaff', count: 130, size: 0.04 },
  phantom: { type: 'rise', color: '#aeb4c4', count: 60, size: 0.05 },
  ember: { type: 'rise', color: '#ff7a1a', count: 110, size: 0.035 },
  bloodglass: { type: 'drip', color: '#b00018', count: 60, size: 0.055 },
  sss: { type: 'rise', color: '#ffe9a8', count: 150, size: 0.04 },   // soul particles, defying gravity
}

function Aura({ type, color, count, size }) {
  const pts = useRef()
  const seeds = useMemo(() =>
    Array.from({ length: count }, () => ({
      x: (Math.random() - 0.5) * 4.2,
      y: (Math.random() - 0.5) * 4.6,
      z: (Math.random() - 0.5) * 1.6,
      s: 0.2 + Math.random() * 0.5,          // individual speed
      p: Math.random() * Math.PI * 2,        // phase
      r: 1.6 + Math.random() * 0.9,          // orbit radius
      vy: 0,                                  // drip fall velocity
    })), [type, count])
  const positions = useMemo(() => new Float32Array(count * 3), [type, count])

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime
    for (let i = 0; i < count; i++) {
      const d = seeds[i]
      if (type === 'fall') {
        d.y -= d.s * 0.55 * dt
        if (d.y < -2.4) { d.y = 2.4; d.x = (Math.random() - 0.5) * 4.2 }
        positions[i * 3] = d.x + Math.sin(t * 0.8 + d.p) * 0.12   // gentle sway
        positions[i * 3 + 1] = d.y
        positions[i * 3 + 2] = d.z
      } else if (type === 'rise') {
        d.y += d.s * 0.5 * dt
        if (d.y > 2.4) { d.y = -2.4; d.x = (Math.random() - 0.5) * 3.4 }
        positions[i * 3] = d.x + Math.sin(t * 2.2 + d.p) * 0.06   // heat flicker
        positions[i * 3 + 1] = d.y
        positions[i * 3 + 2] = d.z * 0.6
      } else if (type === 'drip') {
        if (d.y > -1.78) {
          d.y -= d.s * 0.11 * dt                                   // beading down the glass
          d.x = THREE.MathUtils.clamp(d.x, -1.15, 1.15)
          d.z = d.z > 0 ? 0.075 : -0.075                           // hugging the faces
        } else {
          d.vy += 4.5 * dt                                         // free fall off the edge
          d.y -= d.vy * dt
        }
        if (d.y < -3) { d.y = 1.6 + Math.random(); d.vy = 0; d.x = (Math.random() - 0.5) * 2.3; d.z = Math.random() > 0.5 ? 0.075 : -0.075 }
        positions[i * 3] = d.x
        positions[i * 3 + 1] = d.y
        positions[i * 3 + 2] = d.z
      } else { // orbit
        const a = d.p + t * d.s * 0.6
        positions[i * 3] = Math.cos(a) * d.r
        positions[i * 3 + 1] = d.y * 0.4 + Math.sin(t * 0.5 + d.p) * 0.35
        positions[i * 3 + 2] = Math.sin(a) * d.r * 0.45
      }
    }
    if (pts.current) pts.current.geometry.attributes.position.needsUpdate = true
  })

  return (
    <points ref={pts} key={type}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color={color} size={size} transparent opacity={0.75}
        blending={THREE.AdditiveBlending} depthWrite={false} sizeAttenuation />
    </points>
  )
}

// ---- SSS backdrop: magic sigils + volumetric god-rays behind the card ----
function SSSBackdrop() {
  const ringA = useRef(), ringB = useRef(), rays = useRef()
  useFrame((state, dt) => {
    const t = state.clock.elapsedTime
    if (ringA.current) ringA.current.rotation.z += dt * 0.12          // sigils counter-rotate, slow and ceremonial
    if (ringB.current) ringB.current.rotation.z -= dt * 0.22
    if (rays.current) {
      rays.current.rotation.z += dt * 0.04
      const breathe = 0.05 + 0.045 * (0.5 + 0.5 * Math.sin(t * 0.6)) // rays swell with the card's breath
      rays.current.children.forEach((m) => { m.material.opacity = breathe })
    }
  })
  const glow = { color: '#ffd88a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }
  return (
    <group position={[0, 0, -1.5]}>
      {/* outer sigil: ring + rune ticks */}
      <group ref={ringA}>
        <mesh><ringGeometry args={[2.3, 2.34, 128]} /><meshBasicMaterial {...glow} opacity={0.5} /></mesh>
        {Array.from({ length: 12 }, (_, i) => (
          <group key={i} rotation-z={(i * Math.PI) / 6}>
            <mesh position={[0, 2.32, 0]}><planeGeometry args={[0.05, 0.22]} /><meshBasicMaterial {...glow} opacity={0.55} /></mesh>
          </group>
        ))}
      </group>
      {/* inner sigil: counter-rotating ring + fine ring */}
      <group ref={ringB}>
        <mesh><ringGeometry args={[1.82, 1.84, 128]} /><meshBasicMaterial {...glow} opacity={0.4} /></mesh>
        <mesh rotation-z={Math.PI / 4}><ringGeometry args={[2.06, 2.07, 6]} /><meshBasicMaterial {...glow} opacity={0.3} /></mesh>
      </group>
      {/* god-rays: soft prismatic shafts sweeping the void */}
      <group ref={rays}>
        {Array.from({ length: 6 }, (_, i) => (
          <mesh key={i} rotation-z={(i * Math.PI) / 3 + 0.4}>
            <planeGeometry args={[0.9, 11]} />
            <meshBasicMaterial color={['#ffd88a', '#ff9ad5', '#9ae8ff'][i % 3]} transparent opacity={0.06}
              blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

// ---- Signature Moments: the double-tap library ----
const SIGNATURES = {
  flash: 'Golden Flash',
  gravity: 'Gravity Drop',
  shatter: 'Shatter & Reform',
  prism: 'Prism Burst',
}

const easeOut = (x) => 1 - Math.pow(1 - x, 3)
const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)

// shard layout for Shatter: 6x8 grid, each with its own explosion vector
const SHARD_COLS = 6, SHARD_ROWS = 8
const SHARDS = Array.from({ length: SHARD_COLS * SHARD_ROWS }, (_, i) => {
  const c = i % SHARD_COLS, r = Math.floor(i / SHARD_COLS)
  return {
    bx: (c + 0.5) * (2.5 / SHARD_COLS) - 1.25,
    by: (r + 0.5) * (3.5 / SHARD_ROWS) - 1.75,
    x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2, z: Math.random() * 1.5 + 0.3,
    rx: (Math.random() - 0.5) * 4, ry: (Math.random() - 0.5) * 4, rz: (Math.random() - 0.5) * 4,
  }
})

// ---- the utility side: edit URLs here ----
const LINKS = [
  { label: 'SPOTIFY', url: 'https://open.spotify.com/artist/2hbge2y8iTFX7VNniR7Oyx' },
  { label: 'TIKTOK', url: '#' },      // TODO: real handle
  { label: 'INSTAGRAM', url: '#' },   // TODO: real handle
]

function BackLink({ label, url, y, dragRef }) {
  const [hover, setHover] = useState(false)
  const open = (e) => {
    e.stopPropagation()
    // only a click if the pointer barely moved (not a drag ending on the link)
    if (dragRef.current && dragRef.current.moved > 8) return
    if (url !== '#') window.open(url, '_blank')
  }
  return (
    <group position={[0, y, 0.001]}>
      <mesh onPointerUp={open} onPointerOver={() => setHover(true)} onPointerOut={() => setHover(false)}>
        <planeGeometry args={[1.9, 0.44]} />
        <meshPhysicalMaterial
          color={hover ? '#2a2a34' : '#17171d'} metalness={0.4} roughness={0.3}
          clearcoat={1} clearcoatRoughness={0.15} transparent opacity={0.92}
        />
      </mesh>
      <Text position={[0, 0, 0.002]} fontSize={0.15} letterSpacing={0.22} anchorX="center" anchorY="middle">
        {label}
        <meshPhysicalMaterial color={hover ? '#ffffff' : '#b8b8c2'} metalness={0.85} roughness={0.3} />
      </Text>
    </group>
  )
}

function Card({ materialKey, signal, flipSignal, sigKey }) {
  const group = useRef()
  const cardBody = useRef()
  const shardG = useRef()
  const prismG = useRef()
  const flash = useRef()
  const bodyMat = useRef()
  const fx = useRef(null)          // active signature moment
  const photo = useLoader(THREE.TextureLoader, '/premee.jpg')
  photo.colorSpace = THREE.SRGBColorSpace

  // physics state (kept in refs — never re-render during motion)
  const rot = useRef({ y: 0, x: 0 })          // current rotation
  const vel = useRef({ y: 0, x: 0 })          // angular velocity
  const drag = useRef(null)                    // active drag info
  const burst = useRef(0)                      // signature moment energy
  const tilt = useRef({ x: 0, y: 0 })         // gyro / cursor tilt target
  const lastTap = useRef(0)

  // gyroscope on mobile
  useEffect(() => {
    const onOrient = (e) => {
      if (e.beta == null) return
      tilt.current.x = THREE.MathUtils.clamp((e.beta - 45) / 90, -0.5, 0.5) * 0.4
      tilt.current.y = THREE.MathUtils.clamp(e.gamma / 90, -0.5, 0.5) * 0.5
    }
    window.addEventListener('deviceorientation', onOrient)
    return () => window.removeEventListener('deviceorientation', onOrient)
  }, [])

  // signature moment trigger (button or double-tap)
  const sigRef = useRef(sigKey)
  sigRef.current = sigKey
  const triggerSig = () => {
    const k = sigRef.current
    if (k === 'flash') burst.current = 1
    else if (!fx.current) fx.current = { type: k, t: 0, y: 0, vy: 1.5, bounces: 0 }
  }
  const firstSignal = useRef(true)
  useEffect(() => {
    if (firstSignal.current) { firstSignal.current = false; return }
    triggerSig()
  }, [signal])

  // flip: a firm physical spin impulse — the settle logic lands it on the other face
  useEffect(() => { if (flipSignal) vel.current.y += 7 }, [flipSignal])

  const onDown = (e) => {
    e.stopPropagation()
    e.target.setPointerCapture(e.pointerId)
    drag.current = { px: e.clientX, py: e.clientY, t: performance.now(), vx: 0, vy: 0, moved: 0 }
    // double-tap detection → signature moment
    const now = performance.now()
    if (now - lastTap.current < 300) triggerSig()
    lastTap.current = now
  }
  const onMove = (e) => {
    if (!drag.current) return
    const d = drag.current
    const dx = e.clientX - d.px, dy = e.clientY - d.py
    d.moved += Math.abs(dx) + Math.abs(dy)
    rot.current.y += dx * 0.008
    rot.current.x += dy * 0.006
    const now = performance.now(), dt = Math.max(now - d.t, 1)
    d.vx = (dx / dt) * 8        // remember velocity for the flick
    d.vy = (dy / dt) * 6
    d.px = e.clientX; d.py = e.clientY; d.t = now
  }
  const onUp = () => {
    if (!drag.current) return
    vel.current.y = drag.current.vx   // the flick: release with momentum
    vel.current.x = drag.current.vy
    drag.current = null
  }

  useFrame((state, dt) => {
    const g = group.current
    if (!g) return
    const t = state.clock.elapsedTime

    // desktop: card subtly tracks the cursor (awareness)
    if (!('ontouchstart' in window)) {
      tilt.current.y = state.pointer.x * 0.18
      tilt.current.x = -state.pointer.y * 0.12
    }

    if (!drag.current) {
      // inertia + friction (the flick decays naturally)
      rot.current.y += vel.current.y * dt
      rot.current.x += vel.current.x * dt
      const friction = Math.exp(-2.2 * dt)
      vel.current.y *= friction
      vel.current.x *= friction
      // spring the X axis back level; Y settles onto the nearest face (front or back)
      if (Math.abs(vel.current.x) < 0.3)
        rot.current.x = THREE.MathUtils.damp(rot.current.x, 0, 3, dt)
      if (Math.abs(vel.current.y) < 0.5 && burst.current < 0.01) {
        const nearestFace = Math.round(rot.current.y / Math.PI) * Math.PI
        rot.current.y = THREE.MathUtils.damp(rot.current.y, nearestFace, 2.5, dt)
      }
    }

    // signature moment: burst of spin + golden flash, self-healing
    if (burst.current > 0.001) {
      vel.current.y += burst.current * 40 * dt
      burst.current = THREE.MathUtils.damp(burst.current, 0, 3.5, dt)
    }
    if (flash.current)
      flash.current.intensity = burst.current * 30

    // living materials: the pulse is physical — spin it harder, it flares hotter
    const spec = MATERIALS[materialKey]
    if (spec.pulse && bodyMat.current) {
      const p = spec.pulse
      const heartbeat = Math.max(0, Math.sin(t * p.beat * Math.PI)) ** 3
      const spinFlare = Math.min(Math.abs(vel.current.y) * 0.12, 1.2)
      bodyMat.current.emissiveIntensity = p.base + heartbeat * 0.35 + spinFlare + burst.current * 1.5
    }

    // ---- signature moments ----
    let fxY = 0
    const f = fx.current
    if (f?.type === 'gravity') {
      // gravity switches on: fall, bounce with restitution, float back home
      if (!f.returning) {
        f.vy -= 22 * dt
        f.y += f.vy * dt
        if (f.y < -2.3) {
          f.y = -2.3
          f.vy = -f.vy * 0.48
          f.bounces += 1
          vel.current.x += (Math.random() - 0.5) * 3          // bounce jolts the tumble
          burst.current = Math.max(burst.current, 0.4)        // impact glint (decays naturally)
          if (f.bounces >= 3 && Math.abs(f.vy) < 1.2) f.returning = true
        }
      } else {
        f.y = THREE.MathUtils.damp(f.y, 0, 2, dt)      // zero-g reclaims it
        if (Math.abs(f.y) < 0.02) fx.current = null
      }
      fxY = f?.y ?? 0
    } else if (f?.type === 'shatter') {
      f.t += dt
      let k
      if (f.t < 0.45) k = easeOut(f.t / 0.45)                    // explode
      else if (f.t < 0.85) k = 1                                  // hang in the air
      else if (f.t < 1.6) k = 1 - easeInOut((f.t - 0.85) / 0.75) // pull back together
      else { k = 0; fx.current = null }
      const showShards = k > 0.001
      if (shardG.current && cardBody.current) {
        shardG.current.visible = showShards
        cardBody.current.visible = !showShards
        shardG.current.children.forEach((m, i) => {
          const s = SHARDS[i]
          m.position.set(s.bx + s.x * k * 1.6, s.by + s.y * k * 1.6, s.z * k)
          m.rotation.set(s.rx * k, s.ry * k, s.rz * k)
        })
        flash.current.intensity = k * 18
      }
    } else if (f?.type === 'prism') {
      f.t += dt
      const e = Math.max(0, 1 - f.t / 1.3)
      if (prismG.current) {
        prismG.current.visible = e > 0.01
        prismG.current.scale.setScalar(1 + (1 - e) * 4)
        prismG.current.rotation.z += dt * 1.2
        prismG.current.children.forEach((m) => { m.material.opacity = e * 0.65 })
      }
      flash.current.intensity = e * 45
      if (e <= 0.01) fx.current = null
    }

    // the breath: it exists, it doesn't animate
    const breatheY = Math.sin(t * 0.6) * 0.035
    const breatheR = Math.sin(t * 0.4) * 0.02

    g.rotation.y = rot.current.y + breatheR + tilt.current.y
    g.rotation.x = THREE.MathUtils.damp(g.rotation.x, rot.current.x + tilt.current.x, 8, dt)
    g.rotation.z = Math.sin(t * 0.3) * 0.012
    g.position.y = breatheY + fxY
  })

  const mat = MATERIALS[materialKey].props

  return (
    <group ref={group}>
      <group ref={cardBody} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}>
        {/* the object: trading-card ratio, thick enough to have weight */}
        <RoundedBox args={[2.5, 3.5, 0.09]} radius={0.045} smoothness={8}>
          <meshPhysicalMaterial ref={bodyMat} key={materialKey} {...mat} />
        </RoundedBox>

        {/* SSS: heavy liquid-gold trim — blinding on the edges */}
        {materialKey === 'sss' && (
          <group>
            {[[0, 1.78, 2.64, 0.07], [0, -1.78, 2.64, 0.07], [-1.285, 0, 0.07, 3.63], [1.285, 0, 0.07, 3.63]].map(([x, y, w, h], i) => (
              <mesh key={i} position={[x, y, 0]}>
                <boxGeometry args={[w, h, 0.115]} />
                <meshPhysicalMaterial color="#ffd700" metalness={1} roughness={0.08}
                  clearcoat={1} clearcoatRoughness={0.06} emissive="#8a6a00" emissiveIntensity={0.35} />
              </mesh>
            ))}
          </group>
        )}

        {/* diamond dust / void particles: sparkles hugging the surface itself */}
        {MATERIALS[materialKey].sparkle && (
          <Sparkles count={140} scale={[2.4, 3.4, 0.18]} size={1.6} speed={0.12}
            color={MATERIALS[materialKey].sparkle} opacity={0.9} />
        )}

        {/* artist photo — a physical print beneath the lacquer */}
        <mesh position={[0, 0.62, 0.047]}>
          <planeGeometry args={[2.1, 2.1]} />
          <meshPhysicalMaterial map={photo} roughness={0.35} clearcoat={1} clearcoatRoughness={0.08} />
        </mesh>

        {/* name — embossed, catches the studio light */}
        <Text position={[0, -0.92, 0.052]} fontSize={0.34} letterSpacing={0.18} anchorX="center">
          PREMEE
          <meshPhysicalMaterial color="#e8e8ec" metalness={0.9} roughness={0.25} />
        </Text>

        {/* S-tier seal */}
        <group position={[-0.92, -1.42, 0.052]}>
          <mesh>
            <circleGeometry args={[0.17, 48]} />
            <meshPhysicalMaterial color="#141414" metalness={0.6} roughness={0.3} />
          </mesh>
          <mesh>
            <ringGeometry args={[0.155, 0.17, 48]} />
            <meshPhysicalMaterial color={TIER_COLORS.S} metalness={1} roughness={0.15} emissive={TIER_COLORS.S} emissiveIntensity={0.25} />
          </mesh>
          <Text position={[0, 0, 0.001]} fontSize={materialKey === 'sss' ? 0.11 : 0.19} anchorX="center" anchorY="middle">
            {materialKey === 'sss' ? 'SSS' : 'S'}
            <meshPhysicalMaterial color={TIER_COLORS.S} metalness={1} roughness={0.2} emissive={TIER_COLORS.S} emissiveIntensity={0.3} />
          </Text>
        </group>

        {/* XtraMile mark, small, bottom right */}
        <Text position={[0.92, -1.42, 0.052]} fontSize={0.11} letterSpacing={0.1} anchorX="right" anchorY="middle">
          XTRAMILE
          <meshPhysicalMaterial color="#666" metalness={0.8} roughness={0.4} />
        </Text>
        {/* ---- the back: utility, etched into the glass ---- */}
        <group rotation-y={Math.PI} position={[0, 0, -0.047]}>
          <Text position={[0, 1.28, 0.002]} fontSize={0.14} letterSpacing={0.3} anchorX="center">
            PREMEE
            <meshPhysicalMaterial color="#7a7a86" metalness={0.9} roughness={0.35} />
          </Text>
          {LINKS.map((l, i) => (
            <BackLink key={l.label} {...l} y={0.62 - i * 0.62} dragRef={drag} />
          ))}
          <Text position={[0, -1.42, 0.002]} fontSize={0.09} letterSpacing={0.14} anchorX="center">
            XTRAMILE HQ · LAS VEGAS
            <meshPhysicalMaterial color="#55555f" metalness={0.8} roughness={0.4} />
          </Text>
        </group>
      </group>

      {/* Shatter & Reform: the card as 48 shards, hidden until the moment fires */}
      <group ref={shardG} visible={false}>
        {SHARDS.map((s, i) => (
          <mesh key={i} position={[s.bx, s.by, 0]}>
            <boxGeometry args={[2.5 / SHARD_COLS, 3.5 / SHARD_ROWS, 0.09]} />
            <meshPhysicalMaterial color={mat.color} metalness={mat.metalness ?? 0.5}
              roughness={mat.roughness ?? 0.2} clearcoat={1} clearcoatRoughness={0.1}
              emissive="#ffb84d" emissiveIntensity={0.15} />
          </mesh>
        ))}
      </group>

      {/* Prism Burst: radial light shafts */}
      <group ref={prismG} visible={false}>
        {Array.from({ length: 8 }, (_, i) => (
          <mesh key={i} rotation-z={(i * Math.PI) / 4}>
            <planeGeometry args={[0.14, 7]} />
            <meshBasicMaterial color="#fff6d8" transparent opacity={0}
              blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        ))}
      </group>

      {/* S-tier aura + signature flash */}
      <Sparkles count={40} scale={[3.4, 4.4, 1.5]} size={2.2} speed={0.25} color={TIER_COLORS.S} opacity={0.5} />
      <pointLight ref={flash} color="#ffcf5e" intensity={0} distance={8} position={[0, 0, 1.4]} />
    </group>
  )
}

function ZoomRig() {
  // scroll / pinch zoom — damped so it feels like leaning in, not teleporting
  const target = useRef(6.0)
  const pinch = useRef(null)

  useEffect(() => {
    const onWheel = (e) => {
      target.current = THREE.MathUtils.clamp(target.current + e.deltaY * 0.0035, 3.0, 9.0)
    }
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    const onTouchStart = (e) => { if (e.touches.length === 2) pinch.current = dist(e.touches) }
    const onTouchMove = (e) => {
      if (e.touches.length === 2 && pinch.current) {
        const d = dist(e.touches)
        target.current = THREE.MathUtils.clamp(target.current * (pinch.current / d), 3.0, 9.0)
        pinch.current = d
        e.preventDefault()
      }
    }
    const onTouchEnd = () => { pinch.current = null }
    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd)
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [])

  useFrame((state, dt) => {
    state.camera.position.z = THREE.MathUtils.damp(state.camera.position.z, target.current, 5, dt)
  })
  return null
}

function Studio({ bright }) {
  // bright: 0 = moody vault, 1 = showroom. Scales the whole studio.
  const b = 0.5 + bright * 1.6
  return (
    <>
      <Environment resolution={512}>
        {/* invisible studio: light strips that roll glare across the surface */}
        <Lightformer intensity={4 * b} position={[0, 5, -9]} scale={[10, 10, 1]} />
        <Lightformer intensity={1.5 * b} rotation-y={Math.PI / 2} position={[-5, 1, -1]} scale={[12, 2, 1]} />
        <Lightformer intensity={1.5 * b} rotation-y={-Math.PI / 2} position={[10, 1, 0]} scale={[16, 2, 1]} />
        {/* front fill so the back of the card is readable when flipped */}
        <Lightformer intensity={1.2 * b} position={[0, 0, 9]} scale={[10, 6, 1]} />
        {/* underglow: near-neutral so metals read true — color belongs to the material, not the studio */}
        <Lightformer intensity={0.5 * b} color="#e9e9f2" rotation-x={Math.PI / 2} position={[0, -4, 6]} scale={[8, 8, 1]} />
      </Environment>
      {/* soft direct fill — lights the space itself, not just reflections */}
      <ambientLight intensity={bright * 0.7} color="#ffffff" />
      <pointLight position={[0, 2, 4]} intensity={bright * 12} color="#fff8ee" distance={14} decay={2} />
    </>
  )
}

export default function App() {
  const [materialKey, setMaterialKey] = useState('obsidian')
  const [signal, setSignal] = useState(0)
  const [flipSignal, setFlipSignal] = useState(0)
  const [bright, setBright] = useState(0.35)
  const [sigKey, setSigKey] = useState('shatter')
  return (
    <div className="stage">
      <Canvas camera={{ position: [0, 0, 6.0], fov: 42 }} dpr={[1, 2]} gl={{ preserveDrawingBuffer: true }}>
        <color attach="background" args={[
          new THREE.Color('#050507').lerp(new THREE.Color('#232324'), bright)
        ]} />
        <Card materialKey={materialKey} signal={signal} flipSignal={flipSignal} sigKey={sigKey} />
        {AURAS[materialKey] && <Aura key={materialKey} {...AURAS[materialKey]} />}
        {materialKey === 'sss' && <SSSBackdrop />}
        <ZoomRig />
        <Studio bright={bright} />
      </Canvas>
      <div className="controls">
        <select className="matpick" value={materialKey} onChange={(e) => setMaterialKey(e.target.value)}>
          {['SSS', 'Luxe', 'Void', 'Forge', 'Alchemy'].map((col) => (
            <optgroup key={col} label={col}>
              {Object.entries(MATERIALS).filter(([, m]) => m.collection === col).map(([key, m]) => (
                <option key={key} value={key}>{m.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <button onClick={() => setFlipSignal(s => s + 1)}>⟳ Flip</button>
        <select className="matpick" value={sigKey} onChange={(e) => setSigKey(e.target.value)}>
          {Object.entries(SIGNATURES).map(([k, label]) => (
            <option key={k} value={k}>✦ {label}</option>
          ))}
        </select>
        <button onClick={() => setSignal(s => s + 1)}>✦ Fire</button>
        <label className="light">
          ☀
          <input type="range" min="0" max="1" step="0.01" value={bright}
            onChange={(e) => setBright(parseFloat(e.target.value))} />
        </label>
      </div>
      <div className="hint">drag · flick · scroll to zoom · double-tap</div>
    </div>
  )
}
