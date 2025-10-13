"""
MFA 音素对齐器 - 基于 Kaldi 的 dnn-aligner 实现

Montreal Forced Aligner (MFA) 内部使用 Kaldi 工具链，提供精确的音素级对齐。
这个模块封装了 MFA 的对齐功能，用于语音评分系统。

技术原理：
1. 使用 MFA 的预训练声学模型和发音词典
2. 通过 Kaldi 的 GMM-HMM 或 DNN-HMM 模型进行强制对齐
3. 输出音素级别的时间边界信息
4. 为后续的 DNN 评分模型提供对齐数据
"""

import os
import sys
import logging
import tempfile
import shutil
import subprocess
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
from pathlib import Path

# 导入 MFA 相关库
try:
    from montreal_forced_aligner import config
    from montreal_forced_aligner.alignment import PretrainedAligner
    from montreal_forced_aligner.models import AcousticModel
    MFA_AVAILABLE = True
except ImportError:
    MFA_AVAILABLE = False
    logging.warning("MFA not available, will use fallback alignment")

logger = logging.getLogger(__name__)


@dataclass
class PhonemeAlignment:
    """音素对齐结果"""
    phoneme: str          # 音素符号（如 'IH', 'T', 'S' 等）
    start_time: float     # 开始时间（秒）
    end_time: float       # 结束时间（秒）
    duration: float       # 持续时间（秒）
    word: str             # 所属单词


@dataclass
class WordAlignment:
    """单词对齐结果"""
    word: str             # 单词文本
    start_time: float     # 开始时间（秒）
    end_time: float       # 结束时间（秒）
    duration: float       # 持续时间（秒）
    phonemes: List[PhonemeAlignment]  # 音素列表


@dataclass
class AlignmentResult:
    """完整对齐结果"""
    words: List[WordAlignment]        # 单词级对齐
    phonemes: List[PhonemeAlignment]  # 音素级对齐
    total_duration: float              # 总时长
    success: bool                      # 对齐是否成功
    error_message: Optional[str] = None


