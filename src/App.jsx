import { useRef, useState, useEffect } from 'react'
import { Canvas, useFrame, useLoader } from '@react-three/fiber'
import { Environment, Lightformer, Text, RoundedBox, Sparkles } from '@react-three/drei'
import * as THREE from 'three'
import './App.css'

// ---- Material library — the customization system starts here ----
const MATERIALS = {
  obsidian: {
    label: 'Obsidian',
    props: {
      color: '#0a0a0c', metalness: 0.1, roughness: 0.18,
      clearcoat: 1, clearcoatRoughness: 0.06, reflectivity: 1,
    },
  },
  holographic: {
    label: 'Holographic',
    props: {
      color: '#1a1a22', metalness: 0.85, roughness: 0.12,
      clearcoat: 1, clearcoatRoughness: 0.1,
      iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [100, 800],
    },
  },
  chrome: {
    label: 'Chrome',
    props: {
      color: '#c8ccd4', metalness: 1, roughness: 0.06,
      clearcoat: 0.6, clearcoatRoughness: 0.04,
    },
  },
}

const TIER_COLORS = { S: '#ffd700' }

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

function Card({ materialKey, signal, flipSignal }) {
  const group = useRef()
  const flash = useRef()
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

  // signature moment trigger from the button
  useEffect(() => { if (signal) burst.current = 1 }, [signal])

  // flip: a firm physical spin impulse — the settle logic lands it on the other face
  useEffect(() => { if (flipSignal) vel.current.y += 7 }, [flipSignal])

  const onDown = (e) => {
    e.stopPropagation()
    e.target.setPointerCapture(e.pointerId)
    drag.current = { px: e.clientX, py: e.clientY, t: performance.now(), vx: 0, vy: 0, moved: 0 }
    // double-tap detection → signature moment
    const now = performance.now()
    if (now - lastTap.current < 300) burst.current = 1
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

    // the breath: it exists, it doesn't animate
    const breatheY = Math.sin(t * 0.6) * 0.035
    const breatheR = Math.sin(t * 0.4) * 0.02

    g.rotation.y = rot.current.y + breatheR + tilt.current.y
    g.rotation.x = THREE.MathUtils.damp(g.rotation.x, rot.current.x + tilt.current.x, 8, dt)
    g.rotation.z = Math.sin(t * 0.3) * 0.012
    g.position.y = breatheY
  })

  const mat = MATERIALS[materialKey].props

  return (
    <group ref={group}>
      <group onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}>
        {/* the object: trading-card ratio, thick enough to have weight */}
        <RoundedBox args={[2.5, 3.5, 0.09]} radius={0.045} smoothness={8}>
          <meshPhysicalMaterial {...mat} />
        </RoundedBox>

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
          <Text position={[0, 0, 0.001]} fontSize={0.19} anchorX="center" anchorY="middle">
            S
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
        <Lightformer intensity={0.8 * b} color="#b28aff" rotation-x={Math.PI / 2} position={[0, -4, 6]} scale={[8, 8, 1]} />
      </Environment>
      {/* soft direct fill — lights the space itself, not just reflections */}
      <ambientLight intensity={bright * 0.7} color="#cfd4ff" />
      <pointLight position={[0, 2, 4]} intensity={bright * 12} color="#fff4e0" distance={14} decay={2} />
    </>
  )
}

export default function App() {
  const [materialKey, setMaterialKey] = useState('obsidian')
  const [signal, setSignal] = useState(0)
  const [flipSignal, setFlipSignal] = useState(0)
  const [bright, setBright] = useState(0.35)
  return (
    <div className="stage">
      <Canvas camera={{ position: [0, 0, 6.0], fov: 42 }} dpr={[1, 2]} gl={{ preserveDrawingBuffer: true }}>
        <color attach="background" args={[
          new THREE.Color('#050507').lerp(new THREE.Color('#23232e'), bright)
        ]} />
        <Card materialKey={materialKey} signal={signal} flipSignal={flipSignal} />
        <ZoomRig />
        <Studio bright={bright} />
      </Canvas>
      <div className="controls">
        {Object.entries(MATERIALS).map(([key, m]) => (
          <button key={key} className={key === materialKey ? 'active' : ''} onClick={() => setMaterialKey(key)}>
            {m.label}
          </button>
        ))}
        <button onClick={() => setFlipSignal(s => s + 1)}>⟳ Flip</button>
        <button onClick={() => setSignal(s => s + 1)}>✦ Signature</button>
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
