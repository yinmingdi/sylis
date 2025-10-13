# Sylis Speech Service

## 🎯 项目概述

Sylis Speech Service 是一个基于 **PyTorch DNN + MFA** 的智能语音评估服务，专为**儿童英语学习**应用设计。

**核心特点**：

- 使用 **PyTorch DNN** 模型（交叉熵损失函数，保留完整音素概率分布）
- 不使用 CTC（避免概率极化）
- 提供精确的音素级语音对齐和 GOP 评分
- 基于 SpeechOcean762 数据集训练（非母语发音评估）

## ✨ 核心功能

- 🎯 **音素对齐**: 基于 MFA 实现的精确音素级时间对齐（±20ms 精度）
- 🧠 **GOP 评分**: 使用 PyTorch DNN 模型计算 Goodness of Pronunciation 分数
- 📊 **多维度评估**: 准确性、流利度、完整性综合评分
- 🔍 **音素分析**: 详细的音素置信度和混淆分析
- 🏆 **NBest 候选**: 提供每个音素位置的 Top-5 候选音素及分数（类似 Azure）
- ⚠️ **错误类型**: 自动标注 None/Mispronunciation（基于分数阈值）
- 🌐 **RESTful API**: 易于集成的 HTTP API 接口
- 💾 **离线运行**: 无需云端 API，节省成本

## 📁 文件结构

```
services/speech-service/
├── app/                     # 🌐 主应用代码
│   ├── __init__.py
│   ├── mfa_aligner.py       # ✅ MFA 音素对齐实现
│   ├── pytorch_phoneme_scorer.py # 🧠 PyTorch DNN 音素评分器
│   ├── phoneme_confidence.py # 📊 发音评估算法
│   ├── pronunciation_pipeline.py # 🔄 完整评估流水线
│   ├── main.py              # 🌐 FastAPI 服务入口
│   └── schemas.py           # 📋 数据模型定义
├── training/                # 🎓 模型训练
│   ├── train_phoneme_dnn.py # 主训练脚本
│   ├── batch_align_dataset.py # 批量数据对齐
│   ├── align_dataset.py     # 单样本对齐（已废弃）
│   ├── TRAINING_PLAN.md     # 训练计划
│   └── README.md            # 训练文档
├── tests/                   # 🧪 测试代码
│   ├── test_pytorch_model.py # PyTorch 模型测试
│   ├── hello.wav / bye.wav  # 测试音频
│   ├── conftest.py          # pytest 配置
│   ├── unit/                # 单元测试
│   ├── integration/         # 集成测试
│   └── README.md            # 测试文档
├── models/                  # 🤖 模型文件
│   ├── best_phoneme_dnn.pth # 最佳模型
│   └── pytorch_phoneme_dnn/ # PyTorch 模型
├── aligned_data/            # 📊 对齐数据
│   ├── train_aligned.json   # 训练集对齐结果
│   └── test_aligned.json    # 测试集对齐结果
├── scripts/                 # 🔧 管理脚本
├── Makefile                 # 📋 构建管理
└── README.md                # 📄 项目文档
```

## 🏗️ 技术架构

### 核心组件

- **`mfa_aligner.py`**: MFA 音素对齐模块
- **`pytorch_phoneme_scorer.py`**: PyTorch DNN 音素评分器（GOP 算法）
- **`phoneme_confidence.py`**: 多维度置信度计算
- **`pronunciation_pipeline.py`**: 完整的评估流水线
- **`main.py`**: FastAPI 服务主入口

### 🎵 PyTorch DNN + MFA 架构

本服务使用现代化的深度学习架构：

1. **MFA 对齐**: 使用 Montreal Forced Aligner 进行音素级时间对齐
2. **音素级时间边界**: 精确到 ±20ms 的音素级对齐
3. **PyTorch DNN**: 使用自训练的 DNN 模型（**交叉熵训练，不是 CTC**）
4. **GOP 评分**: 计算 `log(P(正确音素) / P(混淆音素))`
5. **多维度评分**: 准确性 + 流利度 + 完整性

