import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider, App as AntApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import 'dayjs/locale/zh-cn';
import App from './App';
import { ThemeProvider, useThemeMode } from './theme/ThemeContext';
import { getThemeConfig } from './theme/theme';
import './index.css';

// ConfigProvider 需位于 ThemeProvider 内部以读取 resolvedTheme；
// cssVar: true 会向 :root 注入 --ant-* 变量，使自定义 CSS 类(.page-card 等)也能随主题翻转
function ThemeConfig({ children }) {
  const { resolvedTheme } = useThemeMode();
  const themeConfig = getThemeConfig(resolvedTheme);
  return (
    <ConfigProvider locale={zhCN} theme={{ ...themeConfig, cssVar: true }}>
      {children}
    </ConfigProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <ThemeConfig>
        <AntApp>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AntApp>
      </ThemeConfig>
    </ThemeProvider>
  </React.StrictMode>
);
