import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';

const VUE_SECONDARY = '#35495E';

const LanguageSwitcher = () => {
  const { i18n } = useTranslation();
  
  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
    localStorage.setItem('language', lng);
  };

  return (
    <button
      onClick={() => changeLanguage(i18n.language === 'zh' ? 'en' : 'zh')}
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/80 backdrop-blur-md hover:bg-white/90 transition-colors"
      style={{ color: VUE_SECONDARY }}
    >
      <Globe size={16} />
      <span className="text-sm font-medium whitespace-nowrap">
        {i18n.language === 'zh' ? '中文' : 'English'}
      </span>
    </button>
  );
};

export default LanguageSwitcher;