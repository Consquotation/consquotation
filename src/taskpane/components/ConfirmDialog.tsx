import * as React from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
} from "@fluentui/react-components";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Hộp xác nhận dạng alert: phải chọn một nút, không đóng khi bấm ra ngoài. */
const ConfirmDialog: React.FC<ConfirmDialogProps> = (props) => (
  <Dialog modalType="alert" open={props.open}>
    <DialogSurface>
      <DialogBody>
        <DialogTitle>{props.title}</DialogTitle>
        <DialogContent>{props.body}</DialogContent>
        <DialogActions>
          <Button appearance="secondary" onClick={props.onCancel}>
            {props.cancelLabel}
          </Button>
          <Button appearance="primary" onClick={props.onConfirm}>
            {props.confirmLabel}
          </Button>
        </DialogActions>
      </DialogBody>
    </DialogSurface>
  </Dialog>
);

export default ConfirmDialog;
