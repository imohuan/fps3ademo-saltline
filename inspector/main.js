// Saltline Asset Inspector - standalone viewer reusing the game's pipelines.
// Run: cd inspector && npm run dev  (http://127.0.0.1:5174)
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  PCFSoftShadowMap,
  AmbientLight,
  WebGLRenderTarget,
  RGBAFormat,
  UnsignedByteType,
  ACESFilmicToneMapping,
  Color,
} from "../src/vendor/three-r180.js";

// local clamp: avoids depending on the vendored MathUtils namespace
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
import { QUALITY_PRESETS } from "../src/core/config.js";
import { createRenderer } from "../src/render/renderer.js";
import { createMaterials } from "../src/render/materials/materials.js";
import { createAudio } from "../src/audio/audio.js";
import { PROP_SIZES, registerProp } from "../src/world/props/registry.js";
import { registerDetailedProps } from "../src/world/props/detailed-builders.js";
import { registerCharacterProps } from "../src/world/props/character-builders.js";
import { registerCargoProps } from "../src/world/props/cargo-builders.js";
import {
  buildBasicContainer,
  buildJerseyBarrier,
  buildLightMast,
  buildFencePanel,
  buildGuardBooth,
  buildGateArm,
  buildMooringBollard,
  buildBollardPost,
  buildRelayNode,
  buildShelfRack,
  buildMetalStairs,
  buildReeferUnit,
  buildSignPost,
  buildFloodlightStand,
} from "../src/world/props/basic-builders.js";
import { createWalkerModel, createDroneModel, pm } from "../src/enemies/models.js";
import { createEnemies } from "../src/enemies/enemies.js";
import { createWeapon } from "../src/weapons/weapon.js";
import { createRandom } from "../src/core/random.js";
import { createEventBus } from "../src/core/events.js";
import { createProps } from "../src/world/props/props.js";
import rawWalker from "../src/enemies/walker.js?raw";
import rawDrone from "../src/enemies/drone.js?raw";
import rawModels from "../src/enemies/models.js?raw";
import rawWeapon from "../src/weapons/weapon.js?raw";
import rawWeaponRig from "../src/weapons/rig.js?raw";
import rawRegistry from "../src/world/props/registry.js?raw";
import rawBasic from "../src/world/props/basic-builders.js?raw";
import rawCargo from "../src/world/props/cargo-builders.js?raw";
import rawDetailed from "../src/world/props/detailed-builders.js?raw";
import rawCharacter from "../src/world/props/character-builders.js?raw";
import rawLibrary from "../src/audio/library.js?raw";
import rawSynthesis from "../src/audio/synthesis.js?raw";
import rawStudioProp from "./studio-prop.js?raw";
import {
  HemisphereLight,
  DirectionalLight,
  Box3,
} from "../src/vendor/three-r180.js";
import {
  STUDIO_PROP_NAME,
  createStudioProp,
} from "./studio-prop.js";

for (let [k, b] of [
  ["container20", (c, o) => buildBasicContainer(c, "container20", o)],
  ["container40", (c, o) => buildBasicContainer(c, "container40", o)],
  ["container40hc", (c, o) => buildBasicContainer(c, "container40hc", o)],
  ["jersey_barrier", buildJerseyBarrier],
  ["light_mast", buildLightMast],
  ["fence_panel", buildFencePanel],
  ["guard_booth", buildGuardBooth],
  ["gate_arm", buildGateArm],
  ["bollard_mooring", buildMooringBollard],
  ["bollard_post", buildBollardPost],
  ["relay_node", buildRelayNode],
  ["shelf_rack", buildShelfRack],
  ["stairs_metal", buildMetalStairs],
  ["reefer_unit", buildReeferUnit],
  ["sign_post", buildSignPost],
  ["floodlight_stand", buildFloodlightStand],
]) registerProp(k, b);
registerDetailedProps(registerProp);
registerCharacterProps(registerProp);
registerCargoProps(registerProp);
registerProp(STUDIO_PROP_NAME, createStudioProp);

// ---------- shared context for the game factories ----------
const canvas = document.getElementById("view");
const context = {
  params: {},
  events: createEventBus(),
  rng: createRandom(4207),
  time: { t: 0, dt: 0, frame: 0, real: 0 },
  quality: { ...QUALITY_PRESETS.high, name: "high" },
};
context.render = await createRenderer(context);
context.renderer = context.render.renderer;
context.scene = context.render.scene;
context.camera = context.render.camera;
context.mats = await createMaterials(context);
context.audio = await createAudio(context);
context.props = createProps(context);

// high sun for open-sky look (renderer defaults to a low dawn angle)
context.render.sun.position.set(28, 42, 18);
context.render.sun.target.position.set(0, 0, 0);
context.render.sun.target.updateMatrixWorld();
context.scene.add(context.render.sun);

// ---------- exhibit stage ----------
const stage = new Group();
stage.name = "stage";
context.scene.add(stage);

// subtle ground disc so the object has grounding + shadow catcher
const ground = new Mesh(
  new BoxGeometry(14, 0.08, 14).translate(0, -0.04, 0),
  context.mats.get("concrete"),
);
ground.receiveShadow = true;
stage.add(ground);

