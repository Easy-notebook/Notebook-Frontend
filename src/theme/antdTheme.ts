// src/theme/antdTheme.ts
// Unified Ant Design theme configuration that matches the project's Vue-inspired design system
import type { ThemeConfig } from 'antd';

// Design system colors for light mode
const lightColors = {
  // Primary colors (Vue green gradient)
  primary: '#41B883',
  primaryHover: '#369870',
  primaryActive: '#2d7a5c',
  primaryLight: 'rgba(65, 184, 131, 0.1)',
  primaryLightest: 'rgba(65, 184, 131, 0.05)',

  // Secondary colors (Blue)
  secondary: '#3490DC',
  secondaryHover: '#2980c9',
  secondaryActive: '#1e70b6',

  // Accent colors (Purple)
  accent: '#6574CD',
  accentHover: '#5a67ba',
  accentActive: '#4f5aa7',

  // Text colors
  textPrimary: '#202124',
  textSecondary: '#35495E',
  textTertiary: '#6B7280',
  textDisabled: '#9CA3AF',

  // Background colors
  bgPrimary: '#FFFFFF',
  bgSecondary: '#F9FAFB',
  bgTertiary: '#F3F4F6',

  // Border colors
  borderPrimary: 'rgba(65, 184, 131, 0.2)',
  borderSecondary: 'rgba(65, 184, 131, 0.1)',
  borderLight: '#E5E7EB',

  // Status colors
  success: '#41B883',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3490DC',

  // Gradient backgrounds
  gradientPrimary: 'linear-gradient(to right, #41B883, #3490DC, #6574CD)',
  gradientSecondary: 'linear-gradient(135deg, rgba(65, 184, 131, 0.04), rgba(52, 144, 220, 0.04))',
};

// Design system colors for dark mode
const darkColors = {
  // Primary colors (brighter for dark mode)
  primary: '#52c896',
  primaryHover: '#6fd9ac',
  primaryActive: '#41b883',
  primaryLight: 'rgba(82, 200, 150, 0.15)',
  primaryLightest: 'rgba(82, 200, 150, 0.08)',

  // Secondary colors (Blue)
  secondary: '#5dade2',
  secondaryHover: '#7dc8f0',
  secondaryActive: '#3490dc',

  // Accent colors (Purple)
  accent: '#8b95e8',
  accentHover: '#a5aef2',
  accentActive: '#6574cd',

  // Text colors
  textPrimary: '#e5e5e7',
  textSecondary: '#b8bcc8',
  textTertiary: '#8b92a5',
  textDisabled: '#5f6677',

  // Background colors
  bgPrimary: '#1a1a1f',
  bgSecondary: '#232329',
  bgTertiary: '#2c2c35',

  // Border colors
  borderPrimary: 'rgba(82, 200, 150, 0.3)',
  borderSecondary: 'rgba(82, 200, 150, 0.15)',
  borderLight: 'rgba(255, 255, 255, 0.12)',

  // Status colors
  success: '#52c896',
  warning: '#fbbf24',
  error: '#f87171',
  info: '#5dade2',

  // Gradient backgrounds
  gradientPrimary: 'linear-gradient(to right, #52c896, #5dade2, #8b95e8)',
  gradientSecondary: 'linear-gradient(135deg, rgba(82, 200, 150, 0.08), rgba(93, 173, 226, 0.08))',
};

// Legacy export for backward compatibility
const colors = lightColors;

