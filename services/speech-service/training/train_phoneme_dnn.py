#!/usr/bin/env python3
"""
训练音素 DNN 模型 - 完全符合文章方案

使用 SpeechOcean762 数据集训练一个简单的 DNN：
1. 输入: MFCC 40维特征
2. 输出: 41 个音素概率
3. 损失: 加权交叉熵（非 CTC）⭐
4. 用于 GOP 评分

完整方案（结合两者优势）：
- MFA 对齐 → 提供精确的音素时间边界
- SpeechOcean762 评分 → 提供专家评分作为样本权重
- 加权损失 → 发音好的音素权重高，提升训练质量

这个才是文章描述的完整方案！
"""

import os
import sys
from pathlib import Path

# 设置环境变量，抑制 NumPy 警告（在导入其他库之前）
os.environ['PYTHONWARNINGS'] = 'ignore'

import warnings
warnings.filterwarnings('ignore')

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
from datasets import load_dataset
import librosa
from tqdm import tqdm
import json
import ssl
import urllib3

# 禁用 SSL 验证和警告
ssl._create_default_https_context = ssl._create_unverified_context
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# 设置环境变量
os.environ['CURL_CA_BUNDLE'] = ''
os.environ['REQUESTS_CA_BUNDLE'] = ''
os.environ['HF_DATASETS_OFFLINE'] = '0'

# 添加 app 到路径
sys.path.insert(0, str(Path(__file__).parent.parent / "app"))
from app.feature_extractor import create_feature_extractor

# 导入对齐函数（同目录）
from batch_align_dataset import batch_align_dataset


# 标准 ARPAbet 音素集（41个）
ARPABET_PHONEMES = [
    # 元音
    'AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'EH', 'ER', 'EY', 'IH', 'IY', 'OW', 'OY', 'UH', 'UW',
    # 辅音
    'B', 'CH', 'D', 'DH', 'F', 'G', 'HH', 'JH', 'K', 'L', 'M', 'N', 'NG', 'P', 'R', 'S',
    'SH', 'T', 'TH', 'V', 'W', 'Y', 'Z', 'ZH',
    # 特殊
    'SIL', 'SP'
]

PHONE_TO_IDX = {p: i for i, p in enumerate(ARPABET_PHONEMES)}


class PhonemeDNN(nn.Module):
    """
    改进的音素分类 DNN 模型

    关键改进：
    1. ✅ 使用上下文窗口（帧拼接）- 捕获时序信息
    2. ✅ 增加模型容量 - 更强的表达能力
    3. ✅ 保持交叉熵输出（非CTC）

    输入: MFCC 40维 × (2*context+1) 帧
    输出: 41 个音素概率
    """

    def __init__(self, input_dim=40, context_frames=5, hidden_dims=[1024, 512, 256], num_phones=41):
        super().__init__()

        self.context_frames = context_frames
        # 拼接前后context_frames帧，总共 (2*context+1) 帧
        self.input_dim = input_dim * (2 * context_frames + 1)

        layers = []
        prev_dim = self.input_dim

        for hidden_dim in hidden_dims:
            layers.append(nn.Linear(prev_dim, hidden_dim))
            layers.append(nn.ReLU())
            layers.append(nn.BatchNorm1d(hidden_dim))
            layers.append(nn.Dropout(0.4))  # 增加dropout
            prev_dim = hidden_dim

        # 输出层：41 个音素
        layers.append(nn.Linear(prev_dim, num_phones))

        self.net = nn.Sequential(*layers)

    def splice_frames(self, x):
        """
        帧拼接：将前后context_frames帧拼接到当前帧

        Args:
            x: [batch, time, features]

        Returns:
            spliced: [batch, time, features * (2*context+1)]
        """
        batch, time, feat = x.shape
        context = self.context_frames

        # Pad前后各context帧
        # 使用edge padding（重复边界值）
        x_padded = torch.nn.functional.pad(x, (0, 0, context, context), mode='replicate')

        # 拼接前后帧
        spliced_frames = []
        for t in range(time):
            # 提取 [t, t+2*context+1) 的帧
            frame_window = x_padded[:, t:t+2*context+1, :]  # [batch, 2*context+1, feat]
            frame_window = frame_window.reshape(batch, -1)  # [batch, (2*context+1)*feat]
            spliced_frames.append(frame_window)

        spliced = torch.stack(spliced_frames, dim=1)  # [batch, time, (2*context+1)*feat]
        return spliced

    def forward(self, x):
        """
        前向传播 + 帧拼接

        Args:
            x: [batch, time, features] 或 [batch, features]

        Returns:
            logits: [batch, time, num_phones] 或 [batch, num_phones]
        """
        if x.dim() == 3:
            # 1. 帧拼接
            x = self.splice_frames(x)  # [batch, time, (2*context+1)*features]

            # 2. DNN处理
            batch, time, feat = x.shape
            x = x.reshape(batch * time, feat)  # [batch*time, (2*context+1)*features]
            out = self.net(x)  # [batch*time, num_phones]
            out = out.reshape(batch, time, -1)  # [batch, time, num_phones]
        else:
            out = self.net(x)

        return out


