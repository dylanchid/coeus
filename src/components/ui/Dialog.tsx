"use client";

import { Dialog } from "@base-ui/react/dialog";

type BackdropProps = Omit<Dialog.Backdrop.Props, "className"> & { className?: string };
type PopupProps = Omit<Dialog.Popup.Props, "className"> & { className?: string };

function Backdrop({ className, ...props }: BackdropProps) {
  return <Dialog.Backdrop {...props} className={["ui-dialog-backdrop", className].filter(Boolean).join(" ")} />;
}

function Popup({ className, ...props }: PopupProps) {
  return <Dialog.Popup {...props} className={["ui-dialog-popup", className].filter(Boolean).join(" ")} />;
}

/** Shared dialog behavior with Coeus surface classes; caller supplies a title. */
export const UiDialog = {
  Root: Dialog.Root,
  Trigger: Dialog.Trigger,
  Portal: Dialog.Portal,
  Backdrop,
  Popup,
  Close: Dialog.Close,
};
