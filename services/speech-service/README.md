# Sylis Speech Service

## 🎯 项目概述

Sylis Speech Service 是一个基于 WeNet 的智能语音评估服务，专为英语学习应用设计。该服务提供精确的语音对齐、发音评估和音素分析功能，帮助学习者提升英语发音水平。

## ✨ 核心功能

- 🎤 **语音识别**: 基于 WeNet (Conformer + CTC) 的高精度语音识别
- 📍 **音素对齐**: CTC 算法实现的精确音素级时间对齐
- 📊 **发音评估**: 多维度发音质量评估（准确性、流利度、完整性）
- 🔍 **音素分析**: 详细的音素置信度分析和错误检测
- 🌐 **RESTful API**: 易于集成的 HTTP API 接口
- 🐳 **容器化**: Docker 支持，便于部署和扩展

## 📁 文件结构

```
services/speech-service/
├── app/                     # 🌐 主应用代码
│   ├── __init__.py
│   ├── alignment.py         # ✅ WeNet语音对齐实现
│   ├── phoneme_confidence.py # 📊 发音评估算法
│   ├── main.py             # 🌐 FastAPI服务入口
│   └── schemas.py          # 📋 数据模型定义
├── config/                  # ⚙️ 配置文件
│   ├── wenet_config.yaml   # WeNet模型配置
│   ├── words.txt           # 词典文件
│   └── env.example         # 环境变量示例
├── scripts/                 # 🔧 管理脚本
│   ├── manage.py           # 服务管理脚本
│   ├── quick_setup.py      # 快速设置脚本
│   └── download_models.py  # 模型下载工具
├── tests/                   # 🧪 测试代码
│   ├── conftest.py         # pytest配置
│   ├── unit/               # 单元测试
│   └── integration/        # 集成测试
├── models/                  # 🤖 模型文件
├── Makefile                # 📋 构建管理
├── pyproject.toml          # 📦 Python项目配置和依赖
├── Dockerfile             # 🐳 Docker配置
└── README.md              # 📄 项目文档
```

## 🏗️ 技术架构

### 核心组件

- **`alignment.py`**: WeNet 语音对齐核心模块
- **`phoneme_confidence.py`**: 发音评估算法实现
- **`main.py`**: FastAPI 服务主入口
- **`wenet_config.yaml`**: WeNet 模型配置文件
- **`words.txt`**: 词典文件

### 技术特点

- **WeNet 集成**: 使用业界先进的 Conformer + CTC 架构
- **CTC 对齐**: 基于概率的精确音素级时间对齐
- **智能回退**: 当 WeNet 不可用时自动使用简化算法
- **配置驱动**: YAML 配置文件，便于参数调优
- **自动下载**: 智能模型下载和缓存机制

## 🚀 使用方法

### 1. 一键快速开始（推荐）

```bash
# 使用 Makefile（推荐）
make setup

# 或直接运行设置脚本
python3 scripts/quick_setup.py
```

### 2. 手动安装

```bash
# 1. 安装依赖
make install
# 或: pip install -e .

# 2. 下载WeNet模型
make download
# 或: python3 scripts/download_models.py

# 3. 运行测试
make test

# 4. 启动服务
make start
# 或开发模式: make dev
```

### 3. 网络问题解决方案

如果模型下载失败（SSL证书错误等），可以使用以下方案：

```bash
# 方案1: 跳过下载，使用回退模式
python3 download_models.py --skip-download

# 方案2: 查看手动下载说明
python3 download_models.py --manual

# 方案3: 强制重试下载
python3 download_models.py --force
```

### 4. Docker部署

```bash
docker build -t sylis-speech-wenet .
docker run -p 8080:8080 sylis-speech-wenet
```

### 5. 使用示例

```bash
# 查看详细使用示例
python example_usage.py
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

1. **WeNet导入失败**

   ```bash
   # 尝试重新安装WeNet
   pip install git+https://github.com/wenet-e2e/wenet.git

   # 或者安装基础依赖，使用回退模式
   pip install torch torchaudio numpy
   ```

2. **模型下载失败 (SSL证书错误)**

   ```bash
   # 方案1: 使用回退模式
   python3 download_models.py --skip-download

   # 方案2: 查看手动下载说明
   python3 download_models.py --manual

   # 方案3: 强制重试（已修复SSL问题）
   python3 download_models.py --force
   ```

3. **服务启动失败**

   ```bash
   # 检查端口占用
   lsof -i :8080

   # 使用其他端口
   uvicorn app.main:app --host 0.0.0.0 --port 8081

   # 查看详细错误
   uvicorn app.main:app --log-level debug
   ```

4. **对齐结果不准确**
   - 检查音频质量 (16kHz, 单声道)
   - 确保文本与音频匹配
   - 调整模型参数
   - 尝试使用真实的WeNet模型

5. **依赖安装失败**

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
