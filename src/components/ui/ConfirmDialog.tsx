"use client";

import React from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { IconTile } from "./IconTile";
import { WarningCircle } from "@phosphor-icons/react";

/** Заменяет нативный confirm() перед удалением аккаунта. */
export const ConfirmDialog: React.FC<{
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({
  open,
  title,
  description,
  confirmLabel = "Удалить",
  cancelLabel = "Отмена",
  loading,
  onConfirm,
  onCancel,
}) => (
  <Modal
    open={open}
    onClose={onCancel}
    size="sm"
    title={title}
    hint={description}
    icon={
      <IconTile tone="soft" size="md" className="text-danger-text">
        <WarningCircle size={20} />
      </IconTile>
    }
    footer={
      <>
        <Button variant="secondary" block onClick={onCancel} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button variant="danger" block loading={loading} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </>
    }
  >
    <></>
  </Modal>
);