class SpeechOcean762Dataset(Dataset):
    """
    SpeechOcean762 数据集

    提取 MFCC 特征和音素标签
    支持使用 MFA 对齐数据（推荐！）
    """

    def __init__(self, split='train', max_samples=None, alignment_file=None):
        """
        初始化数据集

        Args:
            split: 'train' 或 'test'
            max_samples: 最大样本数（用于快速测试）
            alignment_file: MFA 对齐结果文件路径 (JSON)，None=使用平均分配
        """
        print(f"📦 加载 SpeechOcean762 数据集 ({split})...")
        self.dataset = load_dataset("mispeech/speechocean762", split=split)

        if max_samples:
            self.dataset = self.dataset.select(range(min(max_samples, len(self.dataset))))

        self.feature_extractor = create_feature_extractor(feature_type="mfcc", num_ceps=40)

        # 加载对齐数据
        self.alignments = None
        if alignment_file and os.path.exists(alignment_file):
            print(f"📍 加载 MFA 对齐数据: {alignment_file}")
            with open(alignment_file, 'r', encoding='utf-8') as f:
                alignment_list = json.load(f)
                # 转换为字典，以 index 为键
                self.alignments = {a['index']: a for a in alignment_list}
            print(f"✅ 加载了 {len(self.alignments)} 个对齐结果")

        print(f"✅ 数据集加载完成: {len(self.dataset)} 个样本")
        print(f"   对齐方式: {'✅ MFA 精确对齐' if self.alignments else '⚠️ 平均分配帧'}")

    def __len__(self):
        return len(self.dataset)

    def __getitem__(self, idx):
        """
        获取一个样本

        Returns:
            features: [time, 40] MFCC 特征
            labels: [time] 音素标签
        """
        item = self.dataset[idx]

        # 1. 提取音频特征
        audio = item['audio']['array']
        sr = item['audio']['sampling_rate']

        # 转换为临时文件（librosa 需要）
        import tempfile
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
            import soundfile as sf
            sf.write(f.name, audio, sr)
            temp_path = f.name

        # 提取 MFCC
        features = self.feature_extractor.extract_features(temp_path, sr)
        os.unlink(temp_path)

        # 2. 获取音素标签（使用 MFA 对齐或平均分配）
        num_frames = features.features.shape[0]
        frame_shift = features.frame_shift  # 帧移（秒）

        if self.alignments and idx in self.alignments:
            # 使用 MFA 对齐 + SpeechOcean762 评分 ⭐⭐⭐
            frame_labels, frame_scores = self._create_labels_from_alignment(
                self.alignments[idx],
                num_frames,
                frame_shift,
                item  # 传入原始数据，获取评分
            )
        else:
            # 使用平均分配（fallback）
            frame_labels, frame_scores = self._create_labels_average(item, num_frames)

        return {
            'features': torch.FloatTensor(features.features),  # [time, 40]
            'labels': torch.LongTensor(frame_labels),          # [time] 音素标签
            'scores': torch.FloatTensor(frame_scores),         # [time] 专家评分
            'text': item['text']
        }

    def _create_labels_from_alignment(self, alignment, num_frames, frame_shift, item=None):
        """
        使用 MFA 对齐结果 + SpeechOcean762 评分创建帧标签

        MFA 对齐 → 时间边界（精确）
        SpeechOcean762 → 评分数据（专家标注）
        """
        frame_labels = [PHONE_TO_IDX['SIL']] * num_frames
        frame_scores = [0.0] * num_frames  # 存储每帧的评分

        # 获取 SpeechOcean762 的音素评分
        phone_scores = {}
        if item and 'words' in item:
            phone_idx_global = 0
            for word in item['words']:
                phones = word.get('phones', [])
                phones_acc = word.get('phones-accuracy', [])

                for phone, score in zip(phones, phones_acc):
                    base_phone = phone.rstrip('012').upper()
                    phone_scores[phone_idx_global] = score
                    phone_idx_global += 1

        # 使用 MFA 对齐的时间边界 + SpeechOcean762 评分
        for phone_idx, phoneme in enumerate(alignment['phonemes']):
            # 计算帧范围（MFA 提供）
            start_frame = int(phoneme['start_time'] / frame_shift)
            end_frame = int(phoneme['end_time'] / frame_shift)
            start_frame = max(0, min(start_frame, num_frames - 1))
            end_frame = max(start_frame + 1, min(end_frame, num_frames))

            # 获取音素索引
            base_phone = phoneme['phoneme'].rstrip('012').upper()
            phone_idx_in_vocab = PHONE_TO_IDX.get(base_phone, PHONE_TO_IDX['SIL'])

            # 获取该音素的评分（SpeechOcean762 提供）
            score = phone_scores.get(phone_idx, 2.0)  # 默认 2.0

            # 标注帧
            for frame_idx in range(start_frame, end_frame):
                frame_labels[frame_idx] = phone_idx_in_vocab
                frame_scores[frame_idx] = score

        return frame_labels, frame_scores

    def _create_labels_average(self, item, num_frames):
        """使用平均分配创建帧标签（不精确）+ 评分"""
        phone_labels = []
        phone_scores = []

        for word in item['words']:
            phones = word['phones']
            phones_acc = word.get('phones-accuracy', [])

            for i, phone in enumerate(phones):
                base_phone = phone.rstrip('012')
                if base_phone in PHONE_TO_IDX:
                    phone_labels.append(PHONE_TO_IDX[base_phone])
                else:
                    phone_labels.append(PHONE_TO_IDX['SIL'])

                # 获取评分
                score = phones_acc[i] if i < len(phones_acc) else 2.0
                phone_scores.append(score)

        if len(phone_labels) == 0:
            phone_labels = [PHONE_TO_IDX['SIL']]
            phone_scores = [2.0]

        num_phones = len(phone_labels)
        frames_per_phone = num_frames / num_phones
        frame_labels = []
        frame_scores = []

        for i, (phone_idx, score) in enumerate(zip(phone_labels, phone_scores)):
            start_frame = int(i * frames_per_phone)
            end_frame = int((i + 1) * frames_per_phone)
            num_frames_for_phone = end_frame - start_frame
            frame_labels.extend([phone_idx] * num_frames_for_phone)
            frame_scores.extend([score] * num_frames_for_phone)

        if len(frame_labels) < num_frames:
            frame_labels.extend([frame_labels[-1]] * (num_frames - len(frame_labels)))
            frame_scores.extend([frame_scores[-1]] * (num_frames - len(frame_scores)))
        frame_labels = frame_labels[:num_frames]
        frame_scores = frame_scores[:num_frames]

        return frame_labels, frame_scores


