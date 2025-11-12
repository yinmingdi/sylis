"""
训练模块 - 重构版

提供音素 DNN 模型训练和数据对齐的功能

模块结构：
- config: 配置管理
- utils: 工具函数
- dataset: 数据集处理
- model: 模型定义
- trainer: 训练逻辑
- aligner: 对齐逻辑

主要脚本：
- train_phoneme_dnn.py: 训练音素 DNN 模型
- batch_align_dataset.py: 批量对齐数据集
"""

__version__ = "2.0.0"
__author__ = "SpeechService Team"

# 导出主要类和函数
from .config import (
    dataset_config,
    model_config,
    training_config,
    alignment_config,
    ARPABET_PHONEMES,
    PHONE_TO_IDX
)

from .dataset import SpeechOcean762Dataset, create_dataloader
from .model import PhonemeDNN, create_model, load_model, save_model
from .trainer import PhonemeTrainer
from .aligner import MFABatchAligner, batch_align_dataset, check_and_align_data

__all__ = [
    # 配置
    'dataset_config',
    'model_config',
    'training_config',
    'alignment_config',
    'ARPABET_PHONEMES',
    'PHONE_TO_IDX',

    # 数据集
    'SpeechOcean762Dataset',
    'create_dataloader',

    # 模型
    'PhonemeDNN',
    'create_model',
    'load_model',
    'save_model',

    # 训练
    'PhonemeTrainer',

    # 对齐
    'MFABatchAligner',
    'batch_align_dataset',
    'check_and_align_data',
]

