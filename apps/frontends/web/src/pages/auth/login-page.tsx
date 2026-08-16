import { Button, Field, TextInput } from '@sylis/components';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import {
  identityCommands,
  resetAuthenticatedClientState,
} from '../../modules/identity';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const cache = useQueryClient();
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await identityCommands.login({ email, password });
      await resetAuthenticatedClientState(cache);
      const from =
        (location.state as { from?: string } | null)?.from ?? '/study';
      navigate(from, { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '登录失败');
      passwordRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="auth-layout">
      <section className="auth-brand">
        <h1>欢迎回来</h1>
        <p>继续您的英语学习旅程</p>
      </section>
      <form className="auth-form" onSubmit={submit}>
        {new URLSearchParams(location.search).get('password-reset') === '1' ? (
          <p role="status">密码已更新，请重新登录。</p>
        ) : null}
        <Field label="邮箱">
          <TextInput
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <Field label="密码" error={error}>
          <TextInput
            ref={passwordRef}
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        <Button type="submit" disabled={busy}>
          {busy ? '登录中' : '登录'}
        </Button>
        <Link className="auth-form__recovery" to="/recover">
          忘记密码？
        </Link>
        <p className="auth-form__switch">
          没有账户？ <Link to="/register">注册</Link>
        </p>
      </form>
    </main>
  );
}
