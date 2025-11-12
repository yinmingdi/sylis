# 语音评估服务调试指南

## 问题描述

前端调用语音评估接口时出现 400 Bad Request 错误。

## 问题原因

经过分析，发现以下几个可能导致 400 错误的原因：

### 1. 音频格式问题（主要原因）

**问题**：`MediaRecorder` API 录制的音频格式并非真正的 WAV 格式。

- 浏览器的 `MediaRecorder` 通常生成 WebM、Opus 或其他压缩格式
- 即使设置 `type: 'audio/wav'`，实际编码格式仍然不是标准 WAV
- 后端和 Python 语音服务期望接收标准的 WAV 格式（PCM 编码）

**解决方案**：在前端添加音频格式转换工具 `audioConverter.ts`，将录音转换为标准 WAV 格式。

### 2. ValidationPipe 配置过于严格

**问题**：NestJS 的 `ValidationPipe` 配置了 `forbidNonWhitelisted: true`。

- FormData 提交时可能包含一些额外的元数据字段
- 这些字段不在 DTO 中定义，会被拒绝

**解决方案**：将 `forbidNonWhitelisted` 设置为 `false`，并启用 `enableImplicitConversion`。

### 3. FormData 类型转换问题

**问题**：FormData 中的所有字段都是字符串类型。

- `enablePhonemeDetail` 字段在 DTO 中定义为 `boolean`
- FormData 发送的是字符串 `"true"` 或 `"false"`
- 类型验证失败

**解决方案**：在 DTO 中使用 `@Transform` 装饰器进行类型转换。

## 修改内容

### 前端修改

#### 1. 新增音频转换工具（`apps/web/src/utils/audioConverter.ts`）

```typescript
export async function convertToWav(audioBlob: Blob): Promise<Blob>;
```

功能：

- 将任意音频格式转换为标准 WAV 格式（PCM 16-bit）
- 使用 Web Audio API 解码音频
- 生成符合 RIFF WAV 标准的文件

#### 2. 更新 FollowRead 组件

修改文件：`apps/web/src/components/follow-read/FollowRead.tsx`

变更：

- 导入 `convertToWav` 工具函数
- 在 `mediaRecorder.onstop` 中调用 `convertToWav`
- 添加转换进度提示

### 后端修改

#### 1. 更新 ValidationPipe 配置（`apps/api/src/main.ts`）

```typescript
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false, // 允许额外字段
    transform: true,
    transformOptions: {
      enableImplicitConversion: true, // 启用隐式转换
    },
  }),
);
```

#### 2. 更新 DTO（`apps/api/src/modules/speech/dto/pronunciation-assess-req.dto.ts`）

```typescript
@Transform(({ value }) => {
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  return Boolean(value);
})
enablePhonemeDetail?: boolean | string = true;
```

#### 3. 增强日志记录（`apps/api/src/modules/speech/speech.controller.ts`）

添加详细的调试日志：

- 请求参数
- 音频文件信息（文件名、大小、MIME 类型）
- 各种验证错误的详细信息

## 调试步骤

### 1. 检查后端日志

启动 API 服务后，查看控制台输出：

```bash
cd apps/api
pnpm dev
```

关注以下日志：

- ✅ `收到发音评估请求` - 确认请求到达
- ✅ `请求体参数` - 检查 DTO 参数
- ✅ `音频文件信息` - 确认音频文件正确上传
- ❌ 错误日志 - 查看具体的验证失败原因

### 2. 检查前端请求

打开浏览器开发者工具：

1. **Network 面板**：
   - 找到 `/speech/pronunciation/assess` 请求
   - 查看 Request Headers 中的 `Content-Type`（应该是 `multipart/form-data`）
   - 查看 Request Payload 中的表单数据

2. **Console 面板**：
   - 查看是否有 JavaScript 错误
   - 查看音频转换相关的日志

### 3. 验证音频文件

如果仍然出现问题，可以手动验证生成的 WAV 文件：

```javascript
// 在浏览器控制台执行
const blob = /* 获取转换后的 blob */;
const url = URL.createObjectURL(blob);
const audio = new Audio(url);
audio.play(); // 测试是否可以播放
```

### 4. 检查 Python 语音服务

确认 Python 服务正在运行：

```bash
curl http://localhost:8080/health
```

应该返回：

```json
{
  "status": "healthy",
  "model": "WeNet"
}
```

## 常见错误及解决方案