// soft backdrop ring for depth
const ring = new Mesh(
  new BoxGeometry(30, 0.06, 30).translate(0, -0.06, 0),
  context.mats.get("asphalt"),
);
ring.receiveShadow = true;
stage.add(ring);

const mount = new Group(); // current exhibit lives here
stage.add(mount);

// ---------- trackball-style orbit camera ----------
let orbit = {
  yaw: Math.PI * 0.25, // horizontal angle
  pitch: 0.35, // vertical angle, clamped above ground
  dist: 5,
  target: new Vector3(0, 0.8, 0),
};
const MIN_PITCH = 0.08; // never dip under the floor
const MAX_PITCH = Math.PI * 0.48;
const MIN_DIST = 0.9;
const MAX_DIST = 18;

function updateCamera() {
  const { yaw, pitch, dist, target } = orbit;
  const cp = Math.cos(pitch);
  context.camera.position.set(
    target.x + Math.sin(yaw) * cp * dist,
    target.y + Math.sin(pitch) * dist,
    target.z + Math.cos(yaw) * cp * dist,
  );
  context.camera.lookAt(target);
}

let dragging = false;
let lastX = 0;
let lastY = 0;
canvas.addEventListener("pointerdown", (e) => {
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  canvas.classList.add("dragging");
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  // dragging right turns the model to the right (view swings left), which
  // matches how people expect to "grab" the object
  orbit.yaw -= dx * 0.0075;
  orbit.pitch = clamp(
    orbit.pitch + dy * 0.006,
    MIN_PITCH,
    MAX_PITCH,
  );
});
const stopDrag = () => {
  dragging = false;
  canvas.classList.remove("dragging");
};
canvas.addEventListener("pointerup", stopDrag);
canvas.addEventListener("pointercancel", stopDrag);
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    orbit.dist = clamp(
      orbit.dist * (1 + Math.sign(e.deltaY) * 0.12),
      MIN_DIST,
      MAX_DIST,
    );
  },
  { passive: false },
);

// ---------- asset catalog ----------
// Reuse the game's real enemy pool: createEnemies() builds correctly-configured
// rigs, materials (armor_white/gunmetal triplanar) and inert bolt pools.
context.physics = {
  raycast: () => null,
  lineOfSight: () => true,
  groundHeight: () => 0,
  nav: { isWalkable: () => true, findPath: () => null, randomPoint: () => null },
};
context.fx = {
  tracer() {}, muzzleFlash() {}, sparks() {}, smoke() {}, debris() {},
  impact() {}, explosion() {}, shell() {}, decal() {}, dust() {},
  clear() {}, splash() {}, addEmitter: () => ({ stop() {}, setPos() {} }),
};
context.combat = { enemyShot: () => false };
context.player = null;
const enemies = await createEnemies(context);
const walkerPrototype = enemies.list.find((e) => e.type === "gull");
const dronePrototype = enemies.list.find((e) => e.type === "hound");

const weapon = await createWeapon(context);
const weaponRoot = weapon.root;

function makeWalkerActor() {
  const enemy = enemies.spawn("gull", new Vector3(0, 0, 0), {
    passive: true,
    hover: 1.1,
  });
  return enemy;
}
function makeDroneActor() {
  const enemy = enemies.spawn("hound", new Vector3(0, 0, 0), { passive: true });
  return enemy;
}

function propNode(name) {
  const prop = context.props.build(name, {
    seed: 5,
    doors: name.startsWith("container") ? 0.6 : 0,
  });
  prop.position.set(0, 0, 0);
  return prop;
}

// Each category declares where its implementation lives; the Code tab loads
// the actual source text at runtime through Vite's raw import.
const CATEGORIES = [
  {
    id: "props",
    label: "Props",
    build: (name) => propNode(name),
    names: () => {
      const base = Object.keys(PROP_SIZES);
      // studio prop lives in the list even though it has no PROP_SIZES entry
      return base.includes(STUDIO_PROP_NAME) ? base : [...base, STUDIO_PROP_NAME];
    },
    code: (name) => propSource(name),
  },
  {
    id: "actors",
    label: "Actors",
    names: () => ["walker", "drone"],
    build: (name) => {
      const enemy = name === "walker" ? makeWalkerActor() : makeDroneActor();
      if (!enemy) throw new Error("pool exhausted for " + name);
      const node = enemy.rig.group;
      if (node.parent) node.parent.remove(node);
      node.visible = true;
      node.position.set(0, 0, 0);
      node.rotation.set(0, 0, 0);
      return { node, actor: enemy };
    },
    actions: (name) =>
      name === "walker"
        ? ["idle", "walk", "aim"]
        : ["idle", "walk", "aim"],
    code: (name) =>
      name === "walker"
        ? [
            ["src/enemies/walker.js", "createWalker", "Behaviour, gait and state machine"],
            ["src/enemies/models.js", "createWalkerModel", "Bone rig + geometry assembly"],
          ]
        : [
            ["src/enemies/drone.js", "createDrone", "Behaviour, leg stepping"],
            ["src/enemies/models.js", "createDroneModel", "Bone rig + geometry assembly"],
          ],
  },
  {
    id: "weapons",
    label: "Weapons",
    names: () => ["pac9_rifle"],
    build: () => {
      weaponRoot.position.set(0, 0.15, 0);
      weaponRoot.rotation.set(0, Math.PI * 0.5, 0);
      weaponRoot.traverse((o) => {
        o.layers && o.layers.set(0);
        o.castShadow = true;
      });
      return weaponRoot;
    },
    actions: () => ["fire", "reload", "ads"],
    code: () => [
      ["src/weapons/weapon.js", "createWeapon", "State machine: fire / reload / ADS / recoil"],
      ["src/weapons/rig.js", "N_", "Receiver, rail and sight geometry"],
    ],
  },
  {
    id: "audio",
    label: "Sound",
    names: () => context.audio.names,
    build: null, // audio exhibits render a speaker stand
    code: () => [
      ["src/audio/library.js", "Go", "Sound catalog: name -> generator + mix settings"],
      ["src/audio/synthesis.js", "Av", "Biquad filter design used by every generator"],
    ],
  },
];

