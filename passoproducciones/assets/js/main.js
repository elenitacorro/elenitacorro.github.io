import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

const SECTIONS = 6
const PARTICLE_COUNT = 6000

// Camera path: each waypoint = [posX,posY,posZ, lookX,lookY,lookZ]
const CAMERA_WAYPOINTS = [
  [ 0,   2.0, 10,   0,  0.5, 0 ],
  [-4,   5.0,  5,   0, -0.5, 0 ],
  [ 0,   3.0,  8,   0,  0.0, 0 ],
  [-3,   1.0,  6,   0,  0.5,-1 ],
  [ 3.5, 2.5,  9,   0,  0.5, 0 ],
  [ 0,   1.5,  9,   0,  0.2, 0 ],
]

const SECTION_LABELS = ['Inicio','Nosotros','Proyectos','Proceso','Servicios','Contacto']

const lerp = (a, b, t) => a + (b - a) * t
const clamp = (v, min, max) => Math.max(min, Math.min(max, v))
const easeInOut = t => t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2)/2
const easeOut = t => 1 - Math.pow(1-t, 3)

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

class PassoExperience {
  constructor() {
    this.canvas     = document.getElementById('canvas')
    this.W          = window.innerWidth
    this.H          = window.innerHeight
    this.clock      = new THREE.Clock()
    this.progress   = 0
    this.section    = 0
    this.secProg    = 0
    this.targetCam  = new THREE.Vector3()
    this.targetLook = new THREE.Vector3()
    this.particleTargets = []

    this._showLoader()
    this._initRenderer()
    this._initScene()
    this._initPost()
    this._buildParticles()
    this._buildStructures()
    this._buildGrid()
    this._initScroll()
    this._initCursor()
    this._initNav()
    this._animate()
    this._onResize()
    window.addEventListener('resize', () => this._onResize())
  }