class MFAAligner:
    """
    MFA 音素对齐器

    使用 Montreal Forced Aligner 进行音素级语音对齐。
    MFA 内部使用 Kaldi 的 GMM-HMM 和 DNN-HMM 模型。

    特点：
    - 使用预训练的英语声学模型
    - 支持美式和英式英语发音
    - 提供音素级和单词级对齐
    - 输出标准的 ARPAbet 音素集
    """

    def __init__(
        self,
        acoustic_model: str = "english_us_arpa",
        dictionary: str = "english_us_arpa",
        use_gpu: bool = False
    ):
        """
        初始化 MFA 对齐器

        Args:
            acoustic_model: 声学模型名称（默认使用美式英语）
            dictionary: 发音词典名称
            use_gpu: 是否使用 GPU 加速（需要 CUDA 支持）
        """
        if not MFA_AVAILABLE:
            raise RuntimeError(
                "Montreal Forced Aligner not installed. "
                "Please install it: conda install -c conda-forge montreal-forced-aligner"
            )

        self.acoustic_model_name = acoustic_model
        self.dictionary_name = dictionary
        self.use_gpu = use_gpu
        self.aligner = None
        self._initialized = False

        logger.info(f"创建 MFA 对齐器: 模型={acoustic_model}, 词典={dictionary}")

    def initialize(self) -> bool:
        """
        初始化对齐器，下载并加载必要的模型

        Returns:
            bool: 初始化是否成功
        """
        if self._initialized:
            return True

        try:
            logger.info("初始化 MFA 对齐器...")

            # 设置 MFA 配置
            config.USE_MP = False  # 禁用多进程（避免 FastAPI 冲突）

            # 检查模型是否存在（MFA 2.0+ 会自动下载）
            # PretrainedAligner 需要在 align() 时创建，因为它需要 corpus_directory
            # 这里只做基本的配置检查

            # 验证模型名称是否有效
            if not self.acoustic_model_name or not self.dictionary_name:
                raise ValueError("声学模型和词典名称不能为空")

            logger.info(f"  声学模型: {self.acoustic_model_name}")
            logger.info(f"  发音词典: {self.dictionary_name}")

            self._initialized = True
            logger.info("✅ MFA 对齐器初始化成功")
            return True

        except Exception as e:
            logger.error(f"❌ MFA 对齐器初始化失败: {e}")
            return False

    def _get_aligner_config(self) -> Dict:
        """获取对齐器配置"""
        return {
            "num_jobs": 1,  # FastAPI 环境下使用单进程
            "clean": True,  # 自动清理临时文件
            "verbose": False,
            "debug": False,
            "use_postgres": False,  # 不使用 PostgreSQL（简化部署）
        }

    def align(
        self,
        audio_path: str,
        text: str
    ) -> AlignmentResult:
        """
        对音频和文本进行强制对齐

        Args:
            audio_path: 音频文件路径（WAV 格式，16kHz，单声道）
            text: 参考文本

        Returns:
            AlignmentResult: 对齐结果
        """
        if not self._initialized:
            if not self.initialize():
                return AlignmentResult(
                    words=[],
                    phonemes=[],
                    total_duration=0.0,
                    success=False,
                    error_message="MFA 对齐器初始化失败"
                )

        # 创建临时工作目录
        temp_dir = tempfile.mkdtemp(prefix="mfa_align_")

        try:
            # 准备输入文件
            corpus_dir = os.path.join(temp_dir, "corpus")
            output_dir = os.path.join(temp_dir, "output")
            os.makedirs(corpus_dir, exist_ok=True)
            os.makedirs(output_dir, exist_ok=True)

            # 复制音频文件到临时目录
            audio_name = Path(audio_path).stem
            temp_audio = os.path.join(corpus_dir, f"{audio_name}.wav")
            shutil.copy2(audio_path, temp_audio)

            # 创建文本文件
            temp_text = os.path.join(corpus_dir, f"{audio_name}.txt")
            with open(temp_text, 'w', encoding='utf-8') as f:
                f.write(text)

            logger.info(f"开始对齐: 音频={audio_path}, 文本='{text}'")

            # 使用 MFA 命令行工具（更稳定）
            # MFA 3.x 的 Python API 有严重bug，改用命令行
            logger.info(f"使用 MFA 命令行工具进行对齐...")
            logger.info(f"  声学模型: {self.acoustic_model_name}")
            logger.info(f"  词典: {self.dictionary_name}")
            logger.info(f"  语料目录: {corpus_dir}")
            logger.info(f"  输出目录: {output_dir}")

            # 构建 MFA 命令 - 使用 conda 环境中的 python
            # 找到 mfa 模块路径
            import montreal_forced_aligner
            mfa_module_path = Path(montreal_forced_aligner.__file__).parent

            cmd = [
                sys.executable,
                "-m", "montreal_forced_aligner.command_line.mfa",
                "align",
                "--single_speaker",
                "--clean",
                "--overwrite",
                corpus_dir,
                self.dictionary_name,
                self.acoustic_model_name,
                output_dir
            ]

            # 执行 MFA 对齐命令

            # 执行对齐
            try:
                import subprocess
                result = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=120,  # 增加超时时间
                    env=os.environ.copy()
                )

                if result.returncode != 0:
                    logger.error(f"MFA 对齐失败 (返回码 {result.returncode}):")
                    logger.error(f"stdout: {result.stdout[-500:]}")  # 只显示最后500字符
                    logger.error(f"stderr: {result.stderr[-500:]}")
                    raise RuntimeError(f"MFA align 失败")

                logger.info(f"✅ MFA 对齐执行成功")

            except subprocess.TimeoutExpired:
                logger.error(f"MFA 对齐超时")
                raise RuntimeError("MFA 对齐超时（120秒）")
            except Exception as e:
                logger.error(f"❌ MFA 对齐失败: {e}")
                raise

            # 解析对齐结果
            # MFA 3.x 会在 temporary_directory 下创建输出
            # 尝试不同的可能路径
            possible_paths = [
                os.path.join(output_dir, f"{audio_name}.TextGrid"),
                os.path.join(temp_dir, f"{audio_name}.TextGrid"),
                os.path.join(temp_dir, "output", f"{audio_name}.TextGrid"),
                os.path.join(corpus_dir, f"{audio_name}.TextGrid"),
            ]

            textgrid_path = None
            for path in possible_paths:
                if os.path.exists(path):
                    textgrid_path = path
                    break

            if not textgrid_path:
                # 列出临时目录的内容
                logger.error(f"未找到 TextGrid 文件，列出目录内容:")
                for root, dirs, files in os.walk(temp_dir):
                    logger.error(f"  目录: {root}")
                    for f in files:
                        logger.error(f"    文件: {f}")
                raise FileNotFoundError("对齐失败，未生成 TextGrid 文件")

            result = self._parse_textgrid(textgrid_path)

            logger.info(f"✅ 对齐成功: {len(result.words)} 个单词, {len(result.phonemes)} 个音素")

            return result

        except Exception as e:
            logger.error(f"❌ 对齐失败: {e}")
            return AlignmentResult(
                words=[],
                phonemes=[],
                total_duration=0.0,
                success=False,
                error_message=str(e)
            )

        finally:
            # 清理临时文件
            try:
                shutil.rmtree(temp_dir, ignore_errors=True)
            except Exception as e:
                logger.warning(f"清理临时文件失败: {e}")

    def _parse_textgrid(self, textgrid_path: str) -> AlignmentResult:
        """
        解析 TextGrid 文件

        MFA 生成的 TextGrid 包含三层：
        - words: 单词级对齐
        - phones: 音素级对齐

        Args:
            textgrid_path: TextGrid 文件路径

        Returns:
            AlignmentResult: 解析后的对齐结果
        """
        try:
            import textgrid
        except ImportError:
            # 如果没有 textgrid 库，使用 praatio（MFA 依赖）
            from praatio import textgrid as tg

            tg_obj = tg.openTextgrid(textgrid_path, includeEmptyIntervals=False)

            words = []
            phonemes = []

            # 解析单词层
            word_tier = tg_obj.getTier('words')
            for entry in word_tier.entries:
                if entry.label:  # 跳过静音
                    word_align = WordAlignment(
                        word=entry.label,
                        start_time=entry.start,
                        end_time=entry.end,
                        duration=entry.end - entry.start,
                        phonemes=[]
                    )
                    words.append(word_align)

            # 解析音素层 - 修复音素分配逻辑
            phone_tier = tg_obj.getTier('phones')

            # 收集所有有效音素（跳过静音）
            phone_entries = []
            for entry in phone_tier.entries:
                if entry.label and entry.label not in ['', 'sp', 'sil']:
                    phone_entries.append(entry)

            # 为每个单词分配音素（基于时间重叠）
            phoneme_idx = 0
            for word in words:
                word_start = word.start_time
                word_end = word.end_time

                # 找到属于这个单词的所有音素
                while phoneme_idx < len(phone_entries):
                    phone_entry = phone_entries[phoneme_idx]
                    phone_start = phone_entry.start
                    phone_end = phone_entry.end
                    phone_mid = (phone_start + phone_end) / 2  # 使用音素中点判断归属

                    # 如果音素中点在单词时间范围内，则归属于该单词
                    if phone_mid >= word_start and phone_mid <= word_end + 0.01:
                        phoneme_align = PhonemeAlignment(
                            phoneme=phone_entry.label,
                            start_time=phone_start,
                            end_time=phone_end,
                            duration=phone_end - phone_start,
                            word=word.word
                        )
                        word.phonemes.append(phoneme_align)
                        phonemes.append(phoneme_align)
                        phoneme_idx += 1
                    elif phone_mid < word_start:
                        # 音素在当前单词之前，跳过
                        phoneme_idx += 1
                    else:
                        # 音素在当前单词之后，处理下一个单词
                        break

            total_duration = phonemes[-1].end_time if phonemes else 0.0

            return AlignmentResult(
                words=words,
                phonemes=phonemes,
                total_duration=total_duration,
                success=True
            )

        except Exception as e:
            logger.error(f"解析 TextGrid 失败: {e}")
            raise


def create_mfa_aligner(
    acoustic_model: str = "english_us_arpa",
    dictionary: str = "english_us_arpa",
    use_gpu: bool = False
) -> MFAAligner:
    """
    创建 MFA 对齐器的工厂函数

    Args:
        acoustic_model: 声学模型名称
        dictionary: 发音词典名称
        use_gpu: 是否使用 GPU

    Returns:
        MFAAligner: 对齐器实例
    """
    return MFAAligner(
        acoustic_model=acoustic_model,
        dictionary=dictionary,
        use_gpu=use_gpu
    )

