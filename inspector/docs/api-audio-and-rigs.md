# 音频与骨骼 API

## 音频系统

游戏里没有音频文件。每一声枪响、脚步、爆炸都是**运行时用 DSP 代码合成**的。

### 目录结构：src/audio/library.js

`src/audio/library.js:70` 的 `Go` 表是声音目录，每条目长这样：

```js
rifle_shot: {
  gen: KR,      // 生成器函数（在 synthesis.js 里）
  n: 4,         // 4 个变体（随机选一个，避免重复感）
  sr: ki,       // 采样率（ki=44100, Xn=32000, pl=22050，见 library.js:64-66）
  peak: 0.97,   // 峰值音量
  bus: "near",  // 混音总线
  max: 5,       // 同时最多几个实例（超过会偷最老的）
  pri: 9,       // 优先级（被偷时的保护等级）
  boot: 1,      // 启动时立即合成（不 boot 的在后台慢慢排队）
  ref: 2, roll: 1,  // 3D 衰减参考距离 & 滚降系数（bus 为 world 时）
  loop: 1,      // 循环音（雨、风、引擎）
  ir: 1,        // 卷积混响脉冲响应（ir_outdoor / ir_shed）
},
```

**bus（总线）** 有五个（`src/audio/audio.js:333-337`）：

| bus | 用途 | 特点 |
|-----|------|------|
| `world` | 世界里的 3D 音源 | 有 PannerNode 空间化、有混响 |
| `near` | 玩家自己发出的声音 | 无空间化、轻微混响 |
| `dry` | UI、受伤、雷声 | 完全干声 |
| `amb` | 环境循环（风、雨） | 走 `near` 相同的通路 |
| `music` | 音乐层 | 独立音量控制 |

声音名字速查（全部 `library.js:70`，常用的）：`rifle_shot`, `reload_magout/magin/bolt`, `shell_bounce`, `step_concrete/step_metal/step_water`, `land`, `jump`, `hurt`, `impact_metal/concrete/wood/water/glass/enemy`, `ricochet`, `whiz`（子弹擦身）, `gull_fire`, `hound_fire`, `hound_step`, `gull_die`, `hound_die`, `telegraph`, `alert`, `explosion`, `relay_cut`, `thunder`, `foghorn`, `gull_cry`, `halyard`（绳索拍杆）, `container_bang`, `ui_click`, `ui_hover`, `objective`, `complete`, `death`；循环音 `gull_rotor`, `hound_servo`, `relay_hum`, `rain`, `rain_interior`, `wind`, `sea`；音乐 `music_drone/ost/perc/brass/motif`。

### 播放接口：context.audio.play / loop

由 `src/audio/audio.js` 的 `createAudio(context)` 创建（`audio.js:71`），`inspector/main.js:145` 已挂到 `context.audio`。

#### play(name, options?) → boolean — `audio.js:469`（内部函数 `ze`）

```js
context.audio.resume(); // 浏览器要求用户手势后才能出声，先调一次
context.audio.play("rifle_shot");
context.audio.play("impact_metal", {
  pos: { x: 3, y: 0, z: -5 },   // 3D 位置（bus=world 的声音才有效）
  gain: 0.8,                     // 音量倍数
  pitch: 1.1,                    // 播放速率（变调）
  variant: 2,                    // 指定变体（0 到 n-1；不传则自动轮换）
  delay: 0.5,                    // 延迟秒数
  jitter: 0.07,                  // 音高随机抖动幅度（默认 0.035，0 = 精确）
  ref: 4, roll: 0.7,             // 覆盖目录里的 3D 衰减参数
  surface: "metal",              // 别名映射：impact_concrete→impact_metal 等（audio.js:476）
});
```

返回 `true` 表示真的播了（可能因为音源池满、上下文未解锁而返回 false）。别名表 `i_`（`library.js:614`）把语义名映射到实际声音：`step→step_concrete`, `impact→impact_concrete`, `hurt→hurt` 等。

#### loop(name, options?) → handle — `audio.js:568`（内部函数 `Be`）

```js
const hum = context.audio.loop("relay_hum", { gain: 0.9, pos: [4, 1.2, 3] });
// 每帧更新（一般不需要，位置更新自动做）：
hum.setPos([x, y, z]);   // 3D 位置（有 pan 时）
hum.setGain(0.5);        // 音量（内部有平滑）
hum.setPitch(1.2);       // 播放速率（0.25-4）
hum.stop(0.18);          // 淡出 0.18 秒后停
```

