import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

/* ─────────────────────────────────────────────────────────────────────────────
   PASSO PRODUCCIONES — IMMERSIVE EXPERIENCE
   Three.js + GSAP + Lenis
──────────────────────────────────────────────────────────────────────────── */

const SECTIONS = 6
const PARTICLE_COUNT = 6000

// Camera waypoints: [x, y, z, targetX, targetY, targetZ]
const CAMERA_WAYPOINTS = [
  [0,   1.2, 10,   0,  0.3, 0 ],   // 0 Hero
  [3.5, 1.5,  7,   0,  0.5, 0 ],   // 1 Nosotros
  [-2,  2.5,  8,   0,  0.5,-1 ],   // 2 Proyectos
  [0,   0.5,  4,   0,  0.5,-2 ],   // 3 Experiencia
  [2,   3,    8,   0,  0,   0 ],   // 4 Servicios
  [0,   0.8,  9,   0,  0,   0 ],   // 5 Contacto
]

const SECTION_LABELS = ['Inicio','Nosotros','Proyectos','Proceso','Servicios','Contacto']

/* ──────────────────────────────────── UTILS ──────────────────────────────── */
const lerp = (a, b, t) => a + (b - a) * t
const clamp = (v, min, max) => Math.max(min, Math.min(max, v))
const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
const easeOut = t => 1 - Math.pow(1 - t, 3)

/* ──────────────────────────────── SHADERS ────────────────────────────────── */
const particleVert = `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;
  uniform float uTime;
  uniform float uPixelRatio;

  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPixelRatio * (280.0 / -mvPos.z);
    gl_Position = projectionMatrix * mvPos;
  }
`

const particleFrag = `
  varying float vAlpha;
  varying vec3 vColor;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float alpha = (1.0 - smoothstep(0.2, 0.5, d)) * vAlpha;
    gl_FragColor = vec4(vColor, alpha);
  }
`

/* ──────────────────────────────── EXPERIENCE ─────────────────────────────── */
class PassoExperience {
  constructor() {
    this.canvas    = document.getElementById('canvas')
    this.W         = window.innerWidth
    this.H         = window.innerHeight
    this.clock     = new THREE.Clock()
    this.progress  = 0
    this.section   = 0
    this.secProg   = 0
    this.targetCam = new THREE.Vector3()
    this.targetLook= new THREE.Vector3()
    this.structures= []
    this.particleTargets = []

    this._initRenderer()
    this._initScene()
    this._initPost()
    this._buildParticles()
    this._buildStructures()
    this._buildGrid()
    this._initLenis()
    this._initCursor()
    this._initNav()
    this._animate()
    this._onResize()
    window.addEventListener('resize', () => this._onResize())

    this._showLoader()
  }

