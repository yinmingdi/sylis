import { Button, Field, TextInput } from '@sylis/components';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { identityCommands } from '../../modules/identity';

export function RecoveryPage() {
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [token, setToken] = useState(params.get('token') ?? '');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const resetStage = Boolean(params.get('token'));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);
    if (resetStage && password !== confirmation) {
      setError('两次输入的密码不一致');
      return;
    }
    setBusy(true);
    try {
      if (!resetStage) {
        await identityCommands.requestPasswordRecovery(email);
        setRequested(true);
        return;
      }
      await identityCommands.resetPassword({ token, password });
      navigate('/login?password-reset=1', { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '请求失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-layout">
      <section className="auth-brand">
        <h1>{resetStage ? '设置新密码' : '找回密码'}</h1>
        <p>通过邮箱恢复您的学习账户</p>
      </section>
      <form className="auth-form" onSubmit={submit}>
        {resetStage ? (
          <>
            <Field label="恢复令牌">
              <TextInput
                value={token}
                required
                onChange={(event) => setToken(event.target.value)}
              />
            </Field>
            <Field label="新密码" hint="至少 12 位">
              <TextInput
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>
            <Field label="确认新密码" error={error}>
              <TextInput
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </Field>
          </>
        ) : (
          <Field label="邮箱" error={error}>
            <TextInput
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
        )}
        {requested ? (
          <p role="status">如果账户存在，恢复邮件已经发送。</p>
        ) : null}
        <Button type="submit" disabled={busy || requested}>
          {busy ? '处理中' : resetStage ? '更新密码' : '发送恢复邮件'}
        </Button>
        <p className="auth-form__switch">
          返回 <Link to="/login">登录</Link>
        </p>
      </form>
    </main>
  );
}
