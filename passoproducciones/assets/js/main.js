import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

const SECTIONS = 6
const PARTICLE_COUNT = 6000

const CAMERA_WAYPOINTS = [
  [0,   1.2, 10,   0,  0.3, 0 ],
  [3.5, 1.5,  7,   0,  0.5, 0 ],
  [-2,  2.5,  8,   0,  0.5,-1 ],
  [0,   0.5,  4,   0,  0.5,-2 ],
  [2,   3,    8,   0,  0,   0 ],
  [0,   0.8,  9,   0,  0,   0 ],
]

const SECTION_LABELS = ['Inicio','Nosotros','Proyectos','Proceso','Servicios','Contacto']

const lerp = (a, b, t) => a + (b - a) * t
const clamp = (v, min, max) => Math.max(min, Math.min(max, v))
const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
const easeOut = t => 1 - Math.pow(1 - t, 3)

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
    this.canvas    = document.getElementById('canvas')
    this.W         = window.innerWidth
    this.H         = window.innerHeight
    this.clock     = new THREE.Clock()
    this.progress  = 0
    this.section   = 0
    this.secProg   = 0
    this.targetCam = new THREE.Vector3()
    this.targetLook= new THREE.Vector3()
    this.particleTargets = []

    // Loader first — always runs regardless of what follows
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
    const msgs   = ['Iniciando experiencia...','Cargando materiales...','Construyendo espacio...','']
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
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' })
    this.renderer.setSize(this.W, this.H)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setClearColor(0x0A0A0A, 1)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.1
  }

  _initScene() {
    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.FogExp2(0x0A0A0A, 0.04)
    this.camera = new THREE.PerspectiveCamera(55, this.W / this.H, 0.01, 200)
    const wp = CAMERA_WAYPOINTS[0]
    this.camera.position.set(wp[0], wp[1], wp[2])
    this.camera.lookAt(wp[3], wp[4], wp[5])
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

  _initPost() {
    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(this.W, this.H), 0.35, 0.5, 0.82)
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
      const iBlue = Math.random() < 0.15
      colors[i*3]   = iBlue ? 0.23 : 0.7 + Math.random() * 0.3
      colors[i*3+1] = iBlue ? 0.44 : 0.7 + Math.random() * 0.3
      colors[i*3+2] = iBlue ? 1.0  : 0.7 + Math.random() * 0.3
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
      targets[0][i*3]=(Math.random()-0.5)*5; targets[0][i*3+1]=Math.random()*3.5-0.5; targets[0][i*3+2]=(Math.random()-0.5)*4
      const col=Math.floor(t*6)
      targets[1][i*3]=(col-3)*1.1+(Math.random()-0.5)*0.3; targets[1][i*3+1]=4*(t*6-col)-2; targets[1][i*3+2]=(Math.random()-0.5)*2
      const cluster=Math.floor(t*4); const cp=[[-3,0,-2],[3,0,-2],[-3,0,2],[3,0,2]][cluster]
      targets[2][i*3]=cp[0]+(Math.random()-0.5)*2; targets[2][i*3+1]=cp[1]+(Math.random()-0.5)*2; targets[2][i*3+2]=cp[2]+(Math.random()-0.5)*2
      const w=Math.floor(Math.random()*5); let rx=0,ry=0,rz=0
      if(w===0){rx=(Math.random()-0.5)*6;ry=-1.5;rz=(Math.random()-0.5)*4}
      else if(w===1){rx=(Math.random()-0.5)*6;ry=2.5;rz=(Math.random()-0.5)*4}
      else if(w===2){rx=-3;ry=(Math.random()-0.5)*4;rz=(Math.random()-0.5)*4}
      else if(w===3){rx=3;ry=(Math.random()-0.5)*4;rz=(Math.random()-0.5)*4}
      else{rx=(Math.random()-0.5)*6;ry=(Math.random()-0.5)*4;rz=-2}
      targets[3][i*3]=rx; targets[3][i*3+1]=ry; targets[3][i*3+2]=rz
      const gx=((i%80)/79-0.5)*9; const gz=(Math.floor(i/80)/(count/80)-0.5)*9
      targets[4][i*3]=gx; targets[4][i*3+1]=Math.sin(gx*0.8)*Math.cos(gz*0.8)*0.8-0.5; targets[4][i*3+2]=gz-3
      const ring=Math.floor(t*5); const rRad=1.2+ring*0.7; const rAngle=(t*5-ring)*Math.PI*2
      targets[5][i*3]=Math.cos(rAngle)*rRad; targets[5][i*3+1]=(Math.random()-0.5)*0.4; targets[5][i*3+2]=Math.sin(rAngle)*rRad-2
    }
    this.particleTargets = targets
    this.currentPositions = new Float32Array(PARTICLE_COUNT * 3)
    for (let i = 0; i < PARTICLE_COUNT * 3; i++) this.currentPositions[i] = this.basePositions[i]
  }

  _buildStructures() {
    const mat = (col, op) => new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false })
    const wireBox = (w,h,d,pos,m) => {
      const ls = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w,h,d)), m.clone())
      ls.position.set(...pos); return ls
    }
    this.standGroup = new THREE.Group()
    const bm = mat(0x3A6FFF, 0.8)
    ;[[4,.04,3,[0,-.5,0]],[4,3,.04,[0,1,-1.5]],[.04,3,3,[-2,1,0]],[.04,3,3,[2,1,0]],
      [4,.04,3,[0,2.5,0]],[1.6,.04,.7,[0,.5,.8]],[1.6,.9,.04,[0,0,.8]],
      [.04,1.2,.4,[-.75,1.1,-1.3]],[.04,1.2,.4,[.75,1.1,-1.3]],[1.5,.02,.5,[0,1.8,-1.2]]
    ].forEach(([w,h,d,pos]) => this.standGroup.add(wireBox(w,h,d,pos,bm)))
    this.scene.add(this.standGroup)

    this.panelGroup = new THREE.Group()
    const pm = mat(0xC8C8D0, 0.35)
    for (let i=0; i<12; i++) {
      const ang=(i/12)*Math.PI*2
      const p=wireBox(1.2,2,.04,[Math.cos(ang)*4.5,(Math.random()-.5)*2,Math.sin(ang)*4.5-1],pm)
      p.rotation.y=ang; this.panelGroup.add(p)
    }
    this.panelGroup.visible=false; this.scene.add(this.panelGroup)

    this.roomGroup = new THREE.Group()
    const rm = mat(0x888899, 0.5)
    ;[[8,.04,6,[0,-2,-1]],[8,.04,6,[0,3,-1]],[.04,5,6,[-4,.5,-1]],[.04,5,6,[4,.5,-1]],
      [8,5,.04,[0,.5,-4]],[2,1.8,.04,[-2,-.6,-3.5]],[2,1.8,.04,[2,-.6,-3.5]],[3,.04,.4,[0,-.5,0]]
    ].forEach(([w,h,d,pos]) => this.roomGroup.add(wireBox(w,h,d,pos,rm)))
    this.roomGroup.visible=false; this.scene.add(this.roomGroup)
  }

  _buildGrid() {
    this.grid = new THREE.GridHelper(30, 40, 0x1a1a2e, 0x111120)
    this.grid.position.y=-2.5; this.grid.material.opacity=0.4; this.grid.material.transparent=true
    this.scene.add(this.grid)
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(60,60),
      new THREE.MeshBasicMaterial({ color:0x0A0A14, transparent:true, opacity:0.95, side:THREE.DoubleSide }))
    plane.rotation.x=-Math.PI/2; plane.position.y=-2.52; this.scene.add(plane)
  }

  _initScroll() {
    const onScroll = (progress) => { this.progress=progress; this._updateScene(progress) }
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
    const dot=document.getElementById('cursor-dot'), ring=document.getElementById('cursor-ring')
    if (!dot||!ring) return
    let mx=0,my=0,rx=0,ry=0
    window.addEventListener('mousemove', e => { mx=e.clientX; my=e.clientY })
    const tick=()=>{ rx=lerp(rx,mx,.15); ry=lerp(ry,my,.15); dot.style.transform=`translate(${mx}px,${my}px) translate(-50%,-50%)`; ring.style.transform=`translate(${rx}px,${ry}px) translate(-50%,-50%)`; requestAnimationFrame(tick) }
    tick()
  }

  _initNav() {
    document.querySelectorAll('[data-section]').forEach(el => {
      el.addEventListener('click', e => {
        e.preventDefault()
        const idx=parseInt(el.dataset.section)
        const target=(idx/(SECTIONS-1))*(document.documentElement.scrollHeight-window.innerHeight)
        if (this.lenis) this.lenis.scrollTo(target, { duration: 2 })
        else window.scrollTo({ top: target, behavior: 'smooth' })
      })
    })
    document.getElementById('contact-form')?.addEventListener('submit', e => {
      e.preventDefault()
      const btn=e.target.querySelector('.form-submit span')
      if (btn) btn.textContent='Mensaje enviado ✓'
      gsap.to(e.target, { opacity: 0.6, duration: 0.3 })
    })
  }

  _updateScene(progress) {
    const t=progress*(SECTIONS-1); const sec=Math.min(Math.floor(t),SECTIONS-1); const lp=t-Math.floor(t)
    this.section=sec; this.secProg=lp
    const fill=document.getElementById('progress-fill'); if(fill) fill.style.width=(progress*100)+'%'
    const numEl=document.getElementById('section-num'); const nameEl=document.getElementById('section-name')
    if(numEl) numEl.textContent=String(sec+1).padStart(2,'0')
    if(nameEl) nameEl.textContent=SECTION_LABELS[sec]
    this._updateCamera(t); this._updateStructures(sec,lp); this._updateLights(sec,lp)
  }

  _updateCamera(t) {
    const max=CAMERA_WAYPOINTS.length-1; const i=Math.min(Math.floor(t),max-1)
    const f=easeInOut(clamp(t-i,0,1)); const a=CAMERA_WAYPOINTS[i]; const b=CAMERA_WAYPOINTS[Math.min(i+1,max)]
    this.targetCam.set(lerp(a[0],b[0],f),lerp(a[1],b[1],f),lerp(a[2],b[2],f))
    this.targetLook.set(lerp(a[3],b[3],f),lerp(a[4],b[4],f),lerp(a[5],b[5],f))
  }

  _updateStructures(sec,lp) {
    this.standGroup.visible=sec<=1
    if(this.standGroup.visible){ const op=sec===1?easeOut(1-lp):1; this.standGroup.children.forEach(c=>{ if(c.material) c.material.opacity=op*0.8 }) }
    this.panelGroup.visible=sec===1
    if(this.panelGroup.visible){ const op=lp<.3?easeOut(lp/.3):lp>.7?easeOut((1-lp)/.3):1; this.panelGroup.children.forEach(c=>{ if(c.material) c.material.opacity=op*0.35 }) }
    this.roomGroup.visible=sec===3
    if(this.roomGroup.visible){ this.roomGroup.children.forEach((c,idx)=>{ const delay=idx/this.roomGroup.children.length; const offset=clamp((lp-delay*0.4)*3,0,1); if(c.material) c.material.opacity=(1-offset)*0.5; c.position.y+=offset*0.003*(idx%2===0?1:-1) }) }
    const gridOp=sec===0?lerp(0.4,.1,lp):sec===2?.15:sec>=4?lerp(.15,.05,lp):.2
    this.grid.material.opacity=gridOp
  }

  _updateLights(sec,lp) {
    const t=this.clock.getElapsedTime()
    this.bluePoint.position.x=Math.sin(t*.3)*5; this.bluePoint.position.y=3+Math.cos(t*.2)*2
    const bi=[3,2,4,1.5,2.5,2],ri=[.5,.3,1.5,.8,.5,.3]
    this.bluePoint.intensity=lerp(bi[sec],bi[Math.min(sec+1,SECTIONS-1)],lp)
    this.redPoint.intensity=lerp(ri[sec],ri[Math.min(sec+1,SECTIONS-1)],lp)
  }

  _updateParticles(time) {
    const positions=this.particles.geometry.attributes.position.array
    const sec=this.section,lp=this.secProg,nextSec=Math.min(sec+1,SECTIONS-1),t=easeInOut(lp)
    for(let i=0;i<PARTICLE_COUNT;i++){
      const idx=i*3
      const tx=lerp(this.particleTargets[sec][idx],this.particleTargets[nextSec][idx],t)
      const ty=lerp(this.particleTargets[sec][idx+1],this.particleTargets[nextSec][idx+1],t)
      const tz=lerp(this.particleTargets[sec][idx+2],this.particleTargets[nextSec][idx+2],t)
      this.currentPositions[idx]=lerp(this.currentPositions[idx],tx,.04)
      this.currentPositions[idx+1]=lerp(this.currentPositions[idx+1],ty,.04)
      this.currentPositions[idx+2]=lerp(this.currentPositions[idx+2],tz,.04)
      const d=0.002
      positions[idx]=this.currentPositions[idx]+Math.sin(time*.4+i*.7)*d
      positions[idx+1]=this.currentPositions[idx+1]+Math.cos(time*.3+i*.5)*d*.7
      positions[idx+2]=this.currentPositions[idx+2]+Math.sin(time*.5+i*.9)*d
    }
    this.particles.geometry.attributes.position.needsUpdate=true
  }

  _animate() {
    requestAnimationFrame(()=>this._animate())
    const time=this.clock.getElapsedTime()
    this.camera.position.lerp(this.targetCam,.04)
    this.camera.lookAt(this.targetLook)
    if(this.standGroup.visible) this.standGroup.rotation.y=Math.sin(time*.12)*.08
    if(this.panelGroup.visible) this.panelGroup.rotation.y=time*.05
    this._updateParticles(time)
    this.particleMat.uniforms.uTime.value=time
    this.composer.render()
  }

  _onResize() {
    this.W=window.innerWidth; this.H=window.innerHeight
    this.camera.aspect=this.W/this.H; this.camera.updateProjectionMatrix()
    this.renderer.setSize(this.W,this.H); this.composer.setSize(this.W,this.H)
    this.bloomPass.setSize(this.W,this.H)
    this.particleMat.uniforms.uPixelRatio.value=this.renderer.getPixelRatio()
  }
}

