"""
特征提取器 - 提取音频特征用于音素识别

支持的特征类型：
- MFCC: 梅尔频率倒谱系数（用于 PyTorch DNN 模型）
- Fbank: 滤波器组特征

这些特征将输入到 PyTorch DNN 模型进行音素识别和评分。
"""

import os
import logging
import numpy as np
import tempfile
import subprocess
from typing import Tuple, Optional
from dataclasses import dataclass

# 使用 librosa 提取特征，不依赖 Kaldi
KALDIIO_AVAILABLE = False  # 不再使用 kaldiio

logger = logging.getLogger(__name__)


@dataclass
class AcousticFeatures:
    """声学特征"""
    features: np.ndarray      # 特征矩阵 [time, feature_dim]
    frame_count: int          # 帧数
    feature_dim: int          # 特征维度
    frame_shift: float        # 帧移（秒）


class KaldiFeatureExtractor:
    """
    特征提取器（使用 librosa）

    提取 MFCC 或 Fbank 特征用于 PyTorch DNN 模型。
    """

    def __init__(
        self,
        feature_type: str = "mfcc",
        num_ceps: int = 40,
        use_energy: bool = True
    ):
        """
        初始化特征提取器

        Args:
            feature_type: 特征类型 (mfcc/fbank)
            num_ceps: MFCC 系数数量
            use_energy: 是否使用能量特征
        """
        self.feature_type = feature_type
        self.num_ceps = num_ceps
        self.use_energy = use_energy

        # 帧移 10ms，帧长 25ms（标准配置）
        self.frame_shift_ms = 10
        self.frame_length_ms = 25

        logger.info(f"创建特征提取器: {feature_type}, 维度={num_ceps}")

    def extract_features(
        self,
        audio_path: str,
        sample_rate: int = 16000
    ) -> AcousticFeatures:
        """
        提取音频特征（使用 librosa）

        Args:
            audio_path: 音频文件路径
            sample_rate: 采样率

        Returns:
            AcousticFeatures: 提取的特征
        """
        import librosa

        # 使用 librosa 提取 MFCC/Fbank
        # 加载音频
        audio, sr = librosa.load(audio_path, sr=sample_rate)

        if self.feature_type == "mfcc":
            # 使用 librosa 提取 MFCC
            mfcc_features = librosa.feature.mfcc(
                y=audio,
                sr=sr,
                n_mfcc=self.num_ceps,
                n_fft=int(self.frame_length_ms * sr / 1000),
                hop_length=int(self.frame_shift_ms * sr / 1000)
            )
            features = mfcc_features.T  # [time, feature]

        elif self.feature_type == "fbank":
            # 使用 librosa 提取 Fbank
            mel_spec = librosa.feature.melspectrogram(
                y=audio,
                sr=sr,
                n_mels=self.num_ceps,
                n_fft=int(self.frame_length_ms * sr / 1000),
                hop_length=int(self.frame_shift_ms * sr / 1000)
            )
            # 转换为 log scale
            features = librosa.power_to_db(mel_spec).T  # [time, feature]
        else:
            raise ValueError(f"Unknown feature type: {self.feature_type}")

        return AcousticFeatures(
            features=features,
            frame_count=features.shape[0],
            feature_dim=features.shape[1],
            frame_shift=self.frame_shift_ms / 1000.0
        )


def create_feature_extractor(
    feature_type: str = "mfcc",
    num_ceps: int = 40
) -> KaldiFeatureExtractor:
    """
    创建特征提取器的工厂函数

    Args:
        feature_type: 特征类型
        num_ceps: 特征维度

    Returns:
        KaldiFeatureExtractor: 特征提取器实例
    """
    return KaldiFeatureExtractor(
        feature_type=feature_type,
        num_ceps=num_ceps
    )

