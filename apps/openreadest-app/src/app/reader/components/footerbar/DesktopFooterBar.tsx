import React, { useCallback, useEffect, useRef } from 'react';
import { FaHeadphones } from 'react-icons/fa6';
import { RiArrowLeftSLine, RiArrowRightSLine } from 'react-icons/ri';
import { RiArrowGoBackLine, RiArrowGoForwardLine } from 'react-icons/ri';
import { RiArrowLeftDoubleLine, RiArrowRightDoubleLine } from 'react-icons/ri';
import { getNavigationIcon, getNavigationLabel, getNavigationHandler } from './utils';
import { useReaderStore } from '@/store/readerStore';
import { isPageTurnRtl } from '@/utils/pageTurnDirection';
import { useTranslation } from '@/hooks/useTranslation';
import { useBookDataStore } from '@/store/bookDataStore';
import { FooterBarChildProps } from './types';
import { formatProgress } from '@/utils/progress';
import Button from '@/components/Button';

const DesktopFooterBar: React.FC<FooterBarChildProps> = ({
  bookKey,
  gridInsets,
  progressValid,
  progressFraction,
  navigationHandlers,
  onSpeakText,
}) => {
  const _ = useTranslation();
  const { hoveredBookKey, getView, getViewState, getProgress, getViewSettings } = useReaderStore();
  const { getBookData } = useBookDataStore();
  const view = getView(bookKey);
  const bookData = getBookData(bookKey);
  const progress = getProgress(bookKey);
  const viewState = getViewState(bookKey);
  const viewSettings = getViewSettings(bookKey);
  const progressStyle = viewSettings?.progressStyle || 'percentage';

  const [progressValue, setProgressValue] = React.useState(
    progressValid ? progressFraction * 100 : 0,
  );

  const { section, pageinfo } = progress || {};
  const template = progressStyle === 'fraction' ? '{current} / {total}' : '{percent}%';
  const pageInfo = bookData?.isFixedLayout ? section : pageinfo;
  const progressInfo = formatProgress(pageInfo?.current, pageInfo?.total, template, false, 'en', 0);

  const rangeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (hoveredBookKey !== bookKey) {
      if (rangeInputRef.current && document.activeElement === rangeInputRef.current) {
        rangeInputRef.current.blur();
      }
    }
  }, [hoveredBookKey, bookKey]);

  useEffect(() => {
    if (progressValid) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProgressValue(progressFraction * 100);
    }
  }, [progressValid, progressFraction]);

  const handleProgressChange = useCallback(
    (value: number) => {
      setProgressValue(value);
      navigationHandlers.onProgressChange(value);
    },
    [navigationHandlers],
  );

  const isMobile = window.innerWidth < 640 || window.innerHeight < 640;

  return (
    <div
      className='absolute hidden h-8 w-full items-center gap-x-4 px-4 sm:flex'
      style={{ bottom: isMobile ? `${gridInsets.bottom * 0.33}px` : '0px' }}
    >
      <Button
        icon={getNavigationIcon(
          isPageTurnRtl(viewSettings),
          <RiArrowLeftDoubleLine />,
          <RiArrowRightDoubleLine />,
        )}
        onClick={getNavigationHandler(
          isPageTurnRtl(viewSettings),
          navigationHandlers.onPrevSection,
          navigationHandlers.onNextSection,
        )}
        label={getNavigationLabel(
          isPageTurnRtl(viewSettings),
          _('Previous Section'),
          _('Next Section'),
        )}
      />
      <Button
        icon={getNavigationIcon(
          isPageTurnRtl(viewSettings),
          <RiArrowLeftSLine />,
          <RiArrowRightSLine />,
        )}
        onClick={getNavigationHandler(
          isPageTurnRtl(viewSettings),
          navigationHandlers.onPrevPage,
          navigationHandlers.onNextPage,
        )}
        label={getNavigationLabel(isPageTurnRtl(viewSettings), _('Previous Page'), _('Next Page'))}
      />
      <Button
        icon={getNavigationIcon(
          isPageTurnRtl(viewSettings),
          <RiArrowGoBackLine />,
          <RiArrowGoForwardLine />,
        )}
        onClick={navigationHandlers.onGoBack}
        label={_('Go Back')}
        disabled={!view?.history.canGoBack}
      />
      <Button
        icon={getNavigationIcon(
          isPageTurnRtl(viewSettings),
          <RiArrowGoForwardLine />,
          <RiArrowGoBackLine />,
        )}
        onClick={navigationHandlers.onGoForward}
        label={_('Go Forward')}
        disabled={!view?.history.canGoForward}
      />
      {progressValid && (
        <span
          title={_('Reading Progress')}
          aria-label={`${_('Reading Progress')}: ${Math.round(progressFraction * 100)}%`}
          className='mx-2 text-center text-sm'
        >
          <span aria-hidden='true'>{progressInfo}</span>
        </span>
      )}
      <input
        ref={rangeInputRef}
        type='range'
        className='text-base-content mx-2 min-w-0 flex-1'
        min={0}
        max={100}
        aria-label={_('Jump to Location')}
        value={progressValue}
        onChange={(e) => handleProgressChange(parseInt(e.target.value, 10))}
      />
      <Button
        icon={<FaHeadphones className={viewState?.ttsEnabled ? 'text-blue-500' : ''} />}
        onClick={onSpeakText!}
        label={_('Speak')}
      />
      <Button
        icon={getNavigationIcon(
          isPageTurnRtl(viewSettings),
          <RiArrowRightSLine />,
          <RiArrowLeftSLine />,
        )}
        onClick={getNavigationHandler(
          isPageTurnRtl(viewSettings),
          navigationHandlers.onNextPage,
          navigationHandlers.onPrevPage,
        )}
        label={getNavigationLabel(isPageTurnRtl(viewSettings), _('Next Page'), _('Previous Page'))}
      />
      <Button
        icon={getNavigationIcon(
          isPageTurnRtl(viewSettings),
          <RiArrowRightDoubleLine />,
          <RiArrowLeftDoubleLine />,
        )}
        onClick={getNavigationHandler(
          isPageTurnRtl(viewSettings),
          navigationHandlers.onNextSection,
          navigationHandlers.onPrevSection,
        )}
        label={getNavigationLabel(
          isPageTurnRtl(viewSettings),
          _('Next Section'),
          _('Previous Section'),
        )}
      />
    </div>
  );
};

export default DesktopFooterBar;