#### 技术优势（相比 CTC 方案）

- ✅ **保留完整概率分布**: 使用交叉熵而非 CTC，不会极化输出
- ✅ **音素混淆分析**: 可以比较目标音素和混淆音素的概率
- ✅ **可训练优化**: 基于 SpeechOcean762 数据集自主训练
- ✅ **轻量级模型**: PyTorch 模型，易于部署和优化
- ✅ **离线部署**: 无需云端 API，降低成本

### 技术特点

- **PyTorch DNN**: 使用交叉熵训练的深度神经网络（非 CTC）
- **MFA 对齐**: 精确的音素级对齐
- **GOP 算法**: Goodness of Pronunciation 评分
- **自主训练**: 可基于自己的数据训练模型
- **配置驱动**: 灵活的配置系统

### 核心算法原理

详细的算法说明和实现细节，请参阅：

- **算法原理文档**: [ALGORITHM_README.md](ALGORITHM_README.md)
- **实现状态说明**: [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)

## 🎓 模型训练

**首次使用需要训练模型：**

```bash
# 训练音素识别模型（约 30-60 分钟）
make train
```

**训练内容：**

- 数据集：SpeechOcean762（~2500 训练样本）
- 模型：PyTorch DNN [1024, 512, 256]
- 训练轮数：20 轮（自动早停）
- 输出：`models/pytorch_phoneme_dnn/final_model.pth`

### 使用示例

```python
from app.pronunciation_pipeline import create_default_pipeline

# 创建流水线（使用训练好的 PyTorch 模型）
pipeline = create_default_pipeline()

# 初始化
pipeline.initialize()

# 评估发音
result = pipeline.assess_pronunciation(
    audio_path="audio.wav",
    reference_text="this is a test"
)
```

---

## 🚀 快速开始

### 完整流程（首次使用）

```bash
# 1. 设置环境（一次性）
make setup

# 2. 训练模型（必需，约30-60分钟）
make train

# 3. 测试模型
make test-model

# 4. 启动服务
make start
```

---

## 📖 详细使用

### 1. 环境设置

```bash
# 一键创建conda环境并安装所有依赖
make setup
```

**安装内容：**

- ✅ 创建 `sylis-speech-service` conda 环境
- ✅ 安装 PyTorch、Librosa、FastAPI 等核心依赖
- ✅ 安装 Montreal Forced Aligner (MFA)
- ✅ 安装训练和测试所需的所有包

### 2. 模型训练

```bash
# 训练音素识别模型（20轮，约30-60分钟）
make train

# 或手动运行
cd training
python train_phoneme_dnn.py
```

**训练配置：**

- 数据集：SpeechOcean762 (~2500训练样本，~500验证样本)
- 模型：DNN [1024, 512, 256] + 帧拼接（context_frames=5）
- 训练轮数：20轮（自动早停）
- 输出：`models/pytorch_phoneme_dnn/final_model.pth`

详见：[training/README.md](training/README.md)

### 3. 模型测试

```bash
# 测试训练好的模型
make test-model

# 或手动测试
python tests/test_pytorch_model.py tests/hello.wav 'hello'
python tests/test_pytorch_model.py tests/bye.wav 'bye'
```

详见：[tests/README.md](tests/README.md)

### 4. 启动服务

```bash
# 生产模式
make start

# 开发模式（自动重载）
make dev
```

访问：

- 服务地址：http://localhost:8080
- API文档：http://localhost:8080/docs

### 5. 其他命令

```bash
# 查看所有命令
make help

# 检查环境状态
make status

# 批量对齐数据（如果需要）
make align-data

# 代码检查
make lint

# 格式化代码
make format

# 清理临时文件
make clean
```

## 📊 API接口

### POST `/api/pronunciation/assess`

