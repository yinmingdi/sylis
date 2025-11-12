#!/usr/bin/env python3
"""
训练音素 DNN 模型 - 重构版

使用 SpeechOcean762 数据集训练一个简单的 DNN：
1. 输入: MFCC 40维特征
2. 输出: 41 个音素概率
3. 损失: 加权交叉熵（非 CTC）⭐
4. 用于 GOP 评分

完整方案（结合两者优势）：
- MFA 对齐 → 提供精确的音素时间边界
- SpeechOcean762 评分 → 提供专家评分作为样本权重
- 加权损失 → 发音好的音素权重高，提升训练质量

重构说明：
- 使用模块化设计，代码更清晰易维护
- 使用 config 模块管理配置
- 使用 dataset 模块处理数据
- 使用 model 模块定义模型
- 使用 trainer 模块训练模型
- 使用 aligner 模块对齐数据
- 使用 utils 模块提供工具函数
"""

import os
import sys
import json
from pathlib import Path

# 添加当前目录到 Python 路径（必须在导入其他模块之前）
sys.path.insert(0, str(Path(__file__).parent))

from config import (
    setup_environment,
    get_device,
    ensure_dirs,
    get_model_dir,
    alignment_config,
    dataset_config,
    model_config,
    training_config,
    ARPABET_PHONEMES
)
from dataset import SpeechOcean762Dataset, create_dataloader
from model import create_model, print_model_info, save_model
from trainer import PhonemeTrainer
from aligner import check_and_align_data
from utils import (
    analyze_phoneme_distribution,
    print_section,
    print_config
)


def prepare_alignment_data():
    """
    准备对齐数据

    自动检测并对齐数据集
    """
    print_section("📍 步骤 0: 检查 MFA 对齐数据")

    # 获取对齐文件路径
    train_alignment_file = alignment_config.get_alignment_file('train')
    test_alignment_file = alignment_config.get_alignment_file('test')

    # 检查训练集对齐数据
    print(f"\n🔍 检查训练集对齐数据...")
    if not check_and_align_data(
        'train',
        dataset_config.max_train_samples,
        train_alignment_file
    ):
        print("❌ 训练集对齐失败，将使用平均分配")

    # 检查测试集对齐数据
    print(f"\n🔍 检查测试集对齐数据...")
    if not check_and_align_data(
        'test',
        dataset_config.max_val_samples,
        test_alignment_file
    ):
        print("❌ 测试集对齐失败，将使用平均分配")

    return train_alignment_file, test_alignment_file


def analyze_data(train_alignment_file: str, test_alignment_file: str):
    """
    分析音素分布

    Args:
        train_alignment_file: 训练集对齐文件
        test_alignment_file: 测试集对齐文件
    """
    print_section("📊 步骤 0.5: 分析音素分布")
    analyze_phoneme_distribution(train_alignment_file, "训练集")
    analyze_phoneme_distribution(test_alignment_file, "测试集")


def create_datasets(train_alignment_file: str, test_alignment_file: str):
    """
    创建数据集

    Args:
        train_alignment_file: 训练集对齐文件
        test_alignment_file: 测试集对齐文件

    Returns:
        (train_dataset, val_dataset): 训练集和验证集
    """
    print_section("📊 步骤 1: 加载数据集")
    print()

    # 创建训练集
    train_dataset = SpeechOcean762Dataset(
        split='train',
        max_samples=dataset_config.max_train_samples,
        alignment_file=train_alignment_file if os.path.exists(train_alignment_file) else None
    )

    # 创建验证集
    val_dataset = SpeechOcean762Dataset(
        split='test',
        max_samples=dataset_config.max_val_samples,
        alignment_file=test_alignment_file if os.path.exists(test_alignment_file) else None
    )

    return train_dataset, val_dataset


def create_dataloaders(train_dataset, val_dataset):
    """
    创建数据加载器

    Args:
        train_dataset: 训练数据集
        val_dataset: 验证数据集

    Returns:
        (train_loader, val_loader): 训练和验证数据加载器
    """
    import multiprocessing
    num_workers = training_config.num_workers
    if num_workers is None:
        num_workers = max(1, multiprocessing.cpu_count() - 1)

    print(f"   使用 {num_workers} 个工作进程")

    train_loader = create_dataloader(
        train_dataset,
        batch_size=training_config.batch_size,
        shuffle=True,
        num_workers=num_workers
    )

    val_loader = create_dataloader(
        val_dataset,
        batch_size=training_config.batch_size,
        shuffle=False,
        num_workers=num_workers
    )

    return train_loader, val_loader


