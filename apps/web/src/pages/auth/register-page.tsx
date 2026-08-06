import { Button, Field, TextInput } from "@sylis/components";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { identityCommands } from "../../modules/identity";

export function RegisterPage() {
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [token, setToken] = useState(params.get("token") ?? "");
  const [password, setPassword] = useState("");
  const [stage, setStage] = useState<"request" | "complete">(
    token ? "complete" : "request",
  );
  const [error, setError] = useState<string>();
  const navigate = useNavigate();
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);
    try {
      if (stage === "request") {
        await identityCommands.requestRegistration(email);
        setStage("complete");
        return;
      }
      await identityCommands.register({
        token,
        password,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      navigate("/study", { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "请求失败");
    }
  };
  return (
    <main className="auth-layout">
      <section className="auth-brand">
        <span className="auth-brand__mark">S</span>
        <h1>Sylis</h1>
        <p>建立你的个人学习记录。</p>
      </section>
      <form className="auth-form" onSubmit={submit}>
        <h2>{stage === "request" ? "注册" : "完成注册"}</h2>
        {stage === "request" ? (
          <Field label="邮箱" error={error}>
            <TextInput
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
        ) : (
          <>
            <Field label="注册链接令牌">
              <TextInput
                required
                value={token}
                onChange={(event) => setToken(event.target.value)}
              />
            </Field>
            <Field label="密码" error={error} hint="至少 12 位">
              <TextInput
                type="password"
                minLength={12}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>
          </>
        )}
        <Button type="submit">
          {stage === "request" ? "发送验证邮件" : "创建账户"}
        </Button>
        <p className="auth-form__switch">
          已有账户？ <Link to="/login">登录</Link>
        </p>
      </form>
    </main>
  );
}
