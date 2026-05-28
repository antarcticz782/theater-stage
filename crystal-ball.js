import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const MODEL_URL = "ball.glb";
const GLASS_NODE_NAME = "\u7403\u4f53";

const TONE_MAPPINGS = {
  ACES: THREE.ACESFilmicToneMapping,
  Neutral: THREE.NeutralToneMapping,
  None: THREE.NoToneMapping,
  Reinhard: THREE.ReinhardToneMapping,
};

const DEFAULT_RENDER_SETTINGS = {
  toneMapping: "Neutral",
  exposure: 2.01,
  environment: 3.87,
  cakeEnvironment: 4.16,
  cakeColor: 1.28,
  ambient: 2,
  sun: 2,
  glassOpacity: 0.24,
  glassTransmission: 0.72,
  glassRoughness: 0.26,
  glassThickness: 1.05,
  glassIor: 1.33,
  glassEnv: 0.24,
  fov: 32,
  modelScale: 1.11,
  autoRotate: 1.5,
};

function isTouchScreen() {
  return window.matchMedia?.("(hover: none) and (pointer: coarse)")?.matches || navigator.maxTouchPoints > 0;
}

function isVirtualLandscapeMode() {
  return document.documentElement.classList.contains("mobile-portrait");
}

async function loadModelWithTimeout(loader, url, timeoutMs, onProgress) {
  const loading = loader.loadAsync(url, onProgress);
  if (!timeoutMs) {
    return loading;
  }
  const timeout = new Promise((resolve) => {
    window.setTimeout(() => resolve(null), timeoutMs);
  });
  return Promise.race([loading, timeout]);
}

class CrystalBallViewer {
  constructor() {
    this.container = document.getElementById("crystal-ball-viewer");
    this.canvas = document.getElementById("crystal-ball-canvas");
    this.status = document.getElementById("crystal-ball-status");
    this.closeButton = document.getElementById("crystal-ball-close");
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.controls = null;
    this.ambientLight = null;
    this.sunLight = null;
    this.model = null;
    this.modelRoot = null;
    this.materialRecords = [];
    this.glassMaterial = null;
    this.loadingPromise = null;
    this.visible = false;
    this.animationFrame = null;
    this.lastAnimationTime = 0;
    this.settings = { ...DEFAULT_RENDER_SETTINGS };

    this.closeButton?.addEventListener("click", () => this.hide());
    this.container?.addEventListener("pointerdown", (event) => event.stopPropagation());
    this.container?.addEventListener("click", (event) => event.stopPropagation());
    this.container?.addEventListener("wheel", (event) => event.stopPropagation(), { passive: true });
    this.container?.addEventListener("touchmove", (event) => event.stopPropagation(), { passive: true });
  }

  async show() {
    if (!this.container || !this.canvas) {
      return;
    }
    this.container.classList.add("visible");
    this.container.setAttribute("aria-hidden", "false");
    this.visible = true;
    this.lastAnimationTime = 0;
    if (!this.model) {
      this.setStatus("模型加载中...");
    }
    try {
      await this.ensureLoaded();
      this.applyModelOrientation();
      this.applySettings();
      this.resize();
      this.controls?.update();
      this.animate();
      this.setStatus("");
    } catch (error) {
      console.error(error);
      this.setStatus("模型加载失败，请刷新重试");
    }
  }

  hide() {
    this.visible = false;
    this.container?.classList.remove("visible");
    this.container?.setAttribute("aria-hidden", "true");
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    this.lastAnimationTime = 0;
  }

  async ensureLoaded() {
    if (this.model) {
      return;
    }
    if (this.loadingPromise) {
      return this.loadingPromise;
    }
    this.loadingPromise = this.load();
    return this.loadingPromise;
  }

  async load() {
    this.scene = new THREE.Scene();
    this.scene.background = null;

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 1000);
    this.camera.position.set(0, 0.35, 8.8);

    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      canvas: this.canvas,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = TONE_MAPPINGS[this.settings.toneMapping];
    this.renderer.toneMappingExposure = this.settings.exposure;

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(createSunnyEnvironmentScene(), 0.02).texture;

