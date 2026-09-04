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
      { text: '开始接入', link: '/plugin-author-guide' },
      { text: 'API', link: '/plugin-api-reference' },
      { text: '架构', link: '/lifecycle-architecture' },
      { text: 'Capability Catalog', link: '/capability-catalog' },
    ],
    sidebar: {
      '/': [
        {
          text: '开始使用',
          items: [
            { text: '文档首页', link: '/' },
            { text: '文档地图', link: '/README' },
            { text: 'Plugin Author Guide', link: '/plugin-author-guide' },
            { text: 'Example Plugins', link: '/example-plugins' },
            { text: 'Troubleshooting', link: '/troubleshooting' },
          ],
        },
        {
          text: 'P0 · Contract',
          items: [
            { text: 'Plugin API Reference', link: '/plugin-api-reference' },
            { text: 'Manifest / Contract Spec', link: '/manifest-contract-spec' },
            { text: 'Capability Catalog', link: '/capability-catalog' },
          ],
        },
        {
          text: 'P0 · Architecture',
          items: [
            { text: 'Lifecycle & Architecture', link: '/lifecycle-architecture' },
          ],
        },
        {
          text: 'P1 · Operations',
          items: [
            { text: 'Compatibility & Versioning', link: '/compatibility-versioning' },
            { text: 'Sandbox Security Model', link: '/sandbox-security-model' },
          ],
        },
        {
          text: 'P2 · Maintainers',
          items: [
            { text: 'Internal Implementation Design', link: '/internal-implementation-design' },
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
