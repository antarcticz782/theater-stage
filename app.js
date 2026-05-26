const viewport = document.getElementById("viewport");
const stageWindow = document.getElementById("stage-window");
const stage = document.getElementById("stage");
const loading = document.getElementById("loading");
const rotateDeviceHint = document.getElementById("rotate-device-hint");

const state = {
  canvasWidth: 5535,
  canvasHeight: 1259,
  displayWorldWidth: 2300,
  scale: 1,
  cameraX: 0,
  maxCameraX: 0,
  cameraWidth: 2300,
  cameraFocus: null,
  cameraLerpSpeed: 6.5,
  assetVersion: null,

  actor: null,
  actorX: 0,
  actorTargetX: 0,
  actorCenterOffsetX: 0,
  actorFacing: 1,
  actorSpeed: 720,
  actorMoveRightLimit: 4550,
  preKeyRightLimit: 3150,
  actorAwake: false,
  actorWaking: false,
  actorMoving: false,
  actorFrameRate: 2,
  interactionsUnlockedAt: 0,
  pendingActorMoveTimer: null,
  lastActorMoveTime: performance.now(),
  idlePoseDelay: 4500,

  curtainFrames: [],
  curtainElement: null,
  curtainFrameRate: 3,
  curtainStarted: false,
  curtainComplete: false,
  titleLayers: [],
  titleExitStarted: false,

  flowers: [],
  butterflies: [],
  leaf: null,
  bird: null,
  octopus: null,
  key: null,
  areaSwitch: null,
  pendulum: null,
  clockHand: null,
  clockPaused: false,
  clockTapPauseTimer: null,
  clockTapPauseUntil: 0,
  moth: null,
  layer6: null,
  musicBox: null,

  audioContext: null,
  chirpAudio: null,
  chirpAnalyser: null,
  chirpData: null,
  bgm: {
    forest: null,
    house: null,
    current: null,
    unlocked: false,
  },
  clockAudio: null,
  clockAnalyser: null,
  clockData: null,
  fireAudio: null,
  showAudio: null,
  doorAudio: null,
  bloomAudio: null,
  musicBoxAudio: null,
  curtainAudio: null,
  leafAudio: null,
  umAudio: null,

  lastFrameTime: performance.now(),
  lastDeltaSeconds: 0,
};

window.__theaterStage = { state };

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function versionedSrc(src) {
  return state.assetVersion ? `${src}?v=${state.assetVersion}` : src;
}

function playOneShot(audio) {
  if (!audio) {
    return;
  }
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

function playLayeredOneShot(audio) {
  if (!audio) {
    return;
  }
  const copy = audio.cloneNode(true);
  copy.volume = audio.volume;
  copy.play().catch(() => {});
  copy.addEventListener("ended", () => {
    copy.src = "";
  });
}

function interactionsReady() {
  return state.actorAwake && performance.now() >= state.interactionsUnlockedAt && !isKeySequenceBlocking();
}

function isKeySequenceBlocking() {
  return Boolean(state.key?.entered && !state.key.areaUnlocked);
}

function initializeAudio() {
  if (!state.audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      state.audioContext = new AudioContextClass();
    }
  }
  if (state.audioContext?.state === "suspended") {
    state.audioContext.resume().catch(() => {});
  }
  if (!state.bgm.unlocked) {
    state.bgm.unlocked = true;
    startBackgroundMusic();
  }
}

function isTouchScreen() {
  return window.matchMedia?.("(hover: none) and (pointer: coarse)")?.matches || navigator.maxTouchPoints > 0;
}

function updateOrientationHint() {
  if (!rotateDeviceHint) {
    return;
  }
  const virtualLandscape = isTouchScreen() && window.innerHeight > window.innerWidth;
  document.documentElement.classList.toggle("mobile-portrait", virtualLandscape);
  const showHint = false;
  rotateDeviceHint.setAttribute("aria-hidden", showHint ? "false" : "true");
}

updateOrientationHint();

async function requestLandscapeMode() {
  if (!isTouchScreen()) {
    return;
  }
  try {
    if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
      await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    }
  } catch (error) {
    // Some mobile browsers do not allow fullscreen from a normal page.
  }
  try {
    await screen.orientation?.lock?.("landscape");
  } catch (error) {
    // iOS Safari and several Android browsers do not expose orientation lock.
  }
  updateOrientationHint();
  window.setTimeout(resizeStage, 120);
}

function resizeStage() {
  const virtualLandscape = isTouchScreen() && window.innerHeight > window.innerWidth;
  const viewportWidth = virtualLandscape ? window.innerHeight : window.innerWidth;
  const viewportHeight = virtualLandscape ? window.innerWidth : window.innerHeight;
  const displayAspect = state.displayWorldWidth / state.canvasHeight;
  const displayWidth = Math.min(state.displayWorldWidth, viewportWidth, viewportHeight * displayAspect);
  const displayHeight = displayWidth / displayAspect;

  stageWindow.style.width = `${displayWidth}px`;
  stageWindow.style.height = `${displayHeight}px`;

  state.scale = displayHeight / state.canvasHeight;
  state.cameraWidth = state.displayWorldWidth;
  state.maxCameraX = Math.max(0, state.canvasWidth - state.cameraWidth);
  state.cameraX = clamp(state.cameraX, 0, state.maxCameraX);

  stage.style.setProperty("--stage-width", `${state.canvasWidth}px`);
  stage.style.setProperty("--stage-height", `${state.canvasHeight}px`);
  updateStageTransform();
}

function updateStageTransform() {
  stage.style.transform = `scale(${state.scale}) translate3d(${-state.cameraX}px, 0, 0)`;
  updateCurtainTransform();
}

function isVirtualLandscape() {
  return document.documentElement.classList.contains("mobile-portrait");
}

function pointerToStagePoint(event) {
  const rect = stageWindow.getBoundingClientRect();
  let x = event.clientX - rect.left;
  let y = event.clientY - rect.top;

  if (isVirtualLandscape()) {
    x = event.clientY - rect.top;
    y = rect.right - event.clientX;
  }

  const width = stageWindow.offsetWidth;
  const height = stageWindow.offsetHeight;
  if (x < 0 || x > width || y < 0 || y > height) {
    return null;
  }
  return { x, y };
}

function makeLayerElement(layer) {
  const image = document.createElement("img");
  image.className = "layer";
  image.src = versionedSrc(layer.src);
  image.alt = "";
  image.draggable = false;
  image.style.left = `${layer.left}px`;
  image.style.top = `${layer.top}px`;
  image.style.width = `${layer.width}px`;
  image.style.height = `${layer.height}px`;
  image.style.zIndex = String(layer.zIndex);
  image.style.opacity = String(layer.opacity);
  return image;
}

