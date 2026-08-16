import { AssetMimeType } from '@sylis/api-client/agent';
import { FileUp } from '@sylis/components';
import { useMutation } from '@tanstack/react-query';
import { useId, useRef, useState, type ChangeEvent } from 'react';

import {
  AgentAssetUploadStage,
  uploadAgentAsset,
  type AgentAssetUploadProgress,
} from '../api/asset-upload';

export function AgentAssetUploader({
  onUploaded,
}: {
  onUploaded: (assetId: string, revisionId: string) => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<AgentAssetUploadProgress | null>(
    null,
  );
  const upload = useMutation({
    mutationFn: (file: File) => uploadAgentAsset(file, setProgress),
    onSuccess: ({ assetId, revisionId }) => {
      onUploaded(assetId, revisionId);
      setProgress(null);
      if (inputRef.current) inputRef.current.value = '';
    },
  });
  const select = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) upload.mutate(file);
  };
  return (
    <div className="agent-asset-uploader">
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        aria-label="上传文件"
        accept={Object.values(AssetMimeType).join(',')}
        disabled={upload.isPending}
        onChange={select}
      />
      <label htmlFor={inputId} aria-disabled={upload.isPending}>
        <FileUp aria-hidden="true" size={17} />
        <span
          role={upload.isPending ? 'status' : undefined}
          aria-live={upload.isPending ? 'polite' : undefined}
        >
          {upload.isPending ? uploadLabel(progress) : '上传文件'}
        </span>
      </label>
      {upload.error ? <span role="alert">{upload.error.message}</span> : null}
    </div>
  );
}

function uploadLabel(progress: AgentAssetUploadProgress | null): string {
  if (progress?.stage === AgentAssetUploadStage.HASHING) return '校验文件';
  if (progress?.stage === AgentAssetUploadStage.UPLOADING) return '上传中';
  if (progress?.stage === AgentAssetUploadStage.FINALIZING) return '提交扫描';
  return '准备上传';
}
