import { Slot, Slottable } from "@radix-ui/react-slot";
import { createFormHook, createFormHookContexts } from "@tanstack/react-form";
import { createContext, type ReactNode, useContext, useEffect, useRef } from "react";
import { ZodObject, type ZodType } from "zod";
import { cn } from "@/utils/cn";
import Button from "./ui/button";
import type { CheckboxProps } from "./ui/checkbox";
import Checkbox from "./ui/checkbox";
import type { ComboboxProps } from "./ui/combobox";
import Combobox from "./ui/combobox";
import Input, { type InputProps } from "./ui/input";
import InputNumber, { type InputNumberProps } from "./ui/input-number";
import InputPassword, { type InputPasswordProps } from "./ui/input-password";
import { RadioGroup, type RadioGroupProps } from "./ui/radio";
import type { SelectProps } from "./ui/select";
import Select from "./ui/select";
import type { SliderProps } from "./ui/slider";
import Slider from "./ui/slider";
import type { SwitchProps } from "./ui/switch";
import Switch from "./ui/switch";
import Textarea, { type TextareaProps } from "./ui/textarea";
import { ToggleGroup, type ToggleGroupProps } from "./ui/toggle";

const { fieldContext, formContext, useFieldContext, useFormContext } = createFormHookContexts();

// Provided by <AutoSubmit> when auto-submit is enabled. `null` (the default)
// means field components fall back to manual-submit behavior.
const AutoSubmitContext = createContext<(() => void) | null>(null);

// Custom field components (anything outside the bundled `fieldComponents`,
// e.g. VoiceSelect) can call this and invoke the result after a value
// commit so they participate in <form.AutoSubmit>.
export function useAutoSubmit() {
  return useContext(AutoSubmitContext);
}

function AutoSubmit({
  onSubmit,
  enabled = true,
  debounceMs = 300,
  children,
}: {
  onSubmit: () => void;
  enabled?: boolean;
  debounceMs?: number;
  children: ReactNode;
}) {
  // Keep `onSubmit` fresh without retriggering the trigger memo. The handler
  // closure that consumers receive stays stable across renders.
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trigger = enabled
    ? () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          onSubmitRef.current();
        }, debounceMs);
      }
    : null;

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return <AutoSubmitContext.Provider value={trigger}>{children}</AutoSubmitContext.Provider>;
}

function SubmitButton({ children, className }: React.PropsWithChildren<{ className?: string }>) {
  const form = useFormContext();
  return (
    <form.Subscribe selector={(state) => state.canSubmit}>
      {(canSubmit) => (
        <Button
          color="primary"
          size="md"
          className={className}
          disabled={!canSubmit}
          onClick={() => form.handleSubmit()}
        >
          {children}
        </Button>
      )}
    </form.Subscribe>
  );
}

function FormError({
  children,
  className,
}: React.PropsWithChildren<{
  className?: string;
}>) {
  return <p className={cn("text-xs text-error", className)}>{children}</p>;
}

function useIsFieldRequired() {
  const field = useFieldContext();
  const schema = field.form.options.validators?.onSubmit as ZodType | undefined;
  if (!schema || !(schema instanceof ZodObject)) {
    return false;
  }
  const fieldSchema = schema.shape[field.name] as ZodType | undefined;
  if (!fieldSchema) {
    return false;
  }
  return !fieldSchema.safeParse(undefined).success && !fieldSchema.safeParse(null).success;
}

function FormField({
  label,
  description,
  children,
  className,
  asChild,
}: React.PropsWithChildren<{
  label: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
  asChild?: boolean;
}>) {
  const Comp = asChild ? Slot : "div";
  const field = useFieldContext();
  const required = useIsFieldRequired();
  const hasError = !field.state.meta.isValid;

  return (
    <Comp className={cn("flex flex-col gap-1.5", className)}>
      <div className="text-sm">
        {label}
        {required && <span className="ml-0.5 text-error">*</span>}
      </div>
      <Slottable>{children}</Slottable>
      {hasError ? (
        <FormError className="opacity-100 transition-opacity duration-200 starting:opacity-0">
          {field.state.meta.errors.map((error) => error.message).join(", ")}
        </FormError>
      ) : (
        description && <p className="text-xs text-content-300">{description}</p>
      )}
    </Comp>
  );
}

function InputField({ onChange, onBlur, ...rest }: InputProps) {
  const field = useFieldContext<string | null | undefined>();
  const autoSubmit = useAutoSubmit();
  return (
    <Input
      {...rest}
      value={field.state.value}
      onChange={(value) => {
        field.handleChange(value);
        onChange?.(value);
      }}
      onBlur={(e) => {
        onBlur?.(e);
        if (field.state.meta.isDirty) autoSubmit?.();
      }}
      error={!field.state.meta.isValid}
    />
  );
}

