"use client";

import { Button } from "@base-ui/react/button";
import { forwardRef } from "react";

export type UiButtonVariant = "outline" | "solid" | "quiet" | "danger" | "unstyled";

type UiButtonProps = Omit<Button.Props, "className"> & {
  className?: string;
  variant?: UiButtonVariant;
};

/** Coeus appearance around Base UI's button behavior. Links stay links. */
export const UiButton = forwardRef<HTMLElement, UiButtonProps>(function UiButton(
  { className, variant = "outline", type = "button", ...props },
  ref,
) {
  return (
    <Button
      {...props}
      ref={ref}
      type={type}
      className={["ui-button", `ui-button--${variant}`, className].filter(Boolean).join(" ")}
    />
  );
});
