import { cva, type VariantProps } from "class-variance-authority";

export const buttonVariants = cva(
  "reader-control inline-flex items-center py-0.5",
  {
    variants: {
      variant: {
        soft: "bg-flow-muted",
        outline: "bg-flow-muted border border-flow-line",
        ghost: "bg-transparent",
        bare: "",
      },
    },
    compoundVariants: [{
      variant: ["soft", "outline", "ghost"],
      class: "justify-center gap-1 text-small font-medium text-flow-text disabled:cursor-not-allowed disabled:opacity-75",
    }],
  },
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;