  _showLoader() {
    const fill   = document.getElementById('loader-fill')
    const text   = document.getElementById('loader-text')
    const loader = document.getElementById('loader')
    const msgs   = ['Preparando planos...','Cargando materiales...','Construyendo espacio...','']
    let p = 0
    const interval = setInterval(() => {
      p += Math.random() * 12 + 5
      if (p >= 100) { p = 100; clearInterval(interval) }
      if (fill) fill.style.width = p + '%'
      if (text) text.textContent = msgs[Math.floor((p / 100) * (msgs.length - 1))]
      if (p >= 100) {
        setTimeout(() => {
          if (loader) loader.classList.add('hidden')
          if (this.camera) gsap.from(this.camera.position, { z: '+=3', duration: 3, ease: 'power2.out' })
        }, 400)
      }
    }, 120)
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas, antialias: true, powerPreference: 'high-performance'
    })
    this.renderer.setSize(this.W, this.H)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setClearColor(0x0A0A0A, 1)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.2
  }

  _initScene() {
    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.FogExp2(0x0A0A0A, 0.032)
    this.camera = new THREE.PerspectiveCamera(52, this.W / this.H, 0.01, 200)
    const wp = CAMERA_WAYPOINTS[0]
    this.camera.position.set(wp[0], wp[1], wp[2])
    this.camera.lookAt(wp[3], wp[4], wp[5])

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.06))
    this.dirLight = new THREE.DirectionalLight(0xffffff, 0.6)
    this.dirLight.position.set(5, 8, 5)
    this.scene.add(this.dirLight)
    this.bluePoint = new THREE.PointLight(0x3A6FFF, 4, 22)
    this.bluePoint.position.set(-4, 4, 4)
    this.scene.add(this.bluePoint)
    this.redPoint = new THREE.PointLight(0xFF2222, 1.2, 14)
    this.redPoint.position.set(4, -2, 2)
    this.scene.add(this.redPoint)
    this.fillLight = new THREE.PointLight(0x4466AA, 0.8, 18)
    this.fillLight.position.set(0, 3, 7)
    this.scene.add(this.fillLight)
  }

  _initPost() {
    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(this.W, this.H), 0.45, 0.55, 0.78)
    this.composer.addPass(this.bloomPass)
    this.composer.addPass(new OutputPass())
  }

  _buildParticles() {
    const count = PARTICLE_COUNT
    const positions = new Float32Array(count * 3)
    const sizes     = new Float32Array(count)
    const alphas    = new Float32Array(count)
    const colors    = new Float32Array(count * 3)

    for (let i = 0; i < count; i++) {
      const r = 12 + Math.random() * 6
      const theta = Math.random() * Math.PI * 2
      const phi   = Math.acos(2 * Math.random() - 1)
      positions[i*3]   = r * Math.sin(phi) * Math.cos(theta)
      positions[i*3+1] = r * Math.sin(phi) * Math.sin(theta)
      positions[i*3+2] = r * Math.cos(phi)
      sizes[i]  = 0.5 + Math.random() * 1.5
      alphas[i] = 0.15 + Math.random() * 0.6
      const iBlue = Math.random() < 0.18
      colors[i*3]   = iBlue ? 0.23 : 0.72 + Math.random() * 0.28
      colors[i*3+1] = iBlue ? 0.44 : 0.72 + Math.random() * 0.28
      colors[i*3+2] = iBlue ? 1.0  : 0.72 + Math.random() * 0.28
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('aSize',    new THREE.BufferAttribute(sizes, 1))
    geo.setAttribute('aAlpha',   new THREE.BufferAttribute(alphas, 1))
    geo.setAttribute('aColor',   new THREE.BufferAttribute(colors, 3))

    this.particleMat = new THREE.ShaderMaterial({
      vertexShader: particleVert, fragmentShader: particleFrag,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uPixelRatio: { value: this.renderer.getPixelRatio() } }
    })

    this.particles = new THREE.Points(geo, this.particleMat)
    this.scene.add(this.particles)
    this.basePositions = positions.slice()
    this._buildParticleTargets()
  }

  _buildParticleTargets() {
    const count = PARTICLE_COUNT
    const targets = []
    for (let s = 0; s < SECTIONS; s++) targets.push(new Float32Array(count * 3))

    for (let i = 0; i < count; i++) {
      const t = i / count

      // 0 — HERO: gondola array — retail shelving rows seen at 3/4 angle
      {
        const rows = 5, cols = 5, levels = 4
        const rowIdx   = Math.floor(t * rows)
        const inRow    = t * rows - rowIdx
        const colIdx   = Math.floor(inRow * cols)
        const inCol    = inRow * cols - colIdx
        const levelIdx = Math.floor(inCol * levels)
        targets[0][i*3]   = (colIdx - 2) * 2.2 + (Math.random()-0.5) * 2.0
        targets[0][i*3+1] = levelIdx * 0.55 - 0.85 + (Math.random()-0.5) * 0.18
        targets[0][i*3+2] = (rowIdx - 2) * 1.8 + (Math.random()-0.5) * 0.35
      }

      // 1 — NOSOTROS: store floor plan — top-down aisle layout
      {
        if (Math.random() < 0.45) {
          if (Math.random() < 0.5) {
            const ax = (Math.floor(Math.random() * 5) - 2) * 1.9
            targets[1][i*3]   = ax + (Math.random()-0.5) * 0.12
            targets[1][i*3+1] = -2.0
            targets[1][i*3+2] = (Math.random()-0.5) * 7
          } else {
            const az = (Math.floor(Math.random() * 4) - 1.5) * 1.5
            targets[1][i*3]   = (Math.random()-0.5) * 8
            targets[1][i*3+1] = -2.0
            targets[1][i*3+2] = az + (Math.random()-0.5) * 0.12
          }
        } else {
          const sx = (Math.floor(Math.random() * 4) - 1.5) * 1.9
          const sz = (Math.floor(Math.random() * 3) - 1) * 1.5
          targets[1][i*3]   = sx + (Math.random()-0.5) * 1.6
          targets[1][i*3+1] = -2.0 + (Math.random()-0.5) * 0.08
          targets[1][i*3+2] = sz + (Math.random()-0.5) * 1.2
        }
      }

      // 2 — PROYECTOS: 4 project type clusters with distinct shapes
      {
        const cluster = Math.floor(t * 4)
        const centers = [[-3.5,0,-2],[3.5,0,-2],[-3.5,0,2],[3.5,0,2]]
        const cp = centers[cluster]
        if (cluster === 0) {
          // Supermercados: large rectangular spread
          targets[2][i*3]   = cp[0] + (Math.random()-0.5) * 3.0
          targets[2][i*3+1] = cp[1] + (Math.random()-0.5) * 0.6
          targets[2][i*3+2] = cp[2] + (Math.random()-0.5) * 2.2
        } else if (cluster === 1) {
          // Retail textil: vertical shelf bands
          const band = Math.floor(Math.random() * 5) - 2
          targets[2][i*3]   = cp[0] + band * 0.35 + (Math.random()-0.5) * 0.15
          targets[2][i*3+1] = cp[1] + (Math.random()-0.5) * 1.8
          targets[2][i*3+2] = cp[2] + (Math.random()-0.5) * 0.5
        } else if (cluster === 2) {
          // Gastronomia: circular arrangement
          const ang = Math.random() * Math.PI * 2
          const rad = 0.5 + Math.random() * 1.0
          targets[2][i*3]   = cp[0] + Math.cos(ang) * rad
          targets[2][i*3+1] = cp[1] + (Math.random()-0.5) * 0.7
          targets[2][i*3+2] = cp[2] + Math.sin(ang) * rad
        } else {
          // Automotriz: precision showroom grid
          const gx = (Math.floor(Math.random() * 4) - 1.5) * 0.65
          const gz = (Math.floor(Math.random() * 3) - 1) * 0.55
          targets[2][i*3]   = cp[0] + gx + (Math.random()-0.5) * 0.2
          targets[2][i*3+1] = cp[1] + (Math.random()-0.5) * 0.5
          targets[2][i*3+2] = cp[2] + gz + (Math.random()-0.5) * 0.2
        }
      }

      // 3 — PROCESO: left-to-right assembly sequence — scattered to precise
      {
        const stage  = Math.floor(t * 4)
        const stageX = [-4.5, -1.5, 1.5, 4.5][stage]
        const scatter= [1.8, 1.1, 0.55, 0.22][stage]
        if (stage <= 1) {
          targets[3][i*3]   = stageX + (Math.random()-0.5) * scatter * 2.5
          targets[3][i*3+1] = (Math.random()-0.5) * scatter * 2
          targets[3][i*3+2] = (Math.random()-0.5) * scatter * 3
        } else if (stage === 2) {
          const gx = (Math.floor(Math.random() * 6) - 2.5) * 0.5
          const gy = (Math.floor(Math.random() * 4) - 1.5) * 0.55
          targets[3][i*3]   = stageX + gx + (Math.random()-0.5) * 0.2
          targets[3][i*3+1] = gy
          targets[3][i*3+2] = (Math.random()-0.5) * scatter * 2
        } else {
          const row   = Math.floor(Math.random() * 3) - 1
          const level = Math.floor(Math.random() * 3) - 1
          targets[3][i*3]   = stageX + (Math.random()-0.5) * 2.0
          targets[3][i*3+1] = level * 0.6 + (Math.random()-0.5) * 0.15
          targets[3][i*3+2] = row   * 0.8 + (Math.random()-0.5) * 0.2
        }
      }

      // 4 — SERVICIOS: commercial building structural skeleton
      {
        const elem = Math.floor(Math.random() * 4)
        if (elem === 0) {
          const cx = (Math.floor(Math.random() * 5) - 2) * 1.8
          const cz = (Math.floor(Math.random() * 4) - 1.5) * 1.6
          targets[4][i*3]   = cx + (Math.random()-0.5) * 0.1
          targets[4][i*3+1] = (Math.random()-0.5) * 4.5
          targets[4][i*3+2] = cz + (Math.random()-0.5) * 0.1
        } else if (elem === 1) {
          const floor = Math.floor(Math.random() * 3) - 1
          targets[4][i*3]   = (Math.random()-0.5) * 9
          targets[4][i*3+1] = floor * 1.5 + 0.5
          targets[4][i*3+2] = (Math.random()-0.5) * 7
        } else if (elem === 2) {
          targets[4][i*3]   = (Math.random()-0.5) * 9
          targets[4][i*3+1] = -1.8 + (Math.random()-0.5) * 0.06
          targets[4][i*3+2] = (Math.random()-0.5) * 7
        } else {
          if (Math.random() < 0.5) {
            targets[4][i*3]   = (Math.random() < 0.5 ? -4.2 : 4.2) + (Math.random()-0.5)*0.08
            targets[4][i*3+1] = (Math.random()-0.5) * 4.5
            targets[4][i*3+2] = (Math.random()-0.5) * 7
          } else {
            targets[4][i*3]   = (Math.random()-0.5) * 9
            targets[4][i*3+1] = (Math.random()-0.5) * 4.5
            targets[4][i*3+2] = (Math.random() < 0.5 ? -3.2 : 3.2) + (Math.random()-0.5)*0.08
          }
        }
      }

      // 5 — CONTACTO: concentric rings
      {
        const ring   = Math.floor(t * 5)
        const rRad   = 0.9 + ring * 0.9
        const rAngle = (t * 5 - ring) * Math.PI * 2
        targets[5][i*3]   = Math.cos(rAngle) * rRad
        targets[5][i*3+1] = (Math.random()-0.5) * 0.3
        targets[5][i*3+2] = Math.sin(rAngle) * rRad - 1.5
      }
    }

    this.particleTargets = targets
    this.currentPositions = new Float32Array(PARTICLE_COUNT * 3)
    for (let i = 0; i < PARTICLE_COUNT * 3; i++) this.currentPositions[i] = this.basePositions[i]
  }

  _buildStructures() {
    const mat = (col, op) => new THREE.LineBasicMaterial({
      color: col, transparent: true, opacity: op, depthWrite: false
    })
    const wireBox = (w, h, d, pos, m) => {
      const ls = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), m.clone()
      )
      ls.position.set(...pos)
      return ls
    }

    // ── GONDOLA GROUP: retail shelving array (Hero + Nosotros)
    this.gondolaGroup = new THREE.Group()
    const gm = mat(0x3A6FFF, 0.6)
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 4; col++) {
        const x = (col - 1.5) * 2.4
        const z = (row - 1) * 2.0
        this.gondolaGroup.add(wireBox(1.95, 2.3,  0.55, [x, 0,     z], gm))
        this.gondolaGroup.add(wireBox(1.82, 0.03, 0.5,  [x, -0.72, z], gm))
        this.gondolaGroup.add(wireBox(1.82, 0.03, 0.5,  [x,  0,    z], gm))
        this.gondolaGroup.add(wireBox(1.82, 0.03, 0.5,  [x,  0.72, z], gm))
      }
    }
    this.scene.add(this.gondolaGroup)

    // ── FLOOR PLAN GROUP: store layout grid (Nosotros + Proyectos)
    this.floorPlanGroup = new THREE.Group()
    const fm = mat(0x5A8FFF, 0.22)
    for (let i = 0; i < 5; i++) {
      const x = (i - 2) * 1.9
      this.floorPlanGroup.add(wireBox(0.02, 0.02, 9.5, [x, -2.48, 0], fm))
    }
    for (let j = 0; j < 5; j++) {
      const z = (j - 2) * 1.55
      this.floorPlanGroup.add(wireBox(9.5, 0.02, 0.02, [0, -2.48, z], fm))
    }
    this.floorPlanGroup.visible = false
    this.scene.add(this.floorPlanGroup)

    // ── BUILDING SKELETON GROUP: structural frame (Servicios)
    this.buildingGroup = new THREE.Group()
    const sm = mat(0x7788AA, 0.35)
    const colPos = [[-3.6,-1.9],[3.6,-1.9],[-3.6,1.9],[3.6,1.9],[0,-1.9],[0,1.9],[-3.6,0],[3.6,0]]
    colPos.forEach(([cx, cz]) => {
      this.buildingGroup.add(wireBox(0.2, 5.0, 0.2, [cx, 0.2, cz], sm))
    })
    for (let level = 0; level < 3; level++) {
      const ly = -1.6 + level * 1.7
      this.buildingGroup.add(wireBox(8.2, 0.12, 0.12, [0,  ly, -1.9], sm))
      this.buildingGroup.add(wireBox(8.2, 0.12, 0.12, [0,  ly,  1.9], sm))
      this.buildingGroup.add(wireBox(0.12, 0.12, 4.2, [-3.6, ly, 0], sm))
      this.buildingGroup.add(wireBox(0.12, 0.12, 4.2, [ 3.6, ly, 0], sm))
    }
    this.buildingGroup.visible = false
    this.scene.add(this.buildingGroup)
  }

  _buildGrid() {
    this.grid = new THREE.GridHelper(32, 42, 0x1a1a2e, 0x111122)
    this.grid.position.y = -2.55
    this.grid.material.opacity = 0.35
    this.grid.material.transparent = true
    this.scene.add(this.grid)
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshBasicMaterial({ color: 0x0A0A14, transparent: true, opacity: 0.95, side: THREE.DoubleSide })
    )
    plane.rotation.x = -Math.PI / 2
    plane.position.y = -2.57
    this.scene.add(plane)
  }

  _initScroll() {
    const onScroll = (progress) => { this.progress = progress; this._updateScene(progress) }
    if (typeof Lenis !== 'undefined') {
      this.lenis = new Lenis({ lerp: 0.08 })
      this.lenis.on('scroll', ({ progress }) => onScroll(progress))
      gsap.ticker.add(time => this.lenis.raf(time * 1000))
      gsap.ticker.lagSmoothing(0)
    } else {
      window.addEventListener('scroll', () => {
        const max = document.documentElement.scrollHeight - window.innerHeight
        if (max > 0) onScroll(window.scrollY / max)
      }, { passive: true })
    }
  }

  _initCursor() {
    const dot  = document.getElementById('cursor-dot')
    const ring = document.getElementById('cursor-ring')
    if (!dot || !ring) return
    let mx = 0, my = 0, rx = 0, ry = 0
    window.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY })
    const tick = () => {
      rx = lerp(rx, mx, 0.15); ry = lerp(ry, my, 0.15)
      dot.style.transform  = `translate(${mx}px,${my}px) translate(-50%,-50%)`
      ring.style.transform = `translate(${rx}px,${ry}px) translate(-50%,-50%)`
      requestAnimationFrame(tick)
    }
    tick()
  }

  _initNav() {
    document.querySelectorAll('[data-section]').forEach(el => {
      el.addEventListener('click', e => {
        e.preventDefault()
        const idx    = parseInt(el.dataset.section)
        const totalH = document.documentElement.scrollHeight - window.innerHeight
        const target = (idx / (SECTIONS - 1)) * totalH
        if (this.lenis) this.lenis.scrollTo(target, { duration: 2 })
        else window.scrollTo({ top: target, behavior: 'smooth' })
      })
    })
    document.getElementById('contact-form')?.addEventListener('submit', e => {
      e.preventDefault()
      const btn = e.target.querySelector('.form-submit span')
      if (btn) btn.textContent = 'Mensaje enviado ✓'
      gsap.to(e.target, { opacity: 0.6, duration: 0.3 })
    })
  }

  _updateScene(progress) {
    const t   = progress * (SECTIONS - 1)
    const sec = Math.min(Math.floor(t), SECTIONS - 1)
    const lp  = t - Math.floor(t)
    this.section = sec; this.secProg = lp

    const fill = document.getElementById('progress-fill')
    if (fill) fill.style.width = (progress * 100) + '%'
    const numEl  = document.getElementById('section-num')
    const nameEl = document.getElementById('section-name')
    if (numEl)  numEl.textContent  = String(sec + 1).padStart(2, '0')
    if (nameEl) nameEl.textContent = SECTION_LABELS[sec]

    this._updateCamera(t)
    this._updateStructures(sec, lp)
    this._updateLights(sec, lp)
  }

  _updateCamera(t) {
    const max = CAMERA_WAYPOINTS.length - 1
    const i   = Math.min(Math.floor(t), max - 1)
    const f   = easeInOut(clamp(t - i, 0, 1))
    const a   = CAMERA_WAYPOINTS[i]
    const b   = CAMERA_WAYPOINTS[Math.min(i + 1, max)]
    this.targetCam.set(lerp(a[0],b[0],f), lerp(a[1],b[1],f), lerp(a[2],b[2],f))
    this.targetLook.set(lerp(a[3],b[3],f), lerp(a[4],b[4],f), lerp(a[5],b[5],f))
  }

  _updateStructures(sec, lp) {
    this.gondolaGroup.visible = sec <= 1
    if (this.gondolaGroup.visible) {
      const op = sec === 1 ? easeOut(1 - lp) : 1
      this.gondolaGroup.traverse(c => { if (c.material) c.material.opacity = op * 0.6 })
    }

    this.floorPlanGroup.visible = sec >= 1 && sec <= 2
    if (this.floorPlanGroup.visible) {
      const op = sec === 1 ? easeOut(lp) : easeOut(1 - lp)
      this.floorPlanGroup.traverse(c => { if (c.material) c.material.opacity = op * 0.22 })
    }

    this.buildingGroup.visible = sec === 4
    if (this.buildingGroup.visible) {
      const op = lp < 0.3 ? easeOut(lp / 0.3) : lp > 0.7 ? easeOut((1 - lp) / 0.3) : 1
      this.buildingGroup.traverse(c => { if (c.material) c.material.opacity = op * 0.35 })
    }

    const gridOp = sec === 0 ? lerp(0.35, 0.12, lp) : sec === 2 ? 0.18 : sec >= 4 ? lerp(0.15, 0.05, lp) : 0.18
    this.grid.material.opacity = gridOp
  }

  _updateLights(sec, lp) {
    const t = this.clock.getElapsedTime()
    this.bluePoint.position.x = Math.sin(t * 0.28) * 5
    this.bluePoint.position.y = 3 + Math.cos(t * 0.18) * 2
    const bi = [4, 2.5, 5, 1.5, 3, 2]
    const ri = [0.5, 0.3, 1.5, 0.8, 0.5, 0.3]
    this.bluePoint.intensity = lerp(bi[sec], bi[Math.min(sec+1, SECTIONS-1)], lp)
    this.redPoint.intensity  = lerp(ri[sec], ri[Math.min(sec+1, SECTIONS-1)], lp)
  }

  _updateParticles(time) {
    const positions = this.particles.geometry.attributes.position.array
    const sec     = this.section
    const lp      = this.secProg
    const nextSec = Math.min(sec + 1, SECTIONS - 1)
    const t = easeInOut(lp)
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const idx = i * 3
      const tx = lerp(this.particleTargets[sec][idx],   this.particleTargets[nextSec][idx],   t)
      const ty = lerp(this.particleTargets[sec][idx+1], this.particleTargets[nextSec][idx+1], t)
      const tz = lerp(this.particleTargets[sec][idx+2], this.particleTargets[nextSec][idx+2], t)
      this.currentPositions[idx]   = lerp(this.currentPositions[idx],   tx, 0.04)
      this.currentPositions[idx+1] = lerp(this.currentPositions[idx+1], ty, 0.04)
      this.currentPositions[idx+2] = lerp(this.currentPositions[idx+2], tz, 0.04)
      const d = 0.0015
      positions[idx]   = this.currentPositions[idx]   + Math.sin(time*0.4+i*0.7)*d
      positions[idx+1] = this.currentPositions[idx+1] + Math.cos(time*0.3+i*0.5)*d*0.7
      positions[idx+2] = this.currentPositions[idx+2] + Math.sin(time*0.5+i*0.9)*d
    }
    this.particles.geometry.attributes.position.needsUpdate = true
  }

  _animate() {
    requestAnimationFrame(() => this._animate())
    const time = this.clock.getElapsedTime()
    this.camera.position.lerp(this.targetCam, 0.035)
    this.camera.lookAt(this.targetLook)
    if (this.gondolaGroup.visible)  this.gondolaGroup.rotation.y  = Math.sin(time * 0.1) * 0.06
    if (this.floorPlanGroup.visible) this.floorPlanGroup.rotation.y = time * 0.015
    if (this.buildingGroup.visible)  this.buildingGroup.rotation.y  = Math.sin(time * 0.07) * 0.04
    this._updateParticles(time)
    this.particleMat.uniforms.uTime.value = time
    this.composer.render()
  }

  _onResize() {
    this.W = window.innerWidth; this.H = window.innerHeight
    this.camera.aspect = this.W / this.H
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(this.W, this.H)
    this.composer.setSize(this.W, this.H)
    this.bloomPass.setSize(this.W, this.H)
    this.particleMat.uniforms.uPixelRatio.value = this.renderer.getPixelRatio()
  }
}

