import * as React from "react";
import { cn } from "@/lib/utils";
import styles from "./button.module.css";

export type ButtonVariant = "default" | "outline" | "ghost" | "subtle";
export type ButtonSize = "sm" | "md" | "lg" | "icon" | "icon-sm";

const variantClass: Record<ButtonVariant, string> = {
  default: styles.variantDefault,
  outline: styles.variantOutline,
  ghost: styles.variantGhost,
  subtle: styles.variantSubtle,
};

const sizeClass: Record<ButtonSize, string> = {
  sm: styles.sizeSm,
  md: styles.sizeMd,
  lg: styles.sizeLg,
  icon: styles.sizeIcon,
  "icon-sm": styles.sizeIconSm,
};

/** The button's look, for a `Link` styled as one. */
export function buttonClass(variant: ButtonVariant = "default", size: ButtonSize = "md"): string {
  return cn(styles.base, variantClass[variant], sizeClass[size]);
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className, variant = "default", size = "md", type = "button", ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(buttonClass(variant, size), className)}
        {...props}
      />
    );
  },
);
