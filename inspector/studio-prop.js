// STUDIO PROP - live-edit target
// Edit this file and the inspector rebuilds the exhibit instantly via HMR.
// Available materials: context.mats.get(name) with names like paint_teal,
// steel_galv, wood_pallet, concrete_dirty. Helpers come from core/geometry.
import { Group } from "../src/vendor/three-r180.js";
import { boxGeometry, cylinderGeometry, createMesh } from "../src/core/geometry.js";

// tweak these numbers and watch the exhibit change
const CONFIG = {
  bodySize: [1.2, 0.5, 0.8],
  bodyColor: "paint_orange",
  wheelCount: 6,
  wheelRadius: 0.18,
  mastHeight: 2.2,
  name: "STUDIO-01",
};

export const STUDIO_PROP_NAME = "studio_prop";

export function createStudioProp(context) {
  const root = new Group();
  const mat = context.mats.get(CONFIG.bodyColor);
  const steel = context.mats.get("steel_dark");

  // chassis
  const body = createMesh(boxGeometry(...CONFIG.bodySize, "bottom"), mat);
  body.position.y = 0; // resting on the ground, wheels removed
  root.add(body);

  // (wheels removed - watching live edit)

  // mast with a beacon
  const mast = createMesh(
    boxGeometry(0.08, CONFIG.mastHeight, 0.08),
    steel,
  );
  mast.position.set(-CONFIG.bodySize[0] / 2 + 0.1, CONFIG.mastHeight / 2, 0);
  root.add(mast);
  const beacon = createMesh(
    boxGeometry(0.16, 0.1, 0.16),
    context.mats.emissive(16756832, 8),
    { cast: false },
  );
  beacon.position.set(0, CONFIG.mastHeight + 0.08, 0);
  root.add(beacon);

  // trailer hitch: a horizontal arm with a hanging bar, at the tail
  const tailZ = CONFIG.bodySize[2] / 2 + 0.25;
  const hitchArm = createMesh(
    boxGeometry(0.08, 0.08, 0.5),
    steel,
  );
  hitchArm.position.set(0, 0.18, tailZ - 0.12);
  root.add(hitchArm);
  const hitchBar = createMesh(
    boxGeometry(0.3, 0.06, 0.06),
    context.mats.get("steel_rust"),
  );
  hitchBar.position.set(0, 0.12, tailZ + 0.1);
  root.add(hitchBar);

  // headlights: two emissive cubes at the nose
  for (let side of [-1, 1]) {
    const lamp = createMesh(
      boxGeometry(0.12, 0.1, 0.05),
      context.mats.emissive(16774360, 12),
      { cast: false },
    );
    lamp.position.set(side * (CONFIG.bodySize[0] / 4), 0.25, -CONFIG.bodySize[2] / 2 - 0.03);
    root.add(lamp);
  }

  // a red roof over the cab, added during the live-edit test
  const roof = createMesh(
    boxGeometry(CONFIG.bodySize[0] * 0.9, 0.06, CONFIG.bodySize[2] * 0.9),
    context.mats.get("paint_red"),
  );
  roof.position.set(0, CONFIG.bodySize[1] + 0.06, 0);
  root.add(roof);

  return root;
}