// ---------- source loading for the Code tab ----------
// Vite serves any project file as text with the ?raw suffix, so the panel can
// show real implementation code instead of a file path.
const RAW = {
  "src/enemies/walker.js": rawWalker,
  "src/enemies/drone.js": rawDrone,
  "src/enemies/models.js": rawModels,
  "src/weapons/weapon.js": rawWeapon,
  "src/weapons/rig.js": rawWeaponRig,
  "src/world/props/registry.js": rawRegistry,
  "src/world/props/basic-builders.js": rawBasic,
  "src/world/props/cargo-builders.js": rawCargo,
  "src/world/props/detailed-builders.js": rawDetailed,
  "src/world/props/character-builders.js": rawCharacter,
  "inspector/studio-prop.js": rawStudioProp,
  "src/audio/library.js": rawLibrary,
  "src/audio/synthesis.js": rawSynthesis,
};
async function rawSource(path) {
  return RAW[path] || null;
}

// pull one named function/block out of a source file
function extractBlock(src, anchor) {
  if (!src) return null;
  const name = anchor
    .replace(/^(?:async\s+)?(?:function\s+|const\s+|let\s+|var\s+|class\s+)/, "")
    .trim();
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const decl = new RegExp(
    "^(?:async\\s+)?(?:function\\s+|const\\s+|let\\s+|var\\s+|class\\s+)" +
      escaped +
      "\\b",
    "m",
  );
  const declMatch = src.match(decl);
  const at = declMatch ? declMatch.index : src.indexOf(name);
  if (at < 0) return null;
  const lineStart = src.lastIndexOf(String.fromCharCode(10), at) + 1;
  // skip the identifier itself so a default value like "t = {}" cannot be
  // mistaken for the body
  return extractBlockFrom(src, lineStart, at + name.length);
}

function extractBlockFrom(src, lineStart, from) {
  const bodyOpen = findBodyOpen(src, from);
  if (bodyOpen < 0) {
    const eol = src.indexOf(String.fromCharCode(10), from);
    return src.slice(lineStart, eol < 0 ? src.length : eol + 1);
  }
  const bodyClose = matchBrace(src, bodyOpen);
  if (bodyClose < 0) return src.slice(lineStart);
  return src.slice(lineStart, bodyClose + 1);
}

function skipAtomic(src, i) {
  const ch = src[i];
  const next = src[i + 1];
  const tick = String.fromCharCode(96);
  if (ch === "/" && next === "/") {
    const nl = src.indexOf(String.fromCharCode(10), i);
    return nl < 0 ? src.length : nl;
  }
  if (ch === "/" && next === "*") {
    const end = src.indexOf("*/", i + 2);
    return end < 0 ? src.length : end + 2;
  }
  if (ch === '"' || ch === "'" || ch === tick) {
    let j = i + 1;
    while (j < src.length) {
      if (src[j] === String.fromCharCode(92)) {
        j += 2;
        continue;
      }
      if (src[j] === ch) return j + 1;
      j++;
    }
    return src.length;
  }
  return i;
}

// The body always follows the parameter list. Skipping the parens first keeps
// default values such as "opts = {}" from being read as the body.
function findBodyOpen(src, from) {
  let i = from;
  let paramOpen = -1;
  while (i < src.length) {
    const next = skipAtomic(src, i);
    if (next > i) {
      i = next;
      continue;
    }
    if (src[i] === "(") {
      paramOpen = i;
      break;
    }
    // no parameter list at all: the brace right here starts the body
    if (src[i] === "{") return i;
    if (src[i] === ";") return -1;
    i++;
  }
  if (paramOpen >= 0) {
    const close = matchBrace(src, paramOpen);
    if (close < 0) return -1;
    i = close + 1;
  }
  while (i < src.length) {
    const ch = src[i];
    const next = skipAtomic(src, i);
    if (next > i) {
      i = next;
      continue;
    }
    if (ch === "{") return i;
    if (ch === ";") return -1;
    i++;
  }
  return -1;
}

