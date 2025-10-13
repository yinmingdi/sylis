"""
评分归一化模块

将原始的 GOP 分数和各种评分指标归一化到统一的 0-100 分数范围。
使用多种归一化策略以适应不同场景。
"""

import numpy as np
from typing import List, Tuple
from scipy.stats import norm


class ScoreNormalizer:
    """
    评分归一化器

    提供多种归一化方法：
    - Sigmoid 归一化：平滑映射
    - Z-score 归一化：基于统计分布
    - Min-Max 归一化：线性映射
    - 百分位归一化：基于排名
    """

    def __init__(
        self,
        method: str = "sigmoid",
        min_score: float = 0.0,
        max_score: float = 100.0
    ):
        """
        初始化归一化器

        Args:
            method: 归一化方法 (sigmoid/zscore/minmax/percentile)
            min_score: 最小分数
            max_score: 最大分数
        """
        self.method = method
        self.min_score = min_score
        self.max_score = max_score

    def normalize(
        self,
        scores: List[float],
        params: dict = None
    ) -> List[float]:
        """
        归一化分数列表

        Args:
            scores: 原始分数列表
            params: 归一化参数（可选）

        Returns:
            List[float]: 归一化后的分数
        """
        if not scores:
            return []

        params = params or {}

        if self.method == "sigmoid":
            return self._sigmoid_normalize(scores, params)
        elif self.method == "zscore":
            return self._zscore_normalize(scores, params)
        elif self.method == "minmax":
            return self._minmax_normalize(scores, params)
        elif self.method == "percentile":
            return self._percentile_normalize(scores, params)
        else:
            raise ValueError(f"Unknown normalization method: {self.method}")

    def _sigmoid_normalize(
        self,
        scores: List[float],
        params: dict
    ) -> List[float]:
        """
        Sigmoid 归一化

        公式: score = max / (1 + exp(-k * (x - offset)))

        优点：平滑过渡，适合评分场景
        """
        k = params.get('k', 0.5)         # 斜率
        offset = params.get('offset', 0) # 中心点

        normalized = []
        for score in scores:
            norm_score = self.max_score / (1 + np.exp(-k * (score - offset)))
            norm_score = np.clip(norm_score, self.min_score, self.max_score)
            normalized.append(float(norm_score))

        return normalized

    def _zscore_normalize(
        self,
        scores: List[float],
        params: dict
    ) -> List[float]:
        """
        Z-score 归一化

        将分数标准化为均值为50，标准差为15的分布（类似IQ分数）
        """
        target_mean = params.get('target_mean', 50)
        target_std = params.get('target_std', 15)

        # 计算当前分数的均值和标准差
        mean = np.mean(scores)
        std = np.std(scores)

        if std == 0:
            # 所有分数相同，返回目标均值
            return [target_mean] * len(scores)

        normalized = []
        for score in scores:
            # 标准化
            z = (score - mean) / std
            # 转换到目标分布
            norm_score = z * target_std + target_mean
            norm_score = np.clip(norm_score, self.min_score, self.max_score)
            normalized.append(float(norm_score))

        return normalized

    def _minmax_normalize(
        self,
        scores: List[float],
        params: dict
    ) -> List[float]:
        """
        Min-Max 归一化

        线性映射到 [min_score, max_score] 范围
        """
        # 使用参数指定的范围或从数据中计算
        data_min = params.get('min', min(scores))
        data_max = params.get('max', max(scores))

        if data_max == data_min:
            # 所有分数相同
            return [(self.min_score + self.max_score) / 2] * len(scores)

        normalized = []
        for score in scores:
            norm_score = (
                (score - data_min) / (data_max - data_min) *
                (self.max_score - self.min_score) + self.min_score
            )
            norm_score = np.clip(norm_score, self.min_score, self.max_score)
            normalized.append(float(norm_score))

        return normalized

    def _percentile_normalize(
        self,
        scores: List[float],
        params: dict
    ) -> List[float]:
        """
        百分位归一化

        基于分数在数据集中的排名进行归一化
        """
        # 计算每个分数的百分位
        sorted_scores = sorted(scores)

        normalized = []
        for score in scores:
            # 计算该分数的百分位
            percentile = sum(1 for s in sorted_scores if s <= score) / len(sorted_scores)
            # 映射到目标范围
            norm_score = percentile * (self.max_score - self.min_score) + self.min_score
            normalized.append(float(norm_score))

        return normalized

    def calibrate_gop_scores(
        self,
        gop_scores: List[float]
    ) -> List[float]:
        """
        校准 GOP 分数

        GOP 分数通常在 [-5, 5] 范围内，需要映射到 0-100

        Args:
            gop_scores: GOP 原始分数

        Returns:
            List[float]: 校准后的分数
        """
        # GOP 分数的典型范围和映射关系
        # GOP > 2: 优秀 (85-100)
        # GOP 0-2: 良好 (70-85)
        # GOP -2-0: 一般 (50-70)
        # GOP < -2: 较差 (0-50)

        calibrated = []
        for gop in gop_scores:
            if gop >= 2:
                # 优秀：线性映射到 85-100
                score = 85 + min((gop - 2) / 3 * 15, 15)
            elif gop >= 0:
                # 良好：线性映射到 70-85
                score = 70 + (gop / 2) * 15
            elif gop >= -2:
                # 一般：线性映射到 50-70
                score = 50 + (gop + 2) / 2 * 20
            else:
                # 较差：线性映射到 0-50
                score = max(0, 50 + (gop + 2) / 2 * 25)

            calibrated.append(np.clip(score, 0, 100))

        return calibrated


def create_score_normalizer(
    method: str = "sigmoid",
    **kwargs
) -> ScoreNormalizer:
    """
    创建评分归一化器的工厂函数

    Args:
        method: 归一化方法
        **kwargs: 其他参数

    Returns:
        ScoreNormalizer: 归一化器实例
    """
    return ScoreNormalizer(method=method, **kwargs)


def adaptive_normalize(
    scores: List[float],
    target_distribution: Tuple[float, float] = (70, 15)
) -> List[float]:
    """
    自适应归一化

    根据分数分布自动选择最佳归一化方法

    Args:
        scores: 原始分数
        target_distribution: 目标分布 (mean, std)

    Returns:
        List[float]: 归一化后的分数
    """
    if not scores:
        return []

    # 分析分数分布
    mean = np.mean(scores)
    std = np.std(scores)
    skewness = _calculate_skewness(scores)

    # 根据分布特征选择归一化方法
    if abs(skewness) < 0.5:
        # 分布较为对称，使用 Z-score
        normalizer = ScoreNormalizer(method="zscore")
        return normalizer.normalize(
            scores,
            {'target_mean': target_distribution[0], 'target_std': target_distribution[1]}
        )
    else:
        # 分布偏斜，使用 Sigmoid
        normalizer = ScoreNormalizer(method="sigmoid")
        return normalizer.normalize(scores, {'k': 0.5, 'offset': mean})


def _calculate_skewness(scores: List[float]) -> float:
    """计算偏度"""
    if len(scores) < 3:
        return 0.0

    mean = np.mean(scores)
    std = np.std(scores)

    if std == 0:
        return 0.0

    n = len(scores)
    skewness = (n / ((n - 1) * (n - 2))) * sum(((x - mean) / std) ** 3 for x in scores)

    return skewness

