/* =========================================================
   Aether — interactions, smooth scroll & WebGL scene
   ========================================================= */
(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const hasGSAP = typeof window.gsap !== "undefined";
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];

  document.body.classList.add("is-loading");
  $("#year").textContent = new Date().getFullYear();

  // Global pointer state (normalised -1..1), shared by the 3D scene & UI
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  window.addEventListener("pointermove", (e) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
  }, { passive: true });

  /* ---------------------------------------------------------
     Smooth scroll (Lenis) + GSAP ScrollTrigger
     --------------------------------------------------------- */
  let lenis = null;
  if (hasGSAP) gsap.registerPlugin(ScrollTrigger);
  if (typeof window.Lenis !== "undefined" && !reduceMotion) {
    lenis = new Lenis({ duration: 1.25, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true });
    lenis.stop();
    if (hasGSAP) {
      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add((time) => lenis.raf(time * 1000));
      gsap.ticker.lagSmoothing(0);
    } else {
      const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }
  }

  // Anchor links glide with Lenis
  $$('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href");
      const target = id === "#top" ? document.body : $(id);
      if (!target) return;
      e.preventDefault();
      closeMenu();
      if (lenis) lenis.scrollTo(target, { offset: id === "#top" ? 0 : -40, duration: 1.6 });
      else target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
    });
  });

  /* ---------------------------------------------------------
     Navigation: hide on scroll down, mobile menu
     --------------------------------------------------------- */
  const nav = $("#nav");
  let lastY = 0;
  const onScrollNav = (y) => {
    nav.classList.toggle("is-hidden", y > lastY && y > 200);
    lastY = y;
  };
  if (lenis) lenis.on("scroll", ({ scroll }) => onScrollNav(scroll));
  else window.addEventListener("scroll", () => onScrollNav(window.scrollY), { passive: true });

  const burger = $("#burger");
  const menu = $("#mobileMenu");
  function closeMenu() {
    menu.classList.remove("is-open");
    burger.setAttribute("aria-expanded", "false");
    if (lenis && !document.body.classList.contains("is-loading")) lenis.start();
  }
  burger.addEventListener("click", () => {
    const open = !menu.classList.contains("is-open");
    menu.classList.toggle("is-open", open);
    burger.setAttribute("aria-expanded", String(open));
    if (lenis) open ? lenis.stop() : lenis.start();
  });

  /* ---------------------------------------------------------
     WebGL: iridescent noise orb + particle field
     --------------------------------------------------------- */
  const scene3D = initScene();

  function initScene() {
    if (typeof window.THREE === "undefined") return null;
    const canvas = $("#webgl");
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch (err) {
      return null;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 0, 7);

    const noiseGLSL = `
      vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
      vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
      vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
      vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
      float snoise(vec3 v){
        const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
        vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
        vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
        vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
        i=mod289(i);
        vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
        float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;
        vec4 j=p-49.0*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);
        vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);
        vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
        vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));
        vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
        vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
        vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
        p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
        vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;
        return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
      }`;

    // ---- Orb ----
    const orbUniforms = {
      uTime: { value: 0 },
      uAmp: { value: 0.28 },
      uFreq: { value: 1.05 },
      uShift: { value: 0 },
      uMouse: { value: new THREE.Vector2() },
      uHover: { value: 0 },
      uDim: { value: 0 },
    };
    const orbMat = new THREE.ShaderMaterial({
      uniforms: orbUniforms,
      vertexShader: `
        uniform float uTime, uAmp, uFreq, uHover; uniform vec2 uMouse;
        varying vec3 vNormal; varying vec3 vView; varying float vDisp; varying vec3 vPos;
        ${noiseGLSL}
        void main(){
          vec3 p = position;
          float t = uTime * 0.28;
          float n = snoise(normal * uFreq + vec3(t, t * 0.6, -t * 0.4));
          n += 0.18 * snoise(normal * uFreq * 1.9 - vec3(t * 1.2));
          // bulge toward pointer
          vec3 m = normalize(vec3(uMouse, 1.2));
          float pull = smoothstep(0.55, 1.0, dot(normal, m)) * (0.18 + uHover * 0.25);
          float d = n * (uAmp + uHover * 0.12) + pull;
          p += normal * d;
          vDisp = d; vPos = p;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vView = normalize(-mv.xyz);
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform float uTime, uShift, uDim;
        varying vec3 vNormal; varying vec3 vView; varying float vDisp; varying vec3 vPos;
        vec3 palette(float t){
          // violet -> indigo -> cyan -> pink cosine palette
          vec3 a = vec3(0.55, 0.42, 0.78);
          vec3 b = vec3(0.45, 0.40, 0.30);
          vec3 c = vec3(1.0, 1.0, 1.0);
          vec3 d = vec3(0.00, 0.25, 0.55);
          return a + b * cos(6.28318 * (c * t + d));
        }
        void main(){
          float fres = pow(1.0 - max(dot(normalize(vNormal), normalize(vView)), 0.0), 2.2);
          float t = vDisp * 1.6 + vPos.y * 0.18 + uTime * 0.04 + uShift;
          vec3 col = palette(t);
          vec3 deep = vec3(0.05, 0.03, 0.14);
          col = mix(deep, col, 0.35 + fres * 0.9);
          // soft specular band
          col += vec3(0.9, 0.85, 1.0) * pow(fres, 4.0) * 0.6;
          col += palette(t + 0.3) * smoothstep(0.15, 0.45, vDisp) * 0.35;
          col *= mix(1.0, 0.6, uDim);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const isSmall = window.innerWidth < 760;
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(1.35, isSmall ? 48 : 96), orbMat);
    scene.add(orb);

    // ---- Glow halo behind the orb ----
    const haloMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uShift: orbUniforms.uShift, uTime: orbUniforms.uTime, uDim: orbUniforms.uDim },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        varying vec2 vUv; uniform float uShift, uTime, uDim;
        void main(){
          vec2 p = vUv - 0.5; float d = length(p);
          float a = smoothstep(0.5, 0.0, d);
          float ang = atan(p.y, p.x) + uTime * 0.15 + uShift * 3.0;
          vec3 c1 = vec3(0.55, 0.36, 0.96), c2 = vec3(0.13, 0.83, 0.93), c3 = vec3(0.96, 0.45, 0.71);
          vec3 col = mix(c1, c2, 0.5 + 0.5 * sin(ang));
          col = mix(col, c3, 0.5 + 0.5 * sin(ang * 2.0 + 1.3) * 0.6);
          gl_FragColor = vec4(col, pow(a, 2.4) * 0.55 * (1.0 - uDim * 0.5));
        }`,
    });
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), haloMat);
    halo.position.z = -1.5;
    scene.add(halo);

    // ---- Orbiting ring ----
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.25, 0.008, 8, 220),
      new THREE.MeshBasicMaterial({ color: 0xb4a7ff, transparent: true, opacity: 0.35 })
    );
    ring.rotation.x = 1.25;
    scene.add(ring);
    const ring2 = ring.clone();
    ring2.material = ring.material.clone();
    ring2.material.color.set(0x67e8f9);
    ring2.material.opacity = 0.2;
    ring2.scale.setScalar(1.25);
    ring2.rotation.set(1.0, 0.5, 0);
    scene.add(ring2);

    // ---- Particles ----
    const count = isSmall ? 900 : 2200;
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const r = 3 + Math.random() * 9;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th) * 1.6;
      pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
      pos[i * 3 + 2] = r * Math.cos(ph) - 4;
      seed[i] = Math.random();
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    pGeo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    const pMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: orbUniforms.uTime, uPR: { value: renderer.getPixelRatio() } },
      vertexShader: `
        attribute float aSeed; uniform float uTime, uPR; varying float vSeed;
        void main(){
          vSeed = aSeed;
          vec3 p = position;
          p.y += sin(uTime * 0.3 + aSeed * 30.0) * 0.25;
          p.x += cos(uTime * 0.2 + aSeed * 20.0) * 0.25;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = (1.5 + aSeed * 3.0) * uPR * (8.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vSeed;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          vec3 col = mix(vec3(0.66, 0.55, 1.0), vec3(0.4, 0.9, 1.0), vSeed);
          if (vSeed > 0.85) col = vec3(1.0, 0.6, 0.85);
          gl_FragColor = vec4(col, a * 0.7);
        }`,
    });
    const particles = new THREE.Points(pGeo, pMat);
    scene.add(particles);

    const group = { orb, halo, ring, ring2 };
    const state = { scroll: 0, targetX: 0, x: 0, y: 0, scale: 1, targetScale: 1, intro: 0, hover: 0 };

    function resize() {
      const w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener("resize", resize);

    const clock = new THREE.Clock();
    let running = true;
    document.addEventListener("visibilitychange", () => { running = !document.hidden; if (running) clock.getDelta(); });

    function render() {
      requestAnimationFrame(render);
      if (!running) return;
      const dt = Math.min(clock.getDelta(), 0.05);
      const speed = reduceMotion ? 0.15 : 1;
      orbUniforms.uTime.value += dt * speed;

      pointer.sx += (pointer.x - pointer.sx) * 0.06;
      pointer.sy += (pointer.y - pointer.sy) * 0.06;
      orbUniforms.uMouse.value.set(pointer.sx, pointer.sy);

      // Hover energy: stronger when pointer near orb centre
      const near = 1 - Math.min(1, Math.hypot(pointer.x - state.x / 3, pointer.y) / 0.9);
      state.hover += (Math.max(0, near) - state.hover) * 0.05;
      orbUniforms.uHover.value = state.hover;

      // Scroll choreography
      state.x += (state.targetX - state.x) * 0.05;
      state.scale += (state.targetScale - state.scale) * 0.06;
      const s = state.scale * (0.6 + 0.4 * state.intro);
      orb.position.x = state.x;
      orb.position.y = Math.sin(orbUniforms.uTime.value * 0.6) * 0.08;
      orb.scale.setScalar(s);
      orb.rotation.y += dt * 0.12 * speed;
      orb.rotation.x = pointer.sy * 0.3;
      orb.rotation.z = -pointer.sx * 0.2;

      halo.position.x = state.x;
      halo.scale.setScalar(s * (1 + state.hover * 0.15));
      [ring, ring2].forEach((r, i) => {
        r.position.x = state.x;
        r.scale.setScalar(s * (i ? 1.25 : 1));
        r.rotation.z += dt * (i ? -0.08 : 0.12) * speed;
      });
      ring.material.opacity = 0.35 * state.intro;
      ring2.material.opacity = 0.2 * state.intro;

      particles.rotation.y = orbUniforms.uTime.value * 0.02 + pointer.sx * 0.1;
      particles.rotation.x = pointer.sy * 0.06;
      particles.position.y = state.scroll * 3;

      camera.position.x = pointer.sx * 0.25;
      camera.position.y = pointer.sy * 0.2;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    }
    render();

    return { state, uniforms: orbUniforms, group };
  }

  // Drive orb position/colour from scroll progress
  function updateSceneFromScroll() {
    if (!scene3D) return;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const y = lenis ? lenis.scroll : window.scrollY;
    const p = max > 0 ? Math.min(1, Math.max(0, y / max)) : 0;
    const wide = window.innerWidth > 1000;
    scene3D.state.scroll = p;
    scene3D.uniforms.uShift.value = p * 0.9;
    // Gentle side-to-side drift through the page
    const heroP = Math.min(1, y / window.innerHeight);
    const drift = Math.sin(p * Math.PI * 4) * (wide ? 2.6 : 0.9);
    scene3D.state.targetX = heroP * drift;
    scene3D.state.targetScale = (wide ? 1 : 0.62) * (1 - heroP * (wide ? 0.3 : 0.25));
    scene3D.uniforms.uAmp.value = 0.28 + heroP * 0.08;
    scene3D.uniforms.uDim.value = heroP * (wide ? 0.55 : 0.75);
  }
  if (lenis) lenis.on("scroll", updateSceneFromScroll);
  else window.addEventListener("scroll", updateSceneFromScroll, { passive: true });
  window.addEventListener("resize", updateSceneFromScroll);
  updateSceneFromScroll();

  /* ---------------------------------------------------------
     Preloader → intro
     --------------------------------------------------------- */
  const loader = $("#loader");
  const countEl = $("#loaderCount");
  const introStart = performance.now();
  const loadTime = reduceMotion ? 200 : 1400;
  (function tickLoader() {
    const k = Math.min(1, (performance.now() - introStart) / loadTime);
    countEl.textContent = Math.round((1 - Math.pow(1 - k, 3)) * 100);
    if (k < 1) requestAnimationFrame(tickLoader);
    else finishLoading();
  })();

  function finishLoading() {
    document.body.classList.remove("is-loading");
    if (lenis) lenis.start();
    if (!hasGSAP) {
      loader.remove();
      if (scene3D) scene3D.state.intro = 1;
      return;
    }
    const tl = gsap.timeline();
    tl.to(loader, { opacity: 0, duration: 0.8, ease: "power2.out", onComplete: () => loader.remove() })
      .to(scene3D ? scene3D.state : {}, { intro: 1, duration: 2.2, ease: "expo.out" }, 0)
      .from(".hero__title .word", { yPercent: 115, rotate: 4, duration: 1.3, ease: "expo.out", stagger: 0.06 }, 0.15)
      .from(".hero .reveal", { y: 30, opacity: 0, duration: 1.1, ease: "expo.out", stagger: 0.1 }, 0.45)
      .from(nav, { y: -40, opacity: 0, duration: 1, ease: "expo.out", clearProps: "transform" }, 0.3)
      .from(".scroll-hint", { opacity: 0, duration: 1 }, 1);
    initScrollAnimations();
  }

  /* ---------------------------------------------------------
     Scroll-driven animations
     --------------------------------------------------------- */
  function initScrollAnimations() {
    // Generic reveals (excluding hero, handled by intro)
    $$(".reveal").filter((el) => !el.closest(".hero")).forEach((el) => {
      gsap.from(el, {
        y: 60, opacity: 0, duration: 1.2, ease: "expo.out",
        scrollTrigger: { trigger: el, start: "top 88%", once: true },
      });
    });

    // Staggered cards
    [".cards .card", ".quotes .quote"].forEach((sel) => {
      const items = $$(sel);
      if (!items.length) return;
      gsap.from(items, {
        y: 80, opacity: 0, rotateX: -12, duration: 1.3, ease: "expo.out", stagger: 0.12,
        scrollTrigger: { trigger: items[0].parentElement, start: "top 82%", once: true },
      });
    });

    // Hero parallax out
    gsap.to(".hero__inner", {
      yPercent: -18, opacity: 0, ease: "none",
      scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true },
    });

    // Statement: words light up as you scroll
    const st = $("#statement");
    st.innerHTML = st.textContent.trim().split(/\s+/).map((w) => `<span class="w">${w}</span>`).join(" ");
    gsap.to($$(".w", st), {
      opacity: 1, stagger: 0.08, ease: "none",
      scrollTrigger: { trigger: st, start: "top 80%", end: "bottom 45%", scrub: true },
    });

    // Process: pinned horizontal track
    const track = $("#processTrack");
    const bar = $("#processBar");
    const distance = () => Math.max(0, track.scrollWidth - window.innerWidth);
    gsap.to(track, {
      x: () => -distance(), ease: "none",
      scrollTrigger: {
        trigger: ".process", start: "top top", end: () => "+=" + (distance() + window.innerHeight * 0.4),
        pin: ".process__pin", scrub: 1, invalidateOnRefresh: true,
        onUpdate: (self) => gsap.set(bar, { scaleX: self.progress }),
      },
    });
    gsap.from(".step", {
      opacity: 0, y: 60, stagger: 0.1, duration: 1, ease: "expo.out",
      scrollTrigger: { trigger: ".process", start: "top 70%", once: true },
    });

    // Counters
    $$("[data-count]").forEach((el) => {
      const end = parseFloat(el.dataset.count);
      const dec = parseInt(el.dataset.decimals || "0", 10);
      const suf = el.dataset.suffix || "";
      const o = { v: 0 };
      gsap.to(o, {
        v: end, duration: 2.2, ease: "expo.out",
        scrollTrigger: { trigger: el, start: "top 90%", once: true },
        onUpdate: () => { el.textContent = o.v.toFixed(dec) + suf; },
      });
    });

    // Footer wordmark rise
    gsap.from(".footer__big", {
      yPercent: 40, opacity: 0, ease: "none",
      scrollTrigger: { trigger: ".footer", start: "top bottom", end: "bottom bottom", scrub: true },
    });

    window.addEventListener("load", () => ScrollTrigger.refresh());
    document.fonts && document.fonts.ready.then(() => ScrollTrigger.refresh());
  }

  /* ---------------------------------------------------------
     Custom cursor & magnetic buttons
     --------------------------------------------------------- */
  if (finePointer && !reduceMotion) {
    const cursor = $(".cursor");
    const dot = $(".cursor__dot");
    const ring = $(".cursor__ring");
    const label = $(".cursor__label");
    const m = { x: innerWidth / 2, y: innerHeight / 2 }, r = { x: m.x, y: m.y };
    window.addEventListener("pointermove", (e) => {
      m.x = e.clientX; m.y = e.clientY;
      dot.style.transform = `translate(${m.x}px, ${m.y}px) translate(-50%, -50%)`;
    }, { passive: true });
    (function loop() {
      r.x += (m.x - r.x) * 0.16; r.y += (m.y - r.y) * 0.16;
      ring.style.transform = `translate(${r.x}px, ${r.y}px) translate(-50%, -50%)`;
      requestAnimationFrame(loop);
    })();
    document.addEventListener("pointerover", (e) => {
      const lab = e.target.closest("[data-cursor]");
      const hov = e.target.closest("a, button, summary, input, textarea, label");
      cursor.classList.toggle("is-label", !!lab);
      cursor.classList.toggle("is-hover", !lab && !!hov);
      label.textContent = lab ? lab.dataset.cursor : "";
    });
    document.addEventListener("pointerleave", () => cursor.classList.remove("is-hover", "is-label"));

    $$("[data-magnetic]").forEach((el) => {
      el.addEventListener("pointermove", (e) => {
        const b = el.getBoundingClientRect();
        const x = e.clientX - b.left - b.width / 2;
        const y = e.clientY - b.top - b.height / 2;
        el.style.transform = `translate(${x * 0.25}px, ${y * 0.35}px)`;
      });
      el.addEventListener("pointerleave", () => { el.style.transform = ""; });
    });
  }

  /* ---------------------------------------------------------
     3D tilt + spotlight on cards
     --------------------------------------------------------- */
  if (finePointer && !reduceMotion) {
    $$(".tilt").forEach((el) => {
      let raf = null;
      el.addEventListener("pointermove", (e) => {
        const b = el.getBoundingClientRect();
        const px = (e.clientX - b.left) / b.width;
        const py = (e.clientY - b.top) / b.height;
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          el.style.transition = "transform .15s ease-out, border-color .4s";
          el.style.transform = `rotateX(${(0.5 - py) * 10}deg) rotateY(${(px - 0.5) * 12}deg) translateZ(0)`;
          el.style.setProperty("--mx", px * 100 + "%");
          el.style.setProperty("--my", py * 100 + "%");
        });
      });
      el.addEventListener("pointerleave", () => {
        el.style.transition = "transform .9s cubic-bezier(.22,1,.36,1), border-color .4s";
        el.style.transform = "";
      });
    });
  }

  /* ---------------------------------------------------------
     ROI calculator
     --------------------------------------------------------- */
  const inTeam = $("#inTeam"), inHours = $("#inHours"), inRate = $("#inRate");
  const resMoney = $("#resMoney"), resHours = $("#resHours"), resFte = $("#resFte");
  const fmt = new Intl.NumberFormat("en-US");
  const shown = { money: 0, hours: 0, fte: 0 };
  function calc() {
    [inTeam, inHours, inRate].forEach((i) => {
      i.style.setProperty("--fill", ((i.value - i.min) / (i.max - i.min)) * 100 + "%");
    });
    $("#outTeam").textContent = inTeam.value;
    $("#outHours").textContent = inHours.value;
    $("#outRate").textContent = inRate.value;
    const hours = inTeam.value * inHours.value * 48 * 0.7;
    const money = hours * inRate.value;
    const fte = hours / 1760;
    const apply = () => {
      resMoney.textContent = "$" + fmt.format(Math.round(shown.money));
      resHours.textContent = fmt.format(Math.round(shown.hours));
      resFte.textContent = shown.fte.toFixed(1);
    };
    if (hasGSAP && !reduceMotion) gsap.to(shown, { money, hours, fte, duration: 0.8, ease: "expo.out", overwrite: true, onUpdate: apply });
    else { Object.assign(shown, { money, hours, fte }); apply(); }
  }
  [inTeam, inHours, inRate].forEach((i) => i.addEventListener("input", calc));
  calc();

  /* ---------------------------------------------------------
     Pricing toggle
     --------------------------------------------------------- */
  const toggleBtns = $$(".toggle__btn");
  const pill = $(".toggle__pill");
  function placePill(btn) {
    pill.style.width = btn.offsetWidth + "px";
    pill.style.transform = `translateX(${btn.offsetLeft - 5}px)`;
  }
  toggleBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      toggleBtns.forEach((b) => b.classList.toggle("is-active", b === btn));
      placePill(btn);
      const mode = btn.dataset.billing;
      $$(".plan__price [data-" + mode + "]").forEach((el) => {
        const next = el.dataset[mode];
        if (!hasGSAP || reduceMotion) { el.textContent = next; return; }
        gsap.to(el, { y: -14, opacity: 0, duration: 0.2, ease: "power2.in", onComplete: () => {
          el.textContent = next;
          gsap.fromTo(el, { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: "expo.out" });
        }});
      });
    });
  });
  const placeActive = () => placePill($(".toggle__btn.is-active"));
  placeActive();
  window.addEventListener("resize", placeActive);
  document.fonts && document.fonts.ready.then(placeActive);

  /* ---------------------------------------------------------
     FAQ: smooth accordion (one open at a time)
     --------------------------------------------------------- */
  $$(".faq__item").forEach((item) => {
    const summary = $("summary", item);
    const body = $(".faq__body", item);
    summary.addEventListener("click", (e) => {
      if (!hasGSAP || reduceMotion) return;
      e.preventDefault();
      const opening = !item.open;
      if (opening) {
        $$(".faq__item[open]").forEach((other) => { if (other !== item) closeItem(other); });
        item.open = true;
        gsap.fromTo(body, { height: 0, opacity: 0 }, { height: "auto", opacity: 1, duration: 0.6, ease: "expo.out", onComplete: refreshST });
      } else closeItem(item);
    });
  });
  function closeItem(item) {
    const body = $(".faq__body", item);
    gsap.to(body, { height: 0, opacity: 0, duration: 0.45, ease: "power3.inOut", onComplete: () => { item.open = false; body.style.height = ""; body.style.opacity = ""; refreshST(); } });
  }
  function refreshST() { if (hasGSAP) ScrollTrigger.refresh(); }

  /* ---------------------------------------------------------
     Contact form (front-end validation; wire up a backend
     by setting FORM_ENDPOINT, e.g. a Formspree URL)
     --------------------------------------------------------- */
  const FORM_ENDPOINT = ""; // e.g. "https://formspree.io/f/xxxxxxx"
  const form = $("#contactForm");
  const status = $("#formStatus");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    status.className = "form__status";
    let ok = true;
    ["name", "email"].forEach((n) => {
      const input = form.elements[n];
      const valid = input.value.trim() && (n !== "email" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value));
      input.closest(".field").classList.toggle("is-invalid", !valid);
      if (!valid) ok = false;
    });
    if (!ok) {
      status.textContent = "Please add your name and a valid email.";
      status.classList.add("is-err");
      if (hasGSAP) gsap.fromTo(form, { x: -8 }, { x: 0, duration: 0.6, ease: "elastic.out(1, 0.3)" });
      return;
    }
    const btn = $("button[type=submit]", form);
    btn.disabled = true;
    status.textContent = "Sending…";
    try {
      if (FORM_ENDPOINT) {
        const res = await fetch(FORM_ENDPOINT, { method: "POST", body: new FormData(form), headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error("Request failed");
      } else {
        await new Promise((r) => setTimeout(r, 900)); // demo mode
      }
      form.reset();
      status.textContent = "Thanks! We'll be in touch within one business day.";
      status.classList.add("is-ok");
    } catch (err) {
      status.textContent = "Something went wrong — please email us directly.";
      status.classList.add("is-err");
    } finally {
      btn.disabled = false;
    }
  });
})();
