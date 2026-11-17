import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { eventDispatcher } from '@/utils/event';
import Dialog from './Dialog';

const POSTER_URL = '/support/sponsor-poster.jpg';

export const setSponsorDialogVisible = (visible: boolean) => {
  document
    .getElementById('sponsor_window')
    ?.dispatchEvent(new CustomEvent('setDialogVisibility', { detail: { visible } }));
};

export const SponsorWindow = () => {
  const _ = useTranslation();
  const { appService } = useEnv();
  const [isOpen, setIsOpen] = useState(false);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const dialog = document.getElementById('sponsor_window');
    const handleVisibility = (event: Event) => {
      const { visible } = (event as CustomEvent<{ visible: boolean }>).detail;
      setIsOpen(visible);
      if (visible) setImageLoadFailed(false);
    };
    dialog?.addEventListener('setDialogVisibility', handleVisibility);
    return () => dialog?.removeEventListener('setDialogVisibility', handleVisibility);
  }, []);

  const handleSavePoster = async () => {
    if (appService?.isMobileApp) {
      eventDispatcher.dispatch('toast', {
        message: _('Take a screenshot, then open Alipay Scan and select it from your photos.'),
        type: 'info',
      });
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(POSTER_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const filename = 'KiriReadest-support-alipay.jpg';

      if (appService) {
        const saved = await appService.saveFile(filename, await blob.arrayBuffer(), 'image/jpeg');
        if (!saved) return;
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Failed to save support QR code:', error);
      eventDispatcher.dispatch('toast', {
        message: _('Could not save the QR code. Please try again or take a screenshot.'),
        type: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      id='sponsor_window'
      isOpen={isOpen}
      title={_('Support KiriReadest')}
      onClose={() => setIsOpen(false)}
      boxClassName='sm:!h-auto sm:!w-[480px] sm:!max-w-[92vw]'
      contentClassName='px-5 pb-6 sm:px-6'
    >
      {isOpen && (
        <div className='flex flex-col items-center gap-4 py-2'>
          <p className='text-base-content/80 text-sm leading-6'>
            {_(
              'If KiriReadest helps you read and learn, you can support its continued development.',
            )}
          </p>
          {imageLoadFailed ? (
            <p role='alert' className='text-error py-8 text-sm'>
              {_('Could not load the QR code. Please close this window and try again.')}
            </p>
          ) : (
            <Image
              src={POSTER_URL}
              alt={_('KiriReadest Alipay donation QR code')}
              width={1046}
              height={948}
              className='h-auto w-full max-w-80 rounded-lg'
              unoptimized
              onError={() => setImageLoadFailed(true)}
            />
          )}
          <p className='text-base-content/70 text-center text-sm'>
            {_(
              'Scan with Alipay, or select a saved image from your photos. Donations are optional.',
            )}
          </p>
          <div className='flex w-full flex-col gap-3 sm:flex-row'>
            <button
              type='button'
              className='btn btn-primary flex-1'
              onClick={handleSavePoster}
              disabled={imageLoadFailed || isSaving}
            >
              {isSaving
                ? _('Saving...')
                : appService?.isMobileApp
                  ? _('How to donate')
                  : _('Save QR code')}
            </button>
            <button
              type='button'
              className='btn btn-outline flex-1'
              onClick={() => setIsOpen(false)}
            >
              {_('Close')}
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
};
