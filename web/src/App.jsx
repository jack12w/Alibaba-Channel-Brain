import React, { lazy, Suspense, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import {
  Layout, Menu, Dropdown, Avatar, Space, Typography, Result, Button, Spin, Grid, Drawer,
} from 'antd';
import {
  DashboardOutlined, TeamOutlined, SyncOutlined, DollarOutlined,
  LogoutOutlined, BellOutlined, BookOutlined, ShopOutlined,
  AimOutlined, SettingOutlined, FlagOutlined, RiseOutlined,
  ThunderboltOutlined, AccountBookOutlined, PieChartOutlined, ApartmentOutlined,
  MenuOutlined, MoonOutlined, SunOutlined, ClockCircleOutlined,
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { getUser, clearAuth } from './api/client';
import { useThemeMode } from './theme/ThemeContext';

import Login from './pages/Login';
// 其余页面改为路由懒加载：首屏只下载当前页代码，进入时才按需加载
const Overview = lazy(() => import('./pages/Overview'));
const Customers = lazy(() => import('./pages/Customers'));
const CustomerDetail = lazy(() => import('./pages/CustomerDetail'));
const Renewals = lazy(() => import('./pages/Renewals'));
const Opportunities = lazy(() => import('./pages/Opportunities'));
const Knowledge = lazy(() => import('./pages/Knowledge'));
const Sell = lazy(() => import('./pages/Sell'));
const WorkLogs = lazy(() => import('./pages/WorkLogs'));
const Settings = lazy(() => import('./pages/Settings'));
const Goals = lazy(() => import('./pages/Goals'));
const Milestones = lazy(() => import('./pages/Milestones'));
const Ads = lazy(() => import('./pages/Ads'));
const Revenue = lazy(() => import('./pages/Revenue'));
const Camp = lazy(() => import('./pages/Camp'));
const Organize = lazy(() => import('./pages/Organize'));

const { Header, Sider, Content } = Layout;
const { useBreakpoint } = Grid;

// 路由 -> 顶栏标题（移动端无侧栏时用于定位当前页）
const PAGE_TITLE = {
  '/': '经营总览',
  '/customers': '客户管理',
  '/goals': '目标与达成',
  '/camp': '育商大盘',
  '/milestones': '新商里程碑',
  '/ads': '广告/开P率',
  '/revenue': 'AWB营收',
  '/work': '运营工作',
  '/knowledge': '知识库',
  '/renewals': 'T3/T6续约',
  '/sell': '售卖机会',
  '/opportunities': '新签跟进',
  '/organize': '组织管理',
  '/settings': '系统设置',
};

function Forbidden() {
  return (
    <Result
      status="403"
      title="403"
      subTitle="当前账号没有访问该模块的权限，请联系管理员开通"
      extra={<Button type="primary" onClick={() => (window.location.href = '/')}>返回首页</Button>}
    />
  );
}

function RequirePermission({ permission, children }) {
  const user = getUser();
  const perms = user?.permissions || [];
  if (!permission || perms.includes(permission) || perms.includes('system.manage')) {
    return children;
  }
  return <Forbidden />;
}

function SideContent({ theme, selectedKey, items, onMenuClick }) {
  const [logoOk, setLogoOk] = useState(true);
  return (
    <>
      <div style={{ minHeight: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px 16px' }}>
        {logoOk ? (
          <img
            src="/api/settings/logo"
            alt="渠道 Logo"
            style={{ maxHeight: 40, maxWidth: '100%', objectFit: 'contain' }}
            onError={() => setLogoOk(false)}
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', color: 'var(--ant-color-text)', fontSize: 16, fontWeight: 600 }}>
            <BellOutlined style={{ marginRight: 8, color: 'var(--ant-color-primary)' }} />
            渠道中心大脑
          </div>
        )}
      </div>
      <Menu
        theme={theme}
        mode="inline"
        selectedKeys={[selectedKey]}
        items={items}
        onClick={onMenuClick}
      />
    </>
  );
}

function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getUser();
  const perms = user?.permissions || [];
  const { mode, setMode, resolvedTheme } = useThemeMode();
  const screens = useBreakpoint();
  const isMobile = !screens.md; // < 768px 视为移动端
  const [drawerOpen, setDrawerOpen] = useState(false);

  const canSee = (perm) => !perm || perms.includes(perm) || perms.includes('system.manage');
  const menuGroups = [
    {
      type: 'group', label: '总览', children: [
        { key: '/', icon: <DashboardOutlined />, label: <Link to="/">经营总览</Link>, permission: 'dashboard.view' },
      ],
    },
    {
      type: 'group', label: '客户主数据', children: [
        { key: '/customers', icon: <TeamOutlined />, label: <Link to="/customers">客户管理</Link>, permission: 'customer.view' },
      ],
    },
    {
      type: 'group', label: '育商运营 a', children: [
        { key: '/goals', icon: <FlagOutlined />, label: <Link to="/goals">目标与达成</Link>, permission: 'goal.view' },
        { key: '/camp', icon: <PieChartOutlined />, label: <Link to="/camp">育商大盘</Link>, permission: 'goal.view' },
        { key: '/milestones', icon: <RiseOutlined />, label: <Link to="/milestones">新商里程碑</Link>, permission: 'goal.view' },
        { key: '/ads', icon: <ThunderboltOutlined />, label: <Link to="/ads">广告/开P率</Link>, permission: 'goal.view' },
        { key: '/revenue', icon: <AccountBookOutlined />, label: <Link to="/revenue">AWB营收</Link>, permission: 'goal.view' },
        { key: '/work', icon: <AimOutlined />, label: <Link to="/work">运营工作</Link>, permission: 'work.view' },
        { key: '/knowledge', icon: <BookOutlined />, label: <Link to="/knowledge">知识库</Link>, permission: 'knowledge.view' },
      ],
    },
    {
      type: 'group', label: '重资产 b', children: [
        { key: '/renewals', icon: <SyncOutlined />, label: <Link to="/renewals">T3/T6续约</Link>, permission: 'renewal.view' },
        { key: '/sell', icon: <ShopOutlined />, label: <Link to="/sell">售卖机会</Link>, permission: 'sell.view' },
      ],
    },
    {
      type: 'group', label: '新签客户 c', children: [
        { key: '/opportunities', icon: <DollarOutlined />, label: <Link to="/opportunities">新签跟进</Link>, permission: 'opportunity.view' },
      ],
    },
    {
      type: 'group', label: '系统配置 d', children: [
        { key: '/organize', icon: <ApartmentOutlined />, label: <Link to="/organize">组织管理</Link>, permission: 'system.manage' },
        { key: '/settings', icon: <SettingOutlined />, label: <Link to="/settings">系统设置</Link>, permission: 'system.manage' },
      ],
    },
  ];
  const menuItems = menuGroups
    .map((g) => ({ ...g, children: g.children.filter((c) => canSee(c.permission)) }))
    .filter((g) => g.children.length > 0);

  // 选中态：支持子路由前缀匹配（如 /customers/123 高亮"客户管理"），避免进详情页后菜单失焦
  const selectedKey = (() => {
    const keys = menuItems.flatMap((g) => (g.children || []).map((c) => c.key));
    const hit = keys
      .filter((k) => location.pathname === k || location.pathname.startsWith(k + '/'))
      .sort((a, b) => b.length - a.length)[0];
    return hit || location.pathname;
  })();

  const logout = () => {
    clearAuth();
    window.location.href = '/login';
  };

  const userMenu = {
    items: [
      { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: logout },
    ],
  };

  const themeMenu = {
    items: [
      { key: 'light', label: '浅色' },
      { key: 'dark', label: '深色' },
      { key: 'system', label: '跟随系统' },
    ],
    onClick: ({ key }) => setMode(key),
  };

  const themeIcon = mode === 'dark' ? <MoonOutlined /> : mode === 'light' ? <SunOutlined /> : <ClockCircleOutlined />;
  const themeText = mode === 'dark' ? '深色' : mode === 'light' ? '浅色' : '跟随系统';

  const headerTitle = PAGE_TITLE[selectedKey] || '渠道中心大脑';

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {!isMobile && (
        <Sider
          width={220}
          theme={resolvedTheme}
          style={{ position: 'sticky', top: 0, height: '100vh', overflow: 'auto', boxShadow: '2px 0 8px rgba(0,0,0,0.08)' }}
        >
          <SideContent theme={resolvedTheme} selectedKey={selectedKey} items={menuItems} />
        </Sider>
      )}
      <Layout>
        <Header
          style={{
            background: 'var(--ant-color-bg-container)',
            padding: isMobile ? '0 12px' : '0 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
        >
          <Space size={12}>
            {isMobile && (
              <Button type="text" icon={<MenuOutlined />} onClick={() => setDrawerOpen(true)} />
            )}
            <Typography.Text strong style={{ fontSize: isMobile ? 15 : 16 }}>
              {headerTitle}
            </Typography.Text>
          </Space>
          <Space size={12}>
            <Dropdown menu={themeMenu}>
              <Button type="text" icon={themeIcon}>
                {!isMobile && themeText}
              </Button>
            </Dropdown>
            <Typography.Text type="secondary" style={{ display: isMobile ? 'none' : 'inline' }}>
              {user?.real_name || user?.member?.name || user?.username}
              {user?.role_name ? ` · ${user.role_name}` : ''}
              {user?.data_scope === 'self' ? '（仅本人数据）' : user?.data_scope === 'team' ? '（本团队数据）' : ''}
            </Typography.Text>
            <Dropdown menu={userMenu}>
              <Avatar style={{ background: 'var(--ant-color-primary)', cursor: 'pointer' }}>
                {(user?.real_name || user?.member?.name || user?.username || 'A').slice(0, 1).toUpperCase()}
              </Avatar>
            </Dropdown>
          </Space>
        </Header>
        <Content style={{ margin: isMobile ? 12 : 20 }}>
          <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}><Spin size="large" /></div>}>
            <Routes>
              <Route path="/" element={<RequirePermission permission="dashboard.view"><Overview /></RequirePermission>} />
              <Route path="/customers" element={<RequirePermission permission="customer.view"><Customers /></RequirePermission>} />
              <Route path="/customers/:id" element={<RequirePermission permission="customer.view"><CustomerDetail /></RequirePermission>} />
              <Route path="/work" element={<RequirePermission permission="work.view"><WorkLogs /></RequirePermission>} />
              <Route path="/goals" element={<RequirePermission permission="goal.view"><Goals /></RequirePermission>} />
              <Route path="/milestones" element={<RequirePermission permission="goal.view"><Milestones /></RequirePermission>} />
              <Route path="/ads" element={<RequirePermission permission="goal.view"><Ads /></RequirePermission>} />
              <Route path="/revenue" element={<RequirePermission permission="goal.view"><Revenue /></RequirePermission>} />
              <Route path="/camp" element={<RequirePermission permission="goal.view"><Camp /></RequirePermission>} />
              <Route path="/renewals" element={<RequirePermission permission="renewal.view"><Renewals /></RequirePermission>} />
              <Route path="/sell" element={<RequirePermission permission="sell.view"><Sell /></RequirePermission>} />
              <Route path="/opportunities" element={<RequirePermission permission="opportunity.view"><Opportunities /></RequirePermission>} />
              <Route path="/knowledge" element={<RequirePermission permission="knowledge.view"><Knowledge /></RequirePermission>} />
              <Route path="/organize" element={<RequirePermission permission="system.manage"><Organize /></RequirePermission>} />
              <Route path="/settings" element={<RequirePermission permission="system.manage"><Settings /></RequirePermission>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </Content>
      </Layout>

      <Drawer
        placement="left"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={220}
        title="渠道中心大脑"
        styles={{ body: { padding: 0 } }}
      >
        <SideContent
          theme={resolvedTheme}
          selectedKey={selectedKey}
          items={menuItems}
          onMenuClick={() => setDrawerOpen(false)}
        />
      </Drawer>
    </Layout>
  );
}

export default function App() {
  const user = getUser();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/*" element={user ? <AppLayout /> : <Navigate to="/login" replace />} />
    </Routes>
  );
}
