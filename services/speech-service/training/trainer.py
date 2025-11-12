#!/usr/bin/env python3
"""
训练器模块

提供模型训练的核心逻辑
"""

import sys
from pathlib import Path
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader
from tqdm import tqdm

# 添加当前目录到 Python 路径
sys.path.insert(0, str(Path(__file__).parent))

from config import (
    PHONE_TO_IDX,
    DIFFICULT_PHONEMES,
    training_config,
    get_model_save_path
)
from model import PhonemeDNN, save_model


class PhonemeTrainer:
    """
    音素 DNN 训练器

    负责模型的训练、验证和早停控制
    """

    def __init__(
        self,
        model: PhonemeDNN,
        train_loader: DataLoader,
        val_loader: DataLoader = None,
        device: str = 'cpu',
        learning_rate: float = None,
        patience: int = None,
        min_delta: float = None
    ):
        """
        初始化训练器

        Args:
            model: 模型
            train_loader: 训练数据加载器
            val_loader: 验证数据加载器（可选）
            device: 训练设备
            learning_rate: 学习率
            patience: 早停耐心值
            min_delta: 早停最小改进阈值
        """
        self.model = model.to(device)
        self.train_loader = train_loader
        self.val_loader = val_loader
        self.device = device

        # 训练配置
        self.learning_rate = learning_rate or training_config.learning_rate
        self.patience = patience or training_config.patience
        self.min_delta = min_delta or training_config.min_delta

        # 损失函数：交叉熵（忽略静音）
        self.criterion = nn.CrossEntropyLoss(ignore_index=PHONE_TO_IDX['SIL'])

        # 优化器
        self.optimizer = optim.Adam(
            self.model.parameters(),
            lr=self.learning_rate,
            weight_decay=training_config.weight_decay
        )

        # 学习率调度器
        self.scheduler = optim.lr_scheduler.ReduceLROnPlateau(
            self.optimizer,
            mode='min',
            patience=training_config.scheduler_patience,
            factor=training_config.scheduler_factor,
            verbose=True
        )

        # 早停状态
        self.best_val_loss = float('inf')
        self.best_val_acc = 0.0
        self.epochs_no_improve = 0

        # 难音素索引
        self.difficult_phoneme_indices = [
            PHONE_TO_IDX[p] for p in DIFFICULT_PHONEMES if p in PHONE_TO_IDX
        ]

    def train_epoch(self, epoch: int, num_epochs: int) -> tuple[float, float]:
        """
        训练一个 epoch

        Args:
            epoch: 当前 epoch
            num_epochs: 总 epoch 数

        Returns:
            (avg_loss, accuracy): 平均损失和准确率
        """
        self.model.train()

        total_loss = 0
        correct = 0
        total = 0

        pbar = tqdm(
            self.train_loader,
            desc=f"训练 Epoch {epoch+1}/{num_epochs}",
            ncols=100,
            ascii=True
        )

        for batch_idx, batch in enumerate(pbar):
            features = batch['features'].to(self.device)  # [batch, time, 40]
            labels = batch['labels'].to(self.device)      # [batch, time]
            scores = batch['scores'].to(self.device)      # [batch, time]

            # 前向传播
            self.optimizer.zero_grad()
            outputs = self.model(features)  # [batch, time, 41]

            # 计算加权损失
            loss = self._compute_weighted_loss(outputs, labels, scores)

            # 反向传播
            loss.backward()
            self.optimizer.step()

            # 统计
            total_loss += loss.item()

            # 计算准确率
            outputs_flat = outputs.reshape(-1, outputs.shape[-1])
            labels_flat = labels.reshape(-1)
            _, predicted = outputs_flat.max(1)
            mask = labels_flat != PHONE_TO_IDX['SIL']
            correct += (predicted[mask] == labels_flat[mask]).sum().item()
            total += mask.sum().item()

            # 更新进度条
            current_acc = 100 * correct / max(total, 1)
            pbar.set_postfix({
                'loss': f'{loss.item():.4f}',
                'acc': f'{current_acc:.1f}%',
                'batch': f'{batch_idx+1}/{len(self.train_loader)}'
            })

        avg_loss = total_loss / len(self.train_loader)
        accuracy = 100 * correct / max(total, 1)

        return avg_loss, accuracy

    def validate_epoch(self, epoch: int, num_epochs: int) -> tuple[float, float, dict]:
        """
        验证一个 epoch

        Args:
            epoch: 当前 epoch
            num_epochs: 总 epoch 数

        Returns:
            (avg_loss, accuracy, phoneme_stats): 验证损失、准确率和音素统计
        """
        if not self.val_loader:
            return None, None, None

        self.model.eval()

        total_loss = 0
        correct = 0
        total = 0

        # 难音素统计
        difficult_correct = {p: 0 for p in DIFFICULT_PHONEMES}
        difficult_total = {p: 0 for p in DIFFICULT_PHONEMES}

        with torch.no_grad():
            for batch in tqdm(
                self.val_loader,
                desc=f"验证 Epoch {epoch+1}/{num_epochs}",
                ncols=100,
                ascii=True
            ):
                features = batch['features'].to(self.device)
                labels = batch['labels'].to(self.device)
                scores = batch['scores'].to(self.device)

                outputs = self.model(features)

                # 计算加权损失
                loss = self._compute_weighted_loss(outputs, labels, scores)
                total_loss += loss.item()

                # 统计准确率
                outputs_flat = outputs.reshape(-1, outputs.shape[-1])
                labels_flat = labels.reshape(-1)
                _, predicted = outputs_flat.max(1)
                mask = labels_flat != PHONE_TO_IDX['SIL']
                correct += (predicted[mask] == labels_flat[mask]).sum().item()
                total += mask.sum().item()

                # 统计难音素准确率
                for idx, phoneme in zip(self.difficult_phoneme_indices, DIFFICULT_PHONEMES):
                    phone_mask = (labels_flat == idx)
                    if phone_mask.sum() > 0:
                        difficult_correct[phoneme] += (
                            predicted[phone_mask] == labels_flat[phone_mask]
                        ).sum().item()
                        difficult_total[phoneme] += phone_mask.sum().item()

        avg_loss = total_loss / len(self.val_loader)
        accuracy = 100 * correct / max(total, 1)

        phoneme_stats = {
            'correct': difficult_correct,
            'total': difficult_total
        }

        return avg_loss, accuracy, phoneme_stats

    def _compute_weighted_loss(
        self,
        outputs: torch.Tensor,
        labels: torch.Tensor,
        scores: torch.Tensor
    ) -> torch.Tensor:
        """
        计算加权交叉熵损失

        使用 SpeechOcean762 评分作为样本权重

        Args:
            outputs: [batch, time, num_phones]
            labels: [batch, time]
            scores: [batch, time]

        Returns:
            loss: 标量损失
        """
        # Reshape
        outputs_flat = outputs.reshape(-1, outputs.shape[-1])
        labels_flat = labels.reshape(-1)
        scores_flat = scores.reshape(-1)

        # 使用 SpeechOcean762 评分作为样本权重
        # 评分越高的音素，权重越高
        sample_weights = scores_flat / 2.0  # 归一化到 0-1
        sample_weights = sample_weights * (labels_flat != PHONE_TO_IDX['SIL']).float()

        # 加权交叉熵损失
        loss_per_sample = nn.functional.cross_entropy(
            outputs_flat, labels_flat, reduction='none'
        )
        loss = (loss_per_sample * sample_weights).sum() / (sample_weights.sum() + 1e-8)

        return loss

    def train(self, num_epochs: int) -> PhonemeDNN:
        """
        训练模型

        Args:
            num_epochs: 训练轮数

        Returns:
            model: 训练好的模型
        """
        print("\n" + "=" * 60)
        print("🚀 开始训练音素 DNN 模型")
        print("=" * 60)
        print(f"设备: {self.device}")
        print(f"训练样本: {len(self.train_loader.dataset)}")
        print(f"验证样本: {len(self.val_loader.dataset) if self.val_loader else 0}")
        print(f"训练轮数: {num_epochs}")
        print()

        for epoch in range(num_epochs):
            print(f"\n📊 Epoch {epoch+1}/{num_epochs}")
            print("-" * 60)

            # 训练阶段
            train_loss, train_acc = self.train_epoch(epoch, num_epochs)
            print(f"   训练损失: {train_loss:.4f}")
            print(f"   训练准确率: {train_acc:.2f}%")

            # 验证阶段
            if self.val_loader:
                val_loss, val_acc, phoneme_stats = self.validate_epoch(epoch, num_epochs)
                print(f"   验证损失: {val_loss:.4f}")
                print(f"   验证准确率: {val_acc:.2f}%")

                # 显示难音素准确率
                self._print_difficult_phoneme_stats(phoneme_stats)

                # 学习率调整
                self.scheduler.step(val_loss)

                # 早停检查
                should_stop = self._check_early_stopping(epoch, val_loss, val_acc)
                if should_stop:
                    break

        print("\n" + "=" * 60)
        print("✅ 训练完成！")
        print(f"最佳验证损失: {self.best_val_loss:.4f}")
        print(f"最佳验证准确率: {self.best_val_acc:.2f}%")
        print("=" * 60)

        return self.model

    def _print_difficult_phoneme_stats(self, phoneme_stats: dict):
        """打印难音素统计"""
        print(f"\n   难音素准确率:")
        for phoneme in DIFFICULT_PHONEMES:
            correct = phoneme_stats['correct'][phoneme]
            total = phoneme_stats['total'][phoneme]
            if total > 0:
                acc = 100 * correct / total
                print(f"      {phoneme:3s}: {acc:5.1f}% ({correct}/{total})")
            else:
                print(f"      {phoneme:3s}: N/A (未出现)")

    def _check_early_stopping(
        self,
        epoch: int,
        val_loss: float,
        val_acc: float
    ) -> bool:
        """
        检查早停条件

        Args:
            epoch: 当前 epoch
            val_loss: 验证损失
            val_acc: 验证准确率

        Returns:
            should_stop: 是否应该停止训练
        """
        # 检查是否改善
        if val_loss < self.best_val_loss - self.min_delta:
            # 有改善，保存最佳模型
            self.best_val_loss = val_loss
            self.best_val_acc = val_acc
            self.epochs_no_improve = 0

            # 保存最佳模型
            save_path = get_model_save_path('best_phoneme_dnn.pth')
            save_model(
                self.model,
                self.optimizer,
                epoch,
                val_loss,
                val_acc,
                str(save_path)
            )

            print(f"   ✅ 保存最佳模型 (验证损失: {val_loss:.4f}, 准确率: {val_acc:.2f}%)")
            return False
        else:
            # 没有改善
            self.epochs_no_improve += 1
            print(f"   ⚠️  验证损失未改善 ({self.epochs_no_improve}/{self.patience})")

            # 检查是否达到早停条件
            if self.epochs_no_improve >= self.patience:
                print(f"\n⛔ 早停：验证损失已{self.patience}轮未改善，停止训练")
                return True

            return False