function hashText(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function applySwayStyle(element, seedText) {
  const seed = hashText(seedText);
  const direction = seed % 2 === 0 ? 1 : -1;
  const swayX = direction * (7 + (seed % 5));
  const swayRot = direction * (2.8 + ((seed >> 3) % 18) / 10);
  const duration = 2.1 + ((seed >> 7) % 9) / 10;
  const delay = -(((seed >> 11) % 100) / 100) * duration;

  element.style.setProperty("--sway-x", `${swayX}px`);
  element.style.setProperty("--sway-rot", `${swayRot}deg`);
  element.style.setProperty("--sway-duration", `${duration}s`);
  element.style.setProperty("--sway-delay", `${delay}s`);
}

function createSprite(frame, className, zIndex) {
  const wrapper = document.createElement("div");
  const image = document.createElement("img");
  wrapper.className = `sprite ${className}`.trim();
  wrapper.style.zIndex = String(zIndex ?? frame.zIndex);
  image.alt = "";
  image.draggable = false;
  wrapper.appendChild(image);
  applySwayStyle(wrapper, frame.path || frame.name);
  stage.appendChild(wrapper);

  const sprite = { element: wrapper, image, currentFrame: frame };
  setSpriteFrame(sprite, frame);
  return sprite;
}

function setSpriteFrame(sprite, frame) {
  sprite.currentFrame = frame;
  sprite.image.src = versionedSrc(frame.src);
  sprite.element.style.left = `${frame.left}px`;
  sprite.element.style.top = `${frame.top}px`;
  sprite.element.style.width = `${frame.width}px`;
  sprite.element.style.height = `${frame.height}px`;
  sprite.element.style.opacity = String(frame.opacity);
  updateSpriteShadow(sprite, frame);
}

function updateSpriteShadow(sprite, frame) {
  const area = frame.width * frame.height;
  const scale = clamp(Math.sqrt(area) / 190, 0.62, 1.85);
  const opacity = clamp(0.46 + scale * 0.22, 0.58, 0.92);
  const height = clamp(frame.height * 0.16, 22, 96);
  const bottom = clamp(frame.height * -0.055, -42, -6);

  sprite.element.style.setProperty("--shadow-scale", scale.toFixed(3));
  sprite.element.style.setProperty("--shadow-opacity", opacity.toFixed(3));
  sprite.element.style.setProperty("--shadow-height", `${height}px`);
  sprite.element.style.setProperty("--shadow-bottom", `${bottom}px`);
}

function playFrameSequence(frames, frameRate, onFrame, onDone) {
  if (!frames || frames.length === 0) {
    onDone?.();
    return;
  }

  let frameIndex = 0;
  const frameDelay = 1000 / frameRate;
  onFrame(frames[frameIndex], frameIndex);

  const nextFrame = () => {
    frameIndex += 1;
    if (frameIndex >= frames.length - 1) {
      const finalIndex = frames.length - 1;
      onFrame(frames[finalIndex], finalIndex);
      onDone?.(frames[finalIndex], finalIndex);
      return;
    }
    onFrame(frames[frameIndex], frameIndex);
    window.setTimeout(nextFrame, frameDelay);
  };

  window.setTimeout(nextFrame, frameDelay);
}

function pointerToWorld(event) {
  const point = pointerToStagePoint(event);
  if (!point) {
    return null;
  }
  return {
    x: state.cameraX + point.x / state.scale,
    y: point.y / state.scale,
  };
}

function tick(now) {
  const deltaSeconds = Math.min((now - state.lastFrameTime) / 1000, 0.05);
  state.lastFrameTime = now;
  state.lastDeltaSeconds = deltaSeconds;

  moveActor(deltaSeconds);
  updateActorIdlePose(now);
  updateOctopusFacing();
  updateClockHand(now);
  updateButterflies(now, deltaSeconds);
  updateCamera();
  requestAnimationFrame(tick);
}

function updateCamera() {
  let desiredCameraX = state.cameraX;
  if (!state.actor || !state.actorAwake) {
    updateStageTransform();
    return;
  }

  if (state.cameraFocus) {
    desiredCameraX = state.cameraFocus.x - state.cameraWidth / 2;
  } else {
    desiredCameraX = getActorCenterX() - state.cameraWidth / 2;
  }
  desiredCameraX = clamp(desiredCameraX, 0, state.maxCameraX);
  const smoothing = 1 - Math.exp(-state.cameraLerpSpeed * state.lastDeltaSeconds);
  state.cameraX += (desiredCameraX - state.cameraX) * smoothing;
  if (Math.abs(desiredCameraX - state.cameraX) < 0.2) {
    state.cameraX = desiredCameraX;
  }
  updateStageTransform();
}

function getActorCenterX() {
  return state.actorX + state.actorCenterOffsetX;
}

function updateActorTransform() {
  if (!state.actor) {
    return;
  }
  const deltaX = state.actorX - state.actor.baseLeft;
  const flip = state.actorFacing < 0 ? " scaleX(-1)" : "";
  state.actor.sprite.element.style.transform = `translate3d(${deltaX}px, 0, 0)${flip}`;
}

function setActorVisualFrame(frame) {
  if (!state.actor) {
    return;
  }
  setSpriteFrame(state.actor.sprite, frame);
  const deltaX = state.actorX - state.actor.baseLeft;
  const desiredLeft = state.actorX + state.actor.idleFrame.width / 2 - frame.width / 2;
  const desiredBottom = state.actor.idleFrame.top + state.actor.idleFrame.height;
  state.actor.sprite.element.style.left = `${desiredLeft - deltaX}px`;
  state.actor.sprite.element.style.top = `${desiredBottom - frame.height}px`;
  updateActorTransform();
}

function moveActor(deltaSeconds) {
  if (!state.actor || !state.actorAwake) {
    return;
  }

  const distance = state.actorTargetX - state.actorX;
  const step = state.actorSpeed * deltaSeconds;
  state.actorMoving = Math.abs(distance) > 0.5;

  if (Math.abs(distance) <= step) {
    state.actorX = state.actorTargetX;
    state.actorMoving = false;
  } else {
    if (state.actor.sprite.currentFrame.name !== state.actor.idleFrame.name) {
      setActorVisualFrame(state.actor.idleFrame);
    }
    state.actorX += Math.sign(distance) * step;
    state.lastActorMoveTime = performance.now();
  }

  state.actor.sprite.element.classList.toggle("moving", state.actorMoving);
  updateActorTransform();
  triggerFlowersTouchedByActor();
  updateBackgroundMusicForActor();
}

function updateActorIdlePose(now) {
  if (!state.actor || !state.actorAwake || state.actorMoving || state.actorWaking || now < state.interactionsUnlockedAt) {
    return;
  }
  if (state.actor.sprite.currentFrame.name === "7-3" && now - state.lastActorMoveTime > state.idlePoseDelay) {
    const restFrame = state.actor.frames.find((frame) => frame.name === "7-2");
    if (restFrame) {
      setActorVisualFrame(restFrame);
    }
  }
}

function targetActorAtWorld(world) {
  if (state.actor.sprite.currentFrame.name !== state.actor.idleFrame.name) {
    setActorVisualFrame(state.actor.idleFrame);
  }
  state.lastActorMoveTime = performance.now();
  state.actorFacing = world.x < getActorCenterX() ? -1 : 1;
  const activeRightLimit = state.key?.areaUnlocked ? state.actorMoveRightLimit : Math.min(state.actorMoveRightLimit, state.preKeyRightLimit);
  const maxX = Math.max(0, activeRightLimit - state.actor.idleFrame.width);
  state.actorTargetX = clamp(world.x - state.actorCenterOffsetX, 0, maxX);
  updateActorTransform();
}

function createRipple(event) {
  const point = pointerToStagePoint(event);
  if (!point) {
    return;
  }
  const ripple = document.createElement("div");
  ripple.className = "ripple";
  ripple.style.left = `${point.x}px`;
  ripple.style.top = `${point.y}px`;
  stageWindow.appendChild(ripple);
  window.setTimeout(() => ripple.remove(), 1100);
}

function scheduleActorMove(event) {
  const world = pointerToWorld(event);
  if (!world) {
    return;
  }

  createRipple(event);
  if (state.pendingActorMoveTimer) {
    window.clearTimeout(state.pendingActorMoveTimer);
  }
  state.pendingActorMoveTimer = window.setTimeout(() => {
    state.pendingActorMoveTimer = null;
    if (interactionsReady()) {
      targetActorAtWorld(world);
    }
  }, 200);
}

function setupCurtain(manifest) {
  state.curtainFrames = manifest.curtainFrames || [];
  state.curtainFrameRate = manifest.curtainFrameRate || 3;
  state.curtainComplete = state.curtainFrames.length === 0;
  if (state.curtainFrames.length === 0) {
    return;
  }

  const curtain = document.createElement("img");
  curtain.className = "layer curtain";
  curtain.alt = "";
  curtain.draggable = false;
  curtain.style.zIndex = "10000";
  stage.appendChild(curtain);
  state.curtainElement = curtain;
  setCurtainFrame(0);
}

function setCurtainFrame(index) {
  const frame = state.curtainFrames[index];
  if (!frame || !state.curtainElement) {
    return;
  }
  state.curtainElement.src = versionedSrc(frame.src);
  state.curtainElement.style.left = `${frame.left}px`;
  state.curtainElement.style.top = `${frame.top}px`;
  state.curtainElement.style.width = `${frame.width}px`;
  state.curtainElement.style.height = `${frame.height}px`;
  state.curtainElement.style.opacity = String(frame.opacity);
  updateCurtainTransform();
}

function updateCurtainTransform() {
  if (!state.curtainElement) {
    return;
  }
  state.curtainElement.style.transform = `translate3d(${state.cameraX}px, 0, 0)`;
}

function setupTitle(manifest) {
  const layers = manifest.titleLayers || [];
  state.titleLayers = layers.map((layer, index) => {
    const wrapper = document.createElement("div");
    const image = document.createElement("img");
    const isMay = Boolean(layer.isMayYou);
    const seed = hashText(layer.path || layer.name);
    const dropX = ((seed % 160) - 80) / 10;
    const dropRotate = ((seed % 19) - 9) * 1.6;
    const startY = isMay
      ? state.canvasHeight - layer.top + 120
      : -(layer.top + layer.height + 120 + (seed % 280));

    wrapper.className = `title-layer ${isMay ? "title-may" : "title-drop"}`;
    wrapper.style.left = `${layer.left}px`;
    wrapper.style.top = `${layer.top}px`;
    wrapper.style.width = `${layer.width}px`;
    wrapper.style.height = `${layer.height}px`;
    wrapper.style.zIndex = String(layer.zIndex);
    wrapper.style.setProperty("--title-start-x", `${isMay ? 0 : dropX}px`);
    wrapper.style.setProperty("--title-start-y", `${startY}px`);
    wrapper.style.setProperty("--title-start-rot", `${isMay ? 0 : dropRotate}deg`);
    wrapper.style.setProperty("--title-enter-duration", isMay ? "1s" : `${1.75 + (seed % 35) / 100}s`);
    wrapper.style.setProperty("--title-delay", isMay ? "0.18s" : `${(seed % 22) / 100}s`);
    wrapper.style.setProperty("--title-sway-x", `${((seed >> 3) % 9) - 4}px`);
    wrapper.style.setProperty("--title-sway-rot", `${(((seed >> 6) % 9) - 4) * 0.5}deg`);
    wrapper.style.setProperty("--title-sway-duration", `${1.4 + ((seed >> 12) % 7) / 10}s`);
    wrapper.style.setProperty("--title-sway-delay", `${-((seed >> 15) % 100) / 40}s`);

    image.src = versionedSrc(layer.src);
    image.alt = "";
    image.draggable = false;
    wrapper.appendChild(image);
    stage.appendChild(wrapper);

    void wrapper.offsetWidth;
    window.setTimeout(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => wrapper.classList.add("title-entered"));
      });
    }, 160);
    if (!isMay) {
      window.setTimeout(() => wrapper.classList.add("title-landed"), 2450);
    }
    return { layer, element: wrapper, isMay };
  });
}

