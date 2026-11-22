// Gallery map: props arranged in a compact multi-row grid on an open plane.
// No objectives, no enemies, no extraction - just a place to inspect assets.
import { createWalkerModel, createDroneModel, pm } from "../../enemies/models.js";
import { PROP_SIZES } from "./registry.js";

var GALLERY_ORDER = [
  "container20",
  "container40",
  "container40hc",
  "jersey_barrier",
  "light_mast",
  "fence_panel",
  "guard_booth",
  "gate_arm",
  "bollard_mooring",
  "bollard_post",
  "relay_node",
  "shelf_rack",
  "stairs_metal",
  "catwalk",
  "reefer_unit",
  "barrel",
  "pallet",
  "pallet_stack",
  "crate_wood",
  "crate_stack",
  "ibc_tote",
  "forklift",
  "cable_reel",
  "tire_stack",
  "dumpster",
  "generator",
  "jerry_can",
  "traffic_cone",
  "gas_cylinders",
  "tarp_cargo",
  "sandbags",
  "toolbox_cart",
  "floodlight_stand",
  "cardboard_boxes",
  "pipe_stack",
  "sign_post",
];
var ENEMY_EXHIBITS = [
  {
    key: "walker",
    build: (mats) =>
      pm(
        createWalkerModel(),
        {
          shell: mats.get("paint_grey"),
          metal: mats.get("steel_dark"),
          glow: mats.get("paint_orange"),
          lens: mats.get("paint_blue"),
          disc: mats.get("paint_red"),
          cone: mats.get("paint_white"),
        },
        { radius: 0.9, center: [0, 0, 0] },
      ),
  },
  {
    key: "drone",
    build: (mats) =>
      pm(
        createDroneModel(),
        {
          shell: mats.get("paint_grey"),
          metal: mats.get("steel_dark"),
          glow: mats.get("paint_red"),
          lens: mats.get("paint_blue"),
        },
        { radius: 1.1, center: [0, 0.3, 0] },
      ),
  },
];

var COLS = 8; // exhibits per row
var CELL = 7; // grid cell size (biggest exhibit is a 12m container, overlaps
// its cell a little; rows are spaced far enough to keep aisles walkable)
var ROW_GAP = 6;

function createGallery(context) {
  let root = new (context.THREE.Group)();
  root.name = "gallery";
  context.scene.add(root);

  let exhibits = [];
  let names = [...GALLERY_ORDER, "__walker", "__drone"];
  let rows = Math.ceil(names.length / COLS);

  names.forEach((name, i) => {
    let col = i % COLS;
    let row = Math.floor(i / COLS);
    let x = (col - (COLS - 1) / 2) * CELL;
    let z = row * (CELL + ROW_GAP);
    let size = [2.5, 1, 2.5];
    let node = null;
    if (name === "__walker" || name === "__drone") {
      let mats = context.mats;
      let rig = ENEMY_EXHIBITS.find((e) => e.key === name.slice(2)).build(mats);
      node = rig.group || rig;
      node.position.set(x, name === "__drone" ? 1.1 : 0, z);
      root.add(node);
    } else {
      let prop = context.props.build(name, {
        seed: i + 3,
        doors: name.startsWith("container") ? 0.6 : 0,
      });
      size = prop.userData.size || PROP_SIZES[name] || [1, 1, 1];
      prop.position.set(x, 0, z);
      root.add(prop);
      node = prop;
    }
    let w = Math.max(2, size[0]);
    let d = Math.max(2, size[2] || size[0]);
    context.physics.addBox(
      [x - w / 2, 0, z - d / 2],
      [x + w / 2, Math.max(1, size[1]), z + d / 2],
      { surface: "metal", noNav: true },
    );
    exhibits.push({ name, x, z, size });
  });

  let gridDepth = (rows - 1) * (CELL + ROW_GAP);
  let playerStart = {
    pos: new (context.THREE.Vector3)(0, 0, -CELL),
    yaw: Math.PI, // facing +z, toward the grid
  };

  return { root, exhibits, rows, cols: COLS, gridDepth, playerStart };
}

export { createGallery, GALLERY_ORDER };
