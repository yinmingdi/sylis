import { agentClient } from '@sylis/api-client/agent';
import { apiClient } from '@sylis/api-client/user';

import type {
  LoginReqDto,
  LoginResDto,
  RegisterReqDto,
  RegisterResDto,
  SendEmailCodeReqDto,
} from '@/legacy-dto';

const response = <T>(data: T) => ({ data, message: 'ok', code: 0 });

const legacyUser = (actor: Record<string, unknown>) => ({
  ...actor,
  nickname: String(actor.displayName ?? ''),
  email: String(actor.email ?? ''),
  avatar: String(actor.avatarUrl ?? ''),
});

export const login = async (data: LoginReqDto) => {
  const session = await apiClient.identity.login(data);
  agentClient.setCsrfToken(session.csrfToken);
  return response<LoginResDto>({ token: 'cookie-session' });
};

export const register = async (data: RegisterReqDto) => {
  const session = await apiClient.identity.register({
    token: data.code,
    displayName: data.email.split('@')[0] || 'Sylis learner',
    password: data.password,
    timezone:
      Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai',
  });
  agentClient.setCsrfToken(session.csrfToken);
  return response<RegisterResDto>({ token: 'cookie-session' });
};

export const sendEmailCode = async (data: SendEmailCodeReqDto) => {
  return response(await apiClient.identity.requestRegistration(data.email));
};

export const getUser = async () => {
  const actor = await apiClient.identity.me();
  return response(legacyUser(actor as unknown as Record<string, unknown>));
};

export interface UpdateUserProfileReq {
  nickname?: string;
  email?: string;
  avatar?: string;
}

export interface UpdateUserProfileRes {
  id: string;
  nickname: string;
  email: string;
  avatar?: string;
  updatedAt: string;
}

export const updateUserProfile = async (data: UpdateUserProfileReq) => {
  const actor = await apiClient.identity.me();
  const updated = await apiClient.identity.updateMe({
    locale: actor.locale,
    timezone: actor.timezone,
    displayName: data.nickname,
    email: data.email,
    avatarUrl: data.avatar,
  });
  return response<UpdateUserProfileRes>({
    id: updated.id,
    nickname: updated.displayName,
    email: updated.email,
    avatar: updated.avatarUrl ?? undefined,
    updatedAt: new Date().toISOString(),
  });
};

export const uploadAvatar = async (file: File) => {
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('头像读取失败'));
    reader.readAsDataURL(file);
  });
  return response({ url });
};

export interface ChangePasswordReq {
  oldPassword: string;
  newPassword: string;
}

export interface ChangePasswordRes {
  message: string;
}

export const changePassword = async (data: ChangePasswordReq) => {
  await apiClient.identity.reauthenticate(data.oldPassword);
  await apiClient.identity.changePassword(data.newPassword);
  return response<ChangePasswordRes>({ message: '密码修改成功' });
};
