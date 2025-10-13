# 模型 1: DNN-HMM 对齐器训练方案

## 📋 目标

训练一个 DNN-HMM 对齐模型，用于精确的音素级对齐。

## ⚠️ 说明

**DNN-HMM 对齐器必须用 Kaldi 训练**，不能用 PyTorch/TensorFlow。

原因：

- 需要 HMM 状态转移
- 需要 Viterbi 解码
- Kaldi 有完整的训练pipeline

## 🚀 训练流程（使用 Kaldi）

### 前提条件

1. 安装 Kaldi
2. 准备数据：
   ```
   data/train/
     wav.scp
     text
     utt2spk
     spk2utt
   ```

### 训练脚本

```bash
#!/bin/bash
# train_dnn_aligner.sh

# 基于 Kaldi 训练 DNN-HMM 对齐模型

KALDI_ROOT=/path/to/kaldi
DATA_DIR=data/train
EXP_DIR=exp

cd $KALDI_ROOT/egs/librispeech/s5

# 1. 准备数据
utils/prepare_lang.sh \
  data/local/dict \
  "<UNK>" \
  data/local/lang \
  data/lang

# 2. 提取 MFCC 特征
steps/make_mfcc.sh --nj 4 $DATA_DIR

# 3. 训练 GMM（bootstrap）
echo "训练 GMM..."
steps/train_mono.sh \
  --nj 4 --cmd run.pl \
  $DATA_DIR data/lang $EXP_DIR/mono

# 4. GMM 对齐
steps/align_si.sh \
  --nj 4 --cmd run.pl \
  $DATA_DIR data/lang $EXP_DIR/mono $EXP_DIR/mono_ali

# 5. 训练 triphone GMM
steps/train_deltas.sh \
  --cmd run.pl \
  2500 20000 \
  $DATA_DIR data/lang $EXP_DIR/mono_ali $EXP_DIR/tri1

# 6. 对齐
steps/align_si.sh \
  --nj 4 --cmd run.pl \
  $DATA_DIR data/lang $EXP_DIR/tri1 $EXP_DIR/tri1_ali

# 7. 训练 DNN（关键！）
echo "训练 DNN-HMM..."
steps/nnet3/train_tdnn.sh \
  --stage 0 \
  --cmd run.pl \
  --num-epochs 4 \
  --num-jobs-initial 2 \
  --num-jobs-final 4 \
  --initial-effective-lrate 0.0017 \
  --final-effective-lrate 0.00017 \
  --max-param-change 2.0 \
  --num-hidden-layers 6 \
  --minibatch-size 128 \
  --samples-per-iter 20000 \
  $DATA_DIR data/lang $EXP_DIR/tri1_ali $EXP_DIR/nnet3_aligner

# 8. 使用 DNN 对齐
echo "使用 DNN 对齐..."
steps/nnet3/align.sh \
  --nj 4 --cmd run.pl \
  $DATA_DIR data/lang $EXP_DIR/nnet3_aligner $EXP_DIR/nnet3_ali

echo "✅ DNN-HMM 对齐器训练完成！"
echo "模型路径: $EXP_DIR/nnet3_aligner/final.mdl"
```

### 使用对齐结果

```bash
# 导出对齐结果为文本
ali-to-phones --write-lengths \
  $EXP_DIR/nnet3_aligner/final.mdl \
  ark:$EXP_DIR/nnet3_ali/ali.1.gz \
  ark,t:ali_phones.txt
```

## 💡 当前方案

### 暂时使用 MFA (GMM-HMM)

**理由**：

1. MFA 已经很稳定
2. 精度差距不大（±20ms vs ±15ms）
3. 节省时间

**以后优化**：

- 等评分 DNN 训练好后
- 再考虑训练 DNN 对齐器

## 📝 总结

**模型 1（DNN对齐器）**：

- ✅ 方案已提供
- ⚠️ 需要 Kaldi expertise
- ⭐ 优先级：次要

**模型 2（评分DNN）**：

- ✅ PyTorch 脚本已写好
- ✅ 数据集现成（SpeechOcean762）
- ⭐⭐⭐ 优先级：最高

**建议**：先训练模型2，验证可行性！

