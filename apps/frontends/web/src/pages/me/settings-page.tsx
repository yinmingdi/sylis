import { startRegistration } from '@simplewebauthn/browser';
import {
  Button,
  DataList,
  Field,
  KeyRound,
  LogOut,
  PageHeader,
  Select,
  TextInput,
} from '@sylis/components';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  identityCommands,
  resetAuthenticatedClientState,
  sessionQuery,
} from '../../modules/identity';

export function SettingsPage() {
  const session = useQuery(sessionQuery);
  const [locale, setLocale] = useState('zh-CN');
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const cache = useQueryClient();
  const navigate = useNavigate();
  useEffect(() => {
    if (session.data) {
      setLocale(session.data.actor.locale);
      setTimezone(session.data.actor.timezone);
    }
  }, [session.data]);
  const save = useMutation({
    mutationFn: () => identityCommands.updateMe({ locale, timezone }),
    onSuccess: () =>
      cache.invalidateQueries({ queryKey: sessionQuery.queryKey }),
  });
  const passkey = useMutation({
    mutationFn: async () => {
      const enrollment = await identityCommands.beginPasskeyEnrollment();
      const response = await startRegistration({
        optionsJSON: enrollment.options as Parameters<
          typeof startRegistration
        >[0]['optionsJSON'],
      });
      return identityCommands.completePasskeyEnrollment({
        challengeId: enrollment.challengeId,
        label: 'Passkey',
        response,
      });
    },
  });
  return (
    <div className="page">
      <PageHeader
        eyebrow="Settings"
        title="账户设置"
        actions={
          <Button
            icon={LogOut}
            tone="secondary"
            onClick={async () => {
              await identityCommands.logout();
              await resetAuthenticatedClientState(cache);
              navigate('/login', { replace: true });
            }}
          >
            退出登录
          </Button>
        }
      />
      <form
        className="settings-form"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <Field label="界面语言">
          <Select
            value={locale}
            onChange={(event) => setLocale(event.target.value)}
          >
            <option value="zh-CN">简体中文</option>
            <option value="en">English</option>
          </Select>
        </Field>
        <Field label="时区">
          <TextInput
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
          />
        </Field>
        <Button type="submit" disabled={save.isPending}>
          保存
        </Button>
        {save.isSuccess ? <span role="status">设置已保存</span> : null}
      </form>
      <div className="settings-actions">
        <Button
          icon={KeyRound}
          tone="secondary"
          onClick={() => passkey.mutate()}
          disabled={passkey.isPending}
        >
          添加 Passkey
        </Button>
        {passkey.isSuccess ? <span>已添加</span> : null}
        {passkey.error ? (
          <span role="alert">{passkey.error.message}</span>
        ) : null}
      </div>
      <DataList
        rows={[
          { label: '用户 ID', value: session.data?.actor.id ?? '-' },
          { label: '创建时间', value: session.data?.actor.createdAt ?? '-' },
        ]}
      />
    </div>
  );
}