function matchBrace(src, open) {
  const openCh = src[open];
  const closeCh = openCh === "{" ? "}" : ")";
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    const next = skipAtomic(src, i);
    if (next > i) {
      i = next - 1;
      continue;
    }
    if (ch === openCh) depth++;
    else if (ch === closeCh) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// props share a handful of builder functions; map each prop to its real factory
const PROP_BUILDER = {
  container20: ["basic-builders", "function buildBasicContainer"],
  container40: ["basic-builders", "function buildBasicContainer"],
  container40hc: ["basic-builders", "function buildBasicContainer"],
  jersey_barrier: ["basic-builders", "function buildJerseyBarrier"],
  light_mast: ["basic-builders", "function buildLightMast"],
  fence_panel: ["basic-builders", "function buildFencePanel"],
  guard_booth: ["basic-builders", "function buildGuardBooth"],
  gate_arm: ["basic-builders", "function buildGateArm"],
  bollard_mooring: ["basic-builders", "function buildMooringBollard"],
  bollard_post: ["basic-builders", "function buildBollardPost"],
  relay_node: ["basic-builders", "function buildRelayNode"],
  shelf_rack: ["basic-builders", "function buildShelfRack"],
  stairs_metal: ["basic-builders", "function buildMetalStairs"],
  catwalk: ["basic-builders", "function buildCatwalk"],
  reefer_unit: ["basic-builders", "function buildReeferUnit"],
  sign_post: ["basic-builders", "function buildSignPost"],
  floodlight_stand: ["basic-builders", "function buildFloodlightStand"],
  // cargo-builders.js
  forklift: ["cargo-builders", "function oR"],
  generator: ["cargo-builders", "function rR"],
  dumpster: ["cargo-builders", "function aR"],
  toolbox_cart: ["cargo-builders", "function lR"],
  // detailed-builders.js
  barrel: ["detailed-builders", "function S1"],
  pallet: ["detailed-builders", "function VA"],
  pallet_stack: ["detailed-builders", "function WA"],
  crate_wood: ["detailed-builders", "function GA"],
  crate_stack: ["detailed-builders", "function qA"],
  ibc_tote: ["detailed-builders", "function XA"],
  cable_reel: ["detailed-builders", "function YA"],
  tire_stack: ["detailed-builders", "function $A"],
  jerry_can: ["detailed-builders", "function ZA"],
  traffic_cone: ["detailed-builders", "function jA"],
  gas_cylinders: ["detailed-builders", "function JA"],
  pipe_stack: ["detailed-builders", "function KA"],
  // character-builders.js
  tarp_cargo: ["character-builders", "function QA"],
  sandbags: ["character-builders", "function tR"],
  cardboard_boxes: ["character-builders", "function nR"],
};

function propSource(name) {
  const entry = PROP_BUILDER[name];
  if (name === STUDIO_PROP_NAME) {
    return [["inspector/studio-prop.js", "createStudioProp", "Live-edit studio prop (HMR target)"]];
  }
  const out = [];
  if (entry) {
    out.push([
      "src/world/props/" + entry[0] + ".js",
      entry[1],
      "Builder implementation for " + name,
    ]);
  } else {
    out.push([
      "src/world/props/register.js",
      "registerProp",
      "Registration order for " + name + " (builder not mapped)",
    ]);
  }
  // registry last: it is a long lookup table, the builder is what you came for
  out.push([
    "src/world/props/registry.js",
    "var PROP_SIZES",
    "Footprint, material and surface for " + name,
  ]);
  return out;
}

// speakers for audio entries
function makeSpeaker() {
  const g = new Group();
  const box = new Mesh(
    new BoxGeometry(0.6, 1.1, 0.6),
    context.mats.get("paint_white"),
  );
  box.position.y = 0.55;
  box.castShadow = true;
  g.add(box);
  const cone = new Mesh(
    new BoxGeometry(0.42, 0.42, 0.06),
    context.mats.get("steel_dark"),
  );
  cone.position.set(0, 0.8, 0.32);
  g.add(cone);
  const cone2 = cone.clone();
  cone2.position.y = 0.3;
  g.add(cone2);
  return g;
}

// ---------- panel UI ----------
const listEl = document.getElementById("list");
const searchEl = document.getElementById("search");
const stageInfo = document.getElementById("stage-info");
const codeView = document.getElementById("code-view");
const codeTabs = document.getElementById("code-tabs");
const actTitle = document.getElementById("act-title");
const actRow = document.getElementById("act-row");
const chipsEl = document.getElementById("chips");
const bootEl = document.getElementById("boot");
const bootMsg = document.getElementById("boot-msg");
const bootFill = document.getElementById("boot-fill");
function bootStep(text, t) {
  if (bootMsg) bootMsg.textContent = text;
  if (bootFill) bootFill.style.width = Math.round(t * 100) + "%";
}
import { GUIDE_HTML } from "./guide.js";
document.getElementById("guide-body").innerHTML = GUIDE_HTML;

let current = null; // { cat, name, node, actor, actions }
let currentAction = null;
let currentActionBtn = null;

// Thumbnails are rendered with the MAIN renderer into an offscreen target.
// A second WebGL context cannot sample textures baked by the first one, which
// is what made every thumbnail render black.
const THUMB_W = 144;
const THUMB_H = 104;
const thumbScene = new Scene();
thumbScene.background = null;
const thumbCam = new PerspectiveCamera(32, THUMB_W / THUMB_H, 0.1, 100);
const thumbRT = new WebGLRenderTarget(THUMB_W, THUMB_H, {
  format: RGBAFormat,
  type: UnsignedByteType,
  colorSpace: SRGBColorSpace,
});
const thumbPixels = new Uint8Array(THUMB_W * THUMB_H * 4);
// Three-point-ish rig: bright sky fill + key + rim so nothing goes black.
thumbScene.add(new HemisphereLight(0xd8e6f2, 0x50442f, 3.4));
thumbScene.add(new AmbientLight(0xffffff, 1.4));
const thumbSun = new DirectionalLight(0xfff1d0, 4.2);
thumbSun.position.set(4.5, 7, 5);
thumbSun.castShadow = true;
thumbSun.shadow.mapSize.set(512, 512);
thumbScene.add(thumbSun);
const thumbRim = new DirectionalLight(0x9fc4e8, 2.4);
thumbRim.position.set(-5, 4, -6);
thumbScene.add(thumbRim);

const thumbGround = new Mesh(
  new BoxGeometry(10, 0.05, 10).translate(0, -0.025, 0),
  new MeshStandardMaterial({ color: 0x1a1d20, roughness: 0.95 }),
);
thumbGround.receiveShadow = true;
thumbScene.add(thumbGround);

const thumbHolder = new Group();
thumbScene.add(thumbHolder);

function renderThumb(build) {
  while (thumbHolder.children.length) thumbHolder.remove(thumbHolder.children[0]);
  const node = build();
  if (!node) return null;
  thumbHolder.add(node);
  // frame by bounding box
  const box = new (class {}).constructor === Object ? null : null;
  // compute bbox manually via traverse
  let minX = 1e9, minY = 1e9, minZ = 1e9, maxX = -1e9, maxY = -1e9, maxZ = -1e9;
  node.updateMatrixWorld(true);
  node.traverse((o) => {
    if (!o.geometry) return;
    o.geometry.computeBoundingBox();
    const b = o.geometry.boundingBox;
    const corners = [
      [b.min.x, b.min.y, b.min.z], [b.max.x, b.min.y, b.min.z],
      [b.min.x, b.max.y, b.min.z], [b.max.x, b.max.y, b.min.z],
      [b.min.x, b.min.y, b.max.z], [b.max.x, b.min.y, b.max.z],
      [b.min.x, b.max.y, b.max.z], [b.max.x, b.max.y, b.max.z],
    ];
    for (const c of corners) {
      const v = new Vector3(c[0], c[1], c[2]).applyMatrix4(o.matrixWorld);
      minX = Math.min(minX, v.x); minY = Math.min(minY, v.y); minZ = Math.min(minZ, v.z);
      maxX = Math.max(maxX, v.x); maxY = Math.max(maxY, v.y); maxZ = Math.max(maxZ, v.z);
    }
  });
  if (minX > maxX) { minX = -1; minY = 0; minZ = -1; maxX = 1; maxY = 1; maxZ = 1; }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
  const size = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 0.4);
  const dist = size * 1.9;
  thumbCam.position.set(cx + dist * 0.75, cy + dist * 0.55, cz + dist * 0.85);
  thumbCam.lookAt(cx, cy, cz);

  const r = context.renderer;
  const prevTarget = r.getRenderTarget();
  const prevTone = r.toneMapping;
  const prevExposure = r.toneMappingExposure;
  const prevClearAlpha = r.getClearAlpha();
  const prevColor = new Color();
  r.getClearColor(prevColor);
  try {
    r.setRenderTarget(thumbRT);
    r.setClearColor(0x151a1e, 1);
    r.toneMapping = ACESFilmicToneMapping;
    r.toneMappingExposure = 1.15;
    r.clear();
    r.render(thumbScene, thumbCam);
    r.readRenderTargetPixels(thumbRT, 0, 0, THUMB_W, THUMB_H, thumbPixels);
  } catch (e) {
    console.warn("[thumb] render failed", e);
  } finally {
    r.setRenderTarget(prevTarget);
    r.toneMapping = prevTone;
    r.toneMappingExposure = prevExposure;
    r.setClearColor(prevColor, prevClearAlpha);
    thumbHolder.remove(node);
  }

  // WebGL reads bottom-up; flip rows while blitting into a per-entry canvas
  const out = document.createElement("canvas");
  out.width = THUMB_W;
  out.height = THUMB_H;
  const ctx = out.getContext("2d");
  const img = ctx.createImageData(THUMB_W, THUMB_H);
  const rowBytes = THUMB_W * 4;
  for (let y = 0; y < THUMB_H; y++) {
    const src = (THUMB_H - 1 - y) * rowBytes;
    img.data.set(thumbPixels.subarray(src, src + rowBytes), y * rowBytes);
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

async function buildList(onProgress) {
  const filter = searchEl.value.trim().toLowerCase();
  listEl.innerHTML = "";
  const jobs = [];
  for (const cat of CATEGORIES) {
    if (activeCat !== "all" && cat.id !== activeCat) continue;
    const names = cat.names().filter(
      (n) => !filter || n.toLowerCase().includes(filter) || cat.label.toLowerCase().includes(filter),
    );
    if (!names.length) continue;
    const head = document.createElement("div");
    head.className = "cat-head";
    head.textContent = cat.label;
    listEl.appendChild(head);
    for (const name of names) {
      const item = document.createElement("button");
      item.className = "item";
      item.dataset.cat = cat.id;
      item.dataset.name = name;
      item.addEventListener("click", () => select(cat.id, name));
      listEl.appendChild(item);
      jobs.push({ item, cat, name });
    }
  }
  // render thumbnails in small batches so the boot overlay stays responsive
  for (let i = 0; i < jobs.length; i++) {
    const { item, cat, name } = jobs[i];
    try {
      const thumb = renderThumb(() => {
        if (cat.id === "audio") return makeSpeaker();
        // thumbnails must never touch the shared actor pool
        if (cat.id === "actors") {
          const def = name === "walker" ? createWalkerModel() : createDroneModel();
          return pm(
            def,
            {
              shell: context.mats.get("armor_white", { triplanar: true, vertexColors: true }),
              metal: context.mats.get("gunmetal", { triplanar: true, vertexColors: true }),
              glow: context.mats.get("paint_orange"),
              lens: context.mats.get("paint_blue"),
              disc: context.mats.get("paint_red"),
              cone: context.mats.get("paint_white"),
            },
            { radius: 1, extra: def.extra ? { def: def.extra, radius: 10 } : null },
          ).group;
        }
        const built = cat.build(name);
        return built.node || built;
      });
      if (thumb) item.appendChild(thumb);
    } catch (e) {
      console.warn("[thumb] " + name + " failed", e);
    }
    const label = document.createElement("span");
    label.textContent = name;
    item.appendChild(label);
    if (i % 6 === 5) {
      onProgress && onProgress((i + 1) / jobs.length);
      await nextFrame();
    }
  }
  onProgress && onProgress(1);
}

function updateListSelection() {
  listEl.querySelectorAll(".item").forEach((el) => {
    el.classList.toggle(
      "selected",
      !!current && el.dataset.cat === current.cat && el.dataset.name === current.name,
    );
  });
}

// ---------- category chips ----------
let activeCat = "all";
function buildChips() {
  chipsEl.innerHTML = "";
  const all = [{ id: "all", label: "All" }, ...CATEGORIES];
  for (const c of all) {
    const b = document.createElement("button");
    b.className = "chip" + (c.id === activeCat ? " on" : "");
    b.textContent = c.label;
    b.dataset.cat = c.id;
    b.addEventListener("click", () => {
      activeCat = c.id;
      buildChips();
      buildList();
    });
    chipsEl.appendChild(b);
  }
}

let rebuildToken = 0;
searchEl.addEventListener("input", async () => {
  const token = ++rebuildToken;
  await buildList((t) => {
    if (token === rebuildToken) bootStep("Filtering assets", 0.3 + t * 0.7);
  });
});

// ---------- selection actions (bottom of the Browse pane) ----------
function renderActions() {
  actTitle.textContent = current ? current.name + "  ·  " + current.cat : "—";
  actRow.innerHTML = "";
  if (!current) return;
  if (current.cat === "audio") {
    const variants = 4; // most sounds have up to 4 variants
    for (let v = 0; v < variants; v++) {
      const btn = document.createElement("button");
      btn.className = "act-btn";
      btn.textContent = "Play " + (v + 1);
      btn.addEventListener("click", () => {
        context.audio.resume && context.audio.resume();
        context.audio.play(current.name, { variant: v });
      });
      actRow.appendChild(btn);
    }
  } else if (current.cat === "weapons") {
    for (const act of ["fire", "reload", "ads", "reset"]) {
      const btn = document.createElement("button");
      btn.className = "act-btn";
      btn.textContent = act;
      btn.addEventListener("click", () => triggerWeapon(act, btn));
      actRow.appendChild(btn);
    }
  } else if (current.actor) {
    for (const act of current.def.actions(current.name)) {
      const btn = document.createElement("button");
      btn.className = "act-btn";
      btn.textContent = act;
      btn.addEventListener("click", () => setActorAction(act, btn));
      actRow.appendChild(btn);
    }
  } else {
    const note = document.createElement("div");
    note.className = "meta";
    note.textContent = "Static prop - drag to orbit, scroll to zoom.";
    actRow.appendChild(note);
  }
}

function setActorAction(act, btn) {
  currentAction = act;
  if (currentActionBtn) currentActionBtn.classList.remove("on");
  currentActionBtn = btn || null;
  if (btn) btn.classList.add("on");
  if (current.actor) {
    const d = current.actor;
    // idle = stand still; walk = treadmill in place; aim = face camera & telegraph
    d.mode = act === "idle" ? "patrol" : act === "walk" ? "patrol" : "investigate";
    d.hasGoal = false;
    d.speed = 0;
    d.vel && d.vel.set(0, 0, 0);
    d.passive = true;
  }
}

function triggerWeapon(act, btn) {
  if (act === "reset") return weapon.reset();
  if (act === "fire") {
    weapon.debug.flash = true;
    setTimeout(() => (weapon.debug.flash = false), 120);
    context.audio.resume && context.audio.resume();
    context.audio.play("rifle_shot");
  } else if (act === "reload") {
    weapon.debug.reloadT = 0;
    context.audio.resume && context.audio.resume();
    context.audio.play("reload_magout");
    setTimeout(() => context.audio.play("reload_magin"), 500);
    setTimeout(() => context.audio.play("reload_bolt"), 1000);
  } else if (act === "ads") {
    weapon.debug.empty = !weapon.debug.empty;
  }
}

// ---------- Code tab: real source text, syntax highlighted ----------
const HTML_ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
const escapeHtml = (s) => s.replace(/[&<>]/g, (c) => HTML_ESC[c]);

const KW = /\b(const|let|var|function|return|if|else|for|while|do|class|new|this|import|from|export|default|await|async|try|catch|finally|throw|typeof|instanceof|in|of|switch|case|break|continue|null|undefined|true|false)\b/g;
const NUM = /\b(\d+(?:\.\d+)?)\b/g;
const STR = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/;

function tint(plain) {
  return escapeHtml(plain)
    .replace(KW, '<span class="kw">$1</span>')
    .replace(NUM, '<span class="num">$1</span>');
}

function highlight(src) {
  if (!src) return "";
  return src
    .split("\n")
    .map(function (line, i) {
      let html;
      if (/^\s*\/\//.test(line)) {
        html = '<span class="com">' + escapeHtml(line) + "</span>";
      } else {
        html = "";
        let rest = line;
        for (;;) {
          const m = rest.match(STR);
          if (!m) break;
          const at = rest.indexOf(m[0]);
          html += tint(rest.slice(0, at));
          html += '<span class="str">' + escapeHtml(m[0]) + "</span>";
          rest = rest.slice(at + m[0].length);
        }
        html += tint(rest);
      }
      return '<span class="ln">' + String(i + 1).padStart(4) + "</span>  " + html;
    })
    .join("\n");
}

let codeToken = 0;
let codeChunks = [];
let codeActive = 0;

function paintCode(i) {
  const c = codeChunks[i];
  if (!c) return;
  codeActive = i;
  codeTabs.querySelectorAll(".code-tab").forEach(function (b, n) {
    b.classList.toggle("on", n === i);
  });
  codeView.innerHTML =
    '<span class="com">/* ' +
    escapeHtml(c.path) +
    " - " +
    escapeHtml(c.note) +
    " */</span>\n" +
    highlight(c.block);
  codeView.scrollTop = 0;
}

function paintCodeTabs() {
  codeTabs.innerHTML = "";
  codeChunks.forEach(function (c, i) {
    const b = document.createElement("button");
    b.className = "code-tab" + (i === codeActive ? " on" : "");
    b.textContent = c.path.replace(/^src\//, "");
    b.title = c.path;
    b.addEventListener("click", function () {
      paintCode(i);
    });
    codeTabs.appendChild(b);
  });
}

async function renderCode() {
  const token = ++codeToken;
  codeTabs.innerHTML = "";
  codeView.textContent = current ? "Loading source..." : "Select an asset.";
  if (!current || !current.def || !current.def.code) return;
  const parts = current.def.code(current.name);
  const found = [];
  for (let i = 0; i < parts.length; i++) {
    const path = parts[i][0];
    const anchor = parts[i][1];
    const note = parts[i][2];
    const src = await rawSource(path);
    if (token !== codeToken) return;
    if (!src) continue;
    const block = extractBlock(src, anchor);
    if (!block || block.length < 40) continue;
    found.push({ path: path, note: note, block: block });
  }
  if (token !== codeToken) return;
  if (!found.length) {
    codeView.textContent = "No source block matched this asset.";
    return;
  }
  codeChunks = found;
  codeActive = 0;
  paintCodeTabs();
  paintCode(0);
}

// ---------- top-level pane tabs ----------
function setPane(name) {
  document.querySelectorAll(".p-tab").forEach(function (t) {
    t.classList.toggle("active", t.dataset.pane === name);
  });
  document.querySelectorAll(".pane").forEach(function (p) {
    p.hidden = p.dataset.pane !== name;
  });
}
document.querySelectorAll(".p-tab").forEach(function (tab) {
  tab.addEventListener("click", function () {
    setPane(tab.dataset.pane);
  });
});

// ---------- per-frame update ----------
const clock = { last: performance.now() };
function frame() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - clock.last) / 1000);
  clock.last = now;
  context.time.t += dt;
  context.time.dt = dt;
  context.time.frame++;
  if (current && current.actor) {
    const d = current.actor;
    if (currentAction === "walk") {
      // treadmill: keep the actor pinned at the origin while its leg cycle runs
      d.speed = 2.2;
      d.home.set(0, 0, 0);
      d.hasGoal = false;
      if (d.vel) {
        d.vel.x = Math.sin(d.yaw) * 2.2;
        d.vel.z = Math.cos(d.yaw) * 2.2;
      }
    } else {
      d.vel && d.vel.set(0, 0, 0);
      d.speed = 0;
    }
    try {
      d._update(dt);
    } catch (err) {
      console.warn("actor update failed", err);
    }
    // keep the exhibit centred on its pedestal
    if (d.pos && currentAction === "walk") {
      d.pos.set(0, d.type === "gull" ? 1.1 : 0, 0);
    }
  }
  if (current && current.cat === "weapons") {
    try {
      weapon.update(dt);
    } catch {}
  }
  context.mats.update(dt);
  updateCamera();
  context.render.frame(dt);
  requestAnimationFrame(frame);
}

