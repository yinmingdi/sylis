# 音素 DNN 模型训练

这个目录包含训练音素识别模型的所有脚本。

## 📁 文件说明

### 核心训练脚本

- **`train_phoneme_dnn.py`** - 主训练脚本
  - 使用 SpeechOcean762 数据集
  - 训练 DNN 模型进行音素识别
  - 支持自动对齐数据

### 数据对齐脚本

- **`batch_align_dataset.py`** - 批量对齐数据集
  - 使用 MFA 对 SpeechOcean762 进行音素对齐
  - 批处理模式，速度快
- **`align_dataset.py`** - 单样本对齐（已废弃，使用 batch 版本）

### 文档

- **`TRAINING_PLAN.md`** - 训练计划和方案
- **`train_dnn_aligner.md`** - DNN 对齐器训练文档

---

## 🚀 使用方法

### 1. 训练模型（推荐）

```bash
cd training
python train_phoneme_dnn.py
```

**配置：**

- 训练轮数：20 轮
- 训练样本：全部数据（~2500个）
- 验证样本：全部数据（~500个）
- 早停机制：5轮不提升自动停止

**自动流程：**

1. ✅ 自动检查 MFA 对齐数据
2. ✅ 如果没有，自动调用 `batch_align_dataset.py` 对齐
3. ✅ 加载数据集并训练
4. ✅ 保存模型到 `../models/pytorch_phoneme_dnn/`

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

## ⚙️ 配置调整

编辑 `train_phoneme_dnn.py` 中的配置：

```python
# 配置
batch_size = 16
num_epochs = 20          # 训练轮数（推荐 20-40）
max_train_samples = None # 全部数据
max_val_samples = None   # 全部数据

# 早停配置
patience = 5             # 5轮不提升就停止
min_delta = 0.001        # 最小改进阈值

# 模型配置
context_frames = 5       # 上下文窗口（±5帧）
hidden_dims = [1024, 512, 256]  # 隐藏层维度
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

```bash
⚠️  未找到对齐数据: ../aligned_data/train_aligned.json
🚀 开始对齐 2500 个样本...
```

**解决：** 等待自动对齐完成（约 5-15 分钟）

### 问题：训练太慢

**解决：** 减少样本数进行快速测试

```python
max_train_samples = 500  # 只用500个样本测试
max_val_samples = 100
```

### 问题：显存不足

**解决：** 减小批次大小

```python
batch_size = 8  # 从 16 降到 8
```

---

## 📝 相关文档

- **测试模型**: `../tests/test_pytorch_model.py`
- **评分器实现**: `../app/pytorch_phoneme_scorer.py`
- **MFA 对齐器**: `../app/mfa_aligner.py`
