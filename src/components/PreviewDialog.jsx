import React from 'react';
import {
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from '@fluentui/react-components';
import { Dismiss24Regular, Image20Regular, FolderOpen20Regular } from '@fluentui/react-icons';
import { useActions } from '../actions.js';
import { useT } from '../i18n/index.js';
import api from '../api.js';

export default function PreviewDialog({ item, onClose }) {
  const t = useT();
  const actions = useActions();
  return (
    <Dialog open={!!item} onOpenChange={(_e, data) => { if (!data.open) onClose(); }}>
      <DialogSurface className="preview-surface">
        <DialogBody>
          <DialogTitle
            action={
              <Button appearance="subtle" aria-label={t('wall.close')} icon={<Dismiss24Regular />} onClick={onClose} />
            }
          >
            {item?.name}
          </DialogTitle>
          <DialogContent>
            {item && <img className="preview-img" src={api.previewUrl(item.id)} alt={item.name} draggable={false} />}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" icon={<FolderOpen20Regular />} onClick={() => actions.reveal(item)}>
              {t('wall.reveal')}
            </Button>
            <Button appearance="primary" icon={<Image20Regular />} onClick={() => actions.setWallpaper(item)}>
              {t('wall.set')}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