// ---------- boot ----------
bootStep("Generating procedural materials", 0.2);
buildChips();
await buildList((t) => bootStep("Rendering asset thumbnails", 0.25 + t * 0.65));
bootStep("Ready", 1);
// restore the last viewed asset from ?asset=cat:name, else default
const wanted = new URLSearchParams(location.search).get("asset");
let restored = false;
if (wanted && wanted.includes(":")) {
  const [cat, name] = wanted.split(":");
  const def = CATEGORIES.find((c) => c.id === cat);
  if (def && def.names().includes(name)) {
    select(cat, name);
    restored = true;
  }
}
if (!restored) select("props", "container20");
requestAnimationFrame(frame);
setTimeout(() => bootEl && bootEl.classList.add("done"), 380);

// debug hook for automated checks
window.__INSPECT = () => {
  const cam = context.camera;
  const node = current && current.node;
  const box = node ? new Box3().setFromObject(node) : null;
  return {
    cat: current && current.cat,
    name: current && current.name,
    orbit: { yaw: orbit.yaw, pitch: orbit.pitch, dist: orbit.dist, target: orbit.target.toArray() },
    cam: cam.position.toArray(),
    box: box ? { min: box.min.toArray(), max: box.max.toArray() } : null,
    nodePos: node ? node.position.toArray() : null,
    nodeVisible: node ? node.visible : null,
    children: node ? node.children.length : null,
    stageChildren: stage.children.length,
    mountChildren: mount.children.length,
  };
};

