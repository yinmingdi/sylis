#!/usr/bin/env python3
"""
模型模块

定义音素 DNN 模型
"""

import sys
from pathlib import Path
import torch
import torch.nn as nn
from typing import List

# 添加当前目录到 Python 路径
sys.path.insert(0, str(Path(__file__).parent))

from config import model_config, ARPABET_PHONEMES


class PhonemeDNN(nn.Module):
    """
    改进的音素分类 DNN 模型

    关键特性：
    1. ✅ 使用上下文窗口（帧拼接）- 捕获时序信息
    2. ✅ 增加模型容量 - 更强的表达能力
    3. ✅ 保持交叉熵输出（非CTC）

    输入: MFCC 40维 × (2*context+1) 帧
    输出: 41 个音素概率
    """

    def __init__(
        self,
        input_dim: int = 40,
        context_frames: int = 5,
        hidden_dims: List[int] = None,
        num_phones: int = 41,
        dropout: float = 0.4
    ):
        """
        初始化模型

        Args:
            input_dim: 输入特征维度（MFCC 维度）
            context_frames: 上下文窗口大小（±N 帧）
            hidden_dims: 隐藏层维度列表
            num_phones: 音素数量
            dropout: Dropout 比率
        """
        super().__init__()

        self.context_frames = context_frames
        self.input_dim = input_dim

        # 拼接前后context_frames帧，总共 (2*context+1) 帧
        self.spliced_dim = input_dim * (2 * context_frames + 1)

        # 默认隐藏层配置
        if hidden_dims is None:
            hidden_dims = model_config.hidden_dims

        # 构建网络层
        layers = []
        prev_dim = self.spliced_dim

        for hidden_dim in hidden_dims:
            layers.append(nn.Linear(prev_dim, hidden_dim))
            layers.append(nn.ReLU())
            layers.append(nn.BatchNorm1d(hidden_dim))
            layers.append(nn.Dropout(dropout))
            prev_dim = hidden_dim

        # 输出层：音素分类
        layers.append(nn.Linear(prev_dim, num_phones))

        self.net = nn.Sequential(*layers)

    def splice_frames(self, x: torch.Tensor) -> torch.Tensor:
        """
        帧拼接：将前后context_frames帧拼接到当前帧

        Args:
            x: [batch, time, features]

        Returns:
            spliced: [batch, time, features * (2*context+1)]
        """
        batch, time, feat = x.shape
        context = self.context_frames

        # Pad前后各context帧（使用edge padding，重复边界值）
        x_padded = torch.nn.functional.pad(
            x, (0, 0, context, context), mode='replicate'
        )

        # 拼接前后帧
        spliced_frames = []
        for t in range(time):
            # 提取 [t, t+2*context+1) 的帧
            frame_window = x_padded[:, t:t+2*context+1, :]  # [batch, 2*context+1, feat]
            frame_window = frame_window.reshape(batch, -1)  # [batch, (2*context+1)*feat]
            spliced_frames.append(frame_window)

        spliced = torch.stack(spliced_frames, dim=1)  # [batch, time, (2*context+1)*feat]
        return spliced

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        前向传播 + 帧拼接

        Args:
            x: [batch, time, features] 或 [batch, features]

        Returns:
            logits: [batch, time, num_phones] 或 [batch, num_phones]
        """
        if x.dim() == 3:
            # 序列输入：需要帧拼接
            # 1. 帧拼接
            x = self.splice_frames(x)  # [batch, time, (2*context+1)*features]

            # 2. DNN处理
            batch, time, feat = x.shape
            x = x.reshape(batch * time, feat)  # [batch*time, (2*context+1)*features]
            out = self.net(x)  # [batch*time, num_phones]
            out = out.reshape(batch, time, -1)  # [batch, time, num_phones]
        else:
            # 单帧输入（用于推理）
            out = self.net(x)

        return out

    def get_model_info(self) -> dict:
        """
        获取模型信息

        Returns:
            info: 模型信息字典
        """
        num_params = sum(p.numel() for p in self.parameters())

        return {
            'input_dim': self.input_dim,
            'context_frames': self.context_frames,
            'spliced_dim': self.spliced_dim,
            'num_params': num_params,
            'model_size_mb': num_params * 4 / 1024 / 1024
        }


def create_model(
    input_dim: int = None,
    context_frames: int = None,
    hidden_dims: List[int] = None,
    num_phones: int = None,
    dropout: float = None
) -> PhonemeDNN:
    """
    创建音素 DNN 模型（使用配置）

    Args:
        input_dim: 输入维度（None = 使用配置）
        context_frames: 上下文窗口（None = 使用配置）
        hidden_dims: 隐藏层维度（None = 使用配置）
        num_phones: 音素数量（None = 使用配置）
        dropout: Dropout 比率（None = 使用配置）

    Returns:
        model: PhonemeDNN 模型
    """
    # 使用配置的默认值
    if input_dim is None:
        input_dim = model_config.input_dim
    if context_frames is None:
        context_frames = model_config.context_frames
    if hidden_dims is None:
        hidden_dims = model_config.hidden_dims
    if num_phones is None:
        num_phones = len(ARPABET_PHONEMES)
    if dropout is None:
        dropout = model_config.dropout

    model = PhonemeDNN(
        input_dim=input_dim,
        context_frames=context_frames,
        hidden_dims=hidden_dims,
        num_phones=num_phones,
        dropout=dropout
    )

    return model


def load_model(
    checkpoint_path: str,
    device: str = 'cpu'
) -> tuple[PhonemeDNN, dict]:
    """
    加载模型检查点

    Args:
        checkpoint_path: 检查点路径
        device: 设备

    Returns:
        (model, checkpoint): 模型和检查点数据
    """
    checkpoint = torch.load(checkpoint_path, map_location=device)

    # 从检查点获取配置
    config = checkpoint.get('config', {})

    # 创建模型
    model = create_model(
        input_dim=config.get('input_dim', model_config.input_dim),
        context_frames=config.get('context_frames', model_config.context_frames),
        hidden_dims=config.get('hidden_dims', model_config.hidden_dims),
        num_phones=config.get('num_phones', len(ARPABET_PHONEMES))
    )

    # 加载权重
    model.load_state_dict(checkpoint['model_state_dict'])
    model.to(device)

    return model, checkpoint


def save_model(
    model: PhonemeDNN,
    optimizer,
    epoch: int,
    val_loss: float,
    val_acc: float,
    save_path: str,
    additional_info: dict = None
):
    """
    保存模型检查点

    Args:
        model: 模型
        optimizer: 优化器
        epoch: 当前轮次
        val_loss: 验证损失
        val_acc: 验证准确率
        save_path: 保存路径
        additional_info: 额外信息
    """
    checkpoint = {
        'epoch': epoch,
        'model_state_dict': model.state_dict(),
        'optimizer_state_dict': optimizer.state_dict(),
        'val_loss': val_loss,
        'val_acc': val_acc,
        'config': {
            'input_dim': model.input_dim,
            'context_frames': model.context_frames,
            'num_phones': len(ARPABET_PHONEMES)
        }
    }

    # 添加额外信息
    if additional_info:
        checkpoint.update(additional_info)

    torch.save(checkpoint, save_path)


def print_model_info(model: PhonemeDNN):
    """
    打印模型信息

    Args:
        model: 模型
    """
    info = model.get_model_info()

    print(f"\n   模型配置:")
    print(f"      输入维度: {info['input_dim']} (MFCC)")
    print(f"      上下文窗口: ±{info['context_frames']} 帧")
    print(f"      实际输入: {info['spliced_dim']} (帧拼接)")
    print(f"      总参数量: {info['num_params']:,}")
    print(f"      模型大小: ~{info['model_size_mb']:.1f} MB")

