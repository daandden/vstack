import { cva, type VariantProps } from "class-variance-authority";

export const buttonVariants = cva(
  "inline-flex items-center",
  {
    variants: {
      variant: {
        soft: "bg-[var(--mantle)]",
        outline: "bg-[var(--base)] border border-flow-border",
        ghost: "bg-transparent",
        bare: "",
      },
    },
    compoundVariants: [{
      variant: ["soft", "outline", "ghost"],
      class: "justify-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[color:var(--text)] disabled:cursor-not-allowed disabled:opacity-75",
    }],
  },
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;