def create_and_print_model(device):
    """
    创建模型并打印信息

    Args:
        device: 训练设备

    Returns:
        model: 创建的模型
    """
    print_section("🏗️  步骤 2: 创建模型")

    model = create_model()
    print_model_info(model)

    return model


def train_model(model, train_loader, val_loader, device):
    """
    训练模型

    Args:
        model: 模型
        train_loader: 训练数据加载器
        val_loader: 验证数据加载器
        device: 训练设备

    Returns:
        model: 训练好的模型
    """
    print_section("🚀 步骤 3: 训练模型")

    trainer = PhonemeTrainer(
        model=model,
        train_loader=train_loader,
        val_loader=val_loader,
        device=device
    )

    trained_model = trainer.train(num_epochs=training_config.num_epochs)

    return trained_model


def save_final_model(model, train_dataset, val_dataset):
    """
    保存最终模型和配置

    Args:
        model: 训练好的模型
        train_dataset: 训练数据集
        val_dataset: 验证数据集
    """
    print_section("💾 步骤 4: 保存模型")

    model_dir = get_model_dir('pytorch_phoneme_dnn')
    model_dir.mkdir(parents=True, exist_ok=True)

    # 保存模型权重
    import torch
    torch.save({
        'model_state_dict': model.state_dict(),
        'phone_to_idx': {p: i for i, p in enumerate(ARPABET_PHONEMES)},
        'phonemes': ARPABET_PHONEMES,
        'config': {
            'input_dim': model_config.input_dim,
            'context_frames': model_config.context_frames,
            'hidden_dims': model_config.hidden_dims,
            'num_phones': len(ARPABET_PHONEMES)
        }
    }, str(model_dir / 'final_model.pth'))

    # 保存配置
    config_data = {
            'phonemes': ARPABET_PHONEMES,
        'input_dim': model_config.input_dim,
        'context_frames': model_config.context_frames,
        'hidden_dims': model_config.hidden_dims,
        'training_dataset': dataset_config.name,
            'training_samples': len(train_dataset),
            'validation_samples': len(val_dataset),
            'loss_function': 'Weighted CrossEntropy',
            'improvements': '帧拼接+增大容量+早停+学习率调度+加权损失',
            'note': '改进版DNN：使用上下文窗口捕获时序信息，使用SpeechOcean762评分加权训练'
    }

    with open(str(model_dir / 'config.json'), 'w') as f:
        json.dump(config_data, f, indent=2)

    print(f"\n✅ 模型已保存:")
    print(f"   模型文件: models/pytorch_phoneme_dnn/final_model.pth")
    print(f"   配置文件: models/pytorch_phoneme_dnn/config.json")
    print(f"   最佳模型: models/best_phoneme_dnn.pth")


def print_completion_info():
    """打印完成信息"""
    print("\n" + "=" * 60)
    print("🎉 训练完成！")
    print("=" * 60)
    print("\n📝 测试模型:")
    print("   python test_pytorch_model.py tests/hello.wav 'hello'")


def main():
    """主函数"""
    # 设置环境
    setup_environment()

    print("=" * 60)
    print("🎯 训练音素 DNN 模型")
    print("   数据集: SpeechOcean762")
    print("   损失函数: 加权交叉熵（非 CTC）⭐")
    print("   输出: 41 个音素概率 ⭐")
    print("=" * 60)

    # 打印配置
    print_config(dataset_config, "数据集配置")
    print_config(model_config, "模型配置")
    print_config(training_config, "训练配置")

    # 获取设备
    device = get_device()
    print(f"\n使用设备: {device}")

    # 确保目录存在
    ensure_dirs()

    # 0. 准备对齐数据
    train_alignment_file, test_alignment_file = prepare_alignment_data()

    # 0.5. 分析音素分布
    analyze_data(train_alignment_file, test_alignment_file)

    # 1. 创建数据集
    train_dataset, val_dataset = create_datasets(
        train_alignment_file,
        test_alignment_file
    )

    # 1.5. 创建数据加载器
    train_loader, val_loader = create_dataloaders(train_dataset, val_dataset)

    # 2. 创建模型
    model = create_and_print_model(device)

    # 3. 训练模型
    model = train_model(model, train_loader, val_loader, device)

    # 4. 保存模型
    save_final_model(model, train_dataset, val_dataset)

    # 5. 打印完成信息
    print_completion_info()


if __name__ == "__main__":
    main()
