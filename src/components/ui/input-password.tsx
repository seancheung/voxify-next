import { cva, type VariantProps } from "class-variance-authority";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useState } from "react";

const variants = cva(
  "inline-flex h-8 min-w-50 items-center justify-center gap-1.5 rounded-md border bg-base-100 px-3 text-sm text-content-200 transition-all has-icon icon:text-content-400",
  {
    variants: {
      error: {
        true: "border-error focus-within:ring-3 focus-within:ring-error/10",
        false:
          "border-content-400/50 focus-within:border-primary-500 focus-within:ring-3 focus-within:ring-primary-500/10",
      },
      disabled: {
        true: "opacity-40",
        false: "",
      },
    },
    defaultVariants: {
      error: false,
      disabled: false,
    },
  },
);

export type InputPasswordProps = Omit<
  React.ComponentProps<"input">,
  "type" | "value" | "defaultValue" | "onChange"
> &
  VariantProps<typeof variants> & {
    value?: string | null;
    defaultValue?: string;
    icon?: React.ReactNode;
    onChange?: (value: string) => void;
  };

export default function InputPassword({
  error,
  icon,
  className,
  disabled,
  value,
  defaultValue,
  onChange,
  ...props
}: InputPasswordProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className={variants({ className, error, disabled })}>
      {icon}
      <input
        {...props}
        type={visible ? "text" : "password"}
        disabled={disabled}
        className="w-full min-w-0 flex-1 border-none bg-transparent outline-none"
        value={value === null ? "" : value}
        defaultValue={defaultValue}
        onChange={(e) => onChange?.(e.target.value)}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled ?? false}
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "隐藏密码" : "显示密码"}
        className="-mr-1 inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-sm text-content-400 transition-colors has-icon not-disabled:hover:text-content-200"
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}