function TextareaField({ onChange, onBlur, ...rest }: TextareaProps) {
  const field = useFieldContext<string | null | undefined>();
  const autoSubmit = useAutoSubmit();
  return (
    <Textarea
      {...rest}
      value={field.state.value}
      onChange={(value) => {
        field.handleChange(value);
        onChange?.(value);
      }}
      onBlur={(e) => {
        onBlur?.(e);
        if (field.state.meta.isDirty) autoSubmit?.();
      }}
      error={!field.state.meta.isValid}
    />
  );
}

function NumberField({ onChange, ...rest }: InputNumberProps) {
  const field = useFieldContext<number | null | undefined>();
  const autoSubmit = useAutoSubmit();
  return (
    <InputNumber
      {...rest}
      value={field.state.value}
      onChange={(value) => {
        field.handleChange(value);
        onChange?.(value);
        autoSubmit?.();
      }}
      onClear={() => {
        field.handleChange(null);
        autoSubmit?.();
      }}
      error={!field.state.meta.isValid}
    />
  );
}

function PasswordField({ onChange, onBlur, ...rest }: InputPasswordProps) {
  const field = useFieldContext<string | null | undefined>();
  const autoSubmit = useAutoSubmit();
  return (
    <InputPassword
      {...rest}
      value={field.state.value}
      onChange={(value) => {
        field.handleChange(value);
        onChange?.(value);
      }}
      onBlur={(e) => {
        onBlur?.(e);
        if (field.state.meta.isDirty) autoSubmit?.();
      }}
      error={!field.state.meta.isValid}
    />
  );
}

function CheckboxField({ onChange, ...rest }: CheckboxProps) {
  const field = useFieldContext<boolean | null | undefined>();
  const autoSubmit = useAutoSubmit();
  return (
    <Checkbox
      {...rest}
      value={field.state.value}
      onChange={(value) => {
        field.handleChange(value);
        onChange?.(value);
        autoSubmit?.();
      }}
    />
  );
}

function SwitchField({ onChange, ...rest }: SwitchProps) {
  const field = useFieldContext<boolean | null | undefined>();
  const autoSubmit = useAutoSubmit();
  return (
    <Switch
      {...rest}
      value={field.state.value}
      onChange={(value) => {
        field.handleChange(value);
        onChange?.(value);
        autoSubmit?.();
      }}
    />
  );
}

function SelectField<T>({ onChange, onClear, ...rest }: SelectProps<T>) {
  const field = useFieldContext<T | null | undefined>();
  const autoSubmit = useAutoSubmit();
  return (
    <Select
      {...rest}
      value={field.state.value}
      onChange={(value) => {
        field.handleChange(value);
        onChange?.(value);
        autoSubmit?.();
      }}
      onClear={() => {
        field.handleChange(null);
        onClear?.();
        autoSubmit?.();
      }}
      error={!field.state.meta.isValid}
    />
  );
}

function ComboboxField<T>({ onChange, onClear, ...rest }: ComboboxProps<T>) {
  const field = useFieldContext<T | null | undefined>();
  const autoSubmit = useAutoSubmit();
  return (
    <Combobox
      {...rest}
      value={field.state.value}
      onChange={(value) => {
        field.handleChange(value);
        onChange?.(value);
        autoSubmit?.();
      }}
      onClear={() => {
        field.handleChange(null);
        onClear?.();
        autoSubmit?.();
      }}
      error={!field.state.meta.isValid}
    />
  );
}

function RadioGroupField<T>({ onChange, ...rest }: RadioGroupProps<T>) {
  const field = useFieldContext<T | null | undefined>();
  const autoSubmit = useAutoSubmit();
  return (
    <RadioGroup
      {...rest}
      value={field.state.value}
      onChange={(value) => {
        field.handleChange(value);
        onChange?.(value);
        autoSubmit?.();
      }}
    />
  );
}

function ToggleGroupField<T>({ onChange, ...rest }: ToggleGroupProps<T>) {
  const field = useFieldContext<T | null | undefined>();
  const autoSubmit = useAutoSubmit();
  return (
    <ToggleGroup
      {...rest}
      value={field.state.value}
      onChange={(value) => {
        field.handleChange(value);
        onChange?.(value);
        autoSubmit?.();
      }}
    />
  );
}

function SliderField({ onChange, ...rest }: SliderProps) {
  const field = useFieldContext<number | null | undefined>();
  const autoSubmit = useAutoSubmit();
  return (
    <Slider
      {...rest}
      value={field.state.value}
      onChange={(value) => {
        field.handleChange(value);
        onChange?.(value);
        autoSubmit?.();
      }}
    />
  );
}

export const { useAppForm, withForm } = createFormHook({
  formComponents: {
    SubmitButton,
    FormError,
    AutoSubmit,
  },
  fieldComponents: {
    FormField,
    InputField,
    TextareaField,
    NumberField,
    PasswordField,
    CheckboxField,
    SwitchField,
    SelectField,
    ComboboxField,
    RadioGroupField,
    ToggleGroupField,
    SliderField,
  },
  fieldContext,
  formContext,
});