def collate_fn(batch):
    """批处理函数"""
    # 填充到相同长度
    max_len = max([item['features'].shape[0] for item in batch])

    features_list = []
    labels_list = []
    scores_list = []

    for item in batch:
        feat = item['features']
        label = item['labels']
        score = item['scores']

        # 填充
        if feat.shape[0] < max_len:
            pad_len = max_len - feat.shape[0]
            feat = torch.cat([feat, torch.zeros(pad_len, 40)], dim=0)
            label = torch.cat([label, torch.full((pad_len,), PHONE_TO_IDX['SIL'])], dim=0)
            score = torch.cat([score, torch.zeros(pad_len)], dim=0)

        features_list.append(feat)
        labels_list.append(label)
        scores_list.append(score)

    return {
        'features': torch.stack(features_list),  # [batch, time, 40]
        'labels': torch.stack(labels_list),      # [batch, time]
        'scores': torch.stack(scores_list)       # [batch, time] SpeechOcean762 评分
    }


def train_model(
    model,
    train_loader,
    val_loader,
    num_epochs=10,
    device='cpu',
    patience=5,
    min_delta=0.001
):
    """
    训练模型 + 早停策略

    使用交叉熵损失函数 + 早停防止过拟合
    """
    print("\n" + "=" * 60)
    print("🚀 开始训练音素 DNN 模型")
    print("=" * 60)
    print(f"设备: {device}")
    print(f"训练样本: {len(train_loader.dataset)}")
    print(f"验证样本: {len(val_loader.dataset) if val_loader else 0}")
    print(f"训练轮数: {num_epochs}")
    print()

    model = model.to(device)

    # 交叉熵损失函数 ⭐
    criterion = nn.CrossEntropyLoss(ignore_index=PHONE_TO_IDX['SIL'])

    # 优化器和学习率调度器
    optimizer = optim.Adam(model.parameters(), lr=0.001)
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode='min', patience=3, factor=0.5, verbose=True)

    # 早停变量
    best_val_loss = float('inf')
    best_val_acc = 0.0
    epochs_no_improve = 0

    # 难音素跟踪
    difficult_phonemes = ['L', 'R', 'OW', 'AW', 'TH', 'DH', 'V', 'W']
    difficult_phoneme_indices = [PHONE_TO_IDX[p] for p in difficult_phonemes if p in PHONE_TO_IDX]

    for epoch in range(num_epochs):
        print(f"\n📊 Epoch {epoch+1}/{num_epochs}")
        print("-" * 60)

        # 训练阶段
        model.train()
        train_loss = 0
        train_correct = 0
        train_total = 0

        pbar = tqdm(train_loader, desc=f"训练 Epoch {epoch+1}/{num_epochs}",
                    ncols=100, ascii=True)
        for batch_idx, batch in enumerate(pbar):
            features = batch['features'].to(device)  # [batch, time, 40]
            labels = batch['labels'].to(device)      # [batch, time]
            scores = batch['scores'].to(device)      # [batch, time] SpeechOcean762 评分

            # 前向传播
            optimizer.zero_grad()
            outputs = model(features)  # [batch, time, 41]

            # 计算损失
            # Reshape: [batch*time, 41] 和 [batch*time]
            outputs_flat = outputs.reshape(-1, outputs.shape[-1])
            labels_flat = labels.reshape(-1)
            scores_flat = scores.reshape(-1)

            # 使用 SpeechOcean762 评分作为样本权重 ⭐
            # 评分越高的音素，权重越高
            sample_weights = scores_flat / 2.0  # 归一化到 0-1
            sample_weights = sample_weights * (labels_flat != PHONE_TO_IDX['SIL']).float()  # 忽略静音

            # 加权交叉熵损失
            loss_per_sample = nn.functional.cross_entropy(
                outputs_flat, labels_flat, reduction='none'
            )
            loss = (loss_per_sample * sample_weights).sum() / (sample_weights.sum() + 1e-8)

            # 反向传播
            loss.backward()
            optimizer.step()

            # 统计
            train_loss += loss.item()

            _, predicted = outputs_flat.max(1)
            mask = labels_flat != PHONE_TO_IDX['SIL']
            train_correct += (predicted[mask] == labels_flat[mask]).sum().item()
            train_total += mask.sum().item()

            current_acc = 100 * train_correct / max(train_total, 1)
            pbar.set_postfix({
                'loss': f'{loss.item():.4f}',
                'acc': f'{current_acc:.1f}%',
                'batch': f'{batch_idx+1}/{len(train_loader)}'
            })

        avg_train_loss = train_loss / len(train_loader)
        train_acc = 100 * train_correct / max(train_total, 1)

        print(f"   训练损失: {avg_train_loss:.4f}")
        print(f"   训练准确率: {train_acc:.2f}%")

        # 验证阶段
        if val_loader:
            model.eval()
            val_loss = 0
            val_correct = 0
            val_total = 0

            # 难音素统计
            difficult_correct = {p: 0 for p in difficult_phonemes}
            difficult_total = {p: 0 for p in difficult_phonemes}

            with torch.no_grad():
                for batch in tqdm(val_loader, desc=f"验证 Epoch {epoch+1}", ncols=100, ascii=True):
                    features = batch['features'].to(device)
                    labels = batch['labels'].to(device)
                    scores = batch['scores'].to(device)

                    outputs = model(features)

                    outputs_flat = outputs.reshape(-1, outputs.shape[-1])
                    labels_flat = labels.reshape(-1)
                    scores_flat = scores.reshape(-1)

                    # 验证时也使用加权损失
                    sample_weights = scores_flat / 2.0
                    sample_weights = sample_weights * (labels_flat != PHONE_TO_IDX['SIL']).float()

                    loss_per_sample = nn.functional.cross_entropy(
                        outputs_flat, labels_flat, reduction='none'
                    )
                    loss = (loss_per_sample * sample_weights).sum() / (sample_weights.sum() + 1e-8)
                    val_loss += loss.item()

                    _, predicted = outputs_flat.max(1)
                    mask = labels_flat != PHONE_TO_IDX['SIL']
                    val_correct += (predicted[mask] == labels_flat[mask]).sum().item()
                    val_total += mask.sum().item()

                    # 统计难音素准确率
                    for idx, phoneme in zip(difficult_phoneme_indices, difficult_phonemes):
                        phone_mask = (labels_flat == idx)
                        if phone_mask.sum() > 0:
                            difficult_correct[phoneme] += (predicted[phone_mask] == labels_flat[phone_mask]).sum().item()
                            difficult_total[phoneme] += phone_mask.sum().item()

            avg_val_loss = val_loss / len(val_loader)
            val_acc = 100 * val_correct / max(val_total, 1)

            print(f"   验证损失: {avg_val_loss:.4f}")
            print(f"   验证准确率: {val_acc:.2f}%")

            # 显示难音素准确率 ⭐
            print(f"\n   难音素准确率:")
            for phoneme in difficult_phonemes:
                if difficult_total[phoneme] > 0:
                    acc = 100 * difficult_correct[phoneme] / difficult_total[phoneme]
                    print(f"      {phoneme:3s}: {acc:5.1f}% ({difficult_correct[phoneme]}/{difficult_total[phoneme]})")
                else:
                    print(f"      {phoneme:3s}: N/A (未出现)")

            # 学习率调整
            scheduler.step(avg_val_loss)

            # 保存最佳模型 + 早停检查
            if avg_val_loss < best_val_loss - min_delta:
                best_val_loss = avg_val_loss
                best_val_acc = val_acc
                epochs_no_improve = 0

                model_dir = Path(__file__).parent.parent / 'models'
                model_dir.mkdir(exist_ok=True)
                torch.save({
                    'epoch': epoch,
                    'model_state_dict': model.state_dict(),
                    'optimizer_state_dict': optimizer.state_dict(),
                    'val_loss': avg_val_loss,
                    'val_acc': val_acc,
                }, str(model_dir / 'best_phoneme_dnn.pth'))
                print(f"   ✅ 保存最佳模型 (验证损失: {avg_val_loss:.4f}, 准确率: {val_acc:.2f}%)")
            else:
                epochs_no_improve += 1
                print(f"   ⚠️  验证损失未改善 ({epochs_no_improve}/{patience})")

                # 早停判断
                if epochs_no_improve >= patience:
                    print(f"\n⛔ 早停：验证损失已{patience}轮未改善，停止训练")
                    break

    print("\n" + "=" * 60)
    print("✅ 训练完成！")
    print(f"最佳验证损失: {best_val_loss:.4f}")
    print(f"最佳验证准确率: {best_val_acc:.2f}%")
    print("=" * 60)

    return model