  /* ── RENDERER ── */
  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    })
    this.renderer.setSize(this.W, this.H)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setClearColor(0x0A0A0A, 1)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.1
  }

  /* ── SCENE ── */
  _initScene() {
    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.FogExp2(0x0A0A0A, 0.04)

    this.camera = new THREE.PerspectiveCamera(55, this.W / this.H, 0.01, 200)
    const wp = CAMERA_WAYPOINTS[0]
    this.camera.position.set(wp[0], wp[1], wp[2])
    this.camera.lookAt(wp[3], wp[4], wp[5])

    // Lights
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.08))

    this.dirLight = new THREE.DirectionalLight(0xffffff, 0.8)
    this.dirLight.position.set(5, 8, 5)
    this.scene.add(this.dirLight)

    this.bluePoint = new THREE.PointLight(0x3A6FFF, 3, 20)
    this.bluePoint.position.set(-4, 4, 4)
    this.scene.add(this.bluePoint)

    this.redPoint = new THREE.PointLight(0xFF2222, 1.5, 15)
    this.redPoint.position.set(4, -2, 2)
    this.scene.add(this.redPoint)

    this.fillLight = new THREE.PointLight(0x888888, 0.5, 12)
    this.fillLight.position.set(0, 2, 6)
    this.scene.add(this.fillLight)
  }

  /* ── POST PROCESSING ── */
  _initPost() {
    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(this.W, this.H),
      0.35, 0.5, 0.82
    )
    this.composer.addPass(this.bloomPass)
    this.composer.addPass(new OutputPass())
  }

  /* ── PARTICLES ── */
  _buildParticles() {
    const count = PARTICLE_COUNT
    const positions  = new Float32Array(count * 3)
    const sizes      = new Float32Array(count)
    const alphas     = new Float32Array(count)
    const colors     = new Float32Array(count * 3)

    // Random init positions in sphere
    for (let i = 0; i < count; i++) {
      const r = 12 + Math.random() * 6
      const theta = Math.random() * Math.PI * 2
      const phi   = Math.acos(2 * Math.random() - 1)
      positions[i*3]   = r * Math.sin(phi) * Math.cos(theta)
      positions[i*3+1] = r * Math.sin(phi) * Math.sin(theta)
      positions[i*3+2] = r * Math.cos(phi)
      sizes[i]   = 0.5 + Math.random() * 1.5
      alphas[i]  = 0.15 + Math.random() * 0.6
      // Color: mostly white-grey, some blue accent
      const iBlue = Math.random() < 0.15
      colors[i*3]   = iBlue ? 0.23 : 0.7 + Math.random() * 0.3
      colors[i*3+1] = iBlue ? 0.44 : 0.7 + Math.random() * 0.3
      colors[i*3+2] = iBlue ? 1.0  : 0.7 + Math.random() * 0.3
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position',  new THREE.BufferAttribute(positions,  3))
    geo.setAttribute('aSize',     new THREE.BufferAttribute(sizes,      1))
    geo.setAttribute('aAlpha',    new THREE.BufferAttribute(alphas,     1))
    geo.setAttribute('aColor',    new THREE.BufferAttribute(colors,     3))

    this.particleMat = new THREE.ShaderMaterial({
      vertexShader: particleVert,
      fragmentShader: particleFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: this.renderer.getPixelRatio() },
      }
    })

    this.particles = new THREE.Points(geo, this.particleMat)
    this.scene.add(this.particles)

    // Store initial positions for morph targets
    this.basePositions = positions.slice()
    this._buildParticleTargets()
  }

  _buildParticleTargets() {
    const count = PARTICLE_COUNT
    // Target set for each section: stand wireframe shape → scatter → grid → room → ring → center
    const targets = []
    for (let s = 0; s < SECTIONS; s++) targets.push(new Float32Array(count * 3))

    for (let i = 0; i < count; i++) {
      const t = i / count
      const angle = t * Math.PI * 2

      /* Section 0 — Hero: stand wireframe cloud */
      const sx0 = (Math.random() - 0.5) * 5
      const sy0 = Math.random() * 3.5 - 0.5
      const sz0 = (Math.random() - 0.5) * 4
      targets[0][i*3]   = sx0
      targets[0][i*3+1] = sy0
      targets[0][i*3+2] = sz0

      /* Section 1 — Nosotros: vertical rising columns */
      const col = Math.floor(t * 6)
      const colX = (col - 3) * 1.1
      const height = 4 * (t * 6 - col)
      targets[1][i*3]   = colX + (Math.random()-0.5)*0.3
      targets[1][i*3+1] = height - 2
      targets[1][i*3+2] = (Math.random()-0.5) * 2

      /* Section 2 — Proyectos: 4 clusters in space */
      const cluster = Math.floor(t * 4)
      const clusterPos = [[-3,0,-2],[3,0,-2],[-3,0,2],[3,0,2]]
      const cp = clusterPos[cluster]
      targets[2][i*3]   = cp[0] + (Math.random()-0.5)*2
      targets[2][i*3+1] = cp[1] + (Math.random()-0.5)*2
      targets[2][i*3+2] = cp[2] + (Math.random()-0.5)*2

      /* Section 3 — Experiencia: room shell */
      const wallSel = Math.floor(Math.random() * 5)
      let rx=0,ry=0,rz=0
      if(wallSel===0){rx=(Math.random()-0.5)*6;ry=-1.5;rz=(Math.random()-0.5)*4}     // floor
      else if(wallSel===1){rx=(Math.random()-0.5)*6;ry=2.5;rz=(Math.random()-0.5)*4} // ceiling
      else if(wallSel===2){rx=-3;ry=(Math.random()-0.5)*4;rz=(Math.random()-0.5)*4}  // left wall
      else if(wallSel===3){rx=3;ry=(Math.random()-0.5)*4;rz=(Math.random()-0.5)*4}   // right wall
      else {rx=(Math.random()-0.5)*6;ry=(Math.random()-0.5)*4;rz=-2}                 // back wall
      targets[3][i*3]=rx; targets[3][i*3+1]=ry; targets[3][i*3+2]=rz

      /* Section 4 — Servicios: flat wave grid */
      const gx = ((i % 80) / 79 - 0.5) * 9
      const gz = (Math.floor(i / 80) / (count/80) - 0.5) * 9
      const wave = Math.sin(gx * 0.8) * Math.cos(gz * 0.8) * 0.8
      targets[4][i*3]   = gx
      targets[4][i*3+1] = wave - 0.5
      targets[4][i*3+2] = gz - 3

      /* Section 5 — Contacto: concentric rings */
      const ring  = Math.floor(t * 5)
      const rRad  = 1.2 + ring * 0.7
      const rAngle= (t * 5 - ring) * Math.PI * 2
      targets[5][i*3]   = Math.cos(rAngle) * rRad
      targets[5][i*3+1] = (Math.random()-0.5) * 0.4
      targets[5][i*3+2] = Math.sin(rAngle) * rRad - 2
    }

    this.particleTargets = targets
    this.currentPositions = new Float32Array(PARTICLE_COUNT * 3)

    // Init to section 0
    for (let i = 0; i < PARTICLE_COUNT * 3; i++) {
      this.currentPositions[i] = this.basePositions[i]
    }
  }

  /* ── STRUCTURES ── */
  _buildStructures() {
    const mat = (col = 0x3A6FFF, op = 0.7) => new THREE.LineBasicMaterial({
      color: col, transparent: true, opacity: op, depthWrite: false
    })
    const wireBox = (w,h,d,pos,m) => {
      const g = new THREE.BoxGeometry(w,h,d)
      const ls = new THREE.LineSegments(new THREE.EdgesGeometry(g), m.clone())
      ls.position.set(...pos)
      return ls
    }

    /* Stand structure — visible in Hero + Nosotros */
    const standGroup = new THREE.Group()
    const bm = mat(0x3A6FFF, 0.8)
    const components = [
      [4, 0.04, 3,  [0,  -0.5, 0  ]], // floor
      [4, 3,    0.04,[0,  1,  -1.5]], // back wall
      [0.04,3,  3,  [-2, 1,   0  ]], // left wall
      [0.04,3,  3,  [2,  1,   0  ]], // right wall
      [4, 0.04, 3,  [0,  2.5,  0  ]], // ceiling
      [1.6,0.04,0.7,[0,  0.5, 0.8]], // counter top
      [1.6,0.9, 0.04,[0, 0,   0.8]], // counter front
      [0.04,1.2,0.4,[-0.75,1.1,-1.3]], // display left
      [0.04,1.2,0.4,[0.75, 1.1,-1.3]], // display right
      [1.5, 0.02,0.5,[0,  1.8,-1.2]], // shelf
    ]
    components.forEach(([w,h,d,pos]) => standGroup.add(wireBox(w,h,d,pos,bm)))
    standGroup.position.set(0, 0, 0)
    this.standGroup = standGroup
    this.scene.add(standGroup)

    /* Floating modular panels — Nosotros */
    const panelGroup = new THREE.Group()
    const pm = mat(0xC8C8D0, 0.35)
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2
      const radius = 4.5
      const panel = wireBox(1.2, 2, 0.04,
        [Math.cos(ang)*radius, (Math.random()-0.5)*2, Math.sin(ang)*radius - 1], pm)
      panel.rotation.y = ang
      panelGroup.add(panel)
    }
    this.panelGroup = panelGroup
    panelGroup.visible = false
    this.scene.add(panelGroup)

    /* Room structure — Experiencia */
    const roomGroup = new THREE.Group()
    const rm = mat(0x888899, 0.5)
    const roomParts = [
      [8,  0.04, 6, [0,-2,  -1]], // floor
      [8,  0.04, 6, [0, 3,  -1]], // ceiling
      [0.04,5,  6, [-4, 0.5,-1]], // left wall
      [0.04,5,  6, [4,  0.5,-1]], // right wall
      [8,  5,  0.04,[0,  0.5,-4]], // back wall
      // internal details
      [2,   1.8,0.04,[-2, -0.6,-3.5]], // panel
      [2,   1.8,0.04,[2,  -0.6,-3.5]], // panel
      [3,   0.04,0.4,[0,  -0.5, 0  ]], // table top
    ]
    roomParts.forEach(([w,h,d,pos]) => roomGroup.add(wireBox(w,h,d,pos,rm)))
    this.roomGroup = roomGroup
    roomGroup.visible = false
    this.scene.add(roomGroup)

    this.structures = [standGroup, panelGroup, roomGroup]
  }

  /* ── FLOOR GRID ── */
  _buildGrid() {
    const gridHelper = new THREE.GridHelper(30, 40, 0x1a1a2e, 0x111120)
    gridHelper.position.y = -2.5
    gridHelper.material.opacity = 0.4
    gridHelper.material.transparent = true
    this.grid = gridHelper
    this.scene.add(gridHelper)

    // Horizon glow plane
    const planeGeo = new THREE.PlaneGeometry(60, 60)
    const planeMat = new THREE.MeshBasicMaterial({
      color: 0x0A0A14,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide
    })
    const plane = new THREE.Mesh(planeGeo, planeMat)
    plane.rotation.x = -Math.PI / 2
    plane.position.y = -2.52
    this.scene.add(plane)
  }

  /* ── LENIS SCROLL ── */
  _initLenis() {
    this.lenis = new Lenis({
      lerp: 0.08,
      infinite: false,
      orientation: 'vertical',
    })

    this.lenis.on('scroll', ({ progress }) => {
      this.progress = progress
      this._updateScene(progress)
    })

    // GSAP ticker
    gsap.ticker.add(time => this.lenis.raf(time * 1000))
    gsap.ticker.lagSmoothing(0)
  }

  /* ── CURSOR ── */
  _initCursor() {
    const dot  = document.getElementById('cursor-dot')
    const ring = document.getElementById('cursor-ring')
    if (!dot || !ring) return

    let mx = 0, my = 0
    let rx = 0, ry = 0
    window.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY })

    const tickCursor = () => {
      rx = lerp(rx, mx, 0.15)
      ry = lerp(ry, my, 0.15)
      dot.style.transform  = `translate(${mx}px,${my}px) translate(-50%,-50%)`
      ring.style.transform = `translate(${rx}px,${ry}px) translate(-50%,-50%)`
      requestAnimationFrame(tickCursor)
    }
    tickCursor()
  }

  /* ── NAV SECTION LINKS ── */
  _initNav() {
    document.querySelectorAll('[data-section]').forEach(el => {
      el.addEventListener('click', e => {
        e.preventDefault()
        const idx = parseInt(el.dataset.section)
        const totalH = document.documentElement.scrollHeight - window.innerHeight
        const target = (idx / (SECTIONS - 1)) * totalH
        this.lenis.scrollTo(target, { duration: 2 })
      })
    })

    document.getElementById('contact-form')?.addEventListener('submit', e => {
      e.preventDefault()
      const btn = e.target.querySelector('.form-submit span')
      if (btn) btn.textContent = 'Mensaje enviado ✓'
      gsap.to(e.target, { opacity: 0.6, duration: 0.3 })
    })
  }

  /* ── LOADER ── */
  _showLoader() {
    const fill  = document.getElementById('loader-fill')
    const text  = document.getElementById('loader-text')
    const loader= document.getElementById('loader')
    const msgs  = ['Iniciando experiencia...','Cargando materiales...','Construyendo espacio...','']

    let p = 0
    const interval = setInterval(() => {
      p += Math.random() * 12 + 5
      if (p >= 100) { p = 100; clearInterval(interval) }
      if (fill) fill.style.width = p + '%'
      const msgIdx = Math.floor((p/100) * (msgs.length-1))
      if (text) text.textContent = msgs[msgIdx]

      if (p >= 100) {
        setTimeout(() => {
          loader.classList.add('hidden')
          this._animateHeroIn()
        }, 400)
      }
    }, 120)
  }

  _animateHeroIn() {
    // Camera slow drift
    gsap.from(this.camera.position, {
      z: '+=3', duration: 3, ease: 'power2.out'
    })
  }

  /* ── UPDATE SCENE ── */
  _updateScene(progress) {
    const totalSec   = SECTIONS - 1
    const t          = progress * totalSec
    const sec        = Math.min(Math.floor(t), SECTIONS - 1)
    const localProg  = t - Math.floor(t)

    this.section  = sec
    this.secProg  = localProg

    // Progress bar
    const fill = document.getElementById('progress-fill')
    if (fill) fill.style.width = (progress * 100) + '%'

    // Section indicator
    const numEl  = document.getElementById('section-num')
    const nameEl = document.getElementById('section-name')
    if (numEl)  numEl.textContent  = String(sec + 1).padStart(2,'0')
    if (nameEl) nameEl.textContent = SECTION_LABELS[sec]

    // Camera
    this._updateCamera(t)

    // Structures visibility
    this._updateStructures(sec, localProg)

    // Lights
    this._updateLights(sec, localProg)
  }

  _updateCamera(t) {
    const max  = CAMERA_WAYPOINTS.length - 1
    const i    = Math.min(Math.floor(t), max - 1)
    const f    = easeInOut(clamp(t - i, 0, 1))
    const a    = CAMERA_WAYPOINTS[i]
    const b    = CAMERA_WAYPOINTS[Math.min(i+1, max)]

    this.targetCam.set(
      lerp(a[0], b[0], f),
      lerp(a[1], b[1], f),
      lerp(a[2], b[2], f),
    )
    this.targetLook.set(
      lerp(a[3], b[3], f),
      lerp(a[4], b[4], f),
      lerp(a[5], b[5], f),
    )
  }

  _updateStructures(sec, lp) {
    // Stand: hero + nosotros
    const standVisible = sec <= 1
    this.standGroup.visible = standVisible
    if (standVisible) {
      const op = sec === 1 ? easeOut(1 - lp) : 1
      this.standGroup.children.forEach(c => {
        if (c.material) c.material.opacity = op * 0.8
      })
    }

    // Floating panels: nosotros only
    this.panelGroup.visible = sec === 1
    if (this.panelGroup.visible) {
      const op = lp < 0.3 ? easeOut(lp/0.3) : lp > 0.7 ? easeOut((1-lp)/0.3) : 1
      this.panelGroup.children.forEach(c => {
        if (c.material) c.material.opacity = op * 0.35
      })
    }

    // Room: experiencia
    this.roomGroup.visible = sec === 3
    if (this.roomGroup.visible) {
      // disassemble on scroll through
      const disassemble = lp
      this.roomGroup.children.forEach((c, idx) => {
        const delay  = idx / this.roomGroup.children.length
        const offset = clamp((disassemble - delay * 0.4) * 3, 0, 1)
        if (c.material) c.material.opacity = (1 - offset) * 0.5
        c.position.y += offset * 0.003 * (idx % 2 === 0 ? 1 : -1)
      })
    }

    // Grid opacity based on section
    const gridOp = sec === 0 ? lerp(0.4, 0.1, lp) :
                   sec === 2 ? 0.15 :
                   sec >= 4  ? lerp(0.15, 0.05, lp) : 0.2
    this.grid.material.opacity = gridOp
  }

  _updateLights(sec, lp) {
    // Blue point drifts
    this.bluePoint.position.x = Math.sin(this.clock.getElapsedTime() * 0.3) * 5
    this.bluePoint.position.y = 3 + Math.cos(this.clock.getElapsedTime() * 0.2) * 2

    // Intensity by section
    const blueIntensities = [3, 2, 4, 1.5, 2.5, 2]
    const redIntensities  = [0.5, 0.3, 1.5, 0.8, 0.5, 0.3]
    this.bluePoint.intensity = lerp(
      blueIntensities[sec],
      blueIntensities[Math.min(sec+1, SECTIONS-1)],
      lp
    )
    this.redPoint.intensity = lerp(
      redIntensities[sec],
      redIntensities[Math.min(sec+1, SECTIONS-1)],
      lp
    )
  }

  /* ── PARTICLE MORPH ── */
  _updateParticles(time) {
    const positions = this.particles.geometry.attributes.position.array
    const targets   = this.particleTargets
    const sec       = this.section
    const lp        = this.secProg

    // Cross-fade between current section target and next
    const nextSec = Math.min(sec + 1, SECTIONS - 1)
    const t       = easeInOut(lp)

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const idx = i * 3
      // Target position
      const tx = lerp(targets[sec][idx],   targets[nextSec][idx],   t)
      const ty = lerp(targets[sec][idx+1], targets[nextSec][idx+1], t)
      const tz = lerp(targets[sec][idx+2], targets[nextSec][idx+2], t)

      // Smooth lerp current to target
      this.currentPositions[idx]   = lerp(this.currentPositions[idx],   tx, 0.04)
      this.currentPositions[idx+1] = lerp(this.currentPositions[idx+1], ty, 0.04)
      this.currentPositions[idx+2] = lerp(this.currentPositions[idx+2], tz, 0.04)

      // Micro-drift for organic feel
      const drift = 0.002
      positions[idx]   = this.currentPositions[idx]   + Math.sin(time * 0.4 + i * 0.7) * drift
      positions[idx+1] = this.currentPositions[idx+1] + Math.cos(time * 0.3 + i * 0.5) * drift * 0.7
      positions[idx+2] = this.currentPositions[idx+2] + Math.sin(time * 0.5 + i * 0.9) * drift
    }

    this.particles.geometry.attributes.position.needsUpdate = true
  }

  /* ── ANIMATE LOOP ── */
  _animate() {
    requestAnimationFrame(() => this._animate())
    const time = this.clock.getElapsedTime()

    // Smooth camera
    this.camera.position.lerp(this.targetCam, 0.04)
    this.camera.lookAt(this.targetLook)

    // Rotate stand gently
    if (this.standGroup.visible) {
      this.standGroup.rotation.y = Math.sin(time * 0.12) * 0.08
    }

    // Rotate panels
    if (this.panelGroup.visible) {
      this.panelGroup.rotation.y = time * 0.05
    }

    // Particle updates
    this._updateParticles(time)

    // Shader time
    this.particleMat.uniforms.uTime.value = time

    this.composer.render()
  }

  /* ── RESIZE ── */
  _onResize() {
    this.W = window.innerWidth
    this.H = window.innerHeight
    this.camera.aspect = this.W / this.H
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(this.W, this.H)
    this.composer.setSize(this.W, this.H)
    this.bloomPass.setSize(this.W, this.H)
    this.particleMat.uniforms.uPixelRatio.value = this.renderer.getPixelRatio()
  }
}

