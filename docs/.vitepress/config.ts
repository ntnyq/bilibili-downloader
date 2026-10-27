import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Bilibili Downloader',
  description: 'Download Bilibili videos, audio, and companion assets.',
  lang: 'en',
  head: [['link', { rel: 'icon', type: 'image/png', href: '/icon.png' }]],
  locales: {
    root: {
      label: 'English',
      lang: 'en',
      themeConfig: {
        nav: [
          { text: 'Get started', link: '/getting-started' },
          { text: 'Features', link: '/usage' },
          { text: 'Development', link: '/development' },
          { text: 'Help', link: '/troubleshooting' },
        ],
        sidebar: [
          {
            text: 'Start here',
            items: [
              { text: 'Introduction', link: '/' },
              {
                text: 'Installation & first download',
                link: '/getting-started',
              },
              { text: 'Feature overview', link: '/usage' },
            ],
          },
          {
            text: 'Feature guides',
            items: [
              { text: 'Video, quality & tasks', link: '/downloads' },
              { text: 'Batch downloads', link: '/batch-downloads' },
              { text: 'Audio & companion assets', link: '/assets' },
              { text: 'Files & history', link: '/files-and-history' },
            ],
          },
          {
            text: 'Advanced',
            collapsed: false,
            items: [
              { text: 'Cache & large downloads', link: '/cache-storage' },
              { text: 'Local FFmpeg helper', link: '/native-helper' },
              { text: 'Native integration', link: '/native-bridge' },
            ],
          },
          {
            text: 'Help & privacy',
            collapsed: false,
            items: [
              { text: 'Troubleshooting', link: '/troubleshooting' },
              { text: 'Permissions & data', link: '/permissions' },
              { text: 'Privacy policy', link: '/privacy-policy' },
            ],
          },
          {
            text: 'Developer reference',
            collapsed: true,
            items: [
              { text: 'Development guide', link: '/development' },
              { text: 'Architecture', link: '/implementation' },
              { text: 'Implementation milestones', link: '/roadmap' },
              { text: 'Verification records', link: '/verification' },
            ],
          },
        ],
        editLink: {
          pattern:
            'https://github.com/ntnyq/bilibili-downloader/edit/main/docs/:path',
          text: 'Edit this page on GitHub',
        },
        footer: {
          message: 'Project code released under the MIT License.',
        },
      },
    },
    zh: {
      label: '简体中文',
      lang: 'zh-CN',
      title: 'B 站下载器',
      description: '在浏览器中下载 B 站视频、音频与配套素材。',
      markdown: {
        container: {
          tipLabel: '提示',
          noteLabel: '说明',
          infoLabel: '信息',
          warningLabel: '警告',
          dangerLabel: '危险',
          detailsLabel: '详情',
        },
        codeCopyButton: {
          tooltipText: '复制代码',
          copiedText: '已复制',
        },
      },
      themeConfig: {
        nav: [
          { text: '快速开始', link: '/zh/getting-started' },
          { text: '功能指南', link: '/zh/usage' },
          { text: '开发文档', link: '/zh/development' },
          { text: '常见问题', link: '/zh/troubleshooting' },
        ],
        sidebar: [
          {
            text: '开始使用',
            items: [
              { text: '产品介绍', link: '/zh/' },
              { text: '安装与首次下载', link: '/zh/getting-started' },
              { text: '功能概览', link: '/zh/usage' },
            ],
          },
          {
            text: '功能指南',
            items: [
              { text: '视频、画质与任务', link: '/zh/downloads' },
              { text: '批量下载', link: '/zh/batch-downloads' },
              { text: '音频与配套素材', link: '/zh/assets' },
              { text: '文件与下载记录', link: '/zh/files-and-history' },
            ],
          },
          {
            text: '进阶配置',
            collapsed: false,
            items: [
              { text: '缓存与大型下载', link: '/zh/cache-storage' },
              { text: '本地 FFmpeg 助手', link: '/zh/native-helper' },
              { text: '原生助手集成', link: '/zh/native-bridge' },
            ],
          },
          {
            text: '帮助与隐私',
            collapsed: false,
            items: [
              { text: '故障排查', link: '/zh/troubleshooting' },
              { text: '权限与本地数据', link: '/zh/permissions' },
              { text: '隐私政策', link: '/zh/privacy-policy' },
            ],
          },
          {
            text: '开发参考',
            collapsed: true,
            items: [
              { text: '开发指南', link: '/zh/development' },
              { text: '架构说明', link: '/zh/implementation' },
              { text: '实现里程碑', link: '/zh/roadmap' },
              { text: '验证记录', link: '/zh/verification' },
            ],
          },
        ],
        editLink: {
          pattern:
            'https://github.com/ntnyq/bilibili-downloader/edit/main/docs/:path',
          text: '在 GitHub 上编辑此页',
        },
        outline: { label: '本页目录' },
        docFooter: { prev: '上一页', next: '下一页' },
        langMenuLabel: '切换语言',
        navMenuLabel: '主导航',
        mobileMenuLabel: '菜单',
        extraMenuLabel: '更多选项',
        darkModeSwitchLabel: '外观',
        lightModeSwitchTitle: '切换到浅色模式',
        darkModeSwitchTitle: '切换到深色模式',
        sidebarMenuLabel: '菜单',
        returnToTopLabel: '返回顶部',
        skipToContentLabel: '跳转到内容',
        notFound: {
          title: '页面未找到',
          quote: '页面可能已移动，请返回首页继续浏览。',
          linkLabel: '返回首页',
          linkText: '返回首页',
        },
        footer: { message: '项目代码基于 MIT 许可证发布。' },
      },
    },
  },
  themeConfig: {
    logo: { src: '/icon.png', alt: 'Bilibili Downloader' },
    outline: { level: [2, 3] },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/ntnyq/bilibili-downloader' },
    ],
    search: {
      provider: 'local',
      options: {
        locales: {
          zh: {
            translations: {
              button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
              modal: {
                displayDetails: '显示详细列表',
                resetButtonTitle: '清除搜索',
                backButtonTitle: '关闭搜索',
                noResultsText: '没有找到相关结果',
                footer: {
                  selectText: '选择',
                  selectKeyAriaLabel: '回车键',
                  navigateText: '切换',
                  navigateUpKeyAriaLabel: '向上箭头',
                  navigateDownKeyAriaLabel: '向下箭头',
                  closeText: '关闭',
                  closeKeyAriaLabel: 'Esc 键',
                },
              },
            },
          },
        },
      },
    },
  },
})
