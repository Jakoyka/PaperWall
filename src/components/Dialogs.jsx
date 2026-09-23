import React, { useEffect, useRef, useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
} from '@fluentui/react-components';
import { useT } from '../i18n/index.js';

// Pop-up with one text box (used to name / rename categories and tabs).
export function NameDialog({ open, title, label, initial, confirmLabel, onClose, onSubmit }) {
  const t = useT();
  const [value, setValue] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    setValue(initial ?? '');
    // once the pop-up is on screen: focus the box and select the text so typing replaces it
    const timer = setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 80);
    return () => clearTimeout(timer);
  }, [open, initial]);

  const submit = () => {
    const v = value.trim();
    if (v) onSubmit(v);
  };

  return (
    <Dialog open={open} onOpenChange={(_e, d) => { if (!d.open) onClose(); }}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{title}</DialogTitle>
          <DialogContent>
            <Field label={label}>
              <Input
                ref={inputRef}
                value={value}
                onChange={(_e, d) => setValue(d.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
              />
            </Field>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>{t('custom.cancel')}</Button>
            <Button appearance="primary" disabled={!value.trim()} onClick={submit}>{confirmLabel}</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

// "Are you sure?" pop-up.
export function ConfirmDialog({ open, title, body, confirmLabel, onClose, onConfirm }) {
  const t = useT();
  return (
    <Dialog open={open} onOpenChange={(_e, d) => { if (!d.open) onClose(); }}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{title}</DialogTitle>
          <DialogContent>{body}</DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>{t('custom.cancel')}</Button>
            <Button appearance="primary" onClick={onConfirm}>{confirmLabel}</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