/* ─────────────────────────── SECTION SCROLL ANIMATIONS ──────────────────── */
function initScrollAnimations() {
  gsap.registerPlugin(ScrollTrigger)

  // Each section fades in its content
  document.querySelectorAll('.scene:not(#s-hero)').forEach(section => {
    const content = section.querySelector('.scene-content')
    if (!content) return

    gsap.fromTo(content,
      { opacity: 0, y: 40 },
      {
        opacity: 1, y: 0,
        duration: 1,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: section,
          start: 'top 70%',
          end: 'top 30%',
          scrub: false,
          toggleActions: 'play none none reverse',
        }
      }
    )
  })

  // Stats counter animation
  document.querySelectorAll('.stat-num').forEach(el => {
    const target = parseInt(el.textContent)
    if (isNaN(target)) return
    ScrollTrigger.create({
      trigger: el,
      start: 'top 80%',
      onEnter: () => {
        gsap.from({ val: 0 }, {
          val: target,
          duration: 1.5,
          ease: 'power2.out',
          onUpdate() { el.textContent = Math.round(this.targets()[0].val) + (el.textContent.includes('+') ? '+' : '') }
        })
      }
    })
  })

  // Project items stagger in
  gsap.fromTo('.project-item',
    { opacity: 0, y: 30 },
    {
      opacity: 1, y: 0,
      duration: 0.7,
      stagger: 0.1,
      ease: 'power3.out',
      scrollTrigger: {
        trigger: '#s-proyectos',
        start: 'top 60%',
        toggleActions: 'play none none reverse',
      }
    }
  )

  // Service items stagger in
  gsap.fromTo('.service-item',
    { opacity: 0, x: 30 },
    {
      opacity: 1, x: 0,
      duration: 0.6,
      stagger: 0.1,
      ease: 'power3.out',
      scrollTrigger: {
        trigger: '#s-servicios',
        start: 'top 65%',
        toggleActions: 'play none none reverse',
      }
    }
  )

  // Nav scroll style
  ScrollTrigger.create({
    start: 100,
    onUpdate: self => {
      const nav = document.getElementById('nav')
      if (nav) nav.style.padding = self.progress > 0 ? '1.2rem 3rem' : '2rem 3rem'
    }
  })
}

/* ─────────────────────────────────── BOOT ─────────────────────────────────── */
window.addEventListener('DOMContentLoaded', () => {
  new PassoExperience()
  initScrollAnimations()
})
