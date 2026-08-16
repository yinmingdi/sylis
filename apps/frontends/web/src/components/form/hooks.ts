import { useState, useCallback, useContext } from 'react';

import {
  FormContext,
  type FormInstance,
  type FormValues,
  type FormErrors,
  type FormField,
} from './context';

// 创建表单实例
export const useForm = (initialValues: FormValues = {}): FormInstance => {
  const [values, setValues] = useState<FormValues>(initialValues);
  const [errors, setErrors] = useState<FormErrors>({});
  const [fields] = useState<Record<string, FormField>>({});

  const getFieldValue = useCallback(
    (name: string) => {
      return values[name];
    },
    [values],
  );

  const getFieldsValue = useCallback(() => {
    return { ...values };
  }, [values]);

  const setFieldValue = useCallback(
    (name: string, value: any) => {
      setValues((prev) => ({ ...prev, [name]: value }));
      // 清除该字段的错误
      if (errors[name]) {
        setErrors((prev) => {
          const newErrors = { ...prev };
          delete newErrors[name];
          return newErrors;
        });
      }
    },
    [errors],
  );

  const setFieldsValue = useCallback((newValues: FormValues) => {
    setValues((prev) => ({ ...prev, ...newValues }));
    // 清除更新字段的错误
    const updatedFields = Object.keys(newValues);
    setErrors((prev) => {
      const newErrors = { ...prev };
      updatedFields.forEach((field) => {
        if (newErrors[field]) {
          delete newErrors[field];
        }
      });
      return newErrors;
    });
  }, []);

  const getFieldError = useCallback(
    (name: string) => {
      return errors[name];
    },
    [errors],
  );

  const getFieldsError = useCallback(() => {
    return { ...errors };
  }, [errors]);

  const setFieldError = useCallback((name: string, error: string) => {
    setErrors((prev) => ({ ...prev, [name]: error }));
  }, []);

  const setFieldsError = useCallback((newErrors: FormErrors) => {
    setErrors((prev) => ({ ...prev, ...newErrors }));
  }, []);

  const validateField = useCallback(
    async (name: string): Promise<boolean> => {
      const field = fields[name];
      const value = values[name];

      if (!field || !field.rules) return true;

      try {
        for (const rule of field.rules) {
          // 必填验证
          if (
            rule.required &&
            (value === undefined || value === null || value === '')
          ) {
            throw new Error(rule.message || `${name} is required`);
          }

          // 跳过空值的其他验证
          if (value === undefined || value === null || value === '') {
            continue;
          }

          // 正则验证
          if (rule.pattern && !rule.pattern.test(String(value))) {
            throw new Error(rule.message || `${name} format is invalid`);
          }

          // 最小值验证
          if (rule.min !== undefined && value < rule.min) {
            throw new Error(
              rule.message || `${name} must be at least ${rule.min}`,
            );
          }

          // 最大值验证
          if (rule.max !== undefined && value > rule.max) {
            throw new Error(
              rule.message || `${name} must be at most ${rule.max}`,
            );
          }

          // 自定义验证
          if (rule.validator) {
            await rule.validator(value, values);
          }
        }

        // 验证通过，清除错误
        if (errors[name]) {
          setErrors((prev) => {
            const newErrors = { ...prev };
            delete newErrors[name];
            return newErrors;
          });
        }
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setErrors((prev) => ({ ...prev, [name]: message }));
        return false;
      }
    },
    [fields, values, errors],
  );

  const validateFields = useCallback(async (): Promise<boolean> => {
    const fieldNames = Object.keys(fields);
    const results = await Promise.all(
      fieldNames.map((name) => validateField(name)),
    );
    return results.every((result) => result);
  }, [fields, validateField]);

  const resetField = useCallback(
    (name: string) => {
      const field = fields[name];
      setValues((prev) => ({
        ...prev,
        [name]: field?.initialValue || '',
      }));
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    },
    [fields],
  );

  const resetFields = useCallback(() => {
    const resetValues: FormValues = {};
    Object.entries(fields).forEach(([name, field]) => {
      resetValues[name] = field.initialValue || '';
    });
    setValues(resetValues);
    setErrors({});
  }, [fields]);

  const submit = useCallback(() => {
    // 这个方法由Form组件来实现
  }, []);

  return {
    getFieldValue,
    getFieldsValue,
    setFieldValue,
    setFieldsValue,
    getFieldError,
    getFieldsError,
    setFieldError,
    setFieldsError,
    validateField,
    validateFields,
    resetField,
    resetFields,
    submit,
  };
};

// 用于获取表单上下文的Hook
export const useFormContext = () => {
  const context = useContext(FormContext);
  if (!context) {
    throw new Error('useFormContext must be used within a Form component');
  }
  return context;
};
