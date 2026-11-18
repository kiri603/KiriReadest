import React, { useCallback, useEffect, useState } from 'react';
import Popup from '@/components/Popup';
import { Position } from '@/utils/sel';
import { useSettingsStore } from '@/store/settingsStore';
import { useTranslation } from '@/hooks/useTranslation';
import { useTranslator } from '@/hooks/useTranslator';
import { TRANSLATOR_LANGS } from '@/services/constants';
import { UseTranslatorOptions, getTranslators } from '@/services/translators';
import type { SelectionContext } from '@/utils/translationContext';
import Select from '@/components/Select';
import ContextMeaningCard from './ContextMeaningCard';

const notSupportedLangs = [''];

const generateTranslatorLangs = () => {
  return Object.fromEntries(
    Object.entries(TRANSLATOR_LANGS).filter(([code]) => !notSupportedLangs.includes(code)),
  );
};

const translatorLangs = generateTranslatorLangs();

interface TranslatorPopupProps {
  text: string;
  /** 选区所在的句子/段落，用于消除一词多义；提取失败时为 null */
  context?: SelectionContext | null;
  /** 打开设置里的 AI 面板（在弹窗里就能配置 key，不用改文件） */
  onConfigureAi?: () => void;
  position: Position;
  trianglePosition?: Position;
  popupWidth: number;
  popupHeight: number;
  onDismiss?: () => void;
}

interface TranslatorType {
  name: string;
  label: string;
}

const TranslatorPopup: React.FC<TranslatorPopupProps> = ({
  text,
  context,
  onConfigureAi,
  position,
  trianglePosition,
  popupWidth,
  popupHeight,
  onDismiss,
}) => {
  const _ = useTranslation();
  const { settings, setSettings } = useSettingsStore();
  const [providers, setProviders] = useState<TranslatorType[]>([]);
  const [sourceLang, setSourceLang] = useState('AUTO');
  const [targetLang, setTargetLang] = useState(settings.globalReadSettings.translateTargetLang);
  const [provider, setProvider] = useState(settings.globalReadSettings.translationProvider);
  const [translation, setTranslation] = useState<string | null>(null);
  const [detectedSourceLang, setDetectedSourceLang] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 语境释义卡片是否已给出结果：有结果时机器翻译失败不再报错，避免「成功 + 无法获取翻译」并存
  const [contextHasResult, setContextHasResult] = useState(false);
  const handleContextResult = useCallback((hasResult: boolean) => {
    setContextHasResult((previous) => (previous === hasResult ? previous : hasResult));
  }, []);
  const { translate, translators } = useTranslator({
    provider,
    sourceLang,
    targetLang,
  } as UseTranslatorOptions);

  const handleSourceLangChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSourceLang(event.target.value);
  };

  const handleTargetLangChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    settings.globalReadSettings.translateTargetLang = event.target.value;
    setSettings(settings);
    setTargetLang(event.target.value);
  };

  const handleProviderChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const requestedProvider = event.target.value;
    const availableTranslators = getTranslators().filter((t) => !t.quotaExceeded);
    const selectedTranslator =
      availableTranslators.find((t) => t.name === requestedProvider) || availableTranslators[0]!;
    if (selectedTranslator) {
      settings.globalReadSettings.translationProvider = selectedTranslator.name;
      setSettings(settings);
      setProvider(selectedTranslator.name);
    }
  };

  useEffect(() => {
    const availableProviders = translators.map((t) => {
      let label = t.label;
      if (t.quotaExceeded) {
        label = `${label} (${_('Quota Exceeded')})`;
      }
      return { name: t.name, label };
    });
    setProviders(availableProviders);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translators]);

  useEffect(() => {
    setLoading(true);
    const fetchTranslation = async () => {
      setError(null);
      setTranslation(null);

      try {
        const input = text.replaceAll('\n', '').trim();
        const result = await translate([input]);
        const translatedText = result[0];
        const detectedSource = null;

        if (!translatedText) {
          throw new Error('No translation found');
        }

        setTranslation(translatedText);
        if (sourceLang === 'AUTO' && detectedSource) {
          setDetectedSourceLang(detectedSource);
        }
      } catch (err) {
        console.error(err);
        setError(
          _('Google Translate failed. Check your network and proxy. If you use rule mode, try global mode.'),
        );
      } finally {
        setLoading(false);
      }
    };

    fetchTranslation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, sourceLang, targetLang, provider, translate]);

  return (
    <div>
      <Popup
        trianglePosition={trianglePosition}
        width={popupWidth}
        height={popupHeight}
        position={position}
        className='not-eink:text-white flex select-text flex-col bg-gray-600'
        triangleClassName='text-gray-600'
        onDismiss={onDismiss}
      >
        <div className='min-h-0 flex-1 overflow-y-auto overscroll-contain font-sans'>
          <div className='p-4'>
            <div className='mb-2 flex items-center justify-between'>
              <h1 className='text-sm font-normal'>{_('Original Text')}</h1>
              <Select
                className='not-eink:bg-gray-600 not-eink:text-white eink:bg-base-100'
                value={sourceLang}
                onChange={handleSourceLangChange}
                options={[
                  { value: 'AUTO', label: _('Auto Detect') },
                  ...Object.entries(translatorLangs)
                    .sort((a, b) => a[1].localeCompare(b[1]))
                    .map(([code, name]) => {
                      const label =
                        detectedSourceLang && sourceLang === 'AUTO' && code === 'AUTO'
                          ? `${translatorLangs[detectedSourceLang] || detectedSourceLang} ` +
                            _('(detected)')
                          : name;
                      return { value: code, label };
                    }),
                ]}
              />
            </div>
            <p className='not-eink:text-white/90 break-words text-base'>{text}</p>
          </div>

          <div className='mx-4 border-t border-gray-500/30' />

          <div className='break-words p-4'>
            <div className='mb-2 flex items-center justify-between'>
              <h2 className='text-sm font-normal'>{_('Translated Text')}</h2>
              <Select
                className='not-eink:bg-gray-600 not-eink:text-white eink:bg-base-100'
                value={targetLang}
                onChange={handleTargetLangChange}
                options={[
                  { value: '', label: _('System Language') },
                  ...Object.entries(translatorLangs)
                    .sort((a, b) => a[1].localeCompare(b[1]))
                    .map(([code, name]) => ({ value: code, label: name })),
                ]}
              />
            </div>

            <ContextMeaningCard
              text={text}
              context={context ?? null}
              sourceLang={sourceLang}
              targetLang={targetLang}
              translate={translate}
              onConfigureAi={onConfigureAi}
              onResult={handleContextResult}
            />

            {loading ? (
              <p className='text-base italic text-gray-500'>{_('Loading...')}</p>
            ) : error ? (
              contextHasResult ? null : (
                <p role='alert' className='text-base text-red-600'>
                  {error}
                </p>
              )
            ) : (
              <p className='not-eink:text-white/90 text-base'>
                {translation || _('No translation available.')}
              </p>
            )}
          </div>
        </div>
        <div className='flex min-h-8 shrink-0 items-center justify-between px-4'>
          <div className='line-clamp-1 text-xs opacity-60'>
            {provider &&
              !loading &&
              !error &&
              _('Translated by {{provider}}.', {
                provider: providers.find((p) => p.name === provider)?.label,
              })}
          </div>
          <Select
            className='not-eink:bg-gray-600 not-eink:text-white eink:bg-base-100'
            value={provider}
            onChange={handleProviderChange}
            options={providers.map(({ name: value, label }) => ({ value, label }))}
          />
        </div>
      </Popup>
    </div>
  );
};

export default TranslatorPopup;
