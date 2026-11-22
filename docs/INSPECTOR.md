# Asset Inspector - notes and pitfalls

Standalone asset viewer for Saltline. Runs from its own folder with a dev
server, so edits under `src/` hot-reload into the viewer.

```sh
cd inspector
npm run dev          # http://127.0.0.1:5174
```

Layout: an open empty plane, the selected asset centred, orbit camera on drag,
wheel to zoom. Right panel lists every asset (live-rendered thumbnails, no image
files) with Actions / Code / Guide tabs.

## What is on the shelf

| Group | Count | Source |
| --- | --- | --- |
| Props | 38 | `src/world/props/*-builders.js` |
| Actors | 2 (walker, drone) | `src/enemies/models.js` + `walker.js` / `drone.js` |
| Weapons | 1 (pac9 rifle) | `src/weapons/weapon.js` |
| Sound | 65 synthesized samples | `src/audio/synthesis.js` + `library.js` |

## Pitfalls found while building it

1. **Two overlapping floors = z-fighting.** The game runtime already lays a
   400x400 asphalt plane when `ground.stub` is true. Building a second floor at
   the same Y makes both flicker. Reuse the existing ground; never stack coplanar
   meshes.

2. **Camera overrides win.** In showcase mode the renderer re-applies a stored
   menu camera every frame. Any animated camera must run *after* that override,
   otherwise the shot is overwritten.

3. **Procedural textures need light.** Thumbnails rendered with no lights came
   out black. A hemisphere fill + ambient + key + rim, and a bright backdrop,
   makes generated materials readable at 60x44 px.

4. **One canvas cannot be attached N times.** A single WebGL canvas moved into
   a list shows up once. Copy each render into its own 2D canvas instead.

5. **`createEnemies()` builds actors; `createWalkerModel()` only builds data.**
   The model factories return `{ geometry, slots, bones }`, not a scene node.
   Wrap with `pm(def, materials, opts)`, or start from the real pool so the
   materials (`armor_white`, `gunmetal`, triplanar vertex colours) match.

6. **Rigs carry a fixed oversized bounding sphere.** `Box3.setFromObject` on a
   skinned mesh returns a huge box, so auto-framing zooms out to nothing. Detect
   an implausible box and fall back to a nominal size.

7. **Number formatting inside a shell command.** `$c` / `$i` in a PowerShell
   one-liner is expanded by the calling shell before PowerShell sees it. Prefer
   the file patch tool for source edits, and a scratch `.mjs` for inspection
   scripts.

8. **Dev-server module cache.** After renames or export changes, a stale
   `node_modules/.vite` can keep serving the old module. Restart with
   `vite --force` and reload with a cache-busting query.

9. **Panel width must be `flex: 0 0 Npx`.** With `width` plus `min-width` the
   aside can be squeezed off-screen by the canvas. Set `flex: 1 1 auto; min-width: 0`
   on the canvas and a fixed basis on the panel.

10. **A second WebGL context cannot see the first one's textures.** Every
    material texture in Saltline is baked by the main `WebGLRenderer`. A
    separate `new WebGLRenderer()` for thumbnails samples nothing and renders
    pure black. Render thumbnails with the main renderer into a
    `WebGLRenderTarget`, `readRenderTargetPixels`, then flip rows (WebGL reads
    bottom-up) into a 2D canvas.

11. **`[hidden]` loses to `display: flex`.** Any pane styled with
    `display:flex` keeps showing when hidden. Add
    `.pane[hidden] { display: none !important; }` or all panes stack at once.

12. **Vite `?raw` must be a static import.** `import("../x.js?raw")` returns a
    module wrapper whose shape differs from the static `import text from
    "../x.js?raw"` form. Use static imports at the top of the module and index
    them by path; that reliably yields the file text as a string.

13. **Dragging should follow the object, not the camera.** If a right drag
    swings the view left the control feels inverted. Decrement yaw on
    `dx` (and pitch on `dy`) so the model tracks the pointer.
