# 跟读组件 (FollowRead)

一个功能完整的跟读练习组件，支持录音、波形显示、发音评估等功能。

## 功能特性

- 🎤 **录音功能**: 支持浏览器原生录音 API
- 📊 **实时波形**: 录音时显示音频波形可视化
- 🎯 **发音评估**: 集成后端语音评估服务
- 📱 **移动端优化**: 基于 antd-mobile 设计
- 🎨 **主题支持**: 支持明暗主题切换
- 📊 **详细评分**: 提供音素级别的详细评估结果

## 组件结构

### 基础组件

- `FollowRead` - 基础跟读组件
- `FollowReadModal` - 模态框封装的跟读组件

### 网络服务

- `SpeechService` - 语音评估 API 服务

## 使用方法

### 1. 基础跟读组件

```tsx
import { FollowRead } from '@/components';

function MyComponent() {
  const handleAssessmentComplete = (result) => {
    console.log('发音评估结果:', result);
  };

  return (
    <FollowRead
      referenceText="Hello, how are you today?"
      showWaveform={true}
      maxDuration={10}
      onAssessmentComplete={handleAssessmentComplete}
    />
  );
}
```

### 2. 模态框跟读组件

```tsx
import { FollowReadModal } from '@/components';

function MyComponent() {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <Button onClick={() => setShowModal(true)}>开始跟读练习</Button>

      <FollowReadModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        title="跟读练习"
        referenceText="The quick brown fox jumps over the lazy dog."
        showWaveform={true}
        maxDuration={15}
        onAssessmentComplete={(result) => {
          console.log('评估结果:', result);
        }}
      />
    </>
  );
}
```

## API 参考

### FollowReadProps

| 属性                 | 类型                               | 默认值 | 说明               |
| -------------------- | ---------------------------------- | ------ | ------------------ |
| referenceText        | string                             | -      | 参考文本（必需）   |
| showWaveform         | boolean                            | true   | 是否显示波形       |
| maxDuration          | number                             | 10     | 录音时长限制（秒） |
| referenceAudioUrl    | string                             | -      | 参考音频URL        |
| onRecordingComplete  | (blob: Blob) => void               | -      | 录音完成回调       |
| onAssessmentComplete | (result: AssessmentResult) => void | -      | 评估完成回调       |
| disabled             | boolean                            | false  | 是否禁用           |
| className            | string                             | -      | 自定义样式类名     |

### FollowReadModalProps

继承 `FollowReadProps` 的所有属性，额外包含：

| 属性                | 类型       | 默认值     | 说明                     |
| ------------------- | ---------- | ---------- | ------------------------ |
| visible             | boolean    | -          | 是否显示模态框           |
| onClose             | () => void | -          | 关闭模态框回调           |
| title               | string     | '跟读练习' | 模态框标题               |
| showCloseButton     | boolean    | true       | 是否显示关闭按钮         |
| autoCloseOnComplete | boolean    | false      | 是否在评估完成后自动关闭 |
| closeButtonText     | string     | '关闭'     | 关闭按钮文本             |

### AssessmentResult

发音评估结果类型：

```typescript
interface AssessmentResult {
  overallScore: number; // 总体得分 (0-100)
  accuracyScore: number; // 准确性得分 (0-100)
  fluencyScore: number; // 流利度得分 (0-100)
  completenessScore: number; // 完整性得分 (0-100)
  duration: number; // 音频时长（秒）
  wordCount: number; // 单词数量
  phonemeCount: number; // 音素数量
  words: WordDetail[]; // 单词级详细信息
  gopStatistics?: {
    // GOP 统计信息
    meanGop: number;
    stdGop: number;
    minGop: number;
    maxGop: number;
  };
  errorPhonemes?: string[]; // 错误音素列表
}
```

## 样式定制

组件使用 CSS Modules，可以通过以下方式定制样式：

```less
// 自定义跟读组件样式
.myFollowRead {
  :global(.followRead) {
    .card {
      border-radius: 16px;
    }

    .recordButton {
      background: linear-gradient(45deg, #ff6b6b, #4ecdc4);
    }
  }
}
```

## 注意事项

1. **浏览器兼容性**: 需要支持 `getUserMedia` API 的现代浏览器
2. **HTTPS 要求**: 录音功能需要在 HTTPS 环境下使用
3. **权限管理**: 首次使用需要用户授权麦克风权限
4. **网络依赖**: 发音评估功能依赖后端语音服务

## 示例页面

- `pages/follow-read-simple` - 简单使用示例
- `pages/follow-read-demo` - 完整功能演示

## 技术栈

- React 18
- TypeScript
- antd-mobile
- react-icons
- CSS Modules
- Web Audio API
- MediaRecorder API