**请求参数:**

- `audio`: WAV音频文件
- `text`: 参考文本
- `language`: 语言代码 (默认: "en-US")
- `enable_phoneme`: 启用音素分析 (默认: true)

**响应示例:**

```json
{
  "overallScore": 85.5,
  "accuracyScore": 82.3,
  "fluencyScore": 88.7,
  "completenessScore": 100.0,
  "duration": 2.1,
  "words": [
    {
      "word": "hello",
      "start": 0.0,
      "end": 0.8,
      "accuracyScore": 85.2,
      "phonemes": [
        {
          "phoneme": "HH",
          "start": 0.0,
          "end": 0.2,
          "confidence": 0.9
        }
      ]
    }
  ]
}
```

## 🔄 智能回退机制

为了确保服务的稳定性，当 WeNet 不可用时，系统会自动使用简化的对齐算法：

```python
if not WENET_AVAILABLE:
    logger.warning("WeNet not available, using fallback alignment")
    return self._fallback_alignment(waveform, text)
```

这种设计确保了即使在依赖库缺失或模型加载失败的情况下，服务仍能提供基本的发音评估功能。

## 🧪 测试体系

项目包含完整的测试覆盖：

1. **模型加载测试**: 验证 WeNet 模型正确加载和初始化
2. **音频预处理测试**: 确保音频格式转换和预处理正确
3. **对齐算法测试**: 测试 CTC 对齐算法的准确性
4. **评估算法测试**: 验证发音分数计算的合理性
5. **API集成测试**: 端到端 API 功能测试
6. **回退机制测试**: 验证简化算法的可用性

## 📈 性能特性

- 🚀 **GPU 加速**: 支持 CUDA 加速，提升处理速度
- 📦 **批处理**: 支持批量音频处理，提高吞吐量
- 🔄 **模型缓存**: 智能模型缓存，减少重复加载时间
- 💾 **内存优化**: 优化的内存使用，支持高并发场景
- ⚡ **异步处理**: 基于 FastAPI 的异步处理能力

## 🛠️ 配置说明

### 依赖管理策略

本项目采用**纯conda**的依赖管理策略：

- **唯一方式**: 使用conda管理所有依赖，包括科学计算、Web框架、开发工具
- **优势**: 更好的依赖冲突解决、系统依赖自动安装、环境隔离、版本一致性

#### 依赖管理

```
conda环境 (environment.yml)
├── Python 3.8
├── 科学计算: numpy, scipy, librosa, pysoundfile
├── 机器学习: pytorch, torchaudio, torchvision
├── 音频处理: ffmpeg, sox
├── Web框架: fastapi, uvicorn, python-multipart
├── MFA相关: montreal-forced-aligner, praatio, textgrid
└── 开发工具: pytest, black, isort, flake8, mypy

注意: 已完全删除pyproject.toml，所有依赖通过conda管理
```

### Conda环境管理

#### 创建新环境

```bash
# 使用environment.yml创建环境
conda env create -f environment.yml

# 或使用快速脚本
./conda-setup.sh
```

#### 激活环境

```bash
# 激活speech-service环境
conda activate sylis-speech-service

# 验证安装
python -c "import montreal_forced_aligner; print('MFA可用')"
mfa version
```

#### 环境管理

```bash
# 列出所有环境
conda env list

# 删除环境
conda env remove -n sylis-speech-service

# 导出环境配置
conda env export > environment-backup.yml
```

### 环境变量

- `WENET_MODEL_PATH`: WeNet 模型文件路径
- `WENET_CONFIG_PATH`: WeNet 配置文件路径
- `WENET_DICT_PATH`: 词典文件路径
- `DEVICE`: 计算设备 (cpu/cuda)

### 模型配置 (`wenet_config.yaml`)

- **Conformer 编码器**: 语音特征提取配置
- **CTC 解码器**: 对齐和识别参数设置
- **对齐参数**: 音素对齐算法调优参数