    this.ambientLight = new THREE.HemisphereLight(0xdff4ff, 0xffd0a0, this.settings.ambient);
    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight(0xfff1c0, this.settings.sun);
    this.sunLight.position.set(4, 5, 2.6);
    this.scene.add(this.sunLight);

    const loader = new GLTFLoader();
    const gltf = await loadModelWithTimeout(loader, MODEL_URL, 0, (event) => this.updateLoadingProgress(event));
    this.model = gltf.scene;
    this.modelRoot = new THREE.Group();
    this.modelRoot.add(this.model);

    this.model.traverse((object) => {
      if (!object.isMesh) {
        return;
      }

      object.castShadow = false;
      object.receiveShadow = false;
      if (object.name === GLASS_NODE_NAME) {
        this.glassMaterial = new THREE.MeshPhysicalMaterial({
          clearcoat: 0.45,
          clearcoatRoughness: 0.18,
          color: 0xf7ead7,
          depthWrite: false,
          envMapIntensity: this.settings.glassEnv,
          ior: this.settings.glassIor,
          metalness: 0,
          opacity: this.settings.glassOpacity,
          roughness: this.settings.glassRoughness,
          specularIntensity: 0.28,
          thickness: this.settings.glassThickness,
          transmission: this.settings.glassTransmission,
          transparent: true,
        });
        object.material = this.glassMaterial;
        object.renderOrder = 2;
        return;
      }

      const material = object.material?.clone?.() || object.material;
      if (!material) {
        return;
      }
      object.material = material;
      if (material.map) {
        material.map.colorSpace = THREE.SRGBColorSpace;
      }
      const isCakeBody = object.name === "\u8774\u8776\u7ed3";
      material.vertexColors = object.geometry?.hasAttribute("color") || false;
      material.envMapIntensity = isCakeBody ? this.settings.cakeEnvironment : this.settings.environment;
      material.roughness = Math.max(material.roughness ?? 0.28, isCakeBody ? 0.18 : 0.22);
      material.metalness = material.metalness ?? 0;
      const baseColor = material.color?.clone?.() || new THREE.Color(0xffffff);
      this.materialRecords.push({ material, isCakeBody, baseColor });
      material.needsUpdate = true;
    });

