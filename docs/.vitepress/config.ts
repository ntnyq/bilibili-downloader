import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Bilibili Downloader',
  description: 'Download Bilibili videos, audio, and companion assets.',
  lang: 'en',
  locales: {
    root: {
      label: 'English',
      lang: 'en',
      themeConfig: {
        nav: [
          { text: 'Guide', link: '/usage' },
          { text: 'Development', link: '/development' },
        ],
        sidebar: [
          {
            text: 'Guide',
            items: [
              { text: 'Getting started', link: '/' },
              { text: 'Usage', link: '/usage' },
              { text: 'Local helper', link: '/native-helper' },
              { text: 'Native integration', link: '/native-bridge' },
            ],
          },
          {
            text: 'Development',
            items: [
              { text: 'Development guide', link: '/development' },
              { text: 'Architecture', link: '/implementation' },
              { text: 'Roadmap', link: '/roadmap' },
              { text: 'Verification', link: '/verification' },
              { text: 'Privacy policy', link: '/privacy-policy' },
            ],
          },
        ],
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
          { text: '使用指南', link: '/zh/usage' },
          { text: '开发文档', link: '/zh/development' },
        ],
        sidebar: [
          {
            text: '使用指南',
            items: [
              { text: '快速开始', link: '/zh/' },
              { text: '使用说明', link: '/zh/usage' },
              { text: '本地助手', link: '/zh/native-helper' },
              { text: '原生助手集成', link: '/zh/native-bridge' },
            ],
          },
          {
            text: '开发文档',
            items: [
              { text: '开发指南', link: '/zh/development' },
              { text: '实现方案', link: '/zh/implementation' },
              { text: '扩展路线图', link: '/zh/roadmap' },
              { text: '验证记录', link: '/zh/verification' },
              { text: '隐私政策', link: '/zh/privacy-policy' },
            ],
          },
        ],
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
