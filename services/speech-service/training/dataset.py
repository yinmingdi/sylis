#!/usr/bin/env python3
"""
数据集模块

提供 SpeechOcean762 数据集的封装和处理
"""

import sys
from pathlib import Path
from typing import Optional, Dict, List

import torch
from torch.utils.data import Dataset, DataLoader

# 添加路径
sys.path.insert(0, str(Path(__file__).parent))  # training 目录
sys.path.insert(0, str(Path(__file__).parent.parent))  # speech-service 目录
from app.feature_extractor import create_feature_extractor

from config import (
    PHONE_TO_IDX,
    ARPABET_PHONEMES,
    dataset_config
)
from utils import (
    load_speech_ocean_dataset,
    load_alignment_data,
    save_audio_to_temp,
    cleanup_temp_file,
    get_phoneme_index
)


class SpeechOcean762Dataset(Dataset):
    """
    SpeechOcean762 数据集

    提取 MFCC 特征和音素标签
    支持使用 MFA 对齐数据（推荐）或平均分配
    """

    def __init__(
        self,
        split: str = 'train',
        max_samples: Optional[int] = None,
        alignment_file: Optional[str] = None
    ):
        """
        初始化数据集

        Args:
            split: 'train' 或 'test'
            max_samples: 最大样本数（None = 全部）
            alignment_file: MFA 对齐结果文件路径 (JSON)，None=使用平均分配
        """
        # 加载数据集
        self.dataset = load_speech_ocean_dataset(split, max_samples)

        # 创建特征提取器
        self.feature_extractor = create_feature_extractor(
            feature_type=dataset_config.feature_type,
            num_ceps=dataset_config.num_ceps
        )

        # 加载对齐数据
        self.alignments = None
        if alignment_file:
            self.alignments = load_alignment_data(alignment_file)

        print(f"   对齐方式: {'✅ MFA 精确对齐' if self.alignments else '⚠️ 平均分配帧'}")

    def __len__(self) -> int:
        return len(self.dataset)

    def __getitem__(self, idx: int) -> Dict[str, torch.Tensor]:
        """
        获取一个样本

        Returns:
            {
                'features': [time, 40] MFCC 特征
                'labels': [time] 音素标签
                'scores': [time] 专家评分
                'text': str 文本
            }
        """
        item = self.dataset[idx]

        # 1. 提取音频特征
        audio = item['audio']['array']
        sr = item['audio']['sampling_rate']

        # 保存到临时文件
        temp_path = save_audio_to_temp(audio, sr)

        # 提取 MFCC
        features = self.feature_extractor.extract_features(temp_path, sr)
        cleanup_temp_file(temp_path)

        # 2. 获取音素标签（使用 MFA 对齐或平均分配）
        num_frames = features.features.shape[0]
        frame_shift = features.frame_shift  # 帧移（秒）

        if self.alignments and idx in self.alignments:
            # 使用 MFA 对齐 + SpeechOcean762 评分
            frame_labels, frame_scores = self._create_labels_from_alignment(
                self.alignments[idx],
                num_frames,
                frame_shift,
                item
            )
        else:
            # 使用平均分配（fallback）
            frame_labels, frame_scores = self._create_labels_average(item, num_frames)

        return {
            'features': torch.FloatTensor(features.features),  # [time, 40]
            'labels': torch.LongTensor(frame_labels),          # [time]
            'scores': torch.FloatTensor(frame_scores),         # [time]
            'text': item['text']
        }

    def _create_labels_from_alignment(
        self,
        alignment: Dict,
        num_frames: int,
        frame_shift: float,
        item: Dict
    ) -> tuple[List[int], List[float]]:
        """
        使用 MFA 对齐结果 + SpeechOcean762 评分创建帧标签

        Args:
            alignment: MFA 对齐结果
            num_frames: 帧数
            frame_shift: 帧移（秒）
            item: 原始数据项

        Returns:
            (frame_labels, frame_scores): 帧标签和评分
        """
        frame_labels = [PHONE_TO_IDX['SIL']] * num_frames
        frame_scores = [0.0] * num_frames

        # 获取 SpeechOcean762 的音素评分
        phone_scores = self._extract_phone_scores(item)

        # 使用 MFA 对齐的时间边界 + SpeechOcean762 评分
        for phone_idx, phoneme in enumerate(alignment['phonemes']):
            # 计算帧范围（MFA 提供）
            start_frame = int(phoneme['start_time'] / frame_shift)
            end_frame = int(phoneme['end_time'] / frame_shift)
            start_frame = max(0, min(start_frame, num_frames - 1))
            end_frame = max(start_frame + 1, min(end_frame, num_frames))

            # 获取音素索引
            phone_idx_in_vocab = get_phoneme_index(phoneme['phoneme'])

            # 获取该音素的评分（SpeechOcean762 提供）
            score = phone_scores.get(phone_idx, 2.0)  # 默认 2.0

            # 标注帧
            for frame_idx in range(start_frame, end_frame):
                frame_labels[frame_idx] = phone_idx_in_vocab
                frame_scores[frame_idx] = score

        return frame_labels, frame_scores

    def _extract_phone_scores(self, item: Dict) -> Dict[int, float]:
        """
        从 SpeechOcean762 提取音素评分

        Args:
            item: 数据项

        Returns:
            phone_scores: {phone_index: score}
        """
        phone_scores = {}

        if 'words' not in item:
            return phone_scores

        phone_idx_global = 0
        for word in item['words']:
            phones = word.get('phones', [])
            phones_acc = word.get('phones-accuracy', [])

            for phone, score in zip(phones, phones_acc):
                phone_scores[phone_idx_global] = score
                phone_idx_global += 1

        return phone_scores

    def _create_labels_average(
        self,
        item: Dict,
        num_frames: int
    ) -> tuple[List[int], List[float]]:
        """
        使用平均分配创建帧标签（不精确）+ 评分

        Args:
            item: 数据项
            num_frames: 帧数

        Returns:
            (frame_labels, frame_scores): 帧标签和评分
        """
        phone_labels = []
        phone_scores = []

        # 提取所有音素及其评分
        for word in item['words']:
            phones = word.get('phones', [])
            phones_acc = word.get('phones-accuracy', [])

            for i, phone in enumerate(phones):
                phone_idx = get_phoneme_index(phone)
                phone_labels.append(phone_idx)

                # 获取评分
                score = phones_acc[i] if i < len(phones_acc) else 2.0
                phone_scores.append(score)

        # 如果没有音素，使用默认
        if len(phone_labels) == 0:
            phone_labels = [PHONE_TO_IDX['SIL']]
            phone_scores = [2.0]

        # 平均分配帧
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

        # 调整长度
        if len(frame_labels) < num_frames:
            pad_len = num_frames - len(frame_labels)
            frame_labels.extend([frame_labels[-1]] * pad_len)
            frame_scores.extend([frame_scores[-1]] * pad_len)

        frame_labels = frame_labels[:num_frames]
        frame_scores = frame_scores[:num_frames]

        return frame_labels, frame_scores