### Error: "音频文件是必需的"

**原因**：后端未接收到音频文件

**检查**：

1. FormData 中的字段名是否为 `audio`
2. NestJS 的 `FileInterceptor` 配置是否正确
3. 前端是否正确设置了 `Content-Type`（让浏览器自动设置）

### Error: "只支持WAV格式的音频文件"

**原因**：文件名不是 `.wav` 结尾，或 MIME 类型不正确

**检查**：

1. 前端是否使用了 `convertToWav` 函数
2. FormData.append 的文件名是否包含 `.wav` 扩展名
3. 转换后的 Blob 的 type 是否为 `audio/wav`

### Error: "参考文本不能为空"

**原因**：`referenceText` 字段缺失或为空

**检查**：

1. 前端是否正确传递了 `referenceText`
2. DTO 验证是否通过

### Error: 422 Unprocessable Entity (验证失败)

**原因**：NestJS ValidationPipe 验证失败

**常见情况**：

1. **DTO 类型验证失败**：
   - FormData 发送的所有字段都是字符串
   - `@Transform` 装饰器在 multipart/form-data 中可能不生效
   - `@IsBoolean()` 验证器拒绝字符串值

2. **必需字段缺失**：
   - `referenceText` 字段未发送或为空

3. **字段名称不匹配**：
   - 前端发送的字段名与后端期望的不一致

**解决方案**：

改用手动参数提取：

```typescript
async assessPronunciation(
  @UploadedFile() audio: any,
  @Body('referenceText') referenceText: string,
  @Body('language') language?: string,
  @Body('enablePhonemeDetail') enablePhonemeDetail?: string,
)
```

在 controller 中手动构建 DTO 并进行类型转换。

### Error: 422 Unprocessable Entity（来自 Python 服务）

**原因**：NestJS 后端向 Python 服务发送的参数名不匹配

**常见情况**：

Python FastAPI 服务期望的参数名与 NestJS 发送的不同：

- Python 期望：`text`, `enable_phoneme`, `save_debug_info`
- NestJS 错误发送：`referenceText`, `enablePhonemeDetail`

**解决方案**：

在 `speech.service.ts` 中正确映射参数名：

```typescript
// ✅ 正确的参数名
formData.append('text', assessDto.referenceText);           // 不是 'referenceText'
formData.append('enable_phoneme', String(...));             // 不是 'enablePhonemeDetail'
formData.append('save_debug_info', 'false');
```

**如何检查**：

查看 Python 服务的日志，如果看到：

```
INFO:     127.0.0.1:xxxxx - "POST /api/pronunciation/assess HTTP/1.1" 422 Unprocessable Entity
```

说明请求到达了 Python 服务但参数验证失败。

### Error: "语音服务不可用"

**原因**：无法连接到 Python 语音服务

**解决**：

1. 启动 Python 服务：`cd services/speech-service && python start_server.py`
2. 检查环境变量 `PYTHON_SPEECH_SERVICE_URL`（默认 `http://localhost:8080`）
3. 检查防火墙设置

## 性能优化建议

### 1. 音频转换优化

当前实现在主线程进行音频转换，可能阻塞 UI。优化方案：

- 使用 Web Worker 进行转换
- 添加转换进度反馈
- 实现转换缓存

### 2. 文件大小优化

- 当前限制 10MB，可根据实际需求调整
- 考虑在前端压缩音频（降低采样率、单声道等）
- 添加录音时长限制

### 3. 错误处理优化

- 添加重试机制
- 提供更友好的错误提示
- 记录错误统计，监控服务质量

## 测试清单

- [ ] 录音功能正常
- [ ] 音频格式转换成功
- [ ] 后端正确接收音频文件
- [ ] Python 服务正常响应
- [ ] 评估结果正确显示
- [ ] 错误处理正常工作
- [ ] 日志记录完整

## 相关文件

### 前端

- `apps/web/src/utils/audioConverter.ts` - 音频格式转换
- `apps/web/src/components/follow-read/FollowRead.tsx` - 跟读组件
- `apps/web/src/network/speech/index.ts` - 网络请求

### 后端

- `apps/api/src/main.ts` - 应用配置
- `apps/api/src/modules/speech/speech.controller.ts` - 控制器
- `apps/api/src/modules/speech/speech.service.ts` - 服务
- `apps/api/src/modules/speech/dto/pronunciation-assess-req.dto.ts` - 请求 DTO