    this.scene.add(this.modelRoot);
    this.fitModel();

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = false;
    this.controls.dampingFactor = 0;
    this.controls.enablePan = false;
    this.controls.enableRotate = true;
    this.controls.enableZoom = true;
    this.controls.autoRotate = false;
    this.controls.autoRotateSpeed = 0;
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: null,
    };
    this.controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
    this.controls.minDistance = this.camera.position.length() * 0.52;
    this.controls.maxDistance = this.camera.position.length() * 2.4;
    this.controls.target.set(0, 0, 0);
    this.applySettings();
  }

  updateLoadingProgress(event) {
    if (!event.lengthComputable || !event.total) {
      return;
    }
    const percent = Math.round((event.loaded / event.total) * 100);
    window.dispatchEvent(new CustomEvent("crystal-ball-progress", { detail: { percent } }));
    this.setStatus(`模型加载中 ${percent}%`);
  }

  setStatus(text) {
    if (!this.status) {
      return;
    }
    this.status.textContent = text;
    this.status.classList.toggle("visible", Boolean(text));
  }

  fitModel() {
    const box = new THREE.Box3().setFromObject(this.model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.length() * 0.5, 1);

    this.model.position.sub(center);
    this.applyModelOrientation();

    const distance = radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov * 0.5));
    this.camera.position.set(0, radius * 0.12, distance * 1.38);
    this.camera.near = Math.max(0.01, distance / 100);
    this.camera.far = distance * 8;
    this.camera.updateProjectionMatrix();
  }

  applyModelOrientation() {
    if (!this.modelRoot) {
      return;
    }
    const zRotation = isTouchScreen() && isVirtualLandscapeMode() ? -Math.PI / 2 : 0;
    this.modelRoot.rotation.set(0.04, -0.2, zRotation);
  }

  resize() {
    if (!this.renderer || !this.camera || !this.container) {
      return;
    }
    const rect = this.container.getBoundingClientRect();
    const size = Math.max(320, Math.min(rect.width * 0.86, rect.height * 0.86, 780));
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
    this.renderer.setSize(size, size, false);
    this.camera.aspect = 1;
    this.camera.updateProjectionMatrix();
  }

  animate() {
    if (!this.visible || !this.renderer || !this.scene || !this.camera || !this.modelRoot) {
      return;
    }
    const now = performance.now();
    const deltaSeconds = this.lastAnimationTime ? Math.min((now - this.lastAnimationTime) / 1000, 0.05) : 0;
    this.lastAnimationTime = now;
    if (this.model && isTouchScreen() && isVirtualLandscapeMode() && this.settings.autoRotate > 0) {
      this.model.rotation.y += deltaSeconds * this.settings.autoRotate * (Math.PI / 30);
    }
    this.controls?.update();
    this.renderer.render(this.scene, this.camera);
    this.animationFrame = requestAnimationFrame(() => this.animate());
  }

  applySettings() {
    if (this.renderer) {
      this.renderer.toneMapping = TONE_MAPPINGS[this.settings.toneMapping] ?? THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = this.settings.exposure;
    }
    if (this.ambientLight) {
      this.ambientLight.intensity = this.settings.ambient;
    }
    if (this.sunLight) {
      this.sunLight.intensity = this.settings.sun;
    }
    if (this.camera) {
      this.camera.fov = this.settings.fov;
      this.camera.updateProjectionMatrix();
    }
    if (this.modelRoot) {
      this.modelRoot.scale.setScalar(this.settings.modelScale);
    }
    if (this.controls) {
      const manualMobileRotate = isTouchScreen() && isVirtualLandscapeMode();
      this.controls.autoRotateSpeed = manualMobileRotate ? 0 : this.settings.autoRotate;
      this.controls.autoRotate = !manualMobileRotate && this.settings.autoRotate > 0;
    }
    if (this.glassMaterial) {
      this.glassMaterial.opacity = this.settings.glassOpacity;
      this.glassMaterial.transmission = this.settings.glassTransmission;
      this.glassMaterial.roughness = this.settings.glassRoughness;
      this.glassMaterial.thickness = this.settings.glassThickness;
      this.glassMaterial.ior = this.settings.glassIor;
      this.glassMaterial.envMapIntensity = this.settings.glassEnv;
      this.glassMaterial.needsUpdate = true;
    }
    for (const record of this.materialRecords) {
      record.material.envMapIntensity = record.isCakeBody ? this.settings.cakeEnvironment : this.settings.environment;
      record.material.color.copy(record.baseColor).multiplyScalar(record.isCakeBody ? this.settings.cakeColor : 1);
      record.material.needsUpdate = true;
    }
  }
}

function createSunnyEnvironmentScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xb8e6ff);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(12, 32, 16),
    new THREE.MeshBasicMaterial({
      color: 0xb8e6ff,
      side: THREE.BackSide,
    }),
  );
  scene.add(sky);

  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(2.2, 48),
    new THREE.MeshBasicMaterial({
      color: 0xfff3c5,
      side: THREE.DoubleSide,
    }),
  );
  sun.position.set(-4.3, 5.8, -6);
  sun.lookAt(0, 0, 0);
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 18),
    new THREE.MeshBasicMaterial({
      color: 0xffd59a,
      side: THREE.DoubleSide,
    }),
  );
  ground.rotation.x = Math.PI / 2;
  ground.position.y = -3.8;
  scene.add(ground);

  return scene;
}

const viewer = new CrystalBallViewer();
window.crystalBallViewer = viewer;
window.dispatchEvent(new Event("crystal-ball-ready"));
window.addEventListener("resize", () => {
  viewer.applyModelOrientation();
  viewer.applySettings();
  viewer.resize();
});
window.addEventListener("orientationchange", () => {
  window.setTimeout(() => {
    viewer.applyModelOrientation();
    viewer.applySettings();
    viewer.resize();
  }, 160);
});
