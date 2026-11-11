import { cva, type VariantProps } from "class-variance-authority";

const variants = cva(
  "appearance-none rounded-xs bg-base-100 outline-none not-disabled:cursor-pointer disabled:opacity-40 [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary-500 [&::-webkit-slider-thumb]:transition-colors not-disabled:[&::-webkit-slider-thumb]:cursor-pointer not-disabled:hover:[&::-webkit-slider-thumb]:ring-3 not-disabled:hover:[&::-webkit-slider-thumb]:ring-primary-500/10 not-disabled:active:[&::-webkit-slider-thumb]:bg-primary-600",
  {
    variants: {
      direction: {
        horizontal: "h-1 w-full",
        vertical: "h-80 w-1 [direction:rtl] [writing-mode:vertical-rl]",
      },
    },
    defaultVariants: {
      direction: "horizontal",
    },
  },
);

export type SliderProps = Omit<
  React.ComponentProps<"input">,
  "value" | "min" | "max" | "step" | "onChange"
> &
  VariantProps<typeof variants> & {
    value?: number | null;
    min?: number;
    max?: number;
    step?: number;
    onChange?: (value: number) => void;
  };

export default function Slider({
  min,
  max,
  step,
  value,
  direction,
  className,
  onChange,
  ...props
}: SliderProps) {
  return (
    <input
      {...props}
      type="range"
      className={variants({
        className,
        direction,
      })}
      step={step}
      min={min}
      max={max}
      value={value === null ? "" : value}
      onChange={(e) => onChange?.(Number(e.target.value))}
    />
  );
}