function initScrollAnimations() {
  gsap.registerPlugin(ScrollTrigger)
  document.querySelectorAll('.scene:not(#s-hero)').forEach(section => {
    const content = section.querySelector('.scene-content')
    if (!content) return
    gsap.fromTo(content, { opacity: 0, y: 40 }, {
      opacity: 1, y: 0, duration: 1, ease: 'power3.out',
      scrollTrigger: { trigger: section, start: 'top 70%', toggleActions: 'play none none reverse' }
    })
  })
  document.querySelectorAll('.stat-num').forEach(el => {
    const raw    = el.textContent.replace(/\D/g, '')
    const target = parseInt(raw)
    const suffix = el.textContent.includes('+') ? '+' : ''
    if (isNaN(target)) return
    ScrollTrigger.create({ trigger: el, start: 'top 80%',
      onEnter: () => {
        gsap.from({ val: 0 }, { val: target, duration: 2, ease: 'power2.out',
          onUpdate() { el.textContent = Math.round(this.targets()[0].val) + suffix }
        })
      }
    })
  })
  gsap.fromTo('.project-item', { opacity: 0, y: 30 }, {
    opacity: 1, y: 0, duration: 0.7, stagger: 0.1, ease: 'power3.out',
    scrollTrigger: { trigger: '#s-proyectos', start: 'top 60%', toggleActions: 'play none none reverse' }
  })
  gsap.fromTo('.service-item', { opacity: 0, x: 30 }, {
    opacity: 1, x: 0, duration: 0.6, stagger: 0.1, ease: 'power3.out',
    scrollTrigger: { trigger: '#s-servicios', start: 'top 65%', toggleActions: 'play none none reverse' }
  })
  ScrollTrigger.create({ start: 100,
    onUpdate: self => {
      const nav = document.getElementById('nav')
      if (nav) nav.style.padding = self.progress > 0 ? '1.2rem 3rem' : '2rem 3rem'
    }
  })
}

window.addEventListener('DOMContentLoaded', () => {
  new PassoExperience()
  initScrollAnimations()
})