// ---------- live edit: rebuild when the studio prop file changes ----------
if (import.meta.hot) {
  // accept BOTH import paths: main.js pulls the factory and the ?raw source.
  // Missing either one makes Vite bubble the update up to a full page reload.
  import.meta.hot.accept(
    ["./studio-prop.js", "./studio-prop.js?raw"],
    async ([mod, raw]) => {
      if (mod) registerProp(STUDIO_PROP_NAME, mod.createStudioProp);
      if (raw) {
        const text = typeof raw === "string" ? raw : raw.default;
        if (typeof text === "string") RAW["inspector/studio-prop.js"] = text;
      }
      if (!mod) return;
      try {
        const fresh = await import("./studio-prop.js?raw");
        RAW["inspector/studio-prop.js"] =
          typeof fresh === "string" ? fresh : fresh.default;
      } catch {}
      await buildList();
      if (
        current &&
        current.cat === "props" &&
        current.name === STUDIO_PROP_NAME
      ) {
        select("props", STUDIO_PROP_NAME);
      }
      stageInfo.textContent = "studio-prop.js reloaded (no page reload)";
      setTimeout(function () {
        stageInfo.textContent = current ? current.cat + " / " + current.name : "";
      }, 2200);
    },
  );
}

// ---------- selection ----------
function select(cat, name) {
  if (current && current.actor) {
    try {
      current.actor._deactivate();
    } catch {}
  }
  while (mount.children.length) mount.remove(mount.children[0]);
  currentAction = null;
  currentActionBtn = null;
  const def = CATEGORIES.find((c) => c.id === cat);
  if (!def) return;
  let node = null;
  let actor = null;
  if (cat === "audio") {
    node = makeSpeaker();
  } else {
    const built = def.build(name);
    node = built.node || built;
    actor = built.actor || null;
  }
  mount.add(node);
  current = { cat, name, node, actor, def };
  frameObject(node);
  renderActions();
  renderCode();
  updateListSelection();
  stageInfo.textContent = cat + " / " + name;
  // remember the pick in the URL so a refresh restores it
  const url = new URL(location.href);
  url.searchParams.set("asset", cat + ":" + name);
  history.replaceState(null, "", url);
}

function frameObject(node) {
  node.updateMatrixWorld(true);
  const box = new Box3().setFromObject(node);
  let size = box.getSize(new Vector3());
  let center = box.getCenter(new Vector3());
  const longest = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(longest) || longest < 0.2 || longest > 30) {
    size = new Vector3(2.2, 1.6, 2.2);
    center = new Vector3(0, 0.8, 0);
  }
  orbit.target.set(center.x, Math.max(center.y, 0.3), center.z);
  const radius = Math.max(size.x, size.y, size.z) * 0.5;
  orbit.dist = clamp(radius * 2.2, 1.2, 9);
}
