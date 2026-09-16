import { resolve } from 'node:path';

import { defineConfig } from '@rspress/core';

export default defineConfig({
  root: 'docs',
  title: 'Nexus Frontend Plugin Runtime',
  description: 'A contract-first frontend plugin runtime with Restricted + Wujie integration.',
  lang: 'zh',
  route: {
    cleanUrls: true,
  },
  globalStyles: resolve('docs/styles.css'),
  themeConfig: {
    nav: [
      { text: '通用框架', link: '/framework-overview' },
      { text: '构建插件系统', link: '/build-plugin-system' },
      { text: '开发插件', link: '/plugin-author-guide' },
      { text: 'API 参考', link: '/plugin-api-reference' },
      { text: '维护者', link: '/maintainers/' },
    ],
    sidebar: {
      '/maintainers/': [
        {
          text: '维护者文档',
          items: [
            { text: '维护者首页', link: '/maintainers/' },
            { text: 'Console Core 架构', link: '/maintainers/console-core-architecture' },
            { text: '内部实现', link: '/maintainers/internal-implementation-design' },
            { text: 'Host 路由设计', link: '/maintainers/host-routing-design' },
            { text: 'Host 路由实施', link: '/maintainers/host-routing-implementation' },
            { text: 'Externalization 设计', link: '/maintainers/plugin-externalization-design' },
            { text: 'Externalization 实现与发布', link: '/maintainers/plugin-externalization' },
            { text: '插件样式设计', link: '/maintainers/plugin-styling-design' },
            { text: '插件样式实施', link: '/maintainers/plugin-styling-implementation' },
            { text: 'UI 组合设计', link: '/maintainers/cross-plugin-ui-composition-design' },
            {
              text: 'UI 组合实施',
              link: '/maintainers/cross-plugin-ui-composition-implementation',
            },
          ],
        },
      ],
      '/': [
        {
          text: '一、通用框架',
          items: [
            { text: '项目介绍', link: '/' },
            { text: '三层边界与包职责', link: '/framework-overview' },
            { text: '生命周期与概念', link: '/lifecycle-architecture' },
            { text: '文档地图', link: '/README' },
          ],
        },
        {
          text: '二、构建业务插件系统',
          items: [
            { text: '从零搭建', link: '/build-plugin-system' },
            { text: '宿主集成参考', link: '/host-integration' },
            { text: '三层示例地图', link: '/example-plugins' },
          ],
        },
        {
          text: '三、开发插件',
          items: [
            { text: '插件开发指南', link: '/plugin-author-guide' },
            { text: 'Deployment 完整案例', link: '/deployment-example' },
            { text: 'UI 组合指南', link: '/ui-composition-guide' },
          ],
        },
        {
          text: '接口与契约',
          items: [
            { text: 'Plugin API', link: '/plugin-api-reference' },
            { text: 'Manifest', link: '/manifest-contract-spec' },
            { text: 'UI 组合契约', link: '/cross-plugin-ui-composition-contract' },
            { text: '生成的契约参考', link: '/generated/plugin-contract/' },
            { text: '能力清单', link: '/capability-catalog' },
          ],
        },
        {
          text: '运行与排障',
          items: [
            { text: '兼容性与版本', link: '/compatibility-versioning' },
            { text: '安全边界', link: '/sandbox-security-model' },
            { text: '故障排查', link: '/troubleshooting' },
          ],
        },
      ],
    },
    darkMode: true,
    search: true,
    lastUpdated: true,
    enableContentAnimation: true,
    enableScrollToTop: true,
    localeRedirect: 'never',
    footer: {
      message: 'Nexus Frontend Plugin Runtime · V1 documentation',
    },
  },
});