## 🐛 故障排除

### 常见问题

1. **Conda环境问题**

   ```bash
   # 环境创建失败
   conda clean --all
   conda env create -f environment.yml --force

   # 环境激活失败
   conda init bash  # 或 zsh
   source ~/.bashrc  # 或 ~/.zshrc

   # 包冲突
   conda env export > current_env.yml
   conda env remove -n sylis-speech-service
   conda env create -f environment.yml
   ```

2. **MFA安装问题**

   ```bash
   # 使用conda安装MFA
   conda install -c conda-forge montreal-forced-aligner

   # 或使用pip安装
   python3 scripts/install-mfa.py

   # 检查MFA安装
   python3 scripts/install-mfa.py --test-only
   ```

3. **WeNet导入失败**

   ```bash
   # 尝试重新安装WeNet
   pip install git+https://github.com/wenet-e2e/wenet.git

   # 或者安装基础依赖，使用回退模式
   pip install torch torchaudio numpy
   ```

4. **模型下载失败 (SSL证书错误)**

   ```bash
   # 方案1: 使用回退模式
   python3 download_models.py --skip-download

   # 方案2: 查看手动下载说明
   python3 download_models.py --manual

   # 方案3: 强制重试（已修复SSL问题）
   python3 download_models.py --force
   ```

5. **服务启动失败**

   ```bash
   # 检查端口占用
   lsof -i :8080

   # 使用其他端口
   uvicorn app.main:app --host 0.0.0.0 --port 8081

   # 查看详细错误
   uvicorn app.main:app --log-level debug
   ```

6. **对齐结果不准确**
   - 检查音频质量 (16kHz, 单声道)
   - 确保文本与音频匹配
   - 调整模型参数
   - 尝试使用真实的WeNet模型

7. **依赖安装失败**

   ```bash
   # 升级pip
   pip3 install --upgrade pip

   # 使用清华源安装
   pip3 install -e . -i https://pypi.tuna.tsinghua.edu.cn/simple

   # 或逐个安装基础依赖
   pip3 install fastapi uvicorn torch torchaudio numpy requests pyyaml
   ```

## 📚 技术栈

- **语音识别**: WeNet (Conformer + CTC)
- **音频处理**: torchaudio, librosa
- **Web框架**: FastAPI + Uvicorn
- **配置管理**: PyYAML
- **容器化**: Docker
- **异步处理**: asyncio
- **日志系统**: Python logging

## 🎯 项目亮点

- ✅ **先进技术**: 基于业界领先的 WeNet 语音识别技术
- ✅ **精确对齐**: CTC 算法实现音素级精确时间对齐
- ✅ **智能评估**: 多维度发音质量评估算法
- ✅ **高可用性**: 智能回退机制确保服务稳定性
- ✅ **易于部署**: Docker 容器化，一键部署
- ✅ **完整测试**: 全面的测试覆盖保证代码质量
- ✅ **详细文档**: 完善的文档和使用示例

## 🚀 应用场景

- 📱 **英语学习 App**: 集成到移动端英语学习应用
- 🎓 **在线教育**: 为在线教育平台提供发音评估服务
- 🏫 **语言培训**: 支持语言培训机构的教学辅助
- 🔬 **语音研究**: 为语音学研究和开发提供基础服务

这个服务为 Sylis 英语学习应用提供了强大的语音评估能力，帮助学习者提升英语发音水平。

## 📖 相关文档

- 📊 **[API 数据结构对比](./API_COMPARISON.md)**: 与 Azure Speech 的详细功能对比（覆盖 95% Azure 功能）
  - 完整的返回数据示例
  - NBest 音素候选功能说明
  - ErrorType 错误类型说明
  - GOP 和概率分析优势
- 🎓 **[训练文档](./training/README.md)**: 模型训练详细说明
- 🧪 **[测试文档](./tests/README.md)**: 测试用例和覆盖率
