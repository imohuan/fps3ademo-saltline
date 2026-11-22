# 动画 API（每帧更新模式）

这个游戏没有动画文件、没有骨骼动画剪辑。所有动作——无人机螺旋桨、四足机器人步态、相机摇晃——都是**每帧用数学直接算出来的**。Studio 资产用自己的 `update(dt, t)` 钩子走同样的模式。

## 通用模式

```js
// inspector/studio/my-thing.js
let wheelAngle = 0;

export function create(context) { /* ...搭建，把会动的 mesh 存到闭包里... */ }

export function update(dt, t) {
  wheelAngle += dt * 4;              // 角速度（弧度/秒）
  wheel.rotation.x = wheelAngle;     // 直接写 Three.js 的 rotation
}
```

`dt` 是帧间隔（秒，最大 0.05，`inspector/main.js:1037`），`t` 是自启动累计秒数（`context.time.t`）。规则：**任何"速度"都用 dt 乘，任何"周期"都用 t**，这样帧率变化时动画速度不变。

## 三种典型动效（从源码提炼）

### 1. 匀速旋转（螺旋桨、风扇）

`src/enemies/walker.js:470-473`（四旋翼无人机 "gull"）：

```js
// 每帧：不同桨叶略带差速，看起来更自然
l.rotor0.rotation.y += K;
l.rotor1.rotation.y -= K * 1.03;
l.rotor2.rotation.y -= K * 0.98;
l.rotor3.rotation.y += K * 1.01;
```

`K` 是 `speed * dt * 常数`。要点：同轴的多个旋转件给一点点差速（0.98-1.03 倍），比完全同步更真实。

### 2. 闪烁灯（信标、示廓灯）

`src/enemies/walker.js:474-479`——用 phase 归一化时间，分段控制缩放：

```js
const ie = (t * 0.9 + phase) % 1;
const strobe = (ie < 0.05 || (ie > 0.13 && ie < 0.18)) ? 1 : 1e-4;
l.strobeR.scale.setScalar(strobe);
l.strobeG.scale.setScalar(strobe);
l.strobeW.scale.setScalar(ie > 0.5 && ie < 0.56 ? 1 : 1e-4);
```

也可以改自发光颜色——`src/enemies/walker.js:513-515` 用阻尼插值渐变：

```js
// 目标颜色 ee[] 与当前 lensC[] 之间，指数趋近（帧率无关）
for (let i = 0; i < 3; i++)
  lensC[i] += (target[i] - lensC[i]) * (1 - Math.exp(-8 * dt));
mat.color.setRGB(lensC[0] * brightness, lensC[1] * brightness, lensC[2] * brightness);
```

这个 `1 - Math.exp(-rate * dt)` 是整个项目的标准插值写法（帧率无关的阻尼）。等价工具在 `src/core/math.js:12`：`damp(from, to, rate, dt)`。

### 3. 相机/物体的弹簧抖动（后坐力、落地、受伤）

`src/player/player.js` 用弹簧-阻尼系统做相机动效：

```js
// 落地时的下沉（spring: g.v 是速度, g.x 是位移）
g.v -= Math.min(landingSpeed * 0.36, 3.2);      // player.js:359
// 每帧积分（player.js:466 附近的 K(F) 函数）
const force = -g.x * 150 - g.v * 17;
g.v += force * dt;
g.x += g.v * dt;
g.x = clamp(g.x, -0.2, 0.05);
```

相机摇晃（`player.js:450` 的 `K(F)`）：

```js
shake = Math.max(0, shake - 1.7 * dt);          // 指数衰减
const s2 = shake * shake;
pitch += s2 * 0.03 * (Math.sin(t*43.1) + 0.6*Math.sin(t*71.7+1.3)); // 两个不同频率叠加
yaw   += s2 * 0.03 * (Math.sin(t*37.3+2.1) + 0.6*Math.sin(t*83.9));
roll   += s2 * 0.045 * (Math.sin(t*29.7+0.7) + 0.5*Math.sin(t*61.3+4));
```

要点：**多个素数频率的正弦叠加**比单一正弦更"抖"，`shake²` 让轻微摇晃几乎不可见。

### 4. 视觉摆动（走路 bob、武器 sway）

`src/player/player.js:406-407`——走路用步频 phase 驱动：

```js
// phase 由速度积累：h += speed * dt / strideLength
const bobY = -Math.cos(h * Math.PI * 2) * 0.024 * intensity;  // 垂直（每步一浮一沉）
const bobX =  Math.sin(h * Math.PI)     * 0.013 * intensity;  // 横向（每步一左一右）
```

`intensity` 本身用 `damp` 平滑趋近 0 或 1（站着不动时 bob 渐停）。

## 四足步态（进阶参考）

`src/enemies/drone.js` 的 "hound" 是一套完整的四足 IK 步态，如果你想写会走路的资产可以参考（细节见 api-audio-and-rigs.md 的骨骼部分）。核心思路：

1. 每条腿有一个"落脚点" `foot.p`（世界坐标），站立时不动。
2. 身体持续移动，落脚点落后太多时该腿"迈步"：把 `foot.from` → `foot.to` 在 `swDur` 秒内插值，中途抬脚 `p.y += sin(π * progress) * lift`（`drone.js:811-818`）。
3. 迈步分组进行（对角步态：FL+RR 一组、FR+RL 一组，`drone.js:67` 的 `wm`），两组交替。
4. 身体姿态（俯仰/侧倾/高度）由四只脚的平均高度差算出，再用弹簧阻尼平滑（`drone.js:833-866` 的 `O(T)`）。
5. 每条腿的两段骨骼角度由两骨骼 IK 解析解算出（`src/enemies/models.js:184` 的 `q_`，见 api-audio-and-rigs.md）。

## Studio 里怎么用

`create` 里把需要动的 mesh 存起来，`update` 里每帧改它们。示例——旋转雷达 + 呼吸灯：

```js
let radar, ledMat;

export function create(context) {
  const root = new Group();
  radar = createMesh(boxGeometry(0.3, 0.04, 0.06), context.mats.get("steel_dark"));
  radar.position.y = 1.0;
  root.add(radar);
  ledMat = context.mats.emissive(0xff3300, 4);
  const led = createMesh(boxGeometry(0.04, 0.04, 0.04), ledMat, { cast: false });
  led.position.y = 1.1;
  root.add(led);
  return root;
}

export function update(dt, t) {
  radar.rotation.y = t * 1.5;                       // 6 秒/圈
  const pulse = 0.5 + 0.5 * Math.sin(t * 3.0);      // 0→1→0 每约2秒
  ledMat.color.setRGB(1 * pulse + 0.1, 0.2 * pulse, 0);
}
```
