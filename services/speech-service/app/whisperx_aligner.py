"""
WhisperX对齐器模块 - Step 2: WhisperX转录与音素对齐

使用WhisperX进行自动语音识别和精确的word/character级对齐。
结合phonemizer进行G2P转换，生成音素序列和时间戳。
"""

import os
import logging
from typing import List, Dict, Optional, Any, Tuple
from dataclasses import dataclass
import whisperx
from phonemizer import phonemize
import numpy as np

from audio_processor import AudioData

logger = logging.getLogger(__name__)


@dataclass
class PhonemeSegment:
    """音素片段数据结构"""
    phoneme: str      # 音素符号
    start: float      # 开始时间（秒）
    end: float        # 结束时间（秒）
    confidence: float # 置信度分数

    @property
    def duration(self) -> float:
        """音素持续时间"""
        return self.end - self.start


@dataclass
class WordSegment:
    """单词片段数据结构"""
    word: str                           # 单词文本
    start: float                        # 开始时间（秒）
    end: float                          # 结束时间（秒）
    confidence: float                   # 置信度分数
    phonemes: List[PhonemeSegment]      # 音素列表
    phoneme_text: str = ""              # 音素文本表示

    def __post_init__(self):
        if self.phonemes is None:
            self.phonemes = []

    @property
    def duration(self) -> float:
        """单词持续时间"""
        return self.end - self.start

    @property
    def phoneme_count(self) -> int:
        """音素数量"""
        return len(self.phonemes)


@dataclass
class AlignmentResult:
    """完整的对齐结果"""
    words: List[WordSegment]    # 单词列表
    duration: float             # 总时长
    transcript: str             # 转录文本
    phoneme_transcript: str     # 音素转录文本
    language: str               # 语言代码

    @property
    def word_count(self) -> int:
        """单词数量"""
        return len(self.words)

    @property
    def total_phonemes(self) -> int:
        """总音素数量"""
        return sum(word.phoneme_count for word in self.words)


