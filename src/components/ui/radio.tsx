import { cva, type VariantProps } from "class-variance-authority";
import { createContext, useContext, useId, useState } from "react";
import { cn } from "@/utils/cn";

type RadioGroupContextValue = {
  name: string;
  value: unknown;
  setValue: (next: unknown) => void;
  disabled?: boolean;
};

const RadioGroupContext = createContext<RadioGroupContextValue | null>(null);

const variants = cva("inline-flex items-center gap-2 text-sm text-content-200 select-none", {
  variants: {
    disabled: {
      true: "cursor-not-allowed opacity-40",
      false: "cursor-pointer",
    },
  },
  defaultVariants: {
    disabled: false,
  },
});

export type RadioProps = Omit<
  React.ComponentProps<"input">,
  "type" | "value" | "defaultValue" | "checked" | "defaultChecked" | "onChange"
> &
  VariantProps<typeof variants> & {
    value?: unknown;
    defaultValue?: boolean;
    onChange?: (selected: boolean) => void;
    label?: React.ReactNode;
  };

export default function Radio({
  className,
  disabled,
  label,
  value,
  defaultValue,
  onChange,
  name,
  ...props
}: RadioProps) {
  const group = useContext(RadioGroupContext);
  const [uncontrolled, setUncontrolled] = useState(!!defaultValue);

  let selected: boolean;
  let isDisabled = disabled ?? false;
  let inputName = name;
  let handleChange: (next: boolean) => void;

  if (group) {
    selected = group.value !== undefined && group.value === value;
    isDisabled = isDisabled || !!group.disabled;
    inputName = name ?? group.name;
    handleChange = (next) => {
      if (next) group.setValue(value);
    };
  } else {
    const isControlled = typeof value === "boolean";
    selected = isControlled ? (value as boolean) : uncontrolled;
    handleChange = (next) => {
      if (!isControlled) setUncontrolled(next);
      onChange?.(next);
    };
  }

  return (
    <label className={cn(variants({ className, disabled: isDisabled }))}>
      <input
        type="radio"
        disabled={isDisabled}
        name={inputName}
        className="peer sr-only"
        {...props}
        checked={selected}
        onChange={(e) => handleChange(e.target.checked)}
      />
      <span
        className={cn(
          "inline-flex size-3.5 shrink-0 items-center justify-center rounded-full border border-content-400/60 bg-base-100 transition-colors",
          "peer-checked:border-primary-500",
          "peer-focus-visible:ring-3 peer-focus-visible:ring-primary-500/20",
          "[&>span]:size-1.5 [&>span]:scale-0 [&>span]:rounded-full [&>span]:bg-primary-500 [&>span]:transition-transform peer-checked:[&>span]:scale-100",
        )}
      >
        <span />
      </span>
      {label != null && <span>{label}</span>}
    </label>
  );
}

export type RadioGroupProps<T = unknown> = {
  name?: string;
  value?: T | null;
  defaultValue?: T;
  onChange?: (value: T) => void;
  disabled?: boolean;
  className?: string;
  children?: React.ReactNode;
};

export function RadioGroup<T = unknown>(props: RadioGroupProps<T>) {
  const { name, defaultValue, onChange, disabled, className, children } = props;
  const autoId = useId();
  const groupName = name ?? autoId;
  const isControlled = "value" in props;
  const [uncontrolled, setUncontrolled] = useState<T | undefined>(defaultValue);
  const current = isControlled ? props.value : uncontrolled;

  const setValue = (next: unknown) => {
    if (!isControlled) setUncontrolled(next as T);
    onChange?.(next as T);
  };

  return (
    <RadioGroupContext.Provider value={{ name: groupName, value: current, setValue, disabled }}>
      <div className={cn("flex flex-col gap-2", className)}>{children}</div>
    </RadioGroupContext.Provider>
  );
}