循环音只能用 `Go` 里标了 `loop: 1` 的条目，否则返回哑柄（什么都不会播）。玩家移动时游戏自动更新所有 3D 循环音的位置（`audio.js:1287` 的 `lu`）。

#### 其他方法（`audio.js:1629-1648`）

| 方法 | 说明 |
|------|------|
| `audio.resume()` | 解锁 AudioContext（浏览器手势要求），在第一次交互时调用 |
| `audio.setIntensity(0-1)` | 手动战斗强度（驱动音乐层） |
| `audio.setInterior(0-1)` | 室内系数（切 `rain`↔`rain_interior`，加混响） |
| `audio.setVolume(0-1)` | 主音量 |
| `audio.setPaused(bool)` | 全局暂停 |
| `audio.names` | 所有非 IR 声音的名字数组 |
| `audio.ready` | Promise，后台合成队列跑完时 resolve |
| `audio.selfTest({seconds, interior})` | 离线渲染 10 秒并统计峰值/过载/NAN，用于测试 |
| `audio.debug()` | `{ state, buffers, queued, voices, loops, music, intensity, ... }` |

### 生成器函数：src/audio/synthesis.js

每个 `gen(sampleRate, rng, variant)` 返回 `Float32Array`（或数组的数组 = 多声道），也可能返回 generator 用于分步合成。写新声音时直接用这套工具函数（`synthesis.js:1-247`）：

```js
import { St, Xt, Se, at, ei, dn, tn, Wo, ml } from "./synthesis.js";

function mySound(i, e) {                    // i = sr, e = rng()
  const out = St(i, 0.3);                   // 0.3 秒的空缓冲
  Se(out, dn(i, 0.25, [[800, 0.05, 1], [1600, 0.03, 0.5]], e), 0, 0.8, i);  // 敲击体
  Se(out, at(i, e, 0.02, 0.08, { hp: 2000 }), 0, 0.4, i);                    // 噪声尾
  tn(out, "lp", 4000, 0.7, i);              // 低通收尾
  return Wo(out, 1.5);                      // tanh 软限幅
}
```

常用工具（行号）：

| 函数 | 作用 |
|------|------|
| `St(sr, seconds)` `synthesis.js:22` | 新建空 Float32Array |
| `Xt(rng, lo, hi)` `synthesis.js:24` | 随机数区间 |
| `Qn(sr, seconds, rng)` `synthesis.js:28` | 白噪声缓冲 |
| `Se(dst, src, delaySec, gain, sr)` `synthesis.js:104` | 把 src 叠加进 dst |
| `at(sr, rng, len, decay, {hp,lp,bp,q,att})` `synthesis.js:150` | 滤波噪声（嘶声、风、撞击摩擦） |
| `ei(sr, len, f0, f1, decay, ring, att)` `synthesis.js:160` | 下滑正弦（金属叮声、口哨） |
| `dn(sr, len, [[freq, decaySec, amp],...], rng)` `synthesis.js:183` | 加法合成敲击体（模态合成） |
| `tn(buf, "lp"/"hp"/"bp", freq, q, sr)` `synthesis.js:55` | Biquad 滤波器（就地修改） |
| `Wo(buf, drive)` `synthesis.js:133` | tanh 软限幅 |
| `ml(buf, gain)` `synthesis.js:128` | 整体乘系数 |
| `Jc(sr, rng, len, count, opts)` `synthesis.js:203` | 随机颗粒噪声（碎石、碎玻璃） |
| `Vo(a, b, curve?)` `synthesis.js:89` | 返回随时间从 a 到 b 的频率函数（给 `di` 用） |

写好生成器后加进 `library.js` 的 `Go` 表就自动出现在 `audio.names` 里，检视器的 Sound 分类也能播放试听。

## 骨骼/角色建模

角色（四足机器人 hound、四旋翼 gull）用 `src/enemies/models.js` 的一套极简骨骼系统。

### RigBuilder（内部类 `iu`，models.js:27）

