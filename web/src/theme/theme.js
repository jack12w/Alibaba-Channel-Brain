import { theme } from 'antd';

/**
 * 渠道中心大脑 · 设计令牌
 * 色值严格对齐 design-tokens.css / 配色看板：
 *   - 浅色模式：浅底(#F0F2F5 页面 / #FFFFFF 卡片) + 深色字
 *   - 深色模式：深底(#141414 / #1F1F1F) + 白色字，品牌色与语义色各提亮一档保对比度
 * 对比度铁律：深底白字 · 浅底黑字 · 深色主色区(按钮/标签)内文字用白
 */

export const BRAND = {
  primary: '#0F6BFF',
  primaryHover: '#0A57D6',
  primaryActive: '#0846A8',
  primaryBg: '#E6F0FF',
};

const sharedToken = {
  borderRadius: 8,
  fontSize: 14,
  colorLink: '#0F6BFF',
  controlHeight: 34,
};

export const lightTheme = {
  algorithm: theme.defaultAlgorithm,
  token: {
    ...sharedToken,
    colorPrimary: '#0F6BFF',
    colorPrimaryHover: '#0A57D6',
    colorPrimaryActive: '#0846A8',
    colorInfo: '#0F6BFF',
    colorInfoHover: '#0A57D6',
    colorInfoActive: '#0846A8',
    colorSuccess: '#52C41A',
    colorWarning: '#FAAD14',
    colorError: '#FF4D4F',
    colorBgLayout: '#F0F2F5',
    colorBgContainer: '#FFFFFF',
    colorBgElevated: '#FFFFFF',
    colorBorder: '#E8E8E8',
    colorBorderSecondary: '#F0F0F0',
  },
};

export const darkTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    ...sharedToken,
    colorPrimary: '#4096FF',
    colorPrimaryHover: '#5BA8FF',
    colorPrimaryActive: '#2A7DE0',
    colorInfo: '#4096FF',
    colorInfoHover: '#5BA8FF',
    colorInfoActive: '#2A7DE0',
    colorSuccess: '#49AA19',
    colorWarning: '#D89614',
    colorError: '#FF7875',
    colorBgLayout: '#141414',
    colorBgContainer: '#1F1F1F',
    colorBgElevated: '#1F1F1F',
    colorBorder: '#303030',
    colorBorderSecondary: '#262626',
  },
};

export function getThemeConfig(resolvedTheme) {
  return resolvedTheme === 'dark' ? darkTheme : lightTheme;
}
