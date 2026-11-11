import { cva, type VariantProps } from "class-variance-authority";

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

export type InputProps = Omit<
  React.ComponentProps<"input">,
  "value" | "defaultValue" | "onChange"
> &
  VariantProps<typeof variants> & {
    value?: string | null;
    defaultValue?: string;
    icon?: React.ReactNode;
    onChange?: (value: string) => void;
  };

export default function Input({
  error,
  icon,
  className,
  disabled,
  value,
  defaultValue,
  onChange,
  ...props
}: InputProps) {
  return (
    <div className={variants({ className, error, disabled })}>
      {icon}
      <input
        {...props}
        disabled={disabled}
        className="w-full min-w-0 flex-1 border-none bg-transparent outline-none"
        value={value === null ? "" : value}
        defaultValue={defaultValue}
        onChange={(e) => onChange?.(e.target.value)}
      />
    </div>
  );
}