// Function to get theme config based on current theme mode
const getAntdTheme = (isDark = false): ThemeConfig => {
  const themeColors = isDark ? darkColors : lightColors;

  return {
    token: {
      // === Primary Colors ===
      colorPrimary: themeColors.primary,
      colorPrimaryHover: themeColors.primaryHover,
      colorPrimaryActive: themeColors.primaryActive,
      colorPrimaryBg: themeColors.primaryLightest,
      colorPrimaryBgHover: themeColors.primaryLight,
      colorPrimaryBorder: themeColors.borderPrimary,
      colorPrimaryBorderHover: themeColors.primary,

      // === Success Colors (align with primary) ===
      colorSuccess: themeColors.success,
      colorSuccessHover: themeColors.primaryHover,
      colorSuccessActive: themeColors.primaryActive,
      colorSuccessBg: themeColors.primaryLightest,
      colorSuccessBgHover: themeColors.primaryLight,
      colorSuccessBorder: themeColors.borderPrimary,

      // === Info Colors (align with secondary) ===
      colorInfo: themeColors.info,
      colorInfoHover: themeColors.secondaryHover,
      colorInfoActive: themeColors.secondaryActive,
      colorInfoBg: isDark ? 'rgba(93, 173, 226, 0.08)' : 'rgba(52, 144, 220, 0.05)',
      colorInfoBgHover: isDark ? 'rgba(93, 173, 226, 0.15)' : 'rgba(52, 144, 220, 0.1)',
      colorInfoBorder: isDark ? 'rgba(93, 173, 226, 0.3)' : 'rgba(52, 144, 220, 0.2)',

      // === Warning Colors ===
      colorWarning: themeColors.warning,
      colorWarningHover: isDark ? '#fcd34d' : '#E58E0A',
      colorWarningActive: isDark ? '#fbbf24' : '#D97706',
      colorWarningBg: isDark ? 'rgba(251, 191, 36, 0.08)' : 'rgba(245, 158, 11, 0.05)',
      colorWarningBgHover: isDark ? 'rgba(251, 191, 36, 0.15)' : 'rgba(245, 158, 11, 0.1)',
      colorWarningBorder: isDark ? 'rgba(251, 191, 36, 0.3)' : 'rgba(245, 158, 11, 0.2)',

      // === Error Colors ===
      colorError: themeColors.error,
      colorErrorHover: isDark ? '#fca5a5' : '#DC2626',
      colorErrorActive: isDark ? '#f87171' : '#B91C1C',
      colorErrorBg: isDark ? 'rgba(248, 113, 113, 0.08)' : 'rgba(239, 68, 68, 0.05)',
      colorErrorBgHover: isDark ? 'rgba(248, 113, 113, 0.15)' : 'rgba(239, 68, 68, 0.1)',
      colorErrorBorder: isDark ? 'rgba(248, 113, 113, 0.3)' : 'rgba(239, 68, 68, 0.2)',

      // === Text Colors ===
      colorText: themeColors.textPrimary,
      colorTextSecondary: themeColors.textSecondary,
      colorTextTertiary: themeColors.textTertiary,
      colorTextQuaternary: themeColors.textDisabled,
      colorTextDescription: themeColors.textTertiary,
      colorTextHeading: themeColors.textPrimary,
      colorTextLabel: themeColors.textSecondary,

      // === Background Colors ===
      colorBgContainer: themeColors.bgPrimary,
      colorBgElevated: themeColors.bgPrimary,
      colorBgLayout: themeColors.bgSecondary,
      colorBgSpotlight: themeColors.bgTertiary,
      colorBgMask: isDark ? 'rgba(0, 0, 0, 0.65)' : 'rgba(0, 0, 0, 0.45)',

      // === Border Colors ===
      colorBorder: themeColors.borderLight,
      colorBorderSecondary: themeColors.borderSecondary,

      // === Typography ===
      fontFamily:
        'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
      fontSize: 12, // Match index.css base font size
      fontSizeHeading1: 28.8, // 1.8rem * 16px
      fontSizeHeading2: 20.8, // 1.3rem * 16px
      fontSizeHeading3: 19.2, // 1.2rem * 16px
      fontSizeHeading4: 17.6, // 1.1rem * 16px
      fontSizeHeading5: 16, // 1rem * 16px
      lineHeight: 1.4, // Match index.css line height
      lineHeightHeading1: 1.6,
      lineHeightHeading2: 1.5,
      lineHeightHeading3: 1.2,
      lineHeightHeading4: 1.2,
      lineHeightHeading5: 1.2,

      // === Layout & Spacing ===
      borderRadius: 8, // Modern rounded corners
      borderRadiusLG: 12,
      borderRadiusSM: 4,
      borderRadiusXS: 2,

      // Padding
      paddingXXS: 4,
      paddingXS: 8,
      paddingSM: 12,
      padding: 16,
      paddingMD: 20,
      paddingLG: 24,
      paddingXL: 32,

      // Margin
      marginXXS: 4,
      marginXS: 8,
      marginSM: 12,
      margin: 16,
      marginMD: 20,
      marginLG: 24,
      marginXL: 32,
      marginXXL: 48,

      // === Motion & Animation ===
      motionDurationFast: '0.15s',
      motionDurationMid: '0.2s',
      motionDurationSlow: '0.3s',
      motionEaseInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
      motionEaseOut: 'cubic-bezier(0, 0, 0.2, 1)',

      // === Shadows ===
      boxShadow: isDark
        ? '0 1px 3px rgba(0, 0, 0, 0.3), 0 0 1px rgba(82, 200, 150, 0.2)'
        : '0 1px 3px rgba(0, 0, 0, 0.08), 0 0 1px rgba(65, 184, 131, 0.1)',
      boxShadowSecondary: isDark ? '0 1px 4px rgba(0, 0, 0, 0.3)' : '0 1px 4px rgba(0, 0, 0, 0.06)',
      boxShadowTertiary: isDark
        ? '0 2px 8px rgba(82, 200, 150, 0.2)'
        : '0 2px 8px rgba(65, 184, 131, 0.1)',

      // === Z-Index ===
      zIndexBase: 0,
      zIndexPopupBase: 1000,
    },

    components: {
      // === Button Component ===
      Button: {
        borderRadius: 6,
        fontWeight: 500,
        primaryShadow: isDark
          ? '0 2px 4px rgba(82, 200, 150, 0.3)'
          : '0 2px 4px rgba(65, 184, 131, 0.2)',
        defaultShadow: isDark ? '0 1px 2px rgba(0, 0, 0, 0.3)' : '0 1px 2px rgba(0, 0, 0, 0.05)',
        controlHeight: 32,
        controlHeightLG: 40,
        controlHeightSM: 24,
        paddingInline: 16,
        paddingInlineLG: 20,
        paddingInlineSM: 12,
        // Default button colors
        colorText: themeColors.textSecondary,
        colorBorder: themeColors.borderLight,
        colorBgContainer: themeColors.bgPrimary,
        // Primary button uses gradient background via CSS
        primaryColor: themeColors.primary,
      },

      // === Input Component ===
      Input: {
        borderRadius: 6,
        controlHeight: 32,
        controlHeightLG: 40,
        controlHeightSM: 24,
        paddingInline: 12,
        paddingBlock: 4,
        colorText: themeColors.textPrimary,
        colorTextPlaceholder: themeColors.textTertiary,
        colorBorder: themeColors.borderLight,
        activeBorderColor: themeColors.primary,
        activeShadow: `0 0 0 2px ${themeColors.primaryLight}`,
        errorActiveShadow: isDark
          ? '0 0 0 2px rgba(248, 113, 113, 0.15)'
          : '0 0 0 2px rgba(239, 68, 68, 0.1)',
        warningActiveShadow: isDark
          ? '0 0 0 2px rgba(251, 191, 36, 0.15)'
          : '0 0 0 2px rgba(245, 158, 11, 0.1)',
      },

      // === Tabs Component ===
      Tabs: {
        cardBg: themeColors.bgPrimary,
        cardHeight: 40,
        titleFontSize: 14,
        titleFontSizeLG: 16,
        titleFontSizeSM: 12,
        inkBarColor: themeColors.primary,
        itemActiveColor: themeColors.primary,
        itemHoverColor: themeColors.primaryHover,
        itemSelectedColor: themeColors.primary,
        colorText: themeColors.textSecondary,
        colorTextDescription: themeColors.textTertiary,
        margin: 0, // Remove default margins
        horizontalMargin: '0 0 0 0',
        verticalItemPadding: '8px 0',
        horizontalItemPadding: '12px 0',
        cardPadding: '0 12px',
      },

      // === Space Component ===
      Space: {
        size: 8,
        sizeLG: 16,
        sizeSM: 4,
      },

      // === Typography Component ===
      Typography: {
        titleMarginTop: '1.5em',
        titleMarginBottom: '0.5em',
        fontFamily:
          'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
      },

      // === Table Component ===
      Table: {
        borderRadius: 8,
        colorFillAlter: 'rgba(0, 0, 0, 0.01)', // Zebra striping
        colorBorderSecondary: themeColors.borderSecondary,
        headerBg: themeColors.primary,
        headerColor: '#000000',
        headerSplitColor: 'transparent',
        rowHoverBg: themeColors.primaryLightest,
        cellPaddingBlock: 8,
        cellPaddingInline: 12,
        cellPaddingBlockMD: 12,
        cellPaddingInlineMD: 16,
        cellPaddingBlockSM: 6,
        cellPaddingInlineSM: 8,
        fontSize: 12,
        headerSortActiveBg: themeColors.primaryLight,
        headerSortHoverBg: 'rgba(255, 255, 255, 0.1)',
        fixedHeaderSortActiveBg: themeColors.primaryLight,
        bodySortBg: themeColors.primaryLightest,
      },

      // === Dropdown Component ===
      Dropdown: {
        borderRadius: 8,
        controlPaddingHorizontal: 12,
        boxShadowSecondary: '0 4px 12px rgba(0, 0, 0, 0.1), 0 0 1px rgba(65, 184, 131, 0.2)',
      },

      // === Menu Component ===
      Menu: {
        borderRadius: 6,
        itemBorderRadius: 4,
        itemHeight: 32,
        itemPaddingInline: 12,
        colorItemText: themeColors.textSecondary,
        colorItemTextHover: themeColors.primary,
        colorItemTextSelected: themeColors.primary,
        colorItemBgHover: themeColors.primaryLightest,
        colorItemBgSelected: themeColors.primaryLight,
        colorActiveBarBorderSize: 3,
        colorActiveBarWidth: 3,
      },

      // === Tooltip Component ===
      Tooltip: {
        borderRadius: 6,
        colorBgSpotlight: 'rgba(35, 41, 70, 0.9)',
        colorTextLightSolid: '#FFFFFF',
        boxShadowSecondary: '0 4px 12px rgba(0, 0, 0, 0.15)',
      },

      // === Popover Component ===
      Popover: {
        borderRadius: 8,
        boxShadowSecondary: '0 4px 12px rgba(0, 0, 0, 0.1), 0 0 1px rgba(65, 184, 131, 0.2)',
        titleMinWidth: 120,
      },

      // === Modal Component ===
      Modal: {
        borderRadius: 12,
        headerBg: themeColors.bgPrimary,
        contentBg: themeColors.bgPrimary,
        titleColor: themeColors.textPrimary,
        titleFontSize: 18,
        titleLineHeight: 1.4,
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.15), 0 0 1px rgba(65, 184, 131, 0.1)',
      },

      // === Card Component ===
      Card: {
        borderRadius: 8,
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08), 0 0 1px rgba(65, 184, 131, 0.1)',
        headerBg: 'transparent',
        headerFontSize: 16,
        headerFontSizeSM: 14,
        headerHeight: 48,
        headerHeightSM: 36,
      },

      // === Alert Component ===
      Alert: {
        borderRadius: 6,
        fontSizeIcon: 16,
        withDescriptionIconSize: 20,
        defaultPadding: '8px 12px',
        withDescriptionPadding: '12px 16px',
      },

      // === Notification Component ===
      Notification: {
        borderRadius: 8,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15), 0 0 1px rgba(65, 184, 131, 0.2)',
        width: 384,
        padding: 16,
      },

      // === Message Component ===
      Message: {
        borderRadius: 6,
        contentPadding: '8px 12px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15), 0 0 1px rgba(65, 184, 131, 0.2)',
      },

      // === Form Component ===
      Form: {
        labelColor: themeColors.textSecondary,
        labelRequiredMarkColor: themeColors.error,
        labelFontSize: 14,
        itemMarginBottom: 16,
        verticalLabelPadding: '0 0 4px',
        verticalLabelMargin: '0 0 4px',
      },

      // === Select Component ===
      Select: {
        borderRadius: 6,
        controlHeight: 32,
        controlHeightLG: 40,
        controlHeightSM: 24,
        selectorBg: themeColors.bgPrimary,
        optionHeight: 32,
        optionPadding: '8px 12px',
        optionSelectedBg: themeColors.primaryLight,
        optionActiveBg: themeColors.primaryLightest,
        optionSelectedColor: themeColors.primary,
        showArrowPaddingInlineEnd: 24,
        boxShadowSecondary: '0 4px 12px rgba(0, 0, 0, 0.1), 0 0 1px rgba(65, 184, 131, 0.2)',
      },

      // === Checkbox Component ===
      Checkbox: {
        borderRadius: 2,
        size: 16,
        sizeSM: 14,
        colorPrimary: themeColors.primary,
        colorPrimaryHover: themeColors.primaryHover,
        colorWhite: '#FFFFFF',
      },

      // === Radio Component ===
      Radio: {
        size: 16,
        sizeSM: 14,
        colorPrimary: themeColors.primary,
        colorPrimaryHover: themeColors.primaryHover,
        radioSize: 16,
        dotSize: 8,
        dotColorDisabled: themeColors.textDisabled,
      },

      // === Switch Component ===
      Switch: {
        borderRadius: 100,
        handleSize: 18,
        handleSizeSM: 14,
        trackHeight: 22,
        trackHeightSM: 16,
        trackMinWidth: 44,
        trackMinWidthSM: 28,
        trackPadding: 2,
        innerMinMargin: 4,
        innerMaxMargin: 24,
        innerMaxMarginSM: 14,
      },

      // === Slider Component ===
      Slider: {
        borderRadius: 2,
        railSize: 4,
        railBg: themeColors.bgTertiary,
        railHoverBg: themeColors.borderSecondary,
        trackBg: themeColors.primary,
        trackHoverBg: themeColors.primaryHover,
        handleSize: 14,
        handleSizeHover: 16,
        handleLineWidth: 2,
        handleColor: themeColors.primary,
        handleActiveColor: themeColors.primaryActive,
        dotSize: 6,
        dotActiveBorderColor: themeColors.primary,
        dotBorderColor: themeColors.borderLight,
      },
    },

    // CSS Variables for custom styling
    cssVar: true,
    hashed: false, // Disable hash for easier CSS overrides
  };
};

// Default export - light theme for backward compatibility
const antdTheme = getAntdTheme(false);

export default antdTheme;
export { getAntdTheme, colors, lightColors, darkColors };
