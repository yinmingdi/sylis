"""
WhisperX + Phonemizer alignment implementation for phoneme-level speech assessment.

This module uses WhisperX for transcription and alignment, combined with phonemizer
to convert text to phonemes for detailed phoneme-level timing information.
"""

import os
import logging
from typing import List, Dict, Optional, Any
from dataclasses import dataclass
import whisperx
from phonemizer import phonemize

logger = logging.getLogger(__name__)

# 设置espeak环境变量
def _setup_espeak_environment():
    """设置espeak环境变量以确保phonemizer能正常工作"""
    if not os.environ.get('ESPEAK_DATA_PATH'):
        os.environ['ESPEAK_DATA_PATH'] = '/opt/homebrew/Cellar/espeak/1.48.04_1/share/espeak-data'

    if not os.environ.get('PHONEMIZER_ESPEAK_LIBRARY'):
        os.environ['PHONEMIZER_ESPEAK_LIBRARY'] = '/opt/homebrew/lib/libespeak.dylib'


# 在模块加载时设置环境变量
_setup_espeak_environment()

# Global model instances for reuse
_whisper_model = None
_align_model = None
_align_metadata = None
_device = "cpu"
_compute_type = "int8"
_batch_size = 16


@dataclass
class PhonemeSegment:
    """Represents a single phoneme with timing and confidence."""
    phoneme: str
    start: float
    end: float
    confidence: float = 0.0


@dataclass
class WordSegment:
    """Represents a word with its phonemes and timing."""
    word: str
    start: float
    end: float
    confidence: float = 0.0
    phonemes: List[PhonemeSegment] = None

    def __post_init__(self):
        if self.phonemes is None:
            self.phonemes = []


@dataclass
class AlignmentResult:
    """Complete alignment result with words and phonemes."""
    words: List[WordSegment]
    duration: float
    transcript: str = ""


def _initialize_models(language: str = "en") -> None:
    """Initialize WhisperX models for transcription and alignment."""
    global _whisper_model, _align_model, _align_metadata, _device

    try:

        # Initialize Whisper model for transcription
        if _whisper_model is None:
            _whisper_model = whisperx.load_model(
                "small",
                _device,
                compute_type=_compute_type,
                language=language
            )

        # Initialize alignment model with phoneme support
        if _align_model is None or _align_metadata is None:
            # Use Facebook's wav2vec2-lv-60-espeak-cv-ftmodel for phoneme alignment
            language_code = language if language in ["en", "es", "fr", "de"] else "en"

            _align_model, _align_metadata = whisperx.load_align_model(
                model_name="facebook/wav2vec2-lv-60-espeak-cv-ft",
                language_code=language_code,
                device=_device
            )

    except Exception as e:
        logger.error(f"❌ 模型初始化失败: {e}")
        raise




def _extract_phonemes_from_chars(char_alignments: List[Dict], word_text: str) -> List[PhonemeSegment]:
    """Extract phoneme segments from character-level alignments."""
    phonemes = []

    if not char_alignments:
        return phonemes

    # 过滤掉空格字符，只保留实际的音素字符
    valid_chars = [char for char in char_alignments if char.get('char', '').strip() and char.get('char') != ' ']

    if not valid_chars:
        return phonemes

    # 每个字符作为一个音素
    for char_info in valid_chars:
        char = char_info.get('char', '').strip()
        char_start = char_info.get('start')
        char_end = char_info.get('end')
        char_score = char_info.get('score', 0.0)

        if char and char_start is not None and char_end is not None:
            # 处理异常低的置信度分数
            if char_score < 0.1:  # 如果置信度太低，使用平均置信度
                all_scores = [c.get('score', 0.0) for c in valid_chars if c.get('score', 0.0) > 0.1]
                if all_scores:
                    char_score = sum(all_scores) / len(all_scores)
                else:
                    char_score = 0.5  # 默认置信度

            phonemes.append(PhonemeSegment(
                phoneme=char,
                start=char_start,
                end=char_end,
                confidence=char_score
            ))

    return phonemes


