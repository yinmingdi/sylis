import type {
  LoginReqDto,
  LoginResDto,
  RegisterReqDto,
  RegisterResDto,
  SendEmailCodeReqDto,
} from '@sylis/shared/dto';

import request from '../../../network/request';

export const login = async (data: LoginReqDto) => {
  return request<LoginReqDto, LoginResDto>({
    method: 'POST',
    url: '/auth/login',
    data,
  });
};

export const register = async (data: RegisterReqDto) => {
  return request<RegisterReqDto, RegisterResDto>({
    method: 'POST',
    url: '/auth/register',
    data,
  });
};

export const sendEmailCode = async (data: SendEmailCodeReqDto) => {
  return request<SendEmailCodeReqDto>({
    method: 'POST',
    url: '/auth/send-email-code',
    data,
  });
};

export const getUser = async () => {
  return request<null, any>({
    method: 'GET',
    url: '/user',
  });
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
  return request<UpdateUserProfileReq, UpdateUserProfileRes>({
    method: 'PUT',
    url: '/user/profile',
    data,
  });
};

export const uploadAvatar = async (file: File) => {
  const formData = new FormData();
  formData.append('avatar', file);

  return request<FormData, { url: string }>({
    method: 'POST',
    url: '/user/upload-avatar',
    data: formData,
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
};

export interface ChangePasswordReq {
  oldPassword: string;
  newPassword: string;
}

export interface ChangePasswordRes {
  message: string;
}

export const changePassword = async (data: ChangePasswordReq) => {
  return request<ChangePasswordReq, ChangePasswordRes>({
    method: 'PUT',
    url: '/user/change-password',
    data,
  });
};
