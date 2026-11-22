# 材质与贴图 API

所有材质由 `src/render/materials/materials.js` 的 `createMaterials()` 创建（`src/render/materials/materials.js:52`），挂在 `context.mats` 上。贴图不是图片文件——每种材质的 albedo/ORM/normal 三张贴图都是 GPU shader 实时算出来的。

## 取材质：mats.get(name, options?)

`src/render/materials/materials.js:242`（内部函数 `w`）。

```js
const mat = context.mats.get("paint_teal");
const mat2 = context.mats.get("armor_white", { triplanar: true, vertexColors: true });
```

相同 name+options 的材质有缓存，重复调用返回同一个实例。options 支持：

| 选项 | 说明 |
|------|------|
| `triplanar: true` | 三平面贴图：贴图按世界坐标投射，不管几何怎么扭都不拉伸。角色装甲必开（`inspector/main.js:775`） |
| `scale: number` | triplanar 的贴图密度（默认 1） |
| `vertexColors: true` | 启用顶点色相乘（配合 `colorGeometry` 或 RigBuilder 的 `add`） |
| `color: 0xRRGGBB` | 覆盖默认颜色 |
| `doubleSide: true` | 双面渲染 |
| `interior: true` | 室内模式（减弱雨水效果，调低 uSlX.x） |

名字错了不会崩——会打警告 `[mats] unknown material "xxx" — using fallback` 并返回灰色金属（`src/render/materials/catalog.js:442` 的 `fA`）。

## 合法名字清单

全部定义在 `src/render/materials/catalog.js:231` 的 `l1` 表里（aset 各条目引用 `src/render/materials/catalog.js:3` 的 `c3` 贴图集）。按类别列：

**混凝土/地面**: `asphalt`, `concrete`, `concrete_dirty`, `concrete_painted`, `brick`, `floor_epoxy`, `diamond_plate`, `chainlink`

**油漆**（纯色漆面）: `paint_red`, `paint_blue`, `paint_green`, `paint_yellow`, `paint_orange`, `paint_white`, `paint_grey`, `paint_teal`

**金属**: `steel_galv`, `steel_dark`, `steel_worn`, `steel_bare`, `steel_rust`, `aluminium`, `brass`, `gunmetal`, `anodized_black`, `hazard_stripes`, `corrugated_roof`

**聚合物/复合材料**: `polymer_black`, `polymer_tan`, `rubber`, `carbon`, `glove_fabric`, `armor_white`, `armor_orange`

**木头/纸/布**: `wood_pallet`, `wood_dark`, `cardboard`, `tarp`, `rope`

**塑料**: `plastic_blue`, `plastic_red`, `plastic_grey`

**透明/液体**: `glass`, `glass_dirty`, `water_dark`

**船体**: `hull_paint`, `hull_red`

**其他**: `tire`（轮胎纹）

`context.mats.names` 是这个清单的运行时数组（`src/render/materials/materials.js:350`），可以在控制台 `context.mats.names` 直接看。

## 自发光：mats.emissive(color, intensity?)

`src/render/materials/materials.js:334`。

```js
const glow = context.mats.emissive(16756832, 8); // 橙色警示灯
const lamp = createMesh(boxGeometry(0.16, 0.1, 0.16), glow, { cast: false });
```

第一个参数是 0xRRGGBB 数字，第二个是亮度倍数（>1 会过曝，做"发光"效果）。这个材质不走 PBR 管线，直接 unlit——所以阴影要手动关掉。

## 贴花与标签：mats.decal / mats.label / mats.number

这三个是 `src/render/materials/textures.js:166` 的 `l3()` 返回的 Canvas 纹理工厂。

```js
// 印在物体表面的图案（hazard_flammable, arrow, ... 见 textures.js:259 的注册表）
const d = context.mats.decal("hazard_flammable");
// 文字标签（返回 { material, aspect, texture }）
const l = context.mats.label("UN 1202", { color: "white", font: "stencil", distress: 0.5 });
```

`label` 的选项：`color`（`black`/`white`）、`font`（`stencil` 模板喷漆字体 / `sans` / `mono`）、`distress`（0-1 磨损度）。这些通常配合几何的"贴花面"使用——在游戏 prop builder 里是 `builder.decal(...)` / `builder.label(...)`（`src/world/props/detail-geometry.js:610-623`），studio 里可以直接用 PlaneGeometry + 这些材质自己贴。

## 其他方法

| 方法 | 说明 | 位置 |
|------|------|------|
| `mats.prewarm(names?)` | 预生成贴图（启动时减少卡顿） | `materials.js:356` |
| `mats.tileOf(name)` | 查某材质的 tile 密度 | `materials.js:367` |
| `mats.update(dt)` | 内部：释放 4 秒没用的贴图集 | `materials.js:352` |
| `mats.stats()` | `{ sets, textureMB, genMs, decalMB }` | `materials.js:358` |
| `mats.uniforms.wet` | 全局下雨湿度系数（0-1） | `materials.js:88` |

## 材质怎么"下雨"（SL_FX shader）

每种材质都注入了 `src/render/materials/catalog.js` 里的 shader 片段（`catalog.js:268-441`）。运行时行为：

- 雨天材质变暗、变光滑（roughness 往 `uSlWetP.y` 拉伸）
- 垂直面有雨水拉丝（噪声条纹），朝上的面有积水
- 接近地面的位置有溅湿带（`vSlPos.y < 0.5` 时额外变暗）
- `macro` 噪声做整体明暗斑块（大尺度脏污）

这些参数都在 catalog 的每条材质里预设好了，写资产时不用管——但知道有这回事，就能理解为什么雨天所有东西看起来"湿漉漉"。

## Studio 里的典型用法

```js
export function create(context) {
  const root = new Group();

  // 主体：漆面 + 顶点色做旧
  const body = createMesh(
    colorGeometry(boxGeometry(1, 0.5, 1, "bottom"), (x, y, z) => {
      const grime = 0.85 + 0.15 * Math.sin(z * 5); // 底部更脏
      return [grime, grime, grime];
    }),
    context.mats.get("paint_orange", { vertexColors: true }),
  );
  root.add(body);

  // 自发光指示灯
  const led = createMesh(boxGeometry(0.05, 0.05, 0.02), context.mats.emissive(0x00ff88, 6), { cast: false });
  led.position.set(0.4, 0.5, 0.4);
  root.add(led);

  return root;
}
```