def run_mfa_alignment(audio_path: str, reference_text: str, language: str = "en-US") -> AlignmentResult:
    """
    Run WhisperX alignment with phoneme support.

    Args:
        audio_path: Path to the audio file
        reference_text: Reference text to align against
        language: Language code (e.g., "en-US", "es", "fr")

    Returns:
        AlignmentResult with word and phoneme level alignments
    """
    try:
        # Extract base language code
        base_lang = language.split('-')[0] if '-' in language else language

        # Initialize models
        _initialize_models(base_lang)


        # Load audio
        audio = whisperx.load_audio(audio_path)
        audio_duration = len(audio) / 16000.0  # Assuming 16kHz sample rate

        # 1. Transcribe with original whisper (batched)
        transcript_result = _whisper_model.transcribe(audio, batch_size=_batch_size)
        segments = transcript_result.get("segments", [])

        if not segments:
            logger.warning("⚠️ Whisper 未生成任何转录片段")
            return AlignmentResult(words=[], duration=audio_duration, transcript="")


        # 2. Use phonemize to get the transcript in terms of phonemes
        phone_transcript = []

        for segment in segments:
            segment_text = segment.get("text", "").strip()
            if not segment_text:
                continue

            # Use phonemize to convert segment text to phonemes (按照示例的方式)
            try:
                phoneme_text = phonemize(
                    segment_text,
                    language=base_lang,
                    backend='espeak',
                    strip=True,
                    preserve_punctuation=False,
                    with_stress=False
                )
            except Exception as e:
                logger.error(f"❌ phonemizer转换失败: {e}")
                # 如果phonemizer失败，使用原始文本
                phoneme_text = segment_text

            phone_transcript.append({
                "text": phoneme_text,
                "start": segment.get("start", 0.0),
                "end": segment.get("end", audio_duration)
            })

        if not phone_transcript:
            logger.warning("⚠️ 音素转换后无有效片段")
            return AlignmentResult(words=[], duration=audio_duration, transcript="")


        # 3. Align whisper output using phoneme transcript
        alignment_result = whisperx.align(
            phone_transcript,
            _align_model,
            _align_metadata,
            audio,
            _device,
            return_char_alignments=True
        )

        aligned_segments = alignment_result.get("segments", [])

        # 4. Process alignment results
        words = []
        full_transcript = ""

        # 创建原始文本到音素文本的映射
        original_to_phoneme = {}
        for i, segment in enumerate(segments):
            original_text = segment.get("text", "").strip()
            if original_text and i < len(phone_transcript):
                phoneme_text = phone_transcript[i]["text"]
                original_to_phoneme[phoneme_text] = original_text

        # 创建单词级别的映射
        word_mapping = {}
        for orig_text, phoneme_text in original_to_phoneme.items():
            orig_words = orig_text.split()
            phoneme_words = phoneme_text.split()
            if len(orig_words) == len(phoneme_words):
                for orig_word, phoneme_word in zip(orig_words, phoneme_words):
                    word_mapping[phoneme_word] = orig_word

        for segment in aligned_segments:
            segment_words = segment.get("words", [])
            segment_chars = segment.get("chars", [])

            for word_info in segment_words:
                phoneme_word = word_info.get("word", "").strip()
                if not phoneme_word:
                    continue

                # 获取原始单词文本
                original_word = word_mapping.get(phoneme_word, phoneme_word)

                word_start = word_info.get("start", 0.0)
                word_end = word_info.get("end", word_start + 0.1)
                word_score = word_info.get("score", 0.0)

                # Extract phonemes from character alignments for this word
                # Find character alignments that belong to this word
                word_chars = []
                for char_info in segment_chars:
                    char_start = char_info.get("start")
                    char_end = char_info.get("end")

                    # Check if character timing overlaps with word timing
                    if (char_start is not None and char_end is not None and
                        char_start >= word_start - 0.05 and char_end <= word_end + 0.05):
                        word_chars.append(char_info)

                phonemes = _extract_phonemes_from_chars(word_chars, phoneme_word)

                word_segment = WordSegment(
                    word=original_word,  # 使用原始单词文本
                    start=word_start,
                    end=word_end,
                    confidence=word_score,
                    phonemes=phonemes
                )

                words.append(word_segment)
                full_transcript += original_word + " "


        result = AlignmentResult(
            words=words,
            duration=audio_duration,
            transcript=full_transcript.strip()
        )


        return result

    except Exception as e:
        logger.error(f"❌ WhisperX 对齐失败: {e}")
        raise


def is_mfa_ready() -> bool:
    """Check if WhisperX models are ready."""
    try:
        _initialize_models()
        return _whisper_model is not None and _align_model is not None
    except Exception as e:
        logger.error(f"❌ 模型检查失败: {e}")
        return False


def get_mfa_instance():
    """Get the current WhisperX model instance for health checks."""
    class WhisperXInfo:
        def __init__(self):
            self.language = "en"
            self.model_name = "whisperx-small + facebook/wav2vec2-base-960h"
            self.device = _device

    return WhisperXInfo()
