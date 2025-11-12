import { Toast } from 'antd-mobile';
import React, { useRef, useCallback, useEffect } from 'react';

import styles from './index.module.less';
import { convertToWav } from '../../../utils/audioConverter';

export interface RecordingStageProps {
  /** 是否显示波形 */
  showWaveform?: boolean;
  /** 录音完成回调 */
  onRecordingComplete?: (audioBlob: Blob) => void;
}

const RecordingStage: React.FC<RecordingStageProps> = ({
  showWaveform = true,
  onRecordingComplete,
}) => {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // 初始化音频上下文
  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioContextRef.current;
  }, []);

  // 实时音波可视化
  const drawWaveform = useCallback(() => {
    if (!analyserRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      analyser.getByteTimeDomainData(dataArray);

      // 清空画布（透明背景）
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 绘制音波
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#1890ff';
      ctx.beginPath();

      const sliceWidth = canvas.width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] - 128; // 转换为 -128 到 127，中心为 0
        const y = canvas.height / 2 + (v / 128.0) * (canvas.height / 2); // 居中并放大到整个画布高度

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.stroke();

      // 绘制中心线
      ctx.strokeStyle = '#e8e8e8';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, canvas.height / 2);
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();

      animationFrameRef.current = requestAnimationFrame(draw);
    };

    draw();
  }, []);

  // 停止音波绘制
  const stopWaveform = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  // 停止录音
  const handleStopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    stopWaveform();
  }, [stopWaveform]);

  // 开始录音
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const audioContext = initAudioContext();

      // 创建分析器用于实时音波显示
      if (showWaveform) {
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        analyserRef.current = analyser;

        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        // 开始实时音波绘制
        drawWaveform();
      }

      // 创建媒体录制器
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      const audioChunks: BlobPart[] = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const rawBlob = new Blob(audioChunks, { type: 'audio/webm' });

        // 停止音波绘制
        stopWaveform();

        // 停止所有音频轨道
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }

        try {
          // 转换为标准 WAV 格式
          const audioBlob = await convertToWav(rawBlob);
          onRecordingComplete?.(audioBlob);

        } catch (error) {
          console.error('音频转换失败:', error);
        }
      };

      mediaRecorder.start(100); // 每100ms收集一次数据

    } catch (error) {
      console.error('录音失败:', error);
      Toast.show({
        content: '录音失败，请检查麦克风权限',
        icon: 'fail',
      });
    }
  }, [showWaveform, initAudioContext, drawWaveform, onRecordingComplete, stopWaveform]);

  // 组件挂载时开始录音
  useEffect(() => {
    startRecording();

    // 清理资源
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      stopWaveform();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [startRecording, stopWaveform]);

  return (
    <div className={styles.recordingStage}>
      {/* 实时音波可视化 */}
      <div className={styles.waveformContainer}>
        <canvas
          ref={canvasRef}
          className={styles.waveformCanvas}
          width={400}
          height={120}
          onClick={handleStopRecording}
          style={{ cursor: 'pointer' }}
        />
      </div>
    </div>
  );
};

export default RecordingStage;
