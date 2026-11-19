import { cva, type VariantProps } from "class-variance-authority";

export const buttonVariants = cva(
  "u-inline-flex u-items-center u-justify-center u-gap-1 u-rounded-md u-px-2 u-py-1 u-text-xs u-font-medium u-text-[color:var(--text)] disabled:u-cursor-not-allowed disabled:u-opacity-75",
  {
    variants: {
      variant: {
        soft: "u-bg-[var(--mantle)]",
        outline: "u-bg-[var(--base)] u-border u-border-flow-border",
        ghost: "u-bg-transparent",
      },
    },
  },
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;
