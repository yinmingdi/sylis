# 音素 DNN 模型训练（重构版 v2.0）

这个目录包含训练音素识别模型的所有脚本和模块。

## 🎯 重构说明

### v2.0 重构内容

**重构目标：**

- ✅ 模块化设计，提高代码可维护性
- ✅ 分离关注点，每个模块职责明确
- ✅ 统一配置管理
- ✅ 代码复用，减少重复
- ✅ 更好的错误处理
- ✅ 改进的文档

**模块结构：**

```
training/
├── __init__.py              # 包初始化
├── config.py                # 🔧 配置管理
├── utils.py                 # 🛠️ 工具函数
├── dataset.py               # 📊 数据集处理
├── model.py                 # 🏗️ 模型定义
├── trainer.py               # 🚀 训练逻辑
├── aligner.py               # 📍 对齐逻辑
├── batch_align_dataset.py   # 批量对齐脚本
└── train_phoneme_dnn.py     # 训练主脚本
```

---

## 📁 模块说明

### 核心模块

#### 1. `config.py` - 配置管理

- 集中管理所有配置参数
- 数据集配置、模型配置、训练配置、对齐配置
- 音素定义和映射
- 路径管理

#### 2. `utils.py` - 工具函数

- 数据集加载工具
- 音频处理工具
- 对齐数据工具
- 音素分析工具
- 统计和显示工具

#### 3. `dataset.py` - 数据集处理

- `SpeechOcean762Dataset` 类
- 支持 MFA 对齐或平均分配
- 自动提取 MFCC 特征
- 加权评分支持

#### 4. `model.py` - 模型定义

- `PhonemeDNN` 模型类
- 帧拼接（上下文窗口）
- 模型创建、加载、保存
- 模型信息打印

#### 5. `trainer.py` - 训练逻辑

- `PhonemeTrainer` 训练器类
- 训练和验证循环
- 早停机制
- 加权损失计算
- 难音素跟踪

#### 6. `aligner.py` - 对齐逻辑

- `MFABatchAligner` 对齐器类
- 批量对齐流程
- TextGrid 解析
- 自动检查和对齐

### 主要脚本

#### 1. `train_phoneme_dnn.py` - 训练主脚本

使用 SpeechOcean762 数据集训练音素 DNN 模型

**特性：**

- ✅ 自动检查并对齐数据
- ✅ 加权交叉熵损失
- ✅ 早停机制
- ✅ 学习率调度
- ✅ 难音素跟踪

#### 2. `batch_align_dataset.py` - 批量对齐脚本

使用 MFA 批量对齐数据集（速度提升 5-10 倍）

---

## 🚀 使用方法

### 1. 训练模型（推荐）

```bash
cd training
python train_phoneme_dnn.py
```

**自动流程：**

1. ✅ 检查 MFA 对齐数据
2. ✅ 如果没有，自动调用批量对齐
3. ✅ 分析音素分布
4. ✅ 加载数据集并训练
5. ✅ 保存模型到 `../models/`

**训练配置：**

可以在 `config.py` 中修改：

```python
# 数据集配置
dataset_config.max_train_samples = None  # None = 全部数据
dataset_config.max_val_samples = None

# 训练配置
training_config.batch_size = 16
training_config.num_epochs = 40
training_config.patience = 5  # 早停

# 模型配置
model_config.context_frames = 5
model_config.hidden_dims = [1024, 512, 256]
```

### 2. 单独对齐数据集

如果只想对齐数据，不训练：

```bash
cd training
python batch_align_dataset.py --split train --max-samples 2500
python batch_align_dataset.py --split test
```

**输出：**

- `../aligned_data/train_aligned.json`
- `../aligned_data/test_aligned.json`

### 3. 使用模块（Python 代码）

```python
from training import (
    create_model,
    SpeechOcean762Dataset,
    create_dataloader,
    PhonemeTrainer,
    batch_align_dataset
)

# 创建模型
model = create_model()

# 创建数据集
dataset = SpeechOcean762Dataset(
    split='train',
    alignment_file='../aligned_data/train_aligned.json'
)

# 创建数据加载器
loader = create_dataloader(dataset, batch_size=16)

# 创建训练器
trainer = PhonemeTrainer(model, loader)

# 训练
trainer.train(num_epochs=20)
```