def collate_fn(batch: List[Dict]) -> Dict[str, torch.Tensor]:
    """
    批处理函数

    将不同长度的样本填充到相同长度

    Args:
        batch: 样本列表

    Returns:
        {
            'features': [batch, time, 40]
            'labels': [batch, time]
            'scores': [batch, time]
        }
    """
    # 找到最大长度
    max_len = max([item['features'].shape[0] for item in batch])

    features_list = []
    labels_list = []
    scores_list = []

    for item in batch:
        feat = item['features']
        label = item['labels']
        score = item['scores']

        # 填充到最大长度
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
        'scores': torch.stack(scores_list)       # [batch, time]
    }


def create_dataloader(
    dataset: Dataset,
    batch_size: int,
    shuffle: bool = True,
    num_workers: Optional[int] = None
) -> DataLoader:
    """
    创建 DataLoader

    Args:
        dataset: 数据集
        batch_size: 批次大小
        shuffle: 是否打乱
        num_workers: 工作进程数（None = auto）

    Returns:
        dataloader: DataLoader 对象
    """
    if num_workers is None:
        import multiprocessing
        num_workers = max(1, multiprocessing.cpu_count() - 1)

    return DataLoader(
        dataset,
        batch_size=batch_size,
        shuffle=shuffle,
        collate_fn=collate_fn,
        num_workers=num_workers,
        persistent_workers=True if num_workers > 0 else False
    )

