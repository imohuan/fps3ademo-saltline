# 几何与绘制 API

所有几何都从 `src/core/geometry.js` 导入（检视器里写 `../../src/core/geometry.js`）。这个文件只做三件事：生成基础形状、变换它们、合并成 Mesh。

```js
import { Group } from "../src/vendor/three-r180.js"; // 相对 inspector/studio/ 的路径
import { boxGeometry, cylinderGeometry, tubeGeometry, beveledBoxGeometry,
         transformGeometry, createMesh, mergeGeometryParts } from "../src/core/geometry.js";
```

## 基础形状

### boxGeometry(w, h, d, anchor?) — `src/core/geometry.js:204`

最常用的方块。第四个参数 `"bottom"` 让原点落在底面（方便"放在地上"），默认 `"center"` 居中。

```js
const crate = createMesh(boxGeometry(1.2, 0.5, 0.8, "bottom"), mat);
crate.position.y = 0; // 底面贴地
```

它还会重排 UV，让每个面的贴图都按世界尺度铺开（不是拉伸），所以方块用任何材质都不会花。

### beveledBoxGeometry(w, h, d, bevel?, anchor?) — `src/core/geometry.js:220`

带圆角/倒角的方块。第四个参数是倒角宽度（米），默认 0.02。角色装甲、机械外壳几乎全用它（见 `src/enemies/models.js:301` 的 `createWalkerModel`），因为倒角能在高光下勾出边缘。

```js
const shell = createMesh(beveledBoxGeometry(0.35, 0.05, 0.3, 0.014), shellMat);
```

### cylinderGeometry(rTop, rBottom, h, segs?, openEnded?, anchor?) — `src/core/geometry.js:269`

圆锥/圆柱。`rTop` 和 `rBottom` 分别是顶/底半径（相等=圆柱，0=圆锥）。默认 16 段；`openEnded: true` 去掉两端盖。同样支持 `"bottom"` 锚点。

```js
const post = createMesh(cylinderGeometry(0.05, 0.06, 1.0, 12, false, "bottom"), mat);
```

### tubeGeometry(points, radius?, segs?, closed?, tension?) — `src/core/geometry.js:282`

沿一串 3D 点生成管子（CatmullRom 平滑曲线）。点可以是 `[x,y,z]` 数组或 `Vector3`。用于线缆、管路、天线条——见 `src/world/props/detailed-builders.js:922` 的电缆卷盘。

```js
const cable = createMesh(tubeGeometry([
  [0.1, 0.5, 0.2],
  [0.15, 0.6, 0.1],
  [0.12, 0.7, 0.0],
], 0.02, 6), mat);
```

UV 的 U 坐标已经按管长展开，适合做条纹、绝缘层纹理。

## 变换

### transformGeometry(geo, { p, r, s }) — `src/core/geometry.js:304`

对几何本身做平移/旋转/缩放（区别于 Mesh 的 position/rotation）。`r` 是弧度欧拉角。

```js
const pipe = transformGeometry(cylinderGeometry(0.02, 0.02, 0.5, 8), {
  p: [0.2, 0.5, 0],   // 平移
  r: [0, 0, Math.PI/2], // 绕 z 轴转 90°（变成水平）
  s: 1,               // 也可以是 [x,y,z]
});
```

这个模式在角色建模里大量出现——`src/enemies/models.js:265` 定义了一组快捷方式（`Ce` = 变换+定位、`Ro` = 横放的圆柱、`Si` = 朝前的圆柱）。

## 合并

### mergeGeometryParts(parts) — `src/core/geometry.js:330`

把多个 BufferGeometry 合并成一个。会自动补 UV/法线、统一颜色属性。同材质的零件合并后只占一个 draw call，这是所有 prop builder 的收尾步骤（`src/world/props/detail-geometry.js:634` 的 `finish()`）。

### mergeGeometries(geos, useGroups?) — `src/core/geometry.js:17`

更底层的合并（Three.js BufferGeometryUtils 的内联版本）。`useGroups: true` 时保留分组信息，用于多材质 SkinnedMesh。

## 组装成 Mesh

### createMesh(geo, mat, { cast?, recv? }) — `src/core/geometry.js:428`

