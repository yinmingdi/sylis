import React from 'react';

import { FormContext, type FormProps, type FormContextValue } from './context';
import { useForm } from './hooks';
import styles from './index.module.less';

export const Form: React.FC<FormProps> = ({
  form: externalForm,
  initialValues = {},
  layout = 'vertical',
  labelPosition = 'top',
  labelWidth,
  labelAlign = 'left',
  colon = true,
  disabled = false,
  gap = 'medium',
  onSubmit,
  onSubmitFailed,
  children,
  className,
  ...props
}) => {
  const internalForm = useForm(initialValues);
  const form = externalForm || internalForm;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    try {
      const isValid = await form.validateFields();
      const values = form.getFieldsValue();

      if (isValid) {
        await onSubmit?.(values);
      } else {
        const errors = form.getFieldsError();
        onSubmitFailed?.({ values, errors });
      }
    } catch (error) {
      console.error('Form submission error:', error);
    }
  };

  const formClasses = [
    styles.form,
    styles[`form--${layout}`],
    styles[`form--${gap}`],
    disabled && styles['form--disabled'],
    className
  ].filter(Boolean).join(' ');

  const contextValue: FormContextValue = {
    form,
    disabled,
    layout,
    labelPosition,
    labelWidth,
    labelAlign,
    colon
  };

  return (
    <FormContext.Provider value={contextValue}>
      <form
        className={formClasses}
        onSubmit={handleSubmit}
        {...props}
      >
        {children}
      </form>
    </FormContext.Provider>
  );
};

export default Form;
