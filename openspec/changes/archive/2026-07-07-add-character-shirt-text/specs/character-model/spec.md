# Character Model Specification (Delta)

## ADDED Requirements

### Requirement: T 恤正面文字印花

角色T恤（body mesh）的正面（+Z 面）SHALL 显示白色竖排文字"刀哥"，仅在正面出现，坐下后朝向摄像机可见。

#### Scenario: 坐下后文字可见

- **WHEN** 角色完成坐下动画（`charState` 进入 `'done'`，`charWrap.rotation.y === 0`）
- **THEN** body mesh 的 +Z 面朝向摄像机
- **AND** 白色"刀哥"文字在胸口正面可见（`src/three-room.js` body mesh 材质数组 index 4）

#### Scenario: 文字仅出现在正面

- **WHEN** 渲染 body mesh
- **THEN** 只有 +Z 面（材质 index 4）带文字纹理（`shirtFrontMat.map`）
- **AND** 其余 5 个面（±X、±Y、-Z）使用纯色 `shirtMat`，无文字

#### Scenario: 文字竖排方向正确

- **WHEN** 纹理绘制
- **THEN** "刀"位于上方（canvas y 较小 → V≈1 → +Y 方向）
- **AND** "哥"位于下方（canvas y 较大 → V≈0 → -Y 方向）

#### Scenario: 手臂无文字

- **WHEN** 渲染 `leftUpperArmMesh` 和 `rightUpperArmMesh`（`src/three-room.js:604,617`）
- **THEN** 使用 `shirtMat`（无 `map` 属性），不显示"刀哥"文字

#### Scenario: 正面与侧面蓝色一致

- **WHEN** 渲染 body mesh 相邻面（如 +Z 与 +X 的接缝处）
- **THEN** `shirtFrontMat` 纹理蓝底 RGB 与 `shirtMat` 的 `color` 0x4f64df 一致
- **AND** roughness（0.72）/ metalness（0.05）/ emissive（0x000000）/ emissiveIntensity（0.2）参数一致
- **AND** 接缝处无明显色差

#### Scenario: 走路阶段文字不可见

- **WHEN** 角色处于走路阶段（`charState === 'walking'`，`charWrap.rotation.y === 2.6`）
- **THEN** body +Z 面背向摄像机（朝 +X/-Z 方向）
- **AND** "刀哥"文字不可见

### Requirement: 文字纹理生成

`createShirtTextTexture()` SHALL 生成一张蓝底白字的 canvas 纹理，用于 body 正面材质的 map。

#### Scenario: 纹理规格

- **WHEN** 调用 `createShirtTextTexture()`
- **THEN** 返回 `THREE.CanvasTexture`，canvas 尺寸 512×512
- **AND** 背景填充 `#4f64df`（与 shirtMat color 一致）
- **AND** 文字颜色 `#ffffff`（白色）
- **AND** 字体 `bold 140px "SimHei", "Microsoft YaHei", "Heiti SC", sans-serif`
- **AND** `colorSpace` 设为 `THREE.SRGBColorSpace`

#### Scenario: 文字内容与布局

- **WHEN** 纹理绘制完成
- **THEN** canvas 包含两个字"刀""哥"，竖排居中
- **AND** "刀"中心位于 y = height/3，"哥"中心位于 y = height*2/3
- **AND** `textAlign = 'center'`，`textBaseline = 'middle'`