function startTitleExit() {
  if (state.titleExitStarted) {
    return;
  }
  state.titleExitStarted = true;
  for (const item of state.titleLayers) {
    if (item.isMay) {
      item.element.style.setProperty("--title-exit-x", "0px");
      item.element.style.setProperty("--title-exit-y", `${state.canvasHeight - item.layer.top + 180}px`);
      item.element.style.setProperty("--title-exit-rot", "0deg");
      item.element.style.setProperty("--title-exit-delay", "0.15s");
      item.element.classList.add("title-exit");
      continue;
    }
    item.element.classList.remove("title-landed");
    item.element.style.setProperty("--title-exit-x", "0px");
    item.element.style.setProperty("--title-exit-y", `${-(state.canvasHeight + 240)}px`);
    item.element.style.setProperty("--title-exit-rot", "0deg");
    item.element.style.setProperty("--title-exit-delay", "0s");
    item.element.classList.add("title-exit");
  }
  window.setTimeout(() => {
    for (const item of state.titleLayers) {
      item.element.style.display = "none";
    }
  }, 2600);
}

function startCurtainAnimation() {
  if (state.curtainStarted || state.curtainComplete || state.curtainFrames.length === 0) {
    return;
  }
  state.curtainStarted = true;
  startTitleExit();
  playOneShot(state.curtainAudio);
  playFrameSequence(
    state.curtainFrames,
    state.curtainFrameRate,
    (_, index) => setCurtainFrame(index),
    (_, index) => {
      setCurtainFrame(index);
      state.curtainComplete = true;
    },
  );
}

function setupActor(manifest) {
  const frames = manifest.actorFrames || [];
  if (frames.length === 0) {
    throw new Error("Actor frames 7-1, 7-2, 7-3 were not exported.");
  }
  state.actorFrameRate = manifest.actorFrameRate || 2;
  const startFrame = frames[0];
  const idleFrame = frames[frames.length - 1];
  const sprite = createSprite(startFrame, "actor", idleFrame.zIndex);
  state.actor = { frames, idleFrame, sprite, baseLeft: idleFrame.left };
  state.actorX = startFrame.left;
  state.actorTargetX = startFrame.left;
  state.actorCenterOffsetX = idleFrame.width / 2;
  updateActorTransform();
}

function startActorWakeAnimation() {
  if (!state.actor || state.actorAwake || state.actorWaking) {
    return;
  }
  state.actorWaking = true;
  const wakeFrames = state.actor.frames.slice(1);
  playFrameSequence(
    wakeFrames,
    state.actorFrameRate,
    (frame) => {
      setSpriteFrame(state.actor.sprite, frame);
      state.actorX = frame.left;
      state.actorTargetX = frame.left;
      updateActorTransform();
    },
    () => {
      setSpriteFrame(state.actor.sprite, state.actor.idleFrame);
      state.actorX = state.actor.idleFrame.left;
      state.actorTargetX = state.actor.idleFrame.left;
      state.actor.baseLeft = state.actor.idleFrame.left;
      state.actorCenterOffsetX = state.actor.idleFrame.width / 2;
      state.actorWaking = false;
      state.actorAwake = true;
      state.lastActorMoveTime = performance.now();
      state.interactionsUnlockedAt = performance.now() + 1000;
      updateActorTransform();
      updateBackgroundMusicForActor();
    },
  );
}

function setupFlowers(manifest) {
  const frameRate = manifest.flowerFrameRate || 3;
  state.flowers = (manifest.flowerGroups || []).map((group) => {
    const sprite = createSprite(group.frames[0], "flower sway", group.zIndex);
    const flower = { ...group, sprite, frameRate, blooming: false, bloomed: false, bloomSoundPlayed: false };
    sprite.element.addEventListener("pointerdown", (event) => {
      if (!interactionsReady()) {
        return;
      }
      event.stopPropagation();
      triggerFlower(flower);
    });
    return flower;
  });
}

function triggerFlower(flower) {
  if (flower.blooming || flower.bloomed) {
    return;
  }
  flower.blooming = true;
  flower.bloomSoundPlayed = false;
  flower.sprite.element.classList.add("blooming");
  playFrameSequence(
    flower.frames,
    flower.frameRate,
    (frame) => {
      setSpriteFrame(flower.sprite, frame);
      if (!flower.bloomSoundPlayed && frame.name.endsWith("-3")) {
        flower.bloomSoundPlayed = true;
        playLayeredOneShot(state.bloomAudio);
      }
    },
    () => {
      setSpriteFrame(flower.sprite, flower.frames[flower.frames.length - 1]);
      flower.blooming = false;
      flower.bloomed = true;
      flower.sprite.element.classList.remove("blooming");
    },
  );
}

function actorBounds() {
  if (!state.actor || !state.actorAwake) {
    return null;
  }
  const frame = state.actor.idleFrame;
  return {
    left: state.actorX,
    right: state.actorX + frame.width,
    top: frame.top,
    bottom: frame.top + frame.height,
  };
}

