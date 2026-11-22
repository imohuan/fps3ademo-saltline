# Saltline 程序化资产开发指南

这份文档面向想给 Saltline 写"程序化资产"的开发者。整个游戏没有任何模型、贴图或音频文件——每个集装箱、每声枪响都是代码算出来的。你可以在检视器里实时写代码、实时看到结果。

## 文档目录

- [api-drawing.md](./api-drawing.md) —— 几何与绘制：怎么用代码"捏"出形状
- [api-materials.md](./api-materials.md) —— 材质与贴图：怎么给形状上色、贴材质
- [api-animation.md](./api-animation.md) —— 动画：怎么让物体动起来（步态、相机抖动、光圈闪烁）
- [api-audio-and-rigs.md](./api-audio-and-rigs.md) —— 音频与骨骼：怎么用代码"合成"声音、怎么搭会动的角色骨架

## 实时热重载工作流

检视器在 `inspector/` 目录下运行：

```bash
cd inspector
npm run dev
# 打开 http://127.0.0.1:5174
```

所有在 `inspector/studio/*.js` 里的文件都会被检视器自动发现（见 `inspector/main.js:77` 的 `import.meta.glob("./studio/*.js")`），在侧栏"Studio"分类下各占一个条目。工作流是这样的：

1. 在 `inspector/studio/` 里新建一个 `.js` 文件（比如 `my-crate.js`），写好 `create` 函数（见下文约定）。
2. 保存。Vite 检测到文件变化，通过 HMR 热更新通知检视器。
3. 检视器的 `import.meta.hot.accept` 回调（`inspector/main.js:1121`）重新扫描 studio 目录、刷新列表。如果当前选中的正好是你编辑的那个资产，它会自动重建舞台上的模型——**不用手动刷新页面**。
4. 新建的文件不用任何注册动作，保存后直接出现在列表里（glob 在 HMR 时会重新求值）。
5. 想回看某个资产时，检视器会把选择记到 URL 参数里（`?asset=cat:name`，`inspector/main.js:1179`），刷新页面后自动恢复。

### Studio 文件的导出约定

每个 `inspector/studio/*.js` 文件按下面的约定导出（加载逻辑在 `inspector/main.js:84-96`）：

```js
// my-crate.js —— 可选：显示名（不写就用文件名 my-crate）
export const NAME = "My Crate";

// 必需：构建资产。context 是检视器的全局环境（见下文）
export function create(context) {
  const root = new THREE.Group(); // 从 ../src/vendor/three-r180.js import Group
  // ... 用 boxGeometry / createMesh / context.mats.get 搭建 ...
  return root; // 必须返回一个 Object3D（通常是 Group）
}

// 可选：每帧动画钩子。dt 是帧间隔（秒），t 是累计时间（秒）
export function update(dt, t) {
  // 转个轮子、闪个灯、摆个姿势……
}
```

- `create(context)`：必需。没有这个导出的文件会被跳过并打警告（`inspector/main.js:85-88`）。
- `update(dt, t)`：可选。检视器每帧调用一次（dt 经过 0.05s 上限截断，见 `inspector/main.js:1037`）。注意：当前版本的检视器只在选中的 studio 资产上调用 update，没选中时不跑。
- `NAME`：可选。侧栏里显示的名字。

完整可运行的示例见 `inspector/studio/studio-prop.js`。

### context 里有什么

`create(context)` 拿到的 `context` 由检视器在启动时组装好（`inspector/main.js:127-145`），常用的字段有：

| 字段 | 说明 |
|------|------|
| `context.mats` | 材质工厂。`context.mats.get(name)` 按名字取材质，`context.mats.emissive(color, intensity)` 做自发光（见 api-materials.md） |
| `context.scene` | Three.js 场景（一般不用直接动，检视器自己管理舞台） |
| `context.camera` | 轨道相机（拖拽旋转、滚轮缩放已经内置） |
| `context.time` | `{ t, dt, frame, real }`，每帧更新的时间信息 |
| `context.rng` | 确定性随机数生成器（`createRandom(4207)`，每次刷新都一样，方便调参） |
| `context.audio` | 音频系统（`play`/`loop`，见 api-audio-and-rigs.md）。检视器里也接好了，可以直接调 |
| `context.events` | 事件总线（`emit`/`on`），游戏内所有声音都靠它触发 |
| `context.props` | 游戏内置道具的构建器（`context.props.build("barrel")` 可以直接拿现成的道具用） |

Three.js 本体是项目 vendored 的版本，统一从 `src/vendor/three-r180.js` 导入（检视器从 `inspector/` 出发就写 `../src/vendor/three-r180.js`）。

## 推荐阅读顺序

1. 先看 `inspector/studio/studio-prop.js`——它是能跑的最小例子。
2. 复制它，改名，改 `CONFIG` 里的数字，保存，看变化。
3. 需要更复杂的形状再看 api-drawing.md；需要质感再看 api-materials.md；需要动效再看 api-animation.md；需要发声再看 api-audio-and-rigs.md。
