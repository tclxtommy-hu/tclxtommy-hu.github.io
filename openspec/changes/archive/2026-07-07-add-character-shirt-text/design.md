# Design: T 恤文字印花

## Decision 1: 多材质 Box（方案 B）vs 独立面片（方案 A）

**选择：多材质 Box**

| 维度 | A 独立面片 | B 多材质 Box |
|------|-----------|-------------|
| 光照响应 | MeshBasicMaterial 不受光，文字浮在表面 | MeshStandardMaterial 受光，文字像印在布上 |
| Z-fighting | 需偏移 0.001 | 无（就是表面本身） |
| 接缝 | 无 | 需匹配蓝色（已解决） |
| 改动量 | 最小 | 中 |

B 的受光效果让"印花"看起来像真实布料印花而非贴纸，视觉更自然。
接缝色差通过纹理蓝底精确匹配 shirtMat 的 0x4f64df 解决。

## Decision 2: Canvas 尺寸 512×512（正方形）

正面尺寸 0.44×0.46 接近正方形（比例 0.957:1）。
用 512×512 纹理，X 方向压缩约 4%，Y 方向拉伸约 4%——对中文字符几乎无感知。
若用 256×512 竖矩形，文字会被横向压扁，不合适。

## Decision 3: 字体 bold 黑体

`ctx.font = 'bold 140px "SimHei", "Microsoft YaHei", "Heiti SC", sans-serif'`

- 黑体 = 现代 T 恤文化衫印花风格
- 楷体（KaiTi）偏书法/文艺，与T恤印花语境不搭
- 字号 140px / 512px = 27%，单字约 0.12m，符合真实T恤胸印尺寸（8-15cm）

## Decision 4: 文字布局

```
spacing = canvas.height / 3
刀 → y = spacing * 1 = 171px (居中偏上)
哥 → y = spacing * 2 = 341px (居中偏下)
```

- 上下边距各 101px（20%），居中
- 两字间距 30px，不拥挤
- textBaseline = 'middle'，textAlign = 'center'

## Decision 5: UV 方向已验证

BoxGeometry +Z 面 + CanvasTexture flipY=true：
- Canvas 顶 → V=1 → +Y（胸口上方）→ "刀"在上 ✓
- Canvas 底 → V=0 → -Y（胸口下方）→ "哥"在下 ✓
- 水平不镜像 ✓

## Risk: 接缝色差

正面材质 `color: 0xffffff` + `map`（蓝底白字），侧面材质 `color: 0x4f64df`（无 map）。
两者在非文字区域的最终渲染颜色取决于：
- 纹理蓝底 RGB(79,100,223) 经 sRGB→linear 转换后的值
- shirtMat color 0x4f64df 经 sRGB→linear 转换后的值

两者输入相同（都是 #4f64df），且 roughness/metalness/emissive 一致，
渲染结果应像素级一致。若极端情况下有微小差异，肉眼在阴影环境下不可见。