---

## 📊 训练输出

### 训练过程

```
📊 Epoch 1/20
   训练损失: 2.3456
   训练准确率: 28.45%
   验证损失: 2.4567
   验证准确率: 29.81%

   难音素准确率:
      L  : 18.3% (234/1280)
      OW : 15.6% (98/628)
      ...
```

### 保存的模型

```
../models/
  ├── best_phoneme_dnn.pth           # 验证集上最佳模型
  └── pytorch_phoneme_dnn/
      ├── final_model.pth            # 最后一轮模型
      └── config.json                # 模型配置
```

---

## ⚙️ 配置说明

### 数据集配置 (DatasetConfig)

```python
name: str = "mispeech/speechocean762"
train_split: str = "train"
test_split: str = "test"
max_train_samples: Optional[int] = None  # None = 全部
max_val_samples: Optional[int] = None
feature_type: str = "mfcc"
num_ceps: int = 40
```

### 模型配置 (ModelConfig)

```python
input_dim: int = 40              # MFCC 维度
context_frames: int = 5          # 上下文窗口 (±5 帧)
hidden_dims: List[int] = [1024, 512, 256]
num_phones: int = 41             # 音素数量
dropout: float = 0.4
```

### 训练配置 (TrainingConfig)

```python
batch_size: int = 16
num_epochs: int = 40
learning_rate: float = 0.001
patience: int = 5                # 早停耐心值
min_delta: float = 0.001         # 最小改进阈值
```

### 对齐配置 (AlignmentConfig)

```python
acoustic_model: str = "english_us_arpa"
dictionary: str = "english_us_arpa"
timeout: int = 3600              # 超时时间（秒）
```

---

## 🎯 预期结果

### 训练完成后

- ✅ 验证准确率：50-60%
- ✅ 难音素（L/OW）准确率：25-35%
- ✅ 模型参数：~1.1M
- ✅ 模型大小：~4.3MB

### 测试评分

```bash
cd ..
python tests/test_pytorch_model.py tests/hello.wav 'hello'
```

**预期评分：**

- 简单音素（HH）：80-95 分
- 中等音素（AH）：60-75 分
- 难音素（L）：35-50 分
- 难音素（OW）：30-45 分

---

## 🔧 故障排查

### 问题：对齐数据不存在

```
⚠️ 未找到对齐数据: ../aligned_data/train_aligned.json
🚀 开始对齐 2500 个样本...
```

**解决：** 等待自动对齐完成（约 5-15 分钟）

### 问题：训练太慢

**解决：** 减少样本数进行快速测试

```python
# 在 config.py 中修改
dataset_config.max_train_samples = 500
dataset_config.max_val_samples = 100
```

### 问题：显存不足

**解决：** 减小批次大小

```python
# 在 config.py 中修改
training_config.batch_size = 8  # 从 16 降到 8
```

---

## 📝 代码质量改进

### v2.0 改进点

1. **模块化设计**
   - 每个模块职责单一
   - 易于测试和维护

2. **配置集中管理**
   - 所有配置在 `config.py`
   - 使用 dataclass 类型安全

3. **代码复用**
   - 消除重复代码
   - 统一的工具函数

4. **错误处理**
   - 更好的异常处理
   - 清晰的错误消息

5. **文档完善**
   - 详细的 docstring
   - 清晰的注释

6. **类型提示**
   - 使用 Python type hints
   - 提高代码可读性

---

## 📚 相关文档

- **测试模型**: `../tests/test_pytorch_model.py`
- **评分器实现**: `../app/pytorch_phoneme_scorer.py`
- **MFA 对齐器**: `../app/mfa_aligner.py`
- **训练计划**: `TRAINING_PLAN.md`
- **DNN 对齐器**: `train_dnn_aligner.md`

---

## 🎉 总结

重构后的代码具有以下优势：

- ✅ **更清晰**：模块化设计，职责明确
- ✅ **更易维护**：代码复用，减少重复
- ✅ **更灵活**：配置集中，易于调整
- ✅ **更可靠**：类型提示，错误处理
- ✅ **功能不变**：保持原有功能完整性

**版本历史：**

- v1.0: 原始版本（单文件，功能完整但难维护）
- v2.0: 重构版本（模块化，易维护，功能增强）
