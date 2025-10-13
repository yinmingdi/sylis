"""
PyTorch 音素评分器 - 使用训练好的 PyTorch DNN 模型

✅ 完全按照您的方案实现：
1. 使用 MFA 进行音素对齐（不训练）
2. 使用 PyTorch DNN 模型进行评分（已训练）
3. 输入: MFCC 40维
4. 输出: 41 个音素概率
5. 损失: 交叉熵（非 CTC）
6. 评分: GOP (Goodness of Pronunciation)

核心原理：
- 交叉熵训练 → 保留完整音素概率分布
- GOP = log(P(正确音素) / P(混淆音素))
- 可以比较 IH vs IY 等相似音素
"""

import numpy as np
import logging
import os
import json
from typing import List, Dict, Optional
from dataclasses import dataclass
from pathlib import Path

import torch
import torch.nn as nn

from .mfa_aligner import PhonemeAlignment, AlignmentResult
from .feature_extractor import create_feature_extractor

logger = logging.getLogger(__name__)


# ARPAbet 音素集（与训练时一致）
ARPABET_PHONEMES = [
    # 元音
    'AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'EH', 'ER', 'EY', 'IH', 'IY', 'OW', 'OY', 'UH', 'UW',
    # 辅音
    'B', 'CH', 'D', 'DH', 'F', 'G', 'HH', 'JH', 'K', 'L', 'M', 'N', 'NG', 'P', 'R', 'S',
    'SH', 'T', 'TH', 'V', 'W', 'Y', 'Z', 'ZH',
    # 特殊
    'SIL', 'SP'
]

# 常见音素混淆对（儿童英语学习中的典型错误）
CONFUSION_PAIRS = {
    'IH': ['IY', 'EH'],
    'IY': ['IH', 'EY'],
    'EH': ['AE', 'IH'],
    'AE': ['EH', 'AH'],
    'TH': ['S', 'F'],
    'DH': ['Z', 'V'],
    'V': ['W', 'F'],
    'W': ['V', 'UW'],
    'L': ['R', 'N'],
    'R': ['L', 'W'],
    'S': ['TH', 'Z'],
    'Z': ['S', 'DH'],
}


@dataclass
class PhonemeScore:
    """音素评分结果"""
    phoneme: str
    score: float
    confidence: float
    gop_score: float
    target_prob: float
    confusion_prob: float
    duration_score: float
    start_time: float
    end_time: float
    word: str
    error_type: str = "None"  # None/Mispronunciation/Omission
    nbest_phonemes: Optional[List[Dict[str, float]]] = None  # Top-5 候选


class PhonemeDNN(nn.Module):
    """改进的音素识别 DNN（与训练时完全一致）"""

    def __init__(self, input_dim=40, context_frames=5, hidden_dims=[1024, 512, 256], num_phones=41):
        super().__init__()

        self.context_frames = context_frames
        self.input_dim = input_dim * (2 * context_frames + 1)

        layers = []
        prev_dim = self.input_dim

        for hidden_dim in hidden_dims:
            layers.append(nn.Linear(prev_dim, hidden_dim))
            layers.append(nn.ReLU())
            layers.append(nn.BatchNorm1d(hidden_dim))
            layers.append(nn.Dropout(0.4))
            prev_dim = hidden_dim

        layers.append(nn.Linear(prev_dim, num_phones))
        self.net = nn.Sequential(*layers)

    def splice_frames(self, x):
        """帧拼接"""
        batch, time, feat = x.shape
        context = self.context_frames

        x_padded = torch.nn.functional.pad(x, (0, 0, context, context), mode='replicate')

        spliced_frames = []
        for t in range(time):
            frame_window = x_padded[:, t:t+2*context+1, :]
            frame_window = frame_window.reshape(batch, -1)
            spliced_frames.append(frame_window)

        spliced = torch.stack(spliced_frames, dim=1)
        return spliced

    def forward(self, x):
        if x.dim() == 3:
            x = self.splice_frames(x)
            batch, time, feat = x.shape
            x = x.reshape(batch * time, feat)
            out = self.net(x)
            out = out.reshape(batch, time, -1)
        else:
            out = self.net(x)
        return out