function overlaps(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function triggerFlowersTouchedByActor() {
  const actor = actorBounds();
  if (!actor) {
    return;
  }
  for (const flower of state.flowers) {
    if (flower.bloomed || flower.blooming) {
      continue;
    }
    const frame = flower.sprite.currentFrame;
    const bounds = {
      left: frame.left,
      right: frame.left + frame.width,
      top: frame.top,
      bottom: frame.top + frame.height,
    };
    if (overlaps(actor, bounds)) {
      triggerFlower(flower);
    }
  }
}

function setupButterflies(manifest) {
  const variants = manifest.butterflyVariants?.length
    ? manifest.butterflyVariants
    : [{ frames: manifest.butterflyFrames || [] }];
  if (!variants[0]?.frames || variants[0].frames.length < 2) {
    return;
  }
  state.butterflies = Array.from({ length: 4 }, (_, index) => {
    const variant = chooseButterflyVariant(variants, index);
    const frames = variant.frames;
    const sprite = createSprite(frames[0], "butterfly", frames[0].zIndex + 30 + index);
    sprite.element.style.pointerEvents = "none";
    const butterfly = {
      sprite,
      frames,
      frameIndex: Math.floor(Math.random() * 2),
      x: index === 0 ? frames[0].left : randomBetween(120, 2500),
      y: index === 0 ? frames[0].top : randomBetween(130, 820),
      targetX: 0,
      targetY: 0,
      speed: randomBetween(90, 185),
      scale: randomBetween(0.82, 1.12),
      facing: 1,
      landedUntil: 0,
      nextDecisionAt: 0,
      landingTarget: false,
    };
    chooseButterflyTarget(butterfly);
    setButterflyFrame(butterfly, frames[butterfly.frameIndex]);
    butterfly.frameTimer = window.setInterval(() => {
      if (butterfly.landedUntil > performance.now()) {
        setButterflyFrame(butterfly, frames[0]);
        return;
      }
      butterfly.frameIndex = (butterfly.frameIndex + 1) % 2;
      setButterflyFrame(butterfly, frames[butterfly.frameIndex]);
    }, randomBetween(95, 170));
    return butterfly;
  });
}

function chooseButterflyVariant(variants, index) {
  if (variants.length >= 3) {
    return variants[[0, 1, 2, 1][index] ?? 0];
  }
  if (variants.length === 2) {
    return variants[index === 0 ? 0 : 1];
  }
  return variants[0];
}

function flowerLandingTargets() {
  return state.flowers
    .map((flower) => flower.sprite.currentFrame)
    .filter((frame) => frame.left + frame.width / 2 < 2800);
}

function chooseButterflyTarget(butterfly, now = performance.now()) {
  const frame = butterfly.sprite.currentFrame;
  const flowerTargets = flowerLandingTargets();
  const shouldLand = flowerTargets.length > 0 && Math.random() < 0.32;

  if (shouldLand) {
    const flower = flowerTargets[Math.floor(Math.random() * flowerTargets.length)];
    butterfly.targetX = flower.left + flower.width * randomBetween(0.28, 0.72) - frame.width / 2;
    butterfly.targetY = flower.top + flower.height * randomBetween(0.02, 0.24) - frame.height * 0.62;
    butterfly.landingTarget = true;
  } else {
    butterfly.targetX = randomBetween(90, 2800 - frame.width - 40);
    butterfly.targetY = randomBetween(120, 900);
    butterfly.landingTarget = false;
  }

  butterfly.targetX = clamp(butterfly.targetX, 40, 2800 - frame.width);
  butterfly.targetY = clamp(butterfly.targetY, 70, state.canvasHeight - frame.height - 70);
  butterfly.speed = randomBetween(90, 185);
  butterfly.nextDecisionAt = now + randomBetween(1400, 3200);
}

function setButterflyFrame(butterfly, frame) {
  setSpriteFrame(butterfly.sprite, frame);
  applyButterflyTransform(butterfly);
}

function applyButterflyTransform(butterfly) {
  const frame = butterfly.sprite.currentFrame;
  const offsetX = butterfly.x - frame.left;
  const offsetY = butterfly.y - frame.top;
  butterfly.sprite.element.style.transform =
    `translate3d(${offsetX}px, ${offsetY}px, 0) scale(${butterfly.scale}) scaleX(${butterfly.facing})`;
}

function updateButterflies(now, deltaSeconds) {
  for (const butterfly of state.butterflies) {
    if (butterfly.landedUntil > now) {
      applyButterflyTransform(butterfly);
      continue;
    }
    if (butterfly.landedUntil && butterfly.landedUntil <= now) {
      butterfly.landedUntil = 0;
      chooseButterflyTarget(butterfly, now);
    }
    if (now > butterfly.nextDecisionAt) {
      chooseButterflyTarget(butterfly, now);
    }
    const dx = butterfly.targetX - butterfly.x;
    const dy = butterfly.targetY - butterfly.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 8) {
      if (butterfly.landingTarget) {
        butterfly.landedUntil = now + randomBetween(900, 2600);
        setButterflyFrame(butterfly, butterfly.frames[0]);
      }
      chooseButterflyTarget(butterfly, now);
      continue;
    }
    const step = Math.min(distance, butterfly.speed * deltaSeconds);
    butterfly.x += (dx / distance) * step;
    butterfly.y += (dy / distance) * step + Math.sin(now * 0.006 + butterfly.scale * 10) * 0.28;
    butterfly.facing = dx < 0 ? -1 : 1;
    applyButterflyTransform(butterfly);
  }
}

function setupLeaf(manifest) {
  if (!manifest.layer8) {
    return;
  }
  const sprite = createSprite(manifest.layer8, "leaf sway", manifest.layer8.zIndex);
  state.leaf = { sprite, lifted: false, motionComplete: false };
  sprite.element.addEventListener("pointerdown", (event) => {
    if (!interactionsReady()) {
      return;
    }
    event.stopPropagation();
    playOneShot(state.leafAudio);
    state.leaf.lifted = true;
    state.leaf.motionComplete = false;
    sprite.element.classList.add("lifted");
    sprite.element.style.transform = "translate3d(-100px, 253px, 0) rotate(-20deg)";
    window.setTimeout(() => {
      if (state.leaf) {
        state.leaf.motionComplete = true;
      }
    }, 1400);
  });
}

function ensureChirpAnalyser() {
  if (!state.chirpAudio || !state.audioContext || state.chirpAnalyser) {
    return;
  }
  const source = state.audioContext.createMediaElementSource(state.chirpAudio);
  const analyser = state.audioContext.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);
  analyser.connect(state.audioContext.destination);
  state.chirpAnalyser = analyser;
  state.chirpData = new Uint8Array(analyser.frequencyBinCount);
}

