/* =========================================================
   Aether — 3D service showcase, theme morphing,
   smooth scroll & page interactions
   ========================================================= */
(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const hasGSAP = typeof window.gsap !== "undefined";
  const hasTHREE = typeof window.THREE !== "undefined";
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const fmt = new Intl.NumberFormat("en-US");
  const money = (n) => "$" + fmt.format(Math.round(n));

  document.body.classList.add("is-loading");
  $("#year").textContent = new Date().getFullYear();

  /* ---------------------------------------------------------
     Services shown in the hero carousel ("products")
     --------------------------------------------------------- */
  const SLIDES = [
    {
      short: "AI Agents", kicker: "AI Agents & Chatbots",
      title: ["Answers that", "never sleep"],
      text: "Custom AI assistants trained on your products, policies and FAQs. They reply to customers in seconds, qualify leads and book appointments around the clock on your website, WhatsApp or Instagram.",
      prices: [[149, 199], [349, 469], [749, 999]],
      theme: { base: "#e06b12", light: "#f7963a", dark: "#9a4207", deep: "#5c2604" },
      obj: { color: "#ff7d1f", sheen: "#ffc58f", accent: "#ffffff" },
      model: "chat",
    },
    {
      short: "Workflows", kicker: "Workflow Automation",
      title: ["Work that", "runs itself"],
      text: "We connect your CRM, inbox, spreadsheets and payment tools so information moves on its own. Fewer manual steps, fewer errors, and hours returned to your team every week.",
      prices: [[149, 199], [349, 469], [749, 999]],
      theme: { base: "#3b3b3e", light: "#5f5f64", dark: "#1f1f21", deep: "#121213" },
      obj: { color: "#2a2a2e", sheen: "#9a9aa3", accent: "#ededee" },
      model: "gear",
    },
    {
      short: "Voice AI", kicker: "Voice AI Receptionist",
      title: ["Every call,", "answered"],
      text: "A natural-sounding AI receptionist that answers instantly, handles common questions, books appointments and passes urgent calls to the right person, day or night.",
      prices: [[199, 259], [399, 529], [799, 1049]],
      theme: { base: "#a8121d", light: "#d42a35", dark: "#5e0910", deep: "#36050a" },
      obj: { color: "#e3192b", sheen: "#ff8a94", accent: "#ffffff" },
      model: "mic",
    },
    {
      short: "Insights", kicker: "AI Insights & Reporting",
      title: ["Numbers that", "talk back"],
      text: "Automated reports that turn your sales, marketing and operations data into a clear daily summary of what changed, why it matters and what to do next.",
      prices: [[149, 199], [349, 469], [749, 999]],
      theme: { base: "#8f9398", light: "#c3c6ca", dark: "#575b60", deep: "#2f3236" },
      obj: { color: "#f4f4f4", sheen: "#ffffff", accent: "#2d2d31" },
      model: "chart",
    },
  ];
  const N = SLIDES.length;
  let current = 0;
  let sizeIdx = 0;

  // Global pointer (normalised -1..1)
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  window.addEventListener("pointermove", (e) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
  }, { passive: true });

  /* ---------------------------------------------------------
     Theme morphing — writes RGB triplets into CSS variables
     --------------------------------------------------------- */
  const root = document.documentElement;
  const metaTheme = $('meta[name="theme-color"]');
  const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const themeNow = {};
  const KEYS = ["base", "light", "dark", "deep"];
  function writeTheme(t) {
    KEYS.forEach((k) => root.style.setProperty("--t-" + k, t[k].map(Math.round).join(" ")));
  }
  KEYS.forEach((k) => (themeNow[k] = hexToRgb(SLIDES[0].theme[k])));
  writeTheme(themeNow);

  function morphTheme(theme, duration = 1.2) {
    const from = {}; KEYS.forEach((k) => (from[k] = themeNow[k].slice()));
    const to = {}; KEYS.forEach((k) => (to[k] = hexToRgb(theme[k])));
    const apply = (p) => {
      KEYS.forEach((k) => { themeNow[k] = from[k].map((v, i) => v + (to[k][i] - v) * p); });
      writeTheme(themeNow);
    };
    metaTheme.setAttribute("content", theme.base);
    if (!hasGSAP || reduceMotion) return apply(1);
    const o = { p: 0 };
    gsap.to(o, { p: 1, duration, ease: "power2.inOut", onUpdate: () => apply(o.p), overwrite: true });
  }

  /* ---------------------------------------------------------
     Smooth scroll (Lenis) + ScrollTrigger
     --------------------------------------------------------- */
  let lenis = null;
  if (hasGSAP) gsap.registerPlugin(ScrollTrigger);
  if (typeof window.Lenis !== "undefined" && !reduceMotion) {
    lenis = new Lenis({ duration: 1.2, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true });
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
  const scrollToEl = (target, offset = 0) => {
    if (lenis) lenis.scrollTo(target, { offset, duration: 1.5 });
    else if (target === 0) window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    else target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
  };

  $$('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href");
      const target = id === "#top" ? 0 : $(id);
      if (target === null) return;
      e.preventDefault();
      closeMenu();
      scrollToEl(target, -20);
    });
  });

  /* ---------------------------------------------------------
     Navigation
     --------------------------------------------------------- */
  const nav = $("#nav");
  let lastY = 0;
  const onScrollNav = (y) => {
    nav.classList.toggle("is-scrolled", y > 40);
    nav.classList.toggle("is-hidden", y > lastY && y > window.innerHeight * 0.8);
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
     3D stage
     --------------------------------------------------------- */
  const hero = $("#hero");
  const stage = hasTHREE ? initStage() : null;

  function initStage() {
    const canvas = $("#stage3d");
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch (err) { return null; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    const FOV = 30, CAM_Z = 10;
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
    camera.position.set(0, 0, CAM_Z);

    // Studio environment: soft boxes reflected in the glossy surfaces
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), new THREE.MeshBasicMaterial({ color: 0x2c2c2c, side: THREE.BackSide })));
    const softbox = (w, h, k, p) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), side: THREE.DoubleSide }));
      m.position.set(...p); m.lookAt(0, 0, 0); env.add(m);
    };
    softbox(10, 4, 5, [0, 8, 3]);
    softbox(4, 9, 2.6, [-8, 1, 4]);
    softbox(3, 7, 1.6, [8, -1, 3]);
    softbox(9, 2, 1.2, [0, -7, 5]);
    softbox(3, 3, 3.5, [3, 4, 8]);
    scene.environment = pmrem.fromScene(env, 0.035).texture;

    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(3, 5, 6);
    scene.add(key, new THREE.AmbientLight(0xffffff, 0.25));

    // ---- Geometry helpers ----
    const rrect = (w, h, r) => {
      const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
      s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
      s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
      s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
      return s;
    };
    const puff = (shape, depth = 0.45, bevel = 0.3) => {
      const g = new THREE.ExtrudeGeometry(shape, {
        depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 14, curveSegments: 48,
      });
      g.center(); g.computeVertexNormals();
      return g;
    };
    const makeMats = (o) => ({
      main: new THREE.MeshPhysicalMaterial({
        color: o.color, roughness: 0.34, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.14,
        sheen: 0.6, sheenColor: new THREE.Color(o.sheen), sheenRoughness: 0.45,
      }),
      accent: new THREE.MeshPhysicalMaterial({ color: o.accent, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 }),
    });

    const BUILDERS = {
      chat(m) {
        const g = new THREE.Group();
        const w = 2.5, h = 1.8, r = 0.6, x = -w / 2, y = -h / 2;
        const s = new THREE.Shape();
        s.moveTo(x + 1.0, y);
        s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
        s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
        s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
        s.quadraticCurveTo(x + 0.3, y - 0.25, x + 0.15, y - 0.62);
        s.quadraticCurveTo(x + 0.7, y - 0.4, x + 1.0, y);
        const body = new THREE.Mesh(puff(s, 0.5, 0.36), m.main);
        g.add(body);
        const dotGeo = new THREE.SphereGeometry(0.19, 32, 16);
        [-0.62, 0, 0.62].forEach((dx, i) => {
          const d = new THREE.Mesh(dotGeo, m.accent);
          d.position.set(dx, 0.05, 0.6); d.scale.z = 0.6;
          d.userData.phase = i * 0.6;
          g.add(d);
        });
        g.userData.update = (t) => {
          g.children.forEach((c) => { if (c.userData.phase !== undefined) c.position.y = 0.05 + Math.max(0, Math.sin(t * 4 - c.userData.phase * 2)) * 0.14; });
        };
        return g;
      },
      gear(m) {
        const g = new THREE.Group();
        const gearShape = (R, r, teeth, hole) => {
          const s = new THREE.Shape(), step = (Math.PI * 2) / teeth;
          for (let i = 0; i < teeth; i++) {
            const a = i * step;
            const pts = [[r, a], [R, a + step * 0.14], [R, a + step * 0.44], [r, a + step * 0.58]];
            pts.forEach(([rad, ang], j) => {
              const px = Math.cos(ang) * rad, py = Math.sin(ang) * rad;
              if (i === 0 && j === 0) s.moveTo(px, py); else s.lineTo(px, py);
            });
          }
          s.closePath();
          const hp = new THREE.Path(); hp.absarc(0, 0, hole, 0, Math.PI * 2, true); s.holes.push(hp);
          return s;
        };
        const big = new THREE.Mesh(puff(gearShape(1.25, 0.98, 10, 0.4), 0.42, 0.16), m.main);
        const small = new THREE.Mesh(puff(gearShape(0.72, 0.55, 8, 0.22), 0.36, 0.13), m.accent);
        small.position.set(1.32, 1.02, -0.25);
        const hub = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.09, 20, 64), m.accent);
        hub.position.z = 0.38;
        g.add(big, small, hub);
        g.userData.update = (t) => { big.rotation.z = t * 0.35; small.rotation.z = -t * 0.35 * (10 / 8) + 0.2; };
        return g;
      },
      mic(m) {
        const g = new THREE.Group();
        const head = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 0.85, 20, 48), m.main);
        head.position.y = 0.5;
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.565, 0.05, 16, 72), m.accent);
        band.rotation.x = Math.PI / 2; band.position.y = 0.35;
        const band2 = band.clone(); band2.position.y = 0.62;
        const holder = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.075, 20, 72, Math.PI), m.main);
        holder.rotation.z = Math.PI; holder.position.y = 0.3;
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.62, 24), m.main);
        stem.position.y = -0.85;
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.68, 0.16, 64), m.main);
        base.position.y = -1.2;
        // sound waves
        const waves = [1, 2].map((k) => {
          const w = new THREE.Mesh(new THREE.TorusGeometry(0.9 + k * 0.32, 0.045, 12, 64, Math.PI * 0.42), m.accent);
          w.rotation.z = -Math.PI * 0.21; w.position.set(0, 0.5, 0); w.userData.k = k;
          const w2 = w.clone(); w2.rotation.z = Math.PI - Math.PI * 0.21; w2.userData.k = k;
          return [w, w2];
        }).flat();
        g.add(head, band, band2, holder, stem, base, ...waves);
        g.userData.update = (t) => {
          waves.forEach((w) => {
            const p = (Math.sin(t * 3 - w.userData.k) + 1) / 2;
            w.scale.setScalar(0.92 + p * 0.12);
          });
        };
        return g;
      },
      chart(m) {
        const g = new THREE.Group();
        const bars = [0.95, 1.6, 2.3].map((h, i) => {
          const b = new THREE.Mesh(puff(rrect(0.56, h, 0.2), 0.42, 0.14), m.main);
          b.position.set(-0.82 + i * 0.82, -1.15 + h / 2, 0);
          b.userData.h = h;
          return b;
        });
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(-1.35, -0.35, 0.55), new THREE.Vector3(-0.55, 0.25, 0.6),
          new THREE.Vector3(0.1, 0.05, 0.62), new THREE.Vector3(1.05, 1.3, 0.62),
        ]);
        const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.075, 16, false), m.accent);
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.42, 32), m.accent);
        const end = curve.getPoint(1), tan = curve.getTangent(1);
        cone.position.copy(end).addScaledVector(tan, 0.15);
        cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
        g.add(...bars, tube, cone);
        g.userData.update = (t) => {
          bars.forEach((b, i) => { b.scale.y = 1 + Math.sin(t * 1.6 + i) * 0.04; b.position.y = -1.15 + (b.userData.h * b.scale.y) / 2; });
        };
        return g;
      },
    };

    // Normalise each model to a ~3 unit box, centred
    const normalise = (g) => {
      const box = new THREE.Box3().setFromObject(g);
      const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
      const k = 3 / Math.max(size.x, size.y);
      const wrap = new THREE.Group();
      g.position.sub(c);
      wrap.add(g); wrap.scale.setScalar(k);
      wrap.userData.update = g.userData.update;
      return wrap;
    };

    // Soft contact shadow texture
    const shadowTex = (() => {
      const c = document.createElement("canvas"); c.width = c.height = 128;
      const x = c.getContext("2d"), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, "rgba(0,0,0,0.55)"); gr.addColorStop(0.5, "rgba(0,0,0,0.22)"); gr.addColorStop(1, "rgba(0,0,0,0)");
      x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    })();
    const makeShadow = () => new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));

    const items = SLIDES.map((sl, i) => {
      const mats = makeMats(sl.obj);
      const model = normalise(BUILDERS[sl.model](mats));
      const pivot = new THREE.Group(); pivot.add(model);
      const shadow = makeShadow();
      const thumbModel = model.clone(true); thumbModel.userData.update = null;
      const thumb = new THREE.Group(); thumb.add(thumbModel);
      scene.add(pivot, shadow, thumb);
      pivot.visible = shadow.visible = i === 0;
      thumb.visible = false;
      return {
        pivot, model, shadow, thumb,
        st: { x: 0, y: 0, rot: 0, s: i === 0 ? 0 : 1, visible: i === 0 }, // animated by GSAP
        th: { s: 0 },
      };
    });

    // ---- Layout: map DOM anchors to world space ----
    const anchor = $("#stageAnchor"), thumbBtn = $("#nextThumb");
    const L = { visW: 1, visH: 1, cx: 0, cy: 0, scale: 1, tx: 0, ty: 0, tscale: 0.3 };
    function layout() {
      const r = hero.getBoundingClientRect();
      renderer.setSize(r.width, r.height, false);
      camera.aspect = r.width / r.height;
      camera.updateProjectionMatrix();
      L.visH = 2 * CAM_Z * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
      L.visW = L.visH * camera.aspect;
      const toWorld = (el) => {
        const a = el.getBoundingClientRect();
        return {
          x: ((a.left + a.width / 2 - r.left) / r.width - 0.5) * L.visW,
          y: -((a.top + a.height / 2 - r.top) / r.height - 0.5) * L.visH,
          h: (a.height / r.height) * L.visH, w: (a.width / r.width) * L.visW,
        };
      };
      const a = toWorld(anchor), t = toWorld(thumbBtn);
      L.cx = a.x; L.cy = a.y + a.h * 0.04;
      L.scale = Math.min(a.h / 3.4, a.w / 3.1);
      L.tx = t.x; L.ty = t.y + t.h * 0.06; L.tscale = t.h / 4.2;
    }
    layout();
    window.addEventListener("resize", layout);
    if (document.fonts) document.fonts.ready.then(layout);

    // ---- Drag to rotate (with snap-back to the front face) ----
    const drag = { on: false, x0: 0, last: 0, t0: 0, rot: 0, vel: 0, target: 0, moved: 0 };
    hero.addEventListener("pointerdown", (e) => {
      if (e.target.closest("a, button, input")) return;
      drag.on = true; drag.x0 = drag.last = e.clientX; drag.t0 = performance.now(); drag.moved = 0;
      timer.pause();
    });
    window.addEventListener("pointermove", (e) => {
      if (!drag.on) return;
      const dx = e.clientX - drag.last;
      drag.last = e.clientX; drag.moved += Math.abs(dx);
      drag.rot += dx * 0.012; drag.vel = dx * 0.012;
    });
    window.addEventListener("pointerup", (e) => {
      if (!drag.on) return;
      drag.on = false;
      const dx = e.clientX - drag.x0, dt = performance.now() - drag.t0;
      // quick horizontal flick on touch = navigate
      if (e.pointerType !== "mouse" && Math.abs(dx) > 60 && dt < 350) {
        drag.vel = 0; go(dx < 0 ? 1 : -1);
      }
      timer.resume();
    });

    let heroScroll = 0;
    const clock = new THREE.Clock();
    let visible = true, t = 0;
    new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(hero);

    function render() {
      requestAnimationFrame(render);
      const dt = Math.min(clock.getDelta(), 0.05);
      if (!visible || document.hidden) return;
      t += dt * (reduceMotion ? 0.2 : 1);

      pointer.sx += (pointer.x - pointer.sx) * 0.05;
      pointer.sy += (pointer.y - pointer.sy) * 0.05;

      if (!drag.on) {
        drag.rot += drag.vel; drag.vel *= 0.92;
        if (Math.abs(drag.vel) < 0.002) {
          const snap = Math.round(drag.rot / (Math.PI * 2)) * Math.PI * 2;
          drag.rot += (snap - drag.rot) * 0.05;
        }
      }

      const sway = reduceMotion ? 0 : Math.sin(t * 0.55) * 0.32;
      const bob = reduceMotion ? 0 : Math.sin(t * 1.3) * 0.07;
      items.forEach((it, i) => {
        const s = it.st;
        it.pivot.visible = it.shadow.visible = s.visible;
        if (s.visible) {
          const sc = L.scale * s.s;
          it.pivot.position.set(L.cx + s.x * L.visW, L.cy + (bob + s.y) * L.scale + heroScroll * L.visH * 0.18, 0);
          it.pivot.scale.setScalar(Math.max(sc, 0.0001));
          it.pivot.rotation.set(-pointer.sy * 0.18 + 0.04, sway + drag.rot + s.rot + pointer.sx * 0.35, pointer.sx * -0.04);
          if (it.model.userData.update && !reduceMotion) it.model.userData.update(t);
          // contact shadow reacts to the float height
          it.shadow.position.set(L.cx + s.x * L.visW, L.cy - 1.72 * L.scale + heroScroll * L.visH * 0.18, -0.5);
          const k = 1 - bob * 1.6;
          it.shadow.scale.set(2.6 * L.scale * s.s * k, 0.42 * L.scale * s.s * k, 1);
          it.shadow.material.opacity = Math.min(1, s.s) * (0.85 - bob * 2);
        }
        const th = it.th;
        it.thumb.visible = th.s > 0.001;
        if (it.thumb.visible) {
          it.thumb.position.set(L.tx, L.ty + Math.sin(t * 1.5) * 0.03, 0.5);
          it.thumb.scale.setScalar(L.tscale * th.s);
          it.thumb.rotation.set(0.1, t * 0.6, 0);
        }
      });

      renderer.render(scene, camera);
    }
    render();

    return {
      items,
      setHeroScroll: (v) => { heroScroll = v; },
      layout,
    };
  }

  /* ---------------------------------------------------------
     Carousel
     --------------------------------------------------------- */
  const el = {
    kicker: $("#slideKicker"), a: $("#titleA"), b: $("#titleB"), text: $("#slideText"),
    num: $("#slideNum"), total: $("#slideTotal"), now: $("#priceNow"), old: $("#priceOld"),
    navActive: $("#navActive"), nextName: $("#nextName"), progress: $("#heroProgress"),
  };
  el.total.textContent = String(N).padStart(2, "0");
  const priceState = { now: SLIDES[0].prices[0][0], old: SLIDES[0].prices[0][1] };
  let busy = false;

  function setPrice(animate = true) {
    const [n, o] = SLIDES[current].prices[sizeIdx];
    const apply = () => { el.now.textContent = money(priceState.now); el.old.textContent = money(priceState.old); };
    if (!hasGSAP || !animate || reduceMotion) { priceState.now = n; priceState.old = o; return apply(); }
    gsap.to(priceState, { now: n, old: o, duration: 0.9, ease: "expo.out", overwrite: true, onUpdate: apply });
  }

  function showThumb(idx, animate = true) {
    if (!stage) return;
    stage.items.forEach((it, i) => {
      const target = i === idx ? 1 : 0;
      if (!hasGSAP || !animate) it.th.s = target;
      else gsap.to(it.th, { s: target, duration: target ? 0.9 : 0.4, delay: target ? 0.5 : 0, ease: target ? "back.out(1.6)" : "power2.in", overwrite: true });
    });
    el.nextName.textContent = SLIDES[idx].short;
  }

  function go(dir) { goTo((current + dir + N) % N, dir); }

  function goTo(next, dir = 1) {
    if (next === current || busy) return;
    busy = true;
    const prev = current;
    current = next;
    const sl = SLIDES[next];
    morphTheme(sl.theme);
    el.num.textContent = String(next + 1).padStart(2, "0");
    el.navActive.textContent = sl.short;
    showThumb((next + 1) % N);
    timer.restart();

    if (!hasGSAP || reduceMotion) {
      el.kicker.textContent = sl.kicker; el.a.textContent = sl.title[0]; el.b.textContent = sl.title[1]; el.text.textContent = sl.text;
      if (stage) { stage.items[prev].st.visible = false; Object.assign(stage.items[next].st, { visible: true, x: 0, rot: 0, s: 1 }); }
      setPrice(false); busy = false; return;
    }

    // Text out → swap → in
    const lines = [el.a, el.b];
    const tl = gsap.timeline({ onComplete: () => { busy = false; } });
    tl.to(lines, { yPercent: -110, duration: 0.45, ease: "power3.in", stagger: 0.05 }, 0)
      .to([el.kicker, el.text], { opacity: 0, y: -10, duration: 0.35, ease: "power2.in" }, 0)
      .add(() => {
        el.kicker.textContent = sl.kicker; el.a.textContent = sl.title[0]; el.b.textContent = sl.title[1]; el.text.textContent = sl.text;
        setPrice();
      })
      .fromTo(lines, { yPercent: 110 }, { yPercent: 0, duration: 1, ease: "expo.out", stagger: 0.08 })
      .fromTo([el.kicker, el.text], { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.8, ease: "expo.out", stagger: 0.06 }, "<0.1");

    // 3D: current flies out, next spins in from the other side
    if (stage) {
      const out = stage.items[prev].st, inn = stage.items[next].st;
      gsap.killTweensOf([out, inn]);
      gsap.to(out, { x: -dir * 0.62, rot: -dir * 1.6, s: 0.55, y: 0.2, duration: 0.85, ease: "power3.in", onComplete: () => { out.visible = false; } });
      Object.assign(inn, { visible: true, x: dir * 0.62, rot: dir * 1.8, s: 0.55, y: -0.2 });
      gsap.to(inn, { x: 0, rot: 0, s: 1, y: 0, duration: 1.4, delay: 0.38, ease: "expo.out" });
    }
  }

  // Auto-advance with a progress line
  const AUTO = 7;
  const timer = (() => {
    let tw = null, paused = false;
    const start = () => {
      if (!hasGSAP || reduceMotion) return;
      if (tw) tw.kill();
      tw = gsap.fromTo(el.progress, { scaleX: 0 }, { scaleX: 1, duration: AUTO, ease: "none", onComplete: () => go(1) });
      if (paused) tw.pause();
    };
    return {
      restart: start,
      pause: () => { paused = true; tw && tw.pause(); },
      resume: () => { paused = false; tw && tw.resume(); },
    };
  })();
  new IntersectionObserver(([en]) => (en.isIntersecting ? timer.resume() : timer.pause()), { threshold: 0.4 }).observe(hero);

  $("#prevBtn").addEventListener("click", () => go(-1));
  $("#nextBtn").addEventListener("click", () => go(1));
  $("#nextThumb").addEventListener("click", () => go(1));
  window.addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea")) return;
    const r = hero.getBoundingClientRect();
    if (r.bottom < window.innerHeight * 0.4) return;
    if (e.key === "ArrowRight") go(1);
    if (e.key === "ArrowLeft") go(-1);
  });

  // "Automations included" selector (the size circles)
  $$(".size").forEach((btn) => {
    btn.addEventListener("click", () => {
      sizeIdx = +btn.dataset.size;
      $$(".size").forEach((b) => {
        const on = b === btn;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-checked", String(on));
      });
      setPrice();
      timer.restart();
      if (stage && hasGSAP && !reduceMotion) {
        const st = stage.items[current].st;
        gsap.fromTo(st, { s: 0.92 }, { s: 1, duration: 0.9, ease: "elastic.out(1, 0.45)", overwrite: "auto" });
      }
    });
  });

  // Service cards jump to their 3D showcase
  $$(".card[data-goto]").forEach((card) => {
    const open = () => {
      const idx = +card.dataset.goto;
      scrollToEl(0);
      setTimeout(() => goTo(idx, idx > current ? 1 : -1), lenis ? 700 : 300);
    };
    card.addEventListener("click", open);
    card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
  });

  setPrice(false);
  showThumb(1, false);

  /* ---------------------------------------------------------
     Preloader → intro
     --------------------------------------------------------- */
  const loader = $("#loader");
  const bar = $("#loaderBar");
  const t0 = performance.now();
  const loadTime = reduceMotion ? 150 : 1100;
  (function tick() {
    const k = Math.min(1, (performance.now() - t0) / loadTime);
    bar.style.transform = `scaleX(${1 - Math.pow(1 - k, 3)})`;
    if (k < 1) requestAnimationFrame(tick); else finishLoading();
  })();

  function finishLoading() {
    document.body.classList.remove("is-loading");
    if (lenis) lenis.start();
    if (stage) stage.layout();
    if (!hasGSAP) {
      loader.remove();
      if (stage) stage.items[0].st.s = 1;
      return;
    }
    const tl = gsap.timeline({ onComplete: () => timer.restart() });
    tl.to(loader, { opacity: 0, duration: 0.7, ease: "power2.out", onComplete: () => loader.remove() })
      .to(stage ? stage.items[0].st : {}, { s: 1, duration: 1.8, ease: "expo.out" }, 0.1)
      .from(stage ? stage.items[0].st : {}, { rot: -2.2, y: -0.4, duration: 2, ease: "expo.out" }, 0.1)
      .from([el.a, el.b], { yPercent: 110, duration: 1.2, ease: "expo.out", stagger: 0.08 }, 0.2)
      .from(".hero__controls, .hero__kicker, .hero__text, .hero__ctas, .price, .sizes, .hero__tagline", { opacity: 0, y: 24, duration: 1, ease: "expo.out", stagger: 0.06 }, 0.35)
      .from(nav, { opacity: 0, y: -20, duration: 0.9, ease: "expo.out", clearProps: "transform" }, 0.3);
    initScrollAnimations();
  }

  /* ---------------------------------------------------------
     Scroll-driven animations
     --------------------------------------------------------- */
  function initScrollAnimations() {
    // Hero parallax as you leave it
    ScrollTrigger.create({
      trigger: hero, start: "top top", end: "bottom top", scrub: true,
      onUpdate: (self) => stage && stage.setHeroScroll(self.progress),
    });
    gsap.to(".hero__grid", { yPercent: -12, opacity: 0.2, ease: "none", scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true } });

    $$(".reveal").forEach((r) => {
      gsap.from(r, { y: 50, opacity: 0, duration: 1.1, ease: "expo.out", scrollTrigger: { trigger: r, start: "top 88%", once: true } });
    });

    [".cards .card", ".uses__grid .use"].forEach((sel) => {
      const list = $$(sel);
      if (!list.length) return;
      gsap.from(list, {
        y: 70, opacity: 0, rotateX: -10, duration: 1.2, ease: "expo.out", stagger: 0.1,
        scrollTrigger: { trigger: list[0].parentElement, start: "top 82%", once: true },
      });
    });

    const st = $("#statement");
    st.innerHTML = st.textContent.trim().split(/\s+/).map((w) => `<span class="w">${w}</span>`).join(" ");
    gsap.to($$(".w", st), { opacity: 1, stagger: 0.08, ease: "none", scrollTrigger: { trigger: st, start: "top 80%", end: "bottom 45%", scrub: true } });

    const track = $("#processTrack");
    const pbar = $("#processBar");
    const distance = () => Math.max(0, track.scrollWidth - window.innerWidth);
    gsap.to(track, {
      x: () => -distance(), ease: "none",
      scrollTrigger: {
        trigger: ".process", start: "top top", end: () => "+=" + (distance() + window.innerHeight * 0.4),
        pin: ".process__pin", scrub: 1, invalidateOnRefresh: true,
        onUpdate: (self) => gsap.set(pbar, { scaleX: self.progress }),
      },
    });
    gsap.from(".step", { opacity: 0, y: 60, stagger: 0.1, duration: 1, ease: "expo.out", scrollTrigger: { trigger: ".process", start: "top 70%", once: true } });

    $$("[data-count]").forEach((c) => {
      const end = parseFloat(c.dataset.count), dec = parseInt(c.dataset.decimals || "0", 10), suf = c.dataset.suffix || "";
      const o = { v: 0 };
      gsap.to(o, { v: end, duration: 2.2, ease: "expo.out", scrollTrigger: { trigger: c, start: "top 90%", once: true }, onUpdate: () => { c.textContent = o.v.toFixed(dec) + suf; } });
    });

    gsap.from(".footer__big", { yPercent: 40, opacity: 0, ease: "none", scrollTrigger: { trigger: ".footer", start: "top bottom", end: "bottom bottom", scrub: true } });

    window.addEventListener("load", () => ScrollTrigger.refresh());
    if (document.fonts) document.fonts.ready.then(() => ScrollTrigger.refresh());
  }

  /* ---------------------------------------------------------
     Magnetic buttons + 3D tilt cards
     --------------------------------------------------------- */
  if (finePointer && !reduceMotion) {
    $$("[data-magnetic]").forEach((m) => {
      m.addEventListener("pointermove", (e) => {
        const b = m.getBoundingClientRect();
        m.style.transform = `translate(${(e.clientX - b.left - b.width / 2) * 0.22}px, ${(e.clientY - b.top - b.height / 2) * 0.32}px)`;
      });
      m.addEventListener("pointerleave", () => { m.style.transform = ""; });
    });
    $$(".tilt").forEach((c) => {
      c.addEventListener("pointermove", (e) => {
        const b = c.getBoundingClientRect();
        const px = (e.clientX - b.left) / b.width, py = (e.clientY - b.top) / b.height;
        c.style.transition = "transform .15s ease-out, border-color .4s";
        c.style.transform = `rotateX(${(0.5 - py) * 9}deg) rotateY(${(px - 0.5) * 11}deg)`;
        c.style.setProperty("--mx", px * 100 + "%");
        c.style.setProperty("--my", py * 100 + "%");
      });
      c.addEventListener("pointerleave", () => {
        c.style.transition = "transform .9s cubic-bezier(.22,1,.36,1), border-color .4s";
        c.style.transform = "";
      });
    });
  }

  /* ---------------------------------------------------------
     ROI calculator
     --------------------------------------------------------- */
  const inTeam = $("#inTeam"), inHours = $("#inHours"), inRate = $("#inRate");
  const shown = { money: 0, hours: 0, fte: 0 };
  function calc() {
    [inTeam, inHours, inRate].forEach((i) => i.style.setProperty("--fill", ((i.value - i.min) / (i.max - i.min)) * 100 + "%"));
    $("#outTeam").textContent = inTeam.value;
    $("#outHours").textContent = inHours.value;
    $("#outRate").textContent = inRate.value;
    const hours = inTeam.value * inHours.value * 48 * 0.7;
    const target = { money: hours * inRate.value, hours, fte: hours / 1760 };
    const apply = () => {
      $("#resMoney").textContent = money(shown.money);
      $("#resHours").textContent = fmt.format(Math.round(shown.hours));
      $("#resFte").textContent = shown.fte.toFixed(1);
    };
    if (hasGSAP && !reduceMotion) gsap.to(shown, { ...target, duration: 0.8, ease: "expo.out", overwrite: true, onUpdate: apply });
    else { Object.assign(shown, target); apply(); }
  }
  [inTeam, inHours, inRate].forEach((i) => i.addEventListener("input", calc));
  calc();

  /* ---------------------------------------------------------
     Plan buttons pre-fill the budget in the contact form
     --------------------------------------------------------- */
  $$("[data-plan]").forEach((b) => {
    b.addEventListener("click", () => {
      const sel = $("#fBudget");
      const opt = [...sel.options].find((o) => o.text.startsWith(b.dataset.plan));
      if (opt) sel.value = opt.value || opt.text;
    });
  });

  /* ---------------------------------------------------------
     FAQ accordion
     --------------------------------------------------------- */
  const refreshST = () => hasGSAP && ScrollTrigger.refresh();
  function closeItem(item) {
    const body = $(".faq__body", item);
    gsap.to(body, { height: 0, opacity: 0, duration: 0.45, ease: "power3.inOut", onComplete: () => { item.open = false; body.style.height = ""; body.style.opacity = ""; refreshST(); } });
  }
  $$(".faq__item").forEach((item) => {
    const body = $(".faq__body", item);
    $("summary", item).addEventListener("click", (e) => {
      if (!hasGSAP || reduceMotion) return;
      e.preventDefault();
      if (!item.open) {
        $$(".faq__item[open]").forEach((o) => o !== item && closeItem(o));
        item.open = true;
        gsap.fromTo(body, { height: 0, opacity: 0 }, { height: "auto", opacity: 1, duration: 0.6, ease: "expo.out", onComplete: refreshST });
      } else closeItem(item);
    });
  });

  /* ---------------------------------------------------------
     Contact form — set FORM_ENDPOINT (e.g. a Formspree URL)
     to receive submissions.
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
    const consent = form.elements.consent;
    if (ok && !consent.checked) {
      ok = false;
      status.textContent = "Please agree to the Privacy Policy so we can reply to you.";
    } else if (!ok) {
      status.textContent = "Please enter your name and a valid email address.";
    }
    if (!ok) {
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
      status.textContent = "Thank you. We have received your enquiry and will reply within one business day.";
      status.classList.add("is-ok");
    } catch (err) {
      status.textContent = "Your message could not be sent. Please email us at hello@yourdomain.com.";
      status.classList.add("is-err");
    } finally {
      btn.disabled = false;
    }
  });
})();