function initScrollAnimations() {
  gsap.registerPlugin(ScrollTrigger)
  document.querySelectorAll('.scene:not(#s-hero)').forEach(section => {
    const content=section.querySelector('.scene-content'); if(!content) return
    gsap.fromTo(content,{opacity:0,y:40},{opacity:1,y:0,duration:1,ease:'power3.out',
      scrollTrigger:{trigger:section,start:'top 70%',toggleActions:'play none none reverse'}})
  })
  document.querySelectorAll('.stat-num').forEach(el => {
    const target=parseInt(el.textContent); if(isNaN(target)) return
    ScrollTrigger.create({trigger:el,start:'top 80%',onEnter:()=>{
      gsap.from({val:0},{val:target,duration:1.5,ease:'power2.out',
        onUpdate(){ el.textContent=Math.round(this.targets()[0].val)+(el.textContent.includes('+')?'+':'') }})
    }})
  })
  gsap.fromTo('.project-item',{opacity:0,y:30},{opacity:1,y:0,duration:.7,stagger:.1,ease:'power3.out',
    scrollTrigger:{trigger:'#s-proyectos',start:'top 60%',toggleActions:'play none none reverse'}})
  gsap.fromTo('.service-item',{opacity:0,x:30},{opacity:1,x:0,duration:.6,stagger:.1,ease:'power3.out',
    scrollTrigger:{trigger:'#s-servicios',start:'top 65%',toggleActions:'play none none reverse'}})
  ScrollTrigger.create({start:100,onUpdate:self=>{
    const nav=document.getElementById('nav'); if(nav) nav.style.padding=self.progress>0?'1.2rem 3rem':'2rem 3rem'
  }})
}

window.addEventListener('DOMContentLoaded', () => {
  new PassoExperience()
  initScrollAnimations()
})