function setupBird(manifest) {
  const frames = manifest.birdFrames || [];
  if (frames.length === 0) {
    return;
  }
  const sprite = createSprite(frames[0], "bird", frames[0].zIndex);
  state.bird = { sprite, frames, audioSwayActive: false, touchTimer: null };
  const hitbox = frames.reduce(
    (box, frame) => ({
      left: Math.min(box.left, frame.left),
      top: Math.min(box.top, frame.top),
      right: Math.max(box.right, frame.left + frame.width),
      bottom: Math.max(box.bottom, frame.top + frame.height),
    }),
    {
      left: frames[0].left,
      top: frames[0].top,
      right: frames[0].left + frames[0].width,
      bottom: frames[0].top + frames[0].height,
    },
  );
  sprite.element.style.left = `${hitbox.left}px`;
  sprite.element.style.top = `${hitbox.top}px`;
  sprite.element.style.width = `${hitbox.right - hitbox.left}px`;
  sprite.element.style.height = `${hitbox.bottom - hitbox.top}px`;
  sprite.image.style.position = "absolute";

  const setBirdFrame = (frame) => {
    state.bird.sprite.currentFrame = frame;
    state.bird.sprite.image.src = versionedSrc(frame.src);
    state.bird.sprite.image.style.left = `${frame.left - hitbox.left}px`;
    state.bird.sprite.image.style.top = `${frame.top - hitbox.top}px`;
    state.bird.sprite.image.style.width = `${frame.width}px`;
    state.bird.sprite.image.style.height = `${frame.height}px`;
    state.bird.sprite.element.style.opacity = String(frame.opacity);
  };
  setBirdFrame(frames[0]);

  const showBird = () => {
    if (!interactionsReady() || !state.leaf?.motionComplete || !frames[1]) {
      return;
    }
    if (state.bird.sprite.currentFrame.name === frames[1].name) {
      return;
    }
    setBirdFrame(frames[1]);
    startBirdAudioSway();
    if (state.chirpAudio) {
      state.chirpAudio.currentTime = 0;
      state.chirpAudio.play().catch(() => {});
    }
  };

  const hideBird = () => {
    setBirdFrame(frames[0]);
    stopBirdAudioSway();
    if (state.chirpAudio) {
      state.chirpAudio.pause();
      state.chirpAudio.currentTime = 0;
    }
  };
  const showBirdBriefly = (event) => {
    if (!interactionsReady() || !state.leaf?.motionComplete) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    showBird();
    if (state.bird.touchTimer) {
      window.clearTimeout(state.bird.touchTimer);
    }
    state.bird.touchTimer = window.setTimeout(() => {
      state.bird.touchTimer = null;
      hideBird();
    }, 3000);
  };

  sprite.element.addEventListener("mouseenter", showBird);
  sprite.element.addEventListener("pointermove", showBird);
  sprite.element.addEventListener("mouseleave", hideBird);
  sprite.element.addEventListener("pointerdown", showBirdBriefly);
}

function startBirdAudioSway() {
  if (!state.bird) {
    return;
  }
  state.bird.audioSwayActive = true;
  ensureChirpAnalyser();

  const animate = (now) => {
    if (!state.bird?.audioSwayActive) {
      return;
    }
    let energy = 0.35;
    if (state.chirpAnalyser && state.chirpData) {
      state.chirpAnalyser.getByteTimeDomainData(state.chirpData);
      let sum = 0;
      for (const value of state.chirpData) {
        const centered = (value - 128) / 128;
        sum += centered * centered;
      }
      energy = Math.min(1, Math.sqrt(sum / state.chirpData.length) * 4.2 + 0.22);
    }
    const wave = Math.sin(now * 0.032);
    state.bird.sprite.image.style.transform = `translateX(${wave * (12 + energy * 22)}px) rotate(${wave * (5 + energy * 9)}deg)`;
    requestAnimationFrame(animate);
  };
  requestAnimationFrame(animate);
}

function stopBirdAudioSway() {
  if (!state.bird) {
    return;
  }
  state.bird.audioSwayActive = false;
  state.bird.sprite.image.style.transform = "";
}

function setupOctopus(manifest) {
  const frames = manifest.octopusFrames || [];
  if (frames.length === 0) {
    return;
  }
  const sprite = createSprite(frames[0], "octopus", frames[0].zIndex);
  state.octopus = { frames, sprite, clicked: false, loopIndex: 0, loopTimer: null };
  const loopFrames = [frames[0], frames[2], frames[0], frames[1]].filter(Boolean);
  const frameDelay = 1000 / (manifest.octopusFrameRate || 1);
  const loop = () => {
    if (!state.octopus || state.octopus.clicked || loopFrames.length === 0) {
      return;
    }
    state.octopus.loopIndex = (state.octopus.loopIndex + 1) % loopFrames.length;
    setSpriteFrame(sprite, loopFrames[state.octopus.loopIndex]);
    state.octopus.loopTimer = window.setTimeout(loop, frameDelay);
  };
  state.octopus.loopTimer = window.setTimeout(loop, frameDelay);

  sprite.element.addEventListener("pointerdown", (event) => {
    if (!interactionsReady() || state.octopus.clicked) {
      return;
    }
    event.stopPropagation();
    playOneShot(state.umAudio);
    state.octopus.clicked = true;
    if (state.octopus.loopTimer) {
      window.clearTimeout(state.octopus.loopTimer);
    }
    playFrameSequence(frames.slice(3), manifest.octopusFrameRate || 2, (frame) => setSpriteFrame(sprite, frame), () => startKeyEntrance());
  });
}

function updateOctopusFacing() {
  if (!state.octopus || !state.actor || !state.actorAwake || state.octopus.sprite.element.style.display === "none") {
    return;
  }
  const frame = state.octopus.sprite.currentFrame;
  const octopusCenterX = frame.left + frame.width / 2;
  const shouldFlip = getActorCenterX() > octopusCenterX;
  if (!shouldFlip) {
    state.octopus.sprite.element.style.transform = "";
    return;
  }
  const correction = frame.name === "5-7" ? "translate3d(129px, -17px, 0) " : "";
  state.octopus.sprite.element.style.transform = `${correction}scaleX(-1)`;
}

function setupAreaSwitch(manifest) {
  const layers = manifest.areaSwitchLayers || [];
  if (layers.length === 0) {
    return;
  }
  const before = layers.find((layer) => layer.name === "3-1") || layers[0];
  const after = layers.find((layer) => layer.name === "3-3") || layers[layers.length - 1];
  const beforeSprite = createSprite(before, "area-switch", before.zIndex);
  const afterSprite = createSprite(after, "area-switch", after.zIndex);
  afterSprite.element.style.display = "none";
  state.areaSwitch = { before: beforeSprite, after: afterSprite };
}

function setupKey(manifest) {
  if (!manifest.keyLayer) {
    return;
  }
  const sprite = createSprite(manifest.keyLayer, "key", manifest.keyLayer.zIndex);
  sprite.element.style.opacity = "0";
  const glow = document.createElement("div");
  glow.className = "key-glow";
  stage.appendChild(glow);
  state.key = { sprite, glow, entered: false, showComplete: false, resolving: false, areaUnlocked: false };
}