```js
const rig = new RigBuilder();

// bone(name, parentName?, x?, y?, z?) — 定义骨骼（local offset 相对父骨骼）
rig.bone("root", null, 0, 0, 0);
rig.bone("body", "root", 0, 0.72, 0);    // y=0.72 是站立高度
rig.bone("head", "body", 0, 0.13, 0.12);

// add(slotName, boneName, geometry, vertexColor?, shadeByNormal?)
// 把一块几何绑定到骨骼：自动平移到骨骼世界位置，写 skinIndex/skinWeight（刚性绑定到该骨骼）
rig.add("shell", "body", beveledBoxGeometry(0.35, 0.05, 0.3, 0.014), [1.15, 1.15, 1.15]);
rig.add("metal", "body", cylinderGeometry(0.03, 0.03, 0.1, 8), [0.45, 0.46, 0.48]);
rig.add("glow", "body", sphereGeom, [14, 5.5, 0.5], false); // 第四参数 [r,g,b] 是顶点色增益；第五参数 false 表示不做法线明暗

// build([slotOrder]) — 合并成 SkinnedMesh 需要的数据
const def = rig.build(["shell", "metal", "glow", "lens"]);
// def = { geometry, slots, bones, tris }
```

关键点：

- 每个 slot 变成一个材质组（`slots` 顺序 = 材质顺序）。
- `add` 的第四参数是顶点色 RGB 增益（配合 `vertexColors: true` 的材质做明暗区分）。第五参数默认 `true`，会把几何法线的 Y 分量混进亮度（朝上更亮）——角色装甲的标准做法。
- 几何会被硬绑定到单根骨骼（skinWeight 全 1），不做柔性蒙皮。所有形变都靠骨骼的旋转/位移。

### pm(rigDef, materials, opts) — 装配成可动角色

`models.js:108`。把 build 的结果变成 Three.js 的 SkinnedMesh + Bone 层级：

```js
import { pm } from "../src/enemies/models.js";

const parts = pm(def, {
  shell: mats.get("armor_white", { triplanar: true, vertexColors: true }),
  metal: mats.get("gunmetal", { triplanar: true, vertexColors: true }),
  glow:  mats.get("paint_orange"),
}, {
  radius: 1.5,          // 包围球半径（剔除用）
  center: [0, 0.5, 0],  // 包围球中心
});
// parts = { group, mesh, bones: {root, body, head, ...}, skeleton, extraMesh? }
context.scene.add(parts.group);
parts.bones.head.rotation.y = 0.5;  // 直接动骨骼
```

### q_(state, dx, dy, dz, side, l0, L1, L2) — 两骨骼 IK 解析解

`models.js:184`。给定髋关节位置偏移 `(dx,dy,dz)`（相对骨骼原点，在骨骼局部坐标系）、腿的几何参数（`l0` 髋横向偏移、`L1` 大腿长、`L2` 小腿长），把结果写进 `state` 对象：

```js
const ik = {};  // 复用同一个对象避免 GC
// 每帧对每条腿调用：
q_(ik,
  footLocal.x - side * HIP_X,   // 落脚点相对髋关节的局部坐标
  footLocal.y - HIP_Y,
  footLocal.z - side * HIP_Z,
  side,                          // +1 左腿 / -1 右腿
  L0, L1, L2
);
// 读结果：
abdBone.rotation.z = ik.abd;   // 髋外展角
thighBone.rotation.x = ik.hip; // 大腿角度
shinBone.rotation.x = ik.knee; // 膝盖角度
```

真实用例在 `src/enemies/drone.js:883-895`（hound 每帧对四条腿做 IK）。

### 现成模型：createWalkerModel / createDroneModel

`models.js:301` / `models.js:801` 是两个完整实现，可以直接读源码学布局：walker 有 19 根骨骼（含 4 条腿的 abd/thigh/shin 三段），drone 有旋转子骨骼（rotor0-3）和云台（gimbalYaw/ball/gun）。检视器的 Act 页签会展示它们（`inspector/main.js` 的 actors 分类）。

## Studio 里怎么用

音频：在 `create` 或 `update` 里直接 `context.audio.play("ui_click")` 或 `context.audio.loop("relay_hum", { pos: [0,1,0] })`。检视器已接好全部音频系统，但**记得第一次播放前调 `context.audio.resume()`**（浏览器手势解锁）。

骨骼：studio 资产也可以用 RigBuilder——比如给卡车加一根会摆动的机械臂，`create` 里 build，`update` 里旋转 `parts.bones.arm`。更简单的做法（不需要蒙皮）是直接用 Group 嵌套 + 手动旋转，骨骼系统的真正价值是配合 `createWalkerModel` 这种"多段肢体+IK"的场景。