class WhisperXAligner:
    """
    WhisperX对齐器类

    功能：
    1. 使用WhisperX进行语音转录
    2. 执行word/character级精确对齐
    3. G2P转换生成音素序列
    4. 推导音素级时间戳
    """

    # 支持的语言代码
    SUPPORTED_LANGUAGES = {
        "en": "en",
        "en-US": "en",
        "en-GB": "en",
        "zh": "zh",
        "zh-CN": "zh",
        "es": "es",
        "fr": "fr",
        "de": "de"
    }

    def __init__(self,
                 model_size: str = "small",
                 device: str = "cpu",
                 compute_type: str = "int8",
                 batch_size: int = 16):\

        """
        初始化WhisperX对齐器

        Args:
            model_size: Whisper模型大小 (tiny/base/small/medium/large)
            device: 计算设备 (cpu/cuda)
            compute_type: 计算类型 (int8/float16/float32)
            batch_size: 批处理大小
        """
        self.model_size = model_size
        self.device = device
        self.compute_type = compute_type
        self.batch_size = batch_size

        # 模型实例（延迟加载）
        self._whisper_model = None
        self._align_model = None
        self._align_metadata = None
        self._current_language = None

        # 设置espeak环境变量
        self._setup_espeak_environment()


    def align_audio(self,
                   audio_data: AudioData,
                   reference_text: str,
                   language: str = "en-US") -> AlignmentResult:
        """
        执行音频对齐

        Args:
            audio_data: 预处理后的音频数据
            reference_text: 参考文本
            language: 语言代码

        Returns:
            AlignmentResult: 完整的对齐结果
        """
        try:
            # 标准化语言代码
            base_lang = self._normalize_language_code(language)

            # 初始化模型
            self._initialize_models(base_lang)


            # Step 1: 使用参考文本进行强制对齐（不进行自由转录）

            # 直接使用参考文本，不进行自由转录
            reference_segments = [{
                "text": reference_text.strip(),
                "start": 0.0,
                "end": audio_data.duration
            }]

            # Step 2: G2P转换参考文本
            phoneme_segments = self._convert_reference_to_phonemes(reference_text, base_lang, audio_data.duration)
            logger.info(f"🔤 G2P转换完成，{phoneme_segments}")
            # Step 3: 执行强制对齐
            alignment_result = self._align_with_phonemes(
                audio_data, phoneme_segments, base_lang
            )
            # 输出全部alignment_result
            logger.info(f"🔤 对齐结果: {alignment_result}")

            # Step 4: 处理对齐结果
            words = self._process_alignment_results(
                alignment_result, reference_segments, phoneme_segments
            )

            # 构建最终结果
            result = AlignmentResult(
                words=words,
                duration=audio_data.duration,
                transcript=reference_text.strip(),  # 使用参考文本作为转录结果
                phoneme_transcript=" ".join([seg.get("phoneme_text", "") for seg in phoneme_segments]),
                language=language
            )


            return result

        except Exception as e:
            logger.error(f"❌ WhisperX对齐失败: {e}")
            raise

    def is_ready(self, language: str = "en") -> bool:
        """检查模型是否就绪"""
        try:
            base_lang = self._normalize_language_code(language)
            self._initialize_models(base_lang)
            return (self._whisper_model is not None and
                   self._align_model is not None)
        except Exception as e:
            logger.error(f"❌ 模型检查失败: {e}")
            return False

    def get_model_info(self) -> Dict[str, Any]:
        """获取模型信息"""
        return {
            "whisper_model": self.model_size,
            "align_model": "facebook/wav2vec2-lv-60-espeak-cv-ft",
            "device": self.device,
            "compute_type": self.compute_type,
            "batch_size": self.batch_size,
            "current_language": self._current_language,
            "supported_languages": list(self.SUPPORTED_LANGUAGES.keys())
        }

    def _setup_espeak_environment(self):
        """设置espeak环境变量"""
        if not os.environ.get('ESPEAK_DATA_PATH'):
            os.environ['ESPEAK_DATA_PATH'] = '/opt/homebrew/Cellar/espeak/1.48.04_1/share/espeak-data'

        if not os.environ.get('PHONEMIZER_ESPEAK_LIBRARY'):
            os.environ['PHONEMIZER_ESPEAK_LIBRARY'] = '/opt/homebrew/lib/libespeak.dylib'


    def _normalize_language_code(self, language: str) -> str:
        """标准化语言代码"""
        if language in self.SUPPORTED_LANGUAGES:
            return self.SUPPORTED_LANGUAGES[language]

        # 尝试提取基础语言代码
        base_lang = language.split('-')[0].lower()
        if base_lang in self.SUPPORTED_LANGUAGES.values():
            return base_lang

        logger.warning(f"⚠️ 不支持的语言代码: {language}，使用默认语言: en")
        return "en"

    def _initialize_models(self, language: str) -> None:
        """初始化WhisperX模型"""
        # 如果语言相同且模型已加载，跳过初始化
        if (self._current_language == language and
            self._whisper_model is not None and
            self._align_model is not None):
            return

        try:

            # 加载Whisper转录模型
            if self._whisper_model is None or self._current_language != language:
                logger.info(f"🔤 加载Whisper转录模型: {self.model_size}")
                self._whisper_model = whisperx.load_model(
                    self.model_size,
                    self.device,
                    compute_type=self.compute_type,
                    language=language
                )

            # 加载对齐模型
            if self._align_model is None or self._current_language != language:

                # 选择合适的对齐模型
                align_model_name = self._get_align_model_name(language)
                logger.info(f"🔤 加载对齐模型: {align_model_name}")
                self._align_model, self._align_metadata = whisperx.load_align_model(
                    model_name=align_model_name,
                    language_code=language,
                    device=self.device
                )

            self._current_language = language

        except Exception as e:
            logger.error(f"❌ 模型初始化失败: {e}")
            raise

    def _get_align_model_name(self, language: str) -> str:
        """根据语言选择对齐模型"""
        # 使用支持音素的wav2vec2模型
        if language in ["en"]:
            return "facebook/wav2vec2-lv-60-espeak-cv-ft"
        else:
            # 对于其他语言，使用通用模型
            return "facebook/wav2vec2-base-960h"

    def _transcribe_audio(self, audio_data: AudioData) -> Dict[str, Any]:
        """转录音频"""

        result = self._whisper_model.transcribe(
            audio_data.audio,
            batch_size=self.batch_size
        )

        segments = result.get("segments", [])

        for i, segment in enumerate(segments):
            text = segment.get("text", "").strip()
            start = segment.get("start", 0.0)
            end = segment.get("end", audio_data.duration)

        return result

    def _convert_to_phonemes(self, transcript_result: Dict[str, Any], language: str) -> List[Dict[str, Any]]:
        """将转录结果转换为音素"""

        segments = transcript_result.get("segments", [])
        phoneme_segments = []

        for segment in segments:
            text = segment.get("text", "").strip()
            if not text:
                continue

            try:
                # 使用phonemizer转换为音素
                phoneme_text = phonemize(
                    text,
                    language=language,
                    backend='espeak',
                    strip=True,
                    preserve_punctuation=False,
                    with_stress=True
                )


                phoneme_segments.append({
                    "text": text,
                    "phoneme_text": phoneme_text,
                    "start": segment.get("start", 0.0),
                    "end": segment.get("end", 0.0)
                })

            except Exception as e:
                logger.error(f"❌ G2P转换失败 '{text}': {e}")
                # 失败时使用原始文本
                phoneme_segments.append({
                    "text": text,
                    "phoneme_text": text,
                    "start": segment.get("start", 0.0),
                    "end": segment.get("end", 0.0)
                })

        return phoneme_segments

    def _convert_reference_to_phonemes(self, reference_text: str, language: str, duration: float) -> List[Dict[str, Any]]:
        """将参考文本转换为音素（用于强制对齐）"""

        try:
            # 使用phonemizer转换参考文本为音素
            phoneme_text = phonemize(
                reference_text,
                language=language,
                backend='espeak',
                strip=True,
                preserve_punctuation=False,
                with_stress=True
            )


            phoneme_segment = {
                "text": reference_text.strip(),
                "phoneme_text": phoneme_text,
                "start": 0.0,
                "end": duration
            }

            return [phoneme_segment]

        except Exception as e:
            logger.error(f"❌ 参考文本G2P转换失败 '{reference_text}': {e}")
            # 失败时使用原始文本
            return [{
                "text": reference_text.strip(),
                "phoneme_text": reference_text.strip(),
                "start": 0.0,
                "end": duration
            }]

    def _align_with_phonemes(self,
                           audio_data: AudioData,
                           phoneme_segments: List[Dict[str, Any]],
                           language: str) -> Dict[str, Any]:
        """使用音素进行对齐"""

        # 准备对齐输入
        align_segments = []
        for seg in phoneme_segments:
            align_segments.append({
                "text": seg["phoneme_text"],
                "start": seg["start"],
                "end": seg["end"]
            })
        # 执行对齐
        result = whisperx.align(
            align_segments,
            self._align_model,
            self._align_metadata,
            audio_data.audio,
            self.device,
            return_char_alignments=True
        )

        aligned_segments = result.get("segments", [])

        return result

    def _process_alignment_results(self,
                                 alignment_result: Dict[str, Any],
                                 reference_segments: List[Dict[str, Any]],
                                 phoneme_segments: List[Dict[str, Any]]) -> List[WordSegment]:
        """处理对齐结果，生成单词和音素片段"""

        words = []
        aligned_segments = alignment_result.get("segments", [])

        # 创建参考文本到音素文本的映射
        text_to_phoneme_map = {}
        phoneme_to_text_map = {}

        for ref_seg, phone_seg in zip(reference_segments, phoneme_segments):
            ref_text = ref_seg.get("text", "").strip()
            phone_text = phone_seg.get("phoneme_text", "").strip()
            if ref_text and phone_text:
                text_to_phoneme_map[ref_text] = phone_text
                phoneme_to_text_map[phone_text] = ref_text

        # 处理每个对齐片段
        for segment in aligned_segments:
            segment_words = segment.get("words", [])
            segment_chars = segment.get("chars", [])

            for word_info in segment_words:
                phoneme_word = word_info.get("word", "").strip()
                if not phoneme_word:
                    continue

                # 获取参考单词
                reference_word = self._find_reference_word(phoneme_word, phoneme_to_text_map)

                word_start = word_info.get("start", 0.0)
                word_end = word_info.get("end", word_start + 0.1)
                word_score = word_info.get("score", 0.0)

                # 提取该单词的音素
                phonemes = self._extract_word_phonemes(
                    word_info, segment_chars, phoneme_word
                )

                word_segment = WordSegment(
                    word=reference_word,
                    start=word_start,
                    end=word_end,
                    confidence=word_score,
                    phonemes=phonemes,
                    phoneme_text=phoneme_word
                )

                words.append(word_segment)


        return words

    def _find_reference_word(self, phoneme_word: str, phoneme_to_text_map: Dict[str, str]) -> str:
        """查找音素对应的参考单词"""
        # 直接映射查找
        if phoneme_word in phoneme_to_text_map:
            return phoneme_to_text_map[phoneme_word]

        # 模糊匹配（简单实现）
        for phoneme_text, original_text in phoneme_to_text_map.items():
            if phoneme_word in phoneme_text or phoneme_text in phoneme_word:
                # 进一步匹配单词
                phoneme_words = phoneme_text.split()
                original_words = original_text.split()
                if len(phoneme_words) == len(original_words):
                    for p_word, o_word in zip(phoneme_words, original_words):
                        if p_word == phoneme_word:
                            return o_word

        # 如果找不到，返回音素文本
        return phoneme_word

    def _extract_word_phonemes(self,
                             word_info: Dict[str, Any],
                             segment_chars: List[Dict[str, Any]],
                             phoneme_word: str) -> List[PhonemeSegment]:
        """从字符级对齐中提取单词的音素"""
        phonemes = []

        word_start = word_info.get("start", 0.0)
        word_end = word_info.get("end", word_start + 0.1)

        # 找到属于该单词的字符
        word_chars = []
        for char_info in segment_chars:
            char_start = char_info.get("start")
            char_end = char_info.get("end")

            if (char_start is not None and char_end is not None and
                char_start >= word_start - 0.05 and char_end <= word_end + 0.05):
                char = char_info.get("char", "").strip()
                if char and char != " ":  # 过滤空格
                    word_chars.append(char_info)

        # 将字符转换为音素片段
        for char_info in word_chars:
            char = char_info.get("char", "").strip()
            char_start = char_info.get("start", word_start)
            char_end = char_info.get("end", char_start + 0.05)
            char_score = char_info.get("score", 0.0)

            # 处理异常低的置信度
            if char_score < 0.1:
                valid_scores = [c.get("score", 0.0) for c in word_chars if c.get("score", 0.0) > 0.1]
                char_score = sum(valid_scores) / len(valid_scores) if valid_scores else 0.5

            phonemes.append(PhonemeSegment(
                phoneme=char,
                start=char_start,
                end=char_end,
                confidence=char_score
            ))

        return phonemes


def create_whisperx_aligner(model_size: str = "small",
                          device: str = "cpu",
                          compute_type: str = "int8",
                          batch_size: int = 16) -> WhisperXAligner:
    """
    创建WhisperX对齐器实例的工厂函数

    Args:
        model_size: Whisper模型大小
        device: 计算设备
        compute_type: 计算类型
        batch_size: 批处理大小

    Returns:
        WhisperXAligner: 对齐器实例
    """
    return WhisperXAligner(
        model_size=model_size,
        device=device,
        compute_type=compute_type,
        batch_size=batch_size
    )