function startKeyEntrance() {
  if (!state.key || state.key.entered) {
    return;
  }
  const { sprite, glow } = state.key;
  const frame = sprite.currentFrame;
  const maxScale = Math.min(2.1, state.cameraWidth * 0.28 / frame.width, state.canvasHeight * 0.62 / frame.height);
  const targetCenterX = state.cameraX + state.cameraWidth / 2;
  const targetCenterY = state.canvasHeight / 2;
  const deltaX = targetCenterX - (frame.left + frame.width / 2);
  const deltaY = targetCenterY - (frame.top + frame.height / 2);

  state.key.entered = true;
  state.key.showComplete = false;
  sprite.element.classList.add("visible");
  sprite.element.style.opacity = "";
  if (state.showAudio) {
    state.showAudio.currentTime = 0;
    state.showAudio.onended = () => {
      if (state.key) {
        state.key.showComplete = true;
      }
    };
    state.showAudio.play().catch(() => {});
  } else {
    state.key.showComplete = true;
  }
  requestAnimationFrame(() => {
    sprite.element.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0) scale(${maxScale})`;
  });
  window.setTimeout(() => {
    glow.style.setProperty("--glow-x", `${targetCenterX}px`);
    glow.style.setProperty("--glow-y", `${targetCenterY}px`);
    glow.style.transformOrigin = `${targetCenterX}px ${targetCenterY}px`;
    glow.classList.add("visible");
    if (state.octopus) {
      state.octopus.sprite.element.style.display = "none";
    }
  }, 2250);
}

function startKeyResolveSequence() {
  if (!state.key || state.key.resolving || state.key.areaUnlocked || !state.key.showComplete) {
    return;
  }
  const { sprite, glow } = state.key;
  const frame = sprite.currentFrame;
  const currentTransform = getComputedStyle(sprite.element).transform;
  const targetCenterX = 3061;
  const targetDeltaX = targetCenterX - (frame.left + frame.width / 2);
  state.key.resolving = true;
  glow.classList.remove("visible");
  sprite.element.style.zIndex = String((state.areaSwitch?.after.currentFrame?.zIndex ?? 0) - 1);
  sprite.element.style.transition = "transform 1.25s cubic-bezier(0.2, 0.85, 0.25, 1)";
  if (currentTransform && currentTransform !== "none") {
    sprite.element.style.transform = currentTransform;
  }
  requestAnimationFrame(() => {
    sprite.element.style.transform = `translate3d(${targetDeltaX}px, 0, 0) rotate(106.6deg) scale(0.35)`;
  });
  state.cameraFocus = { x: targetCenterX };

  window.setTimeout(() => {
    sprite.element.style.display = "none";
    if (state.areaSwitch) {
      state.areaSwitch.before.element.style.display = "none";
      state.areaSwitch.after.element.style.display = "";
      playOneShot(state.doorAudio);
    }
    window.setTimeout(() => {
      state.cameraFocus = null;
      state.key.resolving = false;
      state.key.areaUnlocked = true;
    }, 500);
  }, 1300);
}

function setupPendulum(manifest) {
  const frames = manifest.pendulumFrames || [];
  if (frames.length === 0) {
    return;
  }
  const sprite = createSprite(frames[0], "pendulum", frames[0].zIndex);
  state.pendulum = { frames, sprite, loopIndex: 0, loopTimer: null, hoverTimer: null, tapTimer: null, actionPlaying: false };
  const loopFrames = frames.slice(0, 3);
  const loop = () => {
    if (!state.pendulum || state.pendulum.actionPlaying || loopFrames.length === 0) {
      return;
    }
    state.pendulum.loopIndex = (state.pendulum.loopIndex + 1) % loopFrames.length;
    setSpriteFrame(sprite, loopFrames[state.pendulum.loopIndex]);
    state.pendulum.loopTimer = window.setTimeout(loop, 1000 / 3);
  };
  state.pendulum.loopTimer = window.setTimeout(loop, 1000 / 3);

  const startHover = () => {
    if (!interactionsReady() || state.pendulum.actionPlaying) {
      return;
    }
    state.pendulum.actionPlaying = true;
    if (state.pendulum.loopTimer) {
      window.clearTimeout(state.pendulum.loopTimer);
    }
    if (state.fireAudio) {
      state.fireAudio.currentTime = 0;
      state.fireAudio.play().catch(() => {});
    }
    const hoverFrames = frames.slice(3);
    let hoverIndex = 0;
    const hoverLoop = () => {
      if (!state.pendulum?.actionPlaying || hoverFrames.length === 0) {
        return;
      }
      setSpriteFrame(sprite, hoverFrames[hoverIndex % hoverFrames.length]);
      hoverIndex += 1;
      state.pendulum.hoverTimer = window.setTimeout(hoverLoop, 1000 / 3);
    };
    hoverLoop();
  };
  const stopHover = () => {
    if (!state.pendulum.actionPlaying) {
      return;
    }
    state.pendulum.actionPlaying = false;
    if (state.pendulum.hoverTimer) {
      window.clearTimeout(state.pendulum.hoverTimer);
    }
    if (state.fireAudio) {
      state.fireAudio.pause();
      state.fireAudio.currentTime = 0;
    }
    setSpriteFrame(sprite, frames[0]);
    state.pendulum.loopIndex = 0;
    state.pendulum.loopTimer = window.setTimeout(loop, 1000 / 3);
  };
  const playBriefly = (event) => {
    if (!interactionsReady()) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    startHover();
    if (state.pendulum.tapTimer) {
      window.clearTimeout(state.pendulum.tapTimer);
    }
    state.pendulum.tapTimer = window.setTimeout(() => {
      state.pendulum.tapTimer = null;
      stopHover();
    }, 3000);
  };
  sprite.element.addEventListener("mouseenter", startHover);
  sprite.element.addEventListener("pointermove", startHover);
  sprite.element.addEventListener("mouseleave", stopHover);
  sprite.element.addEventListener("pointerdown", playBriefly);
}

function setupMusicBox(manifest) {
  const frames = manifest.musicBoxFrames || [];
  if (frames.length === 0) {
    return;
  }
  const sprite = createSprite(frames[0], "music-box", frames[0].zIndex);
  const hitbox = document.createElement("div");
  hitbox.className = "music-box-hitbox";
  const bounds = frames.reduce(
    (box, frame) => ({
      left: Math.min(box.left, frame.left),
      top: Math.min(box.top, frame.top),
      right: Math.max(box.right, frame.left + frame.width),
      bottom: Math.max(box.bottom, frame.top + frame.height),
    }),
    {
      left: frames[0].left,
      top: frames[0].top,
      right: frames[0].left + frames[0].width,
      bottom: frames[0].top + frames[0].height,
    },
  );
  hitbox.style.left = `${bounds.left}px`;
  hitbox.style.top = `${bounds.top}px`;
  hitbox.style.width = `${bounds.right - bounds.left}px`;
  hitbox.style.height = `${bounds.bottom - bounds.top}px`;
  stage.appendChild(hitbox);

  state.musicBox = { frames, sprite, hitbox, frameRate: manifest.musicBoxFrameRate || 3, playing: false, timer: null };
  const handleClick = (event) => {
    initializeAudio();
    if (!interactionsReady() || state.musicBox.playing) {
      return;
    }
    event.stopPropagation();
    startMusicBox();
  };
  sprite.element.addEventListener("pointerdown", handleClick);
  hitbox.addEventListener("pointerdown", handleClick);
}

function setMusicBoxFrame(frame) {
  if (!state.musicBox || !frame) {
    return;
  }
  setSpriteFrame(state.musicBox.sprite, frame);
}

function startMusicBox() {
  if (!state.musicBox || state.musicBox.playing) {
    return;
  }
  const actionFrames = state.musicBox.frames.slice(1);
  if (actionFrames.length === 0) {
    return;
  }
  state.musicBox.playing = true;
  let index = 0;
  const frameDelay = 1000 / state.musicBox.frameRate;
  const loop = () => {
    if (!state.musicBox?.playing) {
      return;
    }
    setMusicBoxFrame(actionFrames[index % actionFrames.length]);
    index += 1;
    state.musicBox.timer = window.setTimeout(loop, frameDelay);
  };
  if (state.musicBoxAudio) {
    state.musicBoxAudio.pause();
    state.musicBoxAudio.currentTime = 0;
    state.musicBoxAudio.onended = stopMusicBox;
    state.musicBoxAudio.play().catch(() => stopMusicBox());
  } else {
    window.setTimeout(stopMusicBox, 5000);
  }
  loop();
}

function stopMusicBox() {
  if (!state.musicBox) {
    return;
  }
  state.musicBox.playing = false;
  if (state.musicBox.timer) {
    window.clearTimeout(state.musicBox.timer);
    state.musicBox.timer = null;
  }
  setMusicBoxFrame(state.musicBox.frames[0]);
}

function ensureClockAnalyser() {
  if (!state.clockAudio || !state.audioContext || state.clockAnalyser) {
    return;
  }
  const source = state.audioContext.createMediaElementSource(state.clockAudio);
  const analyser = state.audioContext.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);
  analyser.connect(state.audioContext.destination);
  state.clockAnalyser = analyser;
  state.clockData = new Uint8Array(analyser.frequencyBinCount);
}

function clockEnergy() {
  if (!state.clockAnalyser || !state.clockData) {
    return 0.45;
  }
  state.clockAnalyser.getByteTimeDomainData(state.clockData);
  let sum = 0;
  for (const value of state.clockData) {
    const centered = (value - 128) / 128;
    sum += centered * centered;
  }
  return Math.min(1, Math.sqrt(sum / state.clockData.length) * 5 + 0.18);
}

function setupClockHand(manifest) {
  if (!manifest.clockHandLayer) {
    return;
  }
  const sprite = createSprite(manifest.clockHandLayer, "clock-hand", manifest.clockHandLayer.zIndex);
  const pivot = manifest.clockHandLayer.pivot;
  const originX = pivot.x - manifest.clockHandLayer.left;
  const originY = pivot.y - manifest.clockHandLayer.top;
  sprite.element.style.transformOrigin = `${originX}px ${originY}px`;
  const hitbox = document.createElement("div");
  hitbox.className = "clock-hand-hitbox";
  hitbox.style.left = `${manifest.clockHandLayer.left - 42}px`;
  hitbox.style.top = `${manifest.clockHandLayer.top - 18}px`;
  hitbox.style.width = `${manifest.clockHandLayer.width + 84}px`;
  hitbox.style.height = `${manifest.clockHandLayer.height + 44}px`;
  stage.appendChild(hitbox);
  state.clockHand = { sprite, hitbox, pivot };
  const pauseBriefly = (event) => {
    if (!interactionsReady()) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    state.clockTapPauseUntil = performance.now() + 2000;
    setClockPaused(true);
    if (state.clockTapPauseTimer) {
      window.clearTimeout(state.clockTapPauseTimer);
    }
    state.clockTapPauseTimer = window.setTimeout(() => {
      state.clockTapPauseTimer = null;
      state.clockTapPauseUntil = 0;
      setClockPaused(false);
    }, 2000);
  };
  sprite.element.addEventListener("mouseenter", () => setClockPaused(true));
  sprite.element.addEventListener("mouseleave", () => setClockPaused(false));
  sprite.element.addEventListener("pointerdown", pauseBriefly);
  hitbox.addEventListener("pointerdown", pauseBriefly);
}

function updateClockHand(now) {
  if (!state.clockHand || state.clockPaused) {
    return;
  }
  const energy = state.bgm.current === "house" ? clockEnergy() : 0.18;
  const wave = Math.sin(now * 0.0085);
  const angle = wave * Math.min(9, 3.5 + energy * 6);
  state.clockHand.sprite.element.style.transform = `rotate(${angle}deg)`;
}

function setClockPaused(paused) {
  if (!paused && performance.now() < state.clockTapPauseUntil) {
    return;
  }
  if (state.clockPaused === paused) {
    return;
  }
  state.clockPaused = paused;
  if (!state.clockAudio) {
    return;
  }
  if (paused) {
    state.clockAudio.pause();
  } else if (state.bgm.current === "house") {
    ensureClockAnalyser();
    fadeAudio(state.clockAudio, 0.24, 500);
  }
}

function updateClockHover(event) {
  if (window.crystalBallViewer?.visible) {
    return;
  }
  if (!state.clockHand) {
    return;
  }
  const point = pointerToWorld(event);
  if (!point) {
    setClockPaused(false);
    return;
  }
  const frame = state.clockHand.sprite.currentFrame;
  const inside = point.x >= frame.left && point.x <= frame.left + frame.width && point.y >= frame.top && point.y <= frame.top + frame.height;
  setClockPaused(inside);
}

function setupMoth(manifest) {
  const frames = manifest.mothFrames || [];
  if (frames.length === 0) {
    return;
  }
  const sprite = createSprite(frames[0], "moth", frames[0].zIndex);
  const hitbox = document.createElement("div");
  hitbox.className = "moth-hitbox";
  stage.appendChild(hitbox);
  state.moth = {
    frames,
    sprite,
    hitbox,
    active: false,
    clicked: false,
    timer: null,
    baseTimer: null,
    baseIndex: 0,
    sequenceToken: 0,
  };
  const handleClick = (event) => {
    if (!interactionsReady()) {
      return;
    }
    event.stopPropagation();
    if (state.layer6?.shown) {
      return;
    }
    if (state.moth.clicked) {
      return;
    }
    playMothReveal();
  };
  sprite.element.addEventListener("pointerdown", handleClick);
  hitbox.addEventListener("pointerdown", handleClick);
  setMothFrame(frames[0]);
  scheduleMothFlutter();
}

function setMothFrame(frame) {
  if (!state.moth || !frame) {
    return;
  }
  setSpriteFrame(state.moth.sprite, frame);
  state.moth.hitbox.style.left = `${frame.left}px`;
  state.moth.hitbox.style.top = `${frame.top}px`;
  state.moth.hitbox.style.width = `${frame.width}px`;
  state.moth.hitbox.style.height = `${frame.height}px`;
}

function scheduleMothFlutter() {
  if (!state.moth) {
    return;
  }
  if (state.moth.timer) {
    window.clearTimeout(state.moth.timer);
  }
  state.moth.timer = window.setTimeout(() => playMothFlutter(), 900 + Math.random() * 1800);
}

function playMothFlutter() {
  if (!state.moth || state.moth.active || state.moth.clicked) {
    return;
  }
  state.moth.active = true;
  const byName = Object.fromEntries(state.moth.frames.map((frame) => [frame.name, frame]));
  const sequence = [byName["图层 77-1"], byName["图层 77-2"], byName["图层 77-3"], byName["图层 77-2"], byName["图层 77-1"]].filter(Boolean);
  playMothSequence(sequence, 8, () => {
    state.moth.active = false;
    scheduleMothFlutter();
  });
}

function playMothSequence(sequence, frameRate, onDone) {
  if (!state.moth || sequence.length === 0) {
    return;
  }
  const token = ++state.moth.sequenceToken;
  const frameDelay = 1000 / frameRate;
  let index = 0;
  const step = () => {
    if (!state.moth || state.moth.sequenceToken !== token) {
      return;
    }
    setMothFrame(sequence[index]);
    if (index >= sequence.length - 1) {
      onDone?.();
      return;
    }
    index += 1;
    window.setTimeout(step, frameDelay);
  };
  step();
}

function playMothReveal() {
  if (!state.moth || state.moth.clicked) {
    return;
  }
  if (state.layer6?.shown) {
    return;
  }
  if (state.moth.timer) {
    window.clearTimeout(state.moth.timer);
    state.moth.timer = null;
  }
  stopMothBaseLoop();
  const token = ++state.moth.sequenceToken;
  state.moth.active = false;
  state.moth.clicked = true;
  state.moth.active = true;
  const byName = Object.fromEntries(state.moth.frames.map((frame) => [frame.name, frame]));
  const frame4 = byName["图层 77-4"];
  const frame5 = byName["图层 77-5"];
  const frameDelay = 1000;

  if (!frame4 || !frame5) {
    state.moth.clicked = false;
    state.moth.active = false;
    scheduleMothFlutter();
    return;
  }

  setMothFrame(frame4);
  window.setTimeout(() => {
    if (!state.moth || state.moth.sequenceToken !== token || state.layer6?.shown) {
      return;
    }
    setMothFrame(frame5);
    window.setTimeout(() => {
      if (!state.moth || state.moth.sequenceToken !== token) {
        return;
      }
      finishMothReveal(byName);
    }, frameDelay);
  }, frameDelay);
}

function finishMothReveal(byName) {
  if (!state.moth) {
    return;
  }
  showLayer6Magic();
  state.moth.clicked = false;
  state.moth.active = false;
  setMothFrame(byName["图层 77-1"] || state.moth.frames[0]);
  scheduleMothFlutter();
}

function startMothBaseLoop() {
  if (!state.moth || state.moth.baseTimer) {
    return;
  }
  if (state.moth.timer) {
    window.clearTimeout(state.moth.timer);
    state.moth.timer = null;
  }
  state.moth.active = false;
  state.moth.clicked = false;
  const byName = Object.fromEntries(state.moth.frames.map((frame) => [frame.name, frame]));
  const loopFrames = [byName["图层 77-1"], byName["图层 77-2"], byName["图层 77-3"]].filter(Boolean);
  if (loopFrames.length === 0) {
    return;
  }
  state.moth.baseIndex = 0;
  setMothFrame(loopFrames[0]);
  state.moth.baseTimer = window.setInterval(() => {
    state.moth.baseIndex = (state.moth.baseIndex + 1) % loopFrames.length;
    setMothFrame(loopFrames[state.moth.baseIndex]);
  }, 125);
}

function stopMothBaseLoop() {
  if (!state.moth?.baseTimer) {
    return;
  }
  window.clearInterval(state.moth.baseTimer);
  state.moth.baseTimer = null;
}

function setupLayer6(manifest) {
  if (!manifest.layer6) {
    return;
  }
  const sprite = createSprite(manifest.layer6, "magic-reveal", manifest.layer6.zIndex);
  sprite.element.style.opacity = "0";
  sprite.element.style.pointerEvents = "none";
  const hitbox = document.createElement("div");
  hitbox.className = "layer6-hitbox";
  hitbox.style.left = `${manifest.layer6.left - 64}px`;
  hitbox.style.top = `${manifest.layer6.top - 64}px`;
  hitbox.style.width = `${manifest.layer6.width + 128}px`;
  hitbox.style.height = `${manifest.layer6.height + 128}px`;
  stage.appendChild(hitbox);

  const openCrystalBall = (event) => {
    if (!state.layer6?.shown) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    requestLandscapeMode();
    initializeAudio();
    window.crystalBallViewer?.show();
  };
  sprite.element.addEventListener("pointerdown", openCrystalBall);
  hitbox.addEventListener("pointerdown", openCrystalBall);
  const effect = document.createElement("div");
  effect.className = "magic-poof";
  stage.appendChild(effect);
  state.layer6 = { sprite, hitbox, effect, shown: false };
}

function showLayer6Magic() {
  if (!state.layer6) {
    return;
  }
  const { sprite, effect } = state.layer6;
  const frame = sprite.currentFrame;
  const centerX = frame.left + frame.width / 2;
  const centerY = frame.top + frame.height / 2;
  const firstReveal = !state.layer6.shown;
  state.layer6.shown = true;
  effect.style.left = `${centerX}px`;
  effect.style.top = `${centerY}px`;
  effect.classList.remove("visible");
  void effect.offsetWidth;
  effect.classList.add("visible");
  if (firstReveal) {
    sprite.element.style.opacity = "1";
    sprite.element.style.pointerEvents = "auto";
    state.layer6.hitbox.classList.add("active");
    sprite.element.classList.add("visible");
  }
}

function fadeAudio(audio, targetVolume, duration = 1300) {
  if (!audio) {
    return;
  }
  const startVolume = audio.volume;
  const startTime = performance.now();
  if (targetVolume > 0) {
    audio.play().catch(() => {});
  }
  const step = (now) => {
    const progress = clamp((now - startTime) / duration, 0, 1);
    audio.volume = startVolume + (targetVolume - startVolume) * progress;
    if (progress < 1) {
      requestAnimationFrame(step);
    } else if (targetVolume === 0) {
      audio.pause();
      audio.currentTime = 0;
    }
  };
  requestAnimationFrame(step);
}

function switchBackgroundMusic(targetName) {
  if (!state.bgm.unlocked || state.bgm.current === targetName) {
    return;
  }
  const previous = state.bgm[state.bgm.current];
  const next = state.bgm[targetName];
  state.bgm.current = targetName;
  fadeAudio(previous, 0, 1400);
  fadeAudio(next, 0.42, 1400);
  if (state.clockAudio) {
    if (targetName === "house") {
      ensureClockAnalyser();
      if (!state.clockPaused) {
        fadeAudio(state.clockAudio, 0.24, 900);
      }
    } else {
      fadeAudio(state.clockAudio, 0, 900);
    }
  }
}

function startBackgroundMusic() {
  if (!state.bgm.forest || !state.bgm.house) {
    return;
  }
  state.bgm.forest.volume = 0;
  state.bgm.house.volume = 0;
  state.bgm.current = null;
  updateBackgroundMusicForActor(true);
}

function updateBackgroundMusicForActor(force = false) {
  if (!state.actor || !state.bgm.unlocked) {
    return;
  }
  const nextTrack = getActorCenterX() > 3154.4 ? "house" : "forest";
  if (force) {
    state.bgm.current = null;
  }
  switchBackgroundMusic(nextTrack);
}

async function loadStage() {
  const response = await fetch("assets/layers.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Unable to load layers.json: ${response.status}`);
  }
  const manifest = await response.json();
  state.canvasWidth = manifest.canvasWidth;
  state.canvasHeight = manifest.canvasHeight;
  state.assetVersion = manifest.assetVersion;
  state.displayWorldWidth = manifest.displayWorldWidth || 2300;
  state.actorMoveRightLimit = manifest.actorMoveRightLimit || 4550;

  if (manifest.audio?.chirp) {
    state.chirpAudio = new Audio(versionedSrc(manifest.audio.chirp));
    state.chirpAudio.loop = true;
  }
  if (manifest.audio?.forest) {
    state.bgm.forest = new Audio(versionedSrc(manifest.audio.forest));
    state.bgm.forest.loop = true;
  }
  if (manifest.audio?.house) {
    state.bgm.house = new Audio(versionedSrc(manifest.audio.house));
    state.bgm.house.loop = true;
  }
  if (manifest.audio?.show) {
    state.showAudio = new Audio(versionedSrc(manifest.audio.show));
  }
  if (manifest.audio?.door) {
    state.doorAudio = new Audio(versionedSrc(manifest.audio.door));
  }
  if (manifest.audio?.bloom) {
    state.bloomAudio = new Audio(versionedSrc(manifest.audio.bloom));
  }
  if (manifest.audio?.musicBox) {
    state.musicBoxAudio = new Audio(versionedSrc(manifest.audio.musicBox));
  }
  if (manifest.audio?.curtain) {
    state.curtainAudio = new Audio(versionedSrc(manifest.audio.curtain));
  }
  if (manifest.audio?.leaf) {
    state.leafAudio = new Audio(versionedSrc(manifest.audio.leaf));
  }
  if (manifest.audio?.um) {
    state.umAudio = new Audio(versionedSrc(manifest.audio.um));
  }
  if (manifest.audio?.clock) {
    state.clockAudio = new Audio(versionedSrc(manifest.audio.clock));
    state.clockAudio.loop = true;
    state.clockAudio.volume = 0;
  }
  if (manifest.audio?.fire) {
    state.fireAudio = new Audio(versionedSrc(manifest.audio.fire));
    state.fireAudio.loop = true;
  }

  for (const layer of manifest.layers) {
    stage.appendChild(makeLayerElement(layer));
  }

  setupTitle(manifest);
  setupBird(manifest);
  setupLeaf(manifest);
  setupFlowers(manifest);
  setupButterflies(manifest);
  setupAreaSwitch(manifest);
  setupPendulum(manifest);
  setupMusicBox(manifest);
  setupClockHand(manifest);
  setupMoth(manifest);
  setupLayer6(manifest);
  setupOctopus(manifest);
  setupKey(manifest);
  setupActor(manifest);
  setupCurtain(manifest);
  resizeStage();
  loading.classList.add("hidden");
  requestAnimationFrame(tick);
}

viewport.addEventListener("pointerdown", (event) => {
  if (window.crystalBallViewer?.visible) {
    event.stopPropagation();
    return;
  }
  requestLandscapeMode();
  initializeAudio();

  if (!state.curtainComplete) {
    startCurtainAnimation();
    return;
  }
  if (!state.actorAwake) {
    startActorWakeAnimation();
    return;
  }
  if (state.key?.entered && !state.key.areaUnlocked) {
    if (state.key.showComplete && !state.key.resolving) {
      startKeyResolveSequence();
    }
    return;
  }
  if (!interactionsReady()) {
    return;
  }
  scheduleActorMove(event);
});

viewport.addEventListener("pointermove", updateClockHover);
viewport.addEventListener("mousemove", updateClockHover);
viewport.addEventListener("pointerleave", () => setClockPaused(false));
viewport.addEventListener("mouseleave", () => setClockPaused(false));
window.addEventListener("resize", () => {
  resizeStage();
  updateOrientationHint();
});
window.addEventListener("orientationchange", () => {
  window.setTimeout(() => {
    resizeStage();
    updateOrientationHint();
  }, 120);
});
updateOrientationHint();

loadStage().catch((error) => {
  loading.textContent = error.message;
  console.error(error);
});