def check_and_align_data(split, num_samples, alignment_file, output_dir='aligned_data'):
    """
    检查对齐数据，如果不足则自动对齐

    Args:
        split: 'train' 或 'test'
        num_samples: 需要的样本数量（None 表示全部数据）
        alignment_file: 对齐文件路径
        output_dir: 对齐数据输出目录

    Returns:
        bool: 是否有足够的对齐数据
    """
    # 如果 num_samples 为 None，获取数据集的实际大小
    if num_samples is None:
        print(f"📊 正在加载数据集以获取实际样本数...")
        from datasets import load_dataset
        dataset = load_dataset('mispeech/speechocean762', split=split, trust_remote_code=True)
        num_samples = len(dataset)
        print(f"✅ 数据集共有 {num_samples} 个样本")

    # 检查对齐文件是否存在
    if not os.path.exists(alignment_file):
        print(f"\n⚠️ 未找到对齐数据: {alignment_file}")
        print(f"🚀 开始对齐 {num_samples} 个样本...")
        print()

        # 自动对齐
        success = batch_align_dataset(
            split=split,
            max_samples=num_samples,
            output_dir=output_dir
        )

        if not success:
            print("❌ 自动对齐失败")
            return False

        print()
        return True

    # 检查对齐数据数量是否足够
    with open(alignment_file, 'r') as f:
        aligned_data = json.load(f)

    num_aligned = len(aligned_data)

    if num_aligned < num_samples:
        print(f"\n⚠️ 对齐数据不足: 需要 {num_samples} 个，现有 {num_aligned} 个")
        print(f"🚀 开始对齐额外的 {num_samples - num_aligned} 个样本...")
        print()

        # 对齐更多数据
        success = batch_align_dataset(
            split=split,
            max_samples=num_samples,
            output_dir=output_dir
        )

        if not success:
            print("❌ 自动对齐失败")
            return False

        print()
        return True

    print(f"✅ 找到对齐数据: {num_aligned} 个样本")
    return True


