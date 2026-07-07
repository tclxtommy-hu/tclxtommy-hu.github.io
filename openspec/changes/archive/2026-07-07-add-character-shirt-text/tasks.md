# Tasks: add-character-shirt-text

## 1. 纹理工厂函数

- [x] 1.1 在 `addCharacter()` 之前（约 `:491`）新增 `createShirtTextTexture()` 函数
  - 512×512 canvas
  - `ctx.fillStyle = '#4f64df'` 填满蓝底
  - `ctx.fillStyle = '#ffffff'`，`ctx.font = 'bold 140px "SimHei", "Microsoft YaHei", "Heiti SC", sans-serif'`
  - 竖排 `['刀', '哥']`，spacing = height/3，textAlign='center'，textBaseline='middle'
  - 返回 `THREE.CanvasTexture`，设 `colorSpace = SRGBColorSpace`

## 2. 正面材质

- [x] 2.1 在 `addCharacter()` 内、body 创建之前，新增 `shirtFrontMat`
  - `MeshStandardMaterial`，`color: 0xffffff`，`map: createShirtTextTexture()`
  - `roughness: 0.72, metalness: 0.05, emissive: 0x000000, emissiveIntensity: 0.2`（复制 makeMaterial 参数）

## 3. 改 body 为多材质

- [x] 3.1 把 `:505` 的 body 创建从单材质改为 6 面材质数组
  - `[shirtMat, shirtMat, shirtMat, shirtMat, shirtFrontMat, shirtMat]`
  - index 4（+Z 正面）= shirtFrontMat，其余 = shirtMat
  - 不改几何体尺寸/位置/旋转

## 4. 验证

- [x] 4.1 `npm run dev` 启动，等角色走进坐下后确认：
  - 白色"刀哥"竖排出现在胸口正面
  - "刀"在上"哥"在下
  - 后背/侧面/手臂无文字
  - 正面与侧面蓝色接缝无明显色差
  - 走路阶段文字不可见（背面朝摄像机）
- [x] 4.2 `/opsx:archive` 归档变更，delta specs 合并进 `openspec/specs/character-model/`
