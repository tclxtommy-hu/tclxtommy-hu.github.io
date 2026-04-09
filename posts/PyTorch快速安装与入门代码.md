# PyTorch 简介

PyTorch 是一个开源的深度学习框架，由 Facebook AI Research (FAIR) 团队开发。它具有以下特点：

## 核心特性
- **动态计算图**：使用"define-by-run"的方式，代码即计算图，调试更直观
- **Pythonic 设计**：与 Python 生态无缝集成，API 设计简洁自然
- **强大的 GPU 加速**：支持 CUDA，可轻松在 CPU 和 GPU 之间切换
- **自动微分**：内置 autograd 系统，自动计算梯度
- **丰富的生态系统**：TorchVision、TorchText、TorchAudio 等扩展库

## 主要应用场景
- 计算机视觉（CNN、GAN、目标检测等）
- 自然语言处理（RNN、Transformer、BERT 等）
- 强化学习
- 科学计算

## 快速安装

### 方法一：使用 pip 安装（推荐）
```bash
# CPU 版本（适用于没有 NVIDIA GPU 的情况）
pip install torch torchvision torchaudio

# GPU 版本（需要 CUDA 支持）
# 访问 https://pytorch.org/get-started/locally/ 获取适合你系统的命令
# 例如 CUDA 11.8:
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
```

### 方法二：使用 conda 安装
```bash
# CPU 版本
conda install pytorch torchvision torchaudio cpuonly -c pytorch

# GPU 版本（CUDA 11.8）
conda install pytorch torchvision torchaudio pytorch-cuda=11.8 -c pytorch -c nvidia
```

## 入门代码示例

### 1. 基础张量操作
```python
import torch
import torch.nn as nn
import torch.optim as optim

# 创建张量
x = torch.tensor([1.0, 2.0, 3.0])
print(f"张量: {x}")
print(f"形状: {x.shape}")

# 随机张量
random_tensor = torch.randn(3, 4)
print(f"随机张量形状: {random_tensor.shape}")

# GPU 检测和使用
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"使用设备: {device}")

x_gpu = x.to(device)  # 移动到 GPU
```

### 2. 简单的线性回归
```python
import torch
import torch.nn as nn
import numpy as np
import matplotlib.pyplot as plt

# 生成模拟数据
np.random.seed(42)
x_data = np.random.rand(100, 1).astype(np.float32)
y_data = 2 * x_data + 1 + 0.1 * np.random.randn(100, 1).astype(np.float32)

# 转换为 PyTorch 张量
x_tensor = torch.from_numpy(x_data)
y_tensor = torch.from_numpy(y_data)

# 定义模型
class LinearRegression(nn.Module):
    def __init__(self):
        super(LinearRegression, self).__init__()
        self.linear = nn.Linear(1, 1)  # 输入维度1，输出维度1
    
    def forward(self, x):
        return self.linear(x)

model = LinearRegression()
criterion = nn.MSELoss()  # 均方误差损失
optimizer = optim.SGD(model.parameters(), lr=0.01)  # 随机梯度下降

# 训练模型
num_epochs = 100
for epoch in range(num_epochs):
    # 前向传播
    outputs = model(x_tensor)
    loss = criterion(outputs, y_tensor)
    
    # 反向传播和优化
    optimizer.zero_grad()  # 清零梯度
    loss.backward()        # 计算梯度
    optimizer.step()       # 更新参数
    
    if (epoch + 1) % 20 == 0:
        print(f'Epoch [{epoch+1}/{num_epochs}], Loss: {loss.item():.4f}')

# 测试模型
with torch.no_grad():
    predicted = model(x_tensor).detach().numpy()
    
print(f"真实权重: 2.0, 学习到的权重: {model.linear.weight.item():.2f}")
print(f"真实偏置: 1.0, 学习到的偏置: {model.linear.bias.item():.2f}")
```

### 3. 使用预训练模型（计算机视觉）
```python
import torch
import torchvision.transforms as transforms
from PIL import Image

# 加载预训练的 ResNet18 模型
model = torch.hub.load('pytorch/vision:v0.10.0', 'resnet18', pretrained=True)
model.eval()  # 设置为评估模式

# 图像预处理
preprocess = transforms.Compose([
    transforms.Resize(256),
    transforms.CenterCrop(224),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])

# 加载并预处理图像（这里用随机数据演示）
dummy_input = torch.randn(1, 3, 224, 224)

# 推理
with torch.no_grad():
    output = model(dummy_input)

print(f"输出形状: {output.shape}")  # [1, 1000] - ImageNet 的 1000 个类别
```

### 4. 数据加载器示例
```python
from torch.utils.data import DataLoader, TensorDataset

# 创建数据集
dataset = TensorDataset(x_tensor, y_tensor)
dataloader = DataLoader(dataset, batch_size=10, shuffle=True)

# 使用数据加载器训练
for epoch in range(50):
    for batch_x, batch_y in dataloader:
        outputs = model(batch_x)
        loss = criterion(outputs, batch_y)
        
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
    
    if (epoch + 1) % 10 == 0:
        print(f'Epoch [{epoch+1}/50], Loss: {loss.item():.4f}')
```

## 常用资源

### 官方文档和教程
- [PyTorch 官网](https://pytorch.org/)
- [官方教程](https://pytorch.org/tutorials/)
- [PyTorch 中文文档](https://pytorch-cn.readthedocs.io/)

### 开发环境建议
- **IDE**: PyCharm、VS Code（安装 Python 和 Jupyter 插件）
- **Notebook**: Jupyter Notebook/Lab
- **调试**: 使用 `torch.set_printoptions()` 控制张量显示

### 常用命令检查安装
```python
import torch
print(torch.__version__)           # PyTorch 版本
print(torch.cuda.is_available())   # CUDA 是否可用
print(torch.version.cuda)          # CUDA 版本
```

这个入门指南涵盖了 PyTorch 的基本概念、安装方法和核心代码示例。你可以从简单的张量操作开始，逐步尝试构建和训练神经网络模型。