def analyze_phoneme_distribution(alignment_file, split_name):
    """分析音素分布"""
    if not os.path.exists(alignment_file):
        return

    print(f"\n📊 分析 {split_name} 音素分布...")
    with open(alignment_file, 'r') as f:
        data = json.load(f)

    phoneme_counts = {}
    phoneme_durations = {}

    for item in data:
        for ph in item['phonemes']:
            p = ph['phoneme'].rstrip('012').upper()
            phoneme_counts[p] = phoneme_counts.get(p, 0) + 1
            duration = ph['end_time'] - ph['start_time']
            if p not in phoneme_durations:
                phoneme_durations[p] = []
            phoneme_durations[p].append(duration)

    # 统计总数
    total = sum(phoneme_counts.values())

    # 显示 Top 10 最常见音素
    print(f"\n   Top 10 最常见音素:")
    sorted_phonemes = sorted(phoneme_counts.items(), key=lambda x: x[1], reverse=True)[:10]
    for phoneme, count in sorted_phonemes:
        percentage = 100 * count / total
        avg_dur = np.mean(phoneme_durations[phoneme])
        print(f"      {phoneme:3s}: {count:5d} ({percentage:4.1f}%)  平均时长: {avg_dur:.3f}s")

    # 显示难音素统计
    difficult_phonemes = ['L', 'R', 'OW', 'AW', 'TH', 'DH', 'V', 'W']
    print(f"\n   难音素统计:")
    for phoneme in difficult_phonemes:
        if phoneme in phoneme_counts:
            count = phoneme_counts[phoneme]
            percentage = 100 * count / total
            avg_dur = np.mean(phoneme_durations[phoneme])
            print(f"      {phoneme:3s}: {count:5d} ({percentage:4.1f}%)  平均时长: {avg_dur:.3f}s")
        else:
            print(f"      {phoneme:3s}: 未出现")

    print(f"\n   总音素数: {total:,}")
    print(f"   音素种类: {len(phoneme_counts)}")