创建 Mesh 并设置阴影。默认 `cast: true, recv: true`（投影+接收）。自发光的小灯通常关掉投影：

```js
const beacon = createMesh(boxGeometry(0.16, 0.1, 0.16), mats.emissive(16756832, 8), { cast: false });
```

### batchStaticMeshes(group, opts?) — `src/core/geometry.js:366`

把一个 Group 里的所有 Mesh 按材质+阴影设置重新合并成更少的 Mesh。用于把场景里的静态物件打包优化。

### colorGeometry(geo, color) — `src/core/geometry.js:319`

给几何写顶点色。`color` 可以是 `[r,g,b]` 数组或 `(x,y,z) => [r,g,b]` 函数。需要材质带 `vertexColors: true` 才生效（见 api-materials.md）。道具系统里几乎每块几何都带顶点色——用来做锈迹、磨损、明暗变化（见 `src/world/props/cargo-builders.js:77-82`）。

## 真实示例：拼一个"油桶推车"

下面是从 `src/world/props/detailed-builders.js`（油桶 S1）、`cargo-builders.js`（叉车轮子 ib）里简化出的模式——props 系统真正用的搭建器是 `src/world/props/detail-geometry.js:564` 的 `Kn` 类（下一节讲）。

```js
import { Group } from "../../src/vendor/three-r180.js";
import { boxGeometry, cylinderGeometry, tubeGeometry,
         transformGeometry, createMesh, colorGeometry } from "../../src/core/geometry.js";

export function create(context) {
  const root = new Group();
  const mat = context.mats.get("steel_dark", { vertexColors: true });

  // 底盘
  const deck = createMesh(colorGeometry(
    transformGeometry(boxGeometry(1.2, 0.08, 0.8), { p: [0, 0.3, 0] }),
    (x, y, z) => [0.85, 0.82, 0.78], // 顶点色：轻微做旧
  ), mat);
  root.add(deck);

  // 四个轮子（横放的圆柱）
  for (const [x, z] of [[-0.5,-0.35],[0.5,-0.35],[-0.5,0.35],[0.5,0.35]]) {
    const wheel = createMesh(
      transformGeometry(cylinderGeometry(0.12, 0.12, 0.08, 12), { r: [0, 0, Math.PI/2], p: [x, 0.12, z] }),
      context.mats.get("tire", { vertexColors: true }),
    );
    root.add(wheel);
  }

  // 推把（弯管）
  const handle = createMesh(tubeGeometry([
    [0.55, 0.4, 0.3], [0.6, 0.55, 0.3], [0.6, 0.8, 0.3],
  ], 0.02, 6), mat);
  root.add(handle);

  return root;
}
```

## 进阶：prop builder 的真正写法

游戏内置道具（集装箱、油桶、叉车……）不走上面的"逐个 createMesh"路线，而是用 `src/world/props/detail-geometry.js:564` 的 **Kn 类**。它的工作方式：

1. `new Kn(context, "propName", seed)` 创建搭建器——seed 决定随机细节（锈迹位置、凹痕），同一个 seed 每次生成都一样。
2. `builder.push({p, r})` / `builder.pop()` 做"局部坐标系"切换（类似 turtle graphics）。
3. `builder.add(materialName, geometry, transform, vertexColorFn)` 添加一块几何。它会自动：应用变换矩阵、乘上顶点色、按材质+投影设置分桶。第四个参数是顶点色回调 `(x, y, z) => number | [r,g,b]`。
4. `builder.finish({ size, colliders })` 返回最终 Group：同材质的几何全部合并、整体做锈迹/暗化处理、写上 `userData.size` 和 `userData.colliders`（碰撞用）。

真实用例：油桶 `HA`（`src/world/props/detail-geometry.js:744`）——先 `us(profile)` 生成桶身旋转体，再用顶点色回调画锈迹和高光，最后贴 hazard 贴花。

给检视器 studio 写资产可以不用 Kn（直接 createMesh 更直观），但如果想把资产迁回游戏本体（`src/world/props/`），就得按 Kn 的模式写，因为游戏运行时依赖 `userData.colliders`。
