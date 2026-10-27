import { Select } from 'antd';
import { Code2 } from 'lucide-react';
import { CODE_LANGUAGES, normalizeCodeLanguage } from '@Store/models/codeLanguage';

const logos: Record<string, string> = {
  aal: '/images/languages/easynet.webp',
  python: '/images/languages/python.svg',
  javascript: '/images/languages/javascript.svg',
  typescript: '/images/languages/typescript.svg',
};

function LanguageLogo({ language }: { language: string }) {
  return logos[language] ? (
    <img
      src={logos[language]}
      alt=""
      width={18}
      height={18}
      style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0 }}
    />
  ) : (
    <Code2 size={18} aria-hidden="true" />
  );
}

export function CodeLanguageSelect({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const language = normalizeCodeLanguage(value);
  const known = CODE_LANGUAGES.some((option) => option.value === language);
  const choices = known
    ? CODE_LANGUAGES
    : [...CODE_LANGUAGES, { value: language, label: `${language} (plain text)` }];
  return (
    <Select
      aria-label="Code language"
      title={choices.find((option) => option.value === language)?.label}
      value={language}
      disabled={disabled}
      onChange={onChange}
      size="small"
      style={{ width: 62 }}
      popupMatchSelectWidth={180}
      optionLabelProp="selectedLabel"
      options={choices.map((option) => ({
        value: option.value,
        selectedLabel: (
          <span className="inline-flex items-center align-middle">
            <LanguageLogo language={option.value} />
          </span>
        ),
        label: (
          <span className="flex items-center gap-2">
            <LanguageLogo language={option.value} />
            <span>{option.label}</span>
          </span>
        ),
      }))}
    />
  );
}
