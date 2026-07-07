# Proposal: 给 3D 角色T恤添加"刀哥"文字印花

## Why

3D 首页的角色（`src/three-room.js` 的 `addCharacter()`）目前穿纯蓝T恤，没有个性化标识。
用户要求在T恤正面竖排印上白色"刀哥"二字，作为角色的个人标签/文化衫效果。

## What Changes

- 新增 `createShirtTextTexture()` 函数：512×512 canvas，蓝底（#4f64df）+ 白色（#ffffff）竖排"刀哥"，bold 黑体
- 新增 `shirtFrontMat` 材质：复制 `shirtMat` 的 roughness/metalness/emissive 参数，加 `map` + `color: 0xffffff`
- 修改 `body` mesh：从单材质改为 6 面材质数组，index 4（+Z 正面）用 `shirtFrontMat`，其余 5 面用 `shirtMat`
- 文字仅出现在角色正面，坐下后（`CHAR_SIT_ROT = 0`）朝向摄像机可见

## Non-Goals

- 不改T恤颜色（仍是 0x4f64df 蓝）
- 不在手臂、后背、其他部位加文字
- 不改角色几何体尺寸/位置/动画逻辑
- 不改 `shirtMat` 定义本身（手臂仍安全引用）
- 不加文字动画（静态印花）

## Impact

- 改动文件：仅 `src/three-room.js`（2 处：新增函数 + 改 body 创建）
- 影响范围：3D 首页角色外观
- 风险：极低——纯增量，不动现有逻辑
