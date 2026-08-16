import { createContext } from 'react';

// 表单验证规则类型
export interface ValidationRule {
  required?: boolean;
  message?: string;
  pattern?: RegExp;
  min?: number;
  max?: number;
  validator?: (
    value: any,
    allValues: Record<string, any>,
  ) => Promise<void> | void;
}

// 表单字段配置
export interface FormField {
  name: string;
  rules?: ValidationRule[];
  initialValue?: any;
}

// 表单错误类型
export interface FormErrors {
  [fieldName: string]: string;
}

// 表单值类型
export interface FormValues {
  [fieldName: string]: any;
}

// 表单实例接口
export interface FormInstance {
  getFieldValue: (name: string) => any;
  getFieldsValue: () => FormValues;
  setFieldValue: (name: string, value: any) => void;
  setFieldsValue: (values: FormValues) => void;
  getFieldError: (name: string) => string | undefined;
  getFieldsError: () => FormErrors;
  setFieldError: (name: string, error: string) => void;
  setFieldsError: (errors: FormErrors) => void;
  validateField: (name: string) => Promise<boolean>;
  validateFields: () => Promise<boolean>;
  resetField: (name: string) => void;
  resetFields: () => void;
  submit: () => void;
}

// 表单属性接口
export interface FormProps
  extends Omit<React.FormHTMLAttributes<HTMLFormElement>, 'onSubmit'> {
  /** 表单实例 */
  form?: FormInstance;
  /** 初始值 */
  initialValues?: FormValues;
  /** 表单布局 */
  layout?: 'horizontal' | 'vertical' | 'inline';
  /** 标签位置 */
  labelPosition?: 'top' | 'left' | 'right';
  /** 标签宽度 */
  labelWidth?: number | string;
  /** 标签对齐方式 */
  labelAlign?: 'left' | 'center' | 'right';
  /** 是否显示冒号 */
  colon?: boolean;
  /** 是否禁用 */
  disabled?: boolean;
  /** 表单项间距 */
  gap?: 'small' | 'medium' | 'large';
  /** 提交回调 */
  onSubmit?: (values: FormValues) => void | Promise<void>;
  /** 提交失败回调 */
  onSubmitFailed?: (errorInfo: {
    values: FormValues;
    errors: FormErrors;
  }) => void;
  /** 值变化回调 */
  onValuesChange?: (changedValues: FormValues, allValues: FormValues) => void;
  /** 子元素 */
  children?: React.ReactNode;
}

// 表单上下文
export interface FormContextValue {
  form: FormInstance;
  disabled?: boolean;
  layout?: FormProps['layout'];
  labelPosition?: FormProps['labelPosition'];
  labelWidth?: FormProps['labelWidth'];
  labelAlign?: FormProps['labelAlign'];
  colon?: FormProps['colon'];
}

export const FormContext = createContext<FormContextValue | null>(null);