class PyTorchPhonemeScorer:
    """基于 PyTorch DNN 的音素评分器"""

    def __init__(self, model_path: Optional[str] = None, device: str = 'cpu'):
        self.model_path = model_path or 'models/pytorch_phoneme_dnn/final_model.pth'
        self.device = torch.device(device)

        self.model: Optional[PhonemeDNN] = None
        self.feature_extractor = None
        self._initialized = False

        self.phoneme_to_idx = {p: i for i, p in enumerate(ARPABET_PHONEMES)}
        self.idx_to_phoneme = {i: p for p, i in self.phoneme_to_idx.items()}

        logger.info(f"创建 PyTorch 音素评分器: 模型={self.model_path}")

    def initialize(self) -> bool:
        if self._initialized:
            return True

        try:
            logger.info("初始化 PyTorch 评分器...")

            if not os.path.exists(self.model_path):
                raise FileNotFoundError(
                    f"模型文件不存在: {self.model_path}\n"
                    f"请先训练模型: python train_phoneme_dnn.py"
                )

            checkpoint = torch.load(self.model_path, map_location=self.device)

            config = checkpoint.get('config', {
                'input_dim': 40,
                'hidden_dims': [512, 256, 128],
                'num_phones': 41
            })

            self.model = PhonemeDNN(
                input_dim=config['input_dim'],
                hidden_dims=config['hidden_dims'],
                num_phones=config['num_phones']
            )

            self.model.load_state_dict(checkpoint['model_state_dict'])
            self.model.to(self.device)
            self.model.eval()

            logger.info(f"  ✅ 模型加载成功")

            self.feature_extractor = create_feature_extractor(
                feature_type="mfcc",
                num_ceps=40
            )

            self._initialized = True
            logger.info("✅ PyTorch 评分器初始化成功")
            return True

        except Exception as e:
            logger.error(f"❌ PyTorch 评分器初始化失败: {e}")
            import traceback
            traceback.print_exc()
            return False

    def score_phonemes(
        self,
        audio_path: str,
        sample_rate: int,
        alignment: AlignmentResult
    ) -> List[PhonemeScore]:
        if not self._initialized:
            if not self.initialize():
                return []

        try:
            # 提取特征
            features = self.feature_extractor.extract_features(audio_path, sample_rate)

            # 计算音素概率
            phoneme_probs = self._compute_phoneme_probabilities(features.features)

            # 评分每个音素
            scores = []
            for phoneme_align in alignment.phonemes:
                score = self._score_single_phoneme(
                    phoneme_align,
                    phoneme_probs,
                    features.frame_shift
                )
                scores.append(score)

            logger.info(f"✅ 完成 {len(scores)} 个音素的评分")
            return scores

        except Exception as e:
            logger.error(f"音素评分失败: {e}")
            import traceback
            traceback.print_exc()
            return []

    def _compute_phoneme_probabilities(self, features: np.ndarray) -> np.ndarray:
        """使用 PyTorch DNN 计算音素概率分布"""
        with torch.no_grad():
            # 转换为 tensor（避免 NumPy 版本冲突）
            feat_tensor = torch.tensor(features, dtype=torch.float32).unsqueeze(0)
            feat_tensor = feat_tensor.to(self.device)

            # 前向传播
            logits = self.model(feat_tensor)
            probs = torch.softmax(logits, dim=-1)

            # 转回 numpy（通过列表中转避免版本冲突）
            probs_list = probs.squeeze(0).tolist()
            probs_np = np.array(probs_list, dtype=np.float32)

        return probs_np

    def _score_single_phoneme(
        self,
        phoneme_align: PhonemeAlignment,
        phoneme_probs: np.ndarray,
        frame_shift: float
    ) -> PhonemeScore:
        start_frame = int(phoneme_align.start_time / frame_shift)
        end_frame = int(phoneme_align.end_time / frame_shift)
        start_frame = max(0, min(start_frame, phoneme_probs.shape[0] - 1))
        end_frame = max(start_frame + 1, min(end_frame, phoneme_probs.shape[0]))

        segment_probs = phoneme_probs[start_frame:end_frame, :]

        target_phoneme = self._normalize_phoneme(phoneme_align.phoneme)
        target_idx = self.phoneme_to_idx.get(target_phoneme)

        if target_idx is None:
            logger.warning(f"未知音素: {phoneme_align.phoneme}")
            return self._create_default_score(phoneme_align)

        target_prob = np.mean(segment_probs[:, target_idx])
        avg_probs = np.mean(segment_probs, axis=0)

        # ✅ 改进的 GOP 计算：使用所有其他音素的最大概率
        # 方法1：如果有定义混淆对，优先使用混淆对中的最大概率
        # 方法2：如果没有混淆对，或混淆对概率太低，使用所有其他音素的最大概率

        confusion_phonemes = CONFUSION_PAIRS.get(target_phoneme, [])
        confusion_probs = []

        # 收集预定义的混淆音素概率
        for conf_phoneme in confusion_phonemes:
            conf_idx = self.phoneme_to_idx.get(conf_phoneme)
            if conf_idx is not None:
                conf_prob = np.mean(segment_probs[:, conf_idx])
                confusion_probs.append(conf_prob)

        # 计算所有其他音素（除目标音素外）的最大概率
        all_other_probs = []
        for idx in range(len(avg_probs)):
            if idx != target_idx:
                all_other_probs.append(avg_probs[idx])

        max_other_prob = max(all_other_probs) if all_other_probs else 0.01

        # 选择混淆概率：优先使用混淆对，但不能低于最大其他音素概率
        if confusion_probs:
            max_confusion_prob = max(max(confusion_probs), max_other_prob)
        else:
            max_confusion_prob = max_other_prob

        target_prob = max(target_prob, 1e-10)
        max_confusion_prob = max(max_confusion_prob, 1e-10)
        gop_score = np.log(target_prob / max_confusion_prob)

        duration_score = self._calculate_duration_score(
            phoneme_align.duration,
            target_phoneme
        )

        # ✅ 改进的评分算法
        # 考虑到模型准确率只有28%，使用更合理的评分映射

        # 1. 计算置信度（0-1范围）
        confidence = target_prob / (target_prob + max_confusion_prob)

        # 2. 基于多个因素的综合评分
        # - 目标概率本身（归一化到0-1）
        prob_score = min(target_prob * 2.5, 1.0)  # 0.4的概率映射到满分

        # - GOP得分（使用sigmoid平滑映射）
        # GOP范围通常在[-3, 3]，使用sigmoid映射到[0, 1]
        gop_normalized = 1 / (1 + np.exp(-gop_score))  # sigmoid

        # - 置信度得分
        conf_score = confidence

        # 3. 加权组合（可调整权重）
        # 目标概率40%，GOP 40%，置信度20%
        combined_score = (
            prob_score * 0.4 +
            gop_normalized * 0.4 +
            conf_score * 0.2
        )

        # 4. 映射到0-100范围，考虑时长
        base_score = combined_score * 100
        raw_score = base_score + duration_score
        normalized_score = np.clip(raw_score, 0, 100)

        # 5. 计算 ErrorType（基于分数）
        if normalized_score >= 70:
            error_type = "None"
        elif normalized_score >= 40:
            error_type = "Mispronunciation"
        else:
            error_type = "Mispronunciation"  # 严重错误

        # 6. 计算 NBest 音素（Top-5）
        top5_indices = np.argsort(avg_probs)[-5:][::-1]
        nbest_phonemes = []
        for idx in top5_indices:
            phoneme_name = self.idx_to_phoneme[idx]
            phoneme_prob = float(avg_probs[idx])
            # 转换为 0-100 分数（与评分算法一致）
            phoneme_score = min(phoneme_prob * 250, 100.0)  # 0.4 概率 → 100 分

            nbest_phonemes.append({
                "phoneme": phoneme_name,
                "score": round(phoneme_score, 1)
            })

        return PhonemeScore(
            phoneme=phoneme_align.phoneme,
            score=normalized_score,
            confidence=confidence,
            gop_score=gop_score,
            target_prob=float(target_prob),
            confusion_prob=float(max_confusion_prob),
            duration_score=duration_score,
            start_time=phoneme_align.start_time,
            end_time=phoneme_align.end_time,
            word=phoneme_align.word,
            error_type=error_type,
            nbest_phonemes=nbest_phonemes
        )

    def _calculate_duration_score(self, duration: float, phoneme: str) -> float:
        duration_ranges = {
            'vowels': (0.05, 0.3),
            'fricatives': (0.08, 0.25),
            'stops': (0.05, 0.15),
            'nasals': (0.05, 0.2),
            'liquids': (0.05, 0.2),
            'glides': (0.04, 0.15),
        }

        vowels = ['AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'EH', 'ER', 'EY', 'IH', 'IY', 'OW', 'OY', 'UH', 'UW']
        fricatives = ['S', 'Z', 'F', 'V', 'TH', 'DH', 'SH', 'ZH', 'HH']
        stops = ['P', 'B', 'T', 'D', 'K', 'G']
        nasals = ['M', 'N', 'NG']
        liquids = ['L', 'R']
        glides = ['W', 'Y']

        if phoneme in vowels:
            min_dur, max_dur = duration_ranges['vowels']
        elif phoneme in fricatives:
            min_dur, max_dur = duration_ranges['fricatives']
        elif phoneme in stops:
            min_dur, max_dur = duration_ranges['stops']
        elif phoneme in nasals:
            min_dur, max_dur = duration_ranges['nasals']
        elif phoneme in liquids:
            min_dur, max_dur = duration_ranges['liquids']
        elif phoneme in glides:
            min_dur, max_dur = duration_ranges['glides']
        else:
            return 0.0

        if duration < min_dur:
            penalty = (min_dur - duration) / min_dur * -5
        elif duration > max_dur:
            penalty = (duration - max_dur) / max_dur * -3
        else:
            penalty = 0.0

        return penalty

    def _normalize_score(self, raw_score: float) -> float:
        k = 0.1
        offset = 70
        score = 100 / (1 + np.exp(-k * (raw_score - offset)))
        return np.clip(score, 0, 100)

    def _normalize_phoneme(self, phoneme: str) -> str:
        phoneme = phoneme.rstrip('012')
        return phoneme.upper()

    def _create_default_score(self, phoneme_align: PhonemeAlignment) -> PhonemeScore:
        return PhonemeScore(
            phoneme=phoneme_align.phoneme,
            score=50.0,
            confidence=0.5,
            gop_score=0.0,
            target_prob=0.5,
            confusion_prob=0.5,
            duration_score=0.0,
            start_time=phoneme_align.start_time,
            end_time=phoneme_align.end_time,
            word=phoneme_align.word
        )


def create_pytorch_phoneme_scorer(
    model_path: Optional[str] = None,
    device: str = 'cpu'
) -> PyTorchPhonemeScorer:
    return PyTorchPhonemeScorer(model_path=model_path, device=device)

