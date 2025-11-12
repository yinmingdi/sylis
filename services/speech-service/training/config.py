#!/usr/bin/env python3
"""
训练配置模块

集中管理所有训练相关的配置参数
"""

import os
from pathlib import Path
from typing import List, Optional
from dataclasses import dataclass


# ==================== 路径配置 ====================

BASE_DIR = Path(__file__).parent.parent
TRAINING_DIR = BASE_DIR / 'training'
MODELS_DIR = BASE_DIR / 'models'
ALIGNED_DATA_DIR = BASE_DIR / 'aligned_data'
APP_DIR = BASE_DIR / 'app'


# ==================== 数据集配置 ====================

@dataclass
class DatasetConfig:
    """数据集配置"""
    name: str = "mispeech/speechocean762"
    train_split: str = "train"
    test_split: str = "test"

    # 采样配置
    max_train_samples: Optional[int] = None  # None = 全部数据
    max_val_samples: Optional[int] = None

    # 音频特征配置
    feature_type: str = "mfcc"
    num_ceps: int = 40
    sample_rate: int = 16000


# ==================== 模型配置 ====================

@dataclass
class ModelConfig:
    """音素 DNN 模型配置"""
    input_dim: int = 40  # MFCC 维度
    context_frames: int = 5  # 上下文窗口 (±5 帧)
    hidden_dims: List[int] = None  # 隐藏层维度
    num_phones: int = 41  # 音素数量
    dropout: float = 0.4

    def __post_init__(self):
        if self.hidden_dims is None:
            self.hidden_dims = [1024, 512, 256]


# ==================== 训练配置 ====================

@dataclass
class TrainingConfig:
    """训练配置"""
    batch_size: int = 16
    num_epochs: int = 40
    learning_rate: float = 0.001

    # 早停配置
    patience: int = 5  # 多少轮不提升就停止
    min_delta: float = 0.001  # 最小改进阈值

    # 优化器配置
    optimizer: str = "adam"
    weight_decay: float = 0.0

    # 学习率调度器配置
    scheduler: str = "reduce_on_plateau"
    scheduler_patience: int = 3
    scheduler_factor: float = 0.5

    # 多线程配置
    num_workers: Optional[int] = None  # None = auto (cpu_count - 1)


# ==================== 对齐配置 ====================

@dataclass
class AlignmentConfig:
    """对齐配置"""
    acoustic_model: str = "english_us_arpa"
    dictionary: str = "english_us_arpa"
    timeout: int = 3600  # MFA 批量对齐超时时间（秒）

    # 输出配置
    output_dir: str = str(ALIGNED_DATA_DIR)

    # 容错配置
    min_success_rate: float = 0.97  # 最低对齐成功率

    def get_alignment_file(self, split: str) -> str:
        """获取对齐文件路径"""
        return str(ALIGNED_DATA_DIR / f"{split}_aligned.json")


# ==================== 音素配置 ====================

# 标准 ARPAbet 音素集（41个）
ARPABET_PHONEMES = [
    # 元音 (15)
    'AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'EH', 'ER', 'EY', 'IH', 'IY',
    'OW', 'OY', 'UH', 'UW',
    # 辅音 (24)
    'B', 'CH', 'D', 'DH', 'F', 'G', 'HH', 'JH', 'K', 'L', 'M', 'N',
    'NG', 'P', 'R', 'S', 'SH', 'T', 'TH', 'V', 'W', 'Y', 'Z', 'ZH',
    # 特殊 (2)
    'SIL', 'SP'
]

PHONE_TO_IDX = {p: i for i, p in enumerate(ARPABET_PHONEMES)}
IDX_TO_PHONE = {i: p for i, p in enumerate(ARPABET_PHONEMES)}

# 难音素列表（用于特殊跟踪）
DIFFICULT_PHONEMES = ['L', 'R', 'OW', 'AW', 'TH', 'DH', 'V', 'W']


# ==================== 默认配置实例 ====================

dataset_config = DatasetConfig()
model_config = ModelConfig()
training_config = TrainingConfig()
alignment_config = AlignmentConfig()


# ==================== 环境配置 ====================

def setup_environment():
    """设置环境变量和警告过滤"""
    # 抑制警告
    os.environ['PYTHONWARNINGS'] = 'ignore'
    os.environ['CURL_CA_BUNDLE'] = ''
    os.environ['REQUESTS_CA_BUNDLE'] = ''
    os.environ['HF_DATASETS_OFFLINE'] = '0'

    import warnings
    warnings.filterwarnings('ignore')

    # SSL 设置
    import ssl
    import urllib3
    ssl._create_default_https_context = ssl._create_unverified_context
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


# ==================== 设备配置 ====================

def get_device():
    """获取训练设备"""
    import torch
    return torch.device('cuda' if torch.cuda.is_available() else 'cpu')


# ==================== 路径工具 ====================

def ensure_dirs():
    """确保必要的目录存在"""
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    ALIGNED_DATA_DIR.mkdir(parents=True, exist_ok=True)


def get_model_save_path(model_name: str = "best_phoneme_dnn.pth") -> Path:
    """获取模型保存路径"""
    ensure_dirs()
    return MODELS_DIR / model_name


def get_model_dir(dir_name: str = "pytorch_phoneme_dnn") -> Path:
    """获取模型目录路径"""
    ensure_dirs()
    return MODELS_DIR / dir_name

