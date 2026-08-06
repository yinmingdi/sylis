import { Button, Field, KeyRound, TextInput } from "@sylis/components";
import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { identityCommands } from "../../modules/identity";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await identityCommands.login({ email, password });
      const from =
        (location.state as { from?: string } | null)?.from ?? "/study";
      navigate(from, { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "登录失败");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="auth-layout">
      <section className="auth-brand">
        <span className="auth-brand__mark">S</span>
        <h1>Sylis</h1>
        <p>词汇、语境与持续练习。</p>
      </section>
      <form className="auth-form" onSubmit={submit}>
        <KeyRound aria-hidden="true" />
        <h2>登录</h2>
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
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        <Button type="submit" disabled={busy}>
          {busy ? "登录中" : "登录"}
        </Button>
        <p className="auth-form__switch">
          没有账户？ <Link to="/register">注册</Link>
        </p>
      </form>
    </main>
  );
}