def main():
    """主函数"""
    print("=" * 60)
    print("🎯 训练音素 DNN 模型")
    print("   数据集: SpeechOcean762")
    print("   损失函数: 加权交叉熵（非 CTC）⭐")
    print("   输出: 41 个音素概率 ⭐")
    print("=" * 60)

    # 配置
    batch_size = 16
    num_epochs = 40  # 训练 20 轮
    max_train_samples = None  # 全部训练数据
    max_val_samples = None    # 全部验证数据

    # 早停配置
    patience = 5  # 5轮不提升就停止
    min_delta = 0.001  # 最小改进阈值

    # MFA 对齐数据文件（相对于项目根目录）
    base_dir = Path(__file__).parent.parent
    train_alignment_file = str(base_dir / 'aligned_data/train_aligned.json')
    test_alignment_file = str(base_dir / 'aligned_data/test_aligned.json')

    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"\n使用设备: {device}")

    # 0. 自动检测并对齐数据 ⭐
    print("\n" + "=" * 60)
    print("📍 步骤 0: 检查 MFA 对齐数据")
    print("=" * 60)

    # 检查训练集对齐数据
    print(f"\n🔍 检查训练集对齐数据...")
    if not check_and_align_data('train', max_train_samples, train_alignment_file):
        print("❌ 训练集对齐失败，使用平均分配")

    # 检查测试集对齐数据
    print(f"\n🔍 检查测试集对齐数据...")
    if not check_and_align_data('test', max_val_samples, test_alignment_file):
        print("❌ 测试集对齐失败，使用平均分配")

    # 0.5. 分析音素分布 ⭐
    print("\n" + "=" * 60)
    print("📊 步骤 0.5: 分析音素分布")
    print("=" * 60)
    analyze_phoneme_distribution(train_alignment_file, "训练集")
    analyze_phoneme_distribution(test_alignment_file, "测试集")

    # 1. 创建数据集
    print("\n" + "=" * 60)
    print("📊 步骤 1: 加载数据集")
    print("=" * 60)
    print()

    train_dataset = SpeechOcean762Dataset(
        split='train',
        max_samples=max_train_samples,
        alignment_file=train_alignment_file if os.path.exists(train_alignment_file) else None
    )
    val_dataset = SpeechOcean762Dataset(
        split='test',
        max_samples=max_val_samples,
        alignment_file=test_alignment_file if os.path.exists(test_alignment_file) else None
    )

    # 使用多线程加速（最大线程数）
    import multiprocessing
    num_workers = max(1, multiprocessing.cpu_count() - 1)  # 使用所有核心-1
    print(f"   使用 {num_workers} 个工作进程（最大线程数）")

    train_loader = DataLoader(
        train_dataset,
        batch_size=batch_size,
        shuffle=True,
        collate_fn=collate_fn,
        num_workers=num_workers,
        persistent_workers=True if num_workers > 0 else False
    )

    val_loader = DataLoader(
        val_dataset,
        batch_size=batch_size,
        shuffle=False,
        collate_fn=collate_fn,
        num_workers=num_workers,
        persistent_workers=True if num_workers > 0 else False
    )

    # 2. 创建模型
    print("\n" + "=" * 60)
    print("🏗️  步骤 2: 创建模型")
    print("=" * 60)

    context_frames = 5
    hidden_dims = [1024, 512, 256]

    model = PhonemeDNN(
        input_dim=40,
        context_frames=context_frames,
        hidden_dims=hidden_dims,
        num_phones=len(ARPABET_PHONEMES)
    )

    num_params = sum(p.numel() for p in model.parameters())
    print(f"\n   模型配置:")
    print(f"      输入维度: 40 (MFCC)")
    print(f"      上下文窗口: ±{context_frames} 帧")
    print(f"      实际输入: {40 * (2*context_frames+1)} (帧拼接)")
    print(f"      隐藏层: {hidden_dims}")
    print(f"      输出维度: {len(ARPABET_PHONEMES)} 音素")
    print(f"      总参数量: {num_params:,}")
    print(f"      模型大小: ~{num_params * 4 / 1024 / 1024:.1f} MB")

    # 3. 训练（使用改进的配置）
    model = train_model(
        model,
        train_loader,
        val_loader,
        num_epochs=num_epochs,
        device=device,
        patience=patience,
        min_delta=min_delta
    )

    # 4. 保存最终模型
    print("\n" + "=" * 60)
    print("💾 步骤 4: 保存模型")
    print("=" * 60)

    base_dir = Path(__file__).parent.parent
    model_dir = base_dir / 'models/pytorch_phoneme_dnn'
    model_dir.mkdir(parents=True, exist_ok=True)

    torch.save({
        'model_state_dict': model.state_dict(),
        'phone_to_idx': PHONE_TO_IDX,
        'phonemes': ARPABET_PHONEMES,
        'config': {
            'input_dim': 40,
            'context_frames': context_frames,
            'hidden_dims': hidden_dims,
            'num_phones': len(ARPABET_PHONEMES)
        }
    }, str(model_dir / 'final_model.pth'))

    # 保存配置
    with open(str(model_dir / 'config.json'), 'w') as f:
        json.dump({
            'phonemes': ARPABET_PHONEMES,
            'input_dim': 40,
            'context_frames': context_frames,
            'hidden_dims': hidden_dims,
            'training_dataset': 'SpeechOcean762',
            'training_samples': len(train_dataset),
            'validation_samples': len(val_dataset),
            'loss_function': 'Weighted CrossEntropy',
            'improvements': '帧拼接+增大容量+早停+学习率调度+加权损失',
            'note': '改进版DNN：使用上下文窗口捕获时序信息，使用SpeechOcean762评分加权训练'
        }, f, indent=2)

    print(f"\n✅ 模型已保存:")
    print(f"   模型文件: models/pytorch_phoneme_dnn/final_model.pth")
    print(f"   配置文件: models/pytorch_phoneme_dnn/config.json")
    print(f"   最佳模型: models/best_phoneme_dnn.pth")

    print("\n" + "=" * 60)
    print("🎉 训练完成！")
    print("=" * 60)
    print("\n📝 测试模型:")
    print("   python test_pytorch_model.py tests/hello.wav 'hello'")


if __name__ == "__main__":
    main()

