import type { PluginDescriptor } from '../../packages/plugin-runtime/src/plugin.ts';
import type { RouteContribution, NavigationContribution } from '../../packages/plugin-runtime/src/contribution.ts';
import { assertRouteMetadata, assertNavigationMetadata } from '../../packages/plugin-runtime/src/contribution.ts';
import { validateRestrictedInstallRecord, type RestrictedPluginManifest } from '../../packages/plugin-runtime/src/manifest.ts';
import { assertExtensionContribution, assertPointRef, type ExtensionKind, type ExtensionPointDefinition, type ExtensionPointRef, type ExtensionContributionDefinition } from '../../packages/plugin-runtime/src/ui/definitions.ts';
import { createPointCompiler, type PointContracts } from '../../packages/plugin-runtime/src/ui/point-compiler.ts';

export interface Source {
  readonly descriptor: PluginDescriptor;
  readonly manifest?: RestrictedPluginManifest;
  readonly points: readonly ExtensionPointDefinition[];
  readonly catalog?: readonly { ref: ExtensionPointRef; kind: ExtensionKind; title: string; description: string }[];
  readonly contributions: { readonly routes?: readonly Omit<RouteContribution, 'target'>[]; readonly navigation?: readonly NavigationContribution[]; readonly extensions?: readonly ExtensionContributionDefinition[] };
  readonly coverage: Readonly<Record<'points' | 'routes' | 'navigation' | 'extensions', 'complete' | 'partial' | 'unknown'>>;
  readonly evidence: string;
  readonly origin: string;
}

const kinds = {
  route: '路由页面与子路由；target 是渲染目标。',
  navigation: '导航链接或分组；由 Host 构建导航关系。',
  action: '通过 actionId 引用操作 handler，运行时按 Context 和条件求值。',
  tab: '通过 tabId/surfaceId 提供标签视图。',
  surface: '通过 surfaceId 提供内联内容；Slot 是运行时 occurrence。',
} satisfies Record<ExtensionKind, string>;
const notice = '> 本仓库选定声明的参考，非当前安装或可用状态。引用关系不代表授权、可见性或执行成功；实际结果请查看 Runtime Inspector。\n';
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const sorted = <T extends { id: string }>(values: readonly T[]) => [...values].sort((a, b) => compare(a.id, b.id));
// Escape prose and tables for both Markdown and MDX, including author-controlled text.
export const escapeMarkdown = (value: string) => value.replace(/&/g, '&amp;').replace(/[<>\{\}|`*_[\]\\#!]/g, c => `&#${c.charCodeAt(0)};`).replace(/\r?\n/g, ' ');
function json(value: unknown): string {
  const text = JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort(compare).map(key => [key, item[key]])) : item, 2);
  const fence = '`'.repeat(Math.max(3, ...Array.from(text.matchAll(/`+/g), match => match[0].length + 1)));
  return `${fence}json\n${text}\n${fence}\n`;
}
const identity = (source: Source) => `${source.descriptor.id}@${source.descriptor.version}`;
const filename = (source: Source) => `plugin-${encodeURIComponent(source.descriptor.id)}-${encodeURIComponent(source.descriptor.version)}.md`;
function table(headers: string[], rows: string[][]) {
  return `| ${headers.join(' | ')} |\n| ${headers.map(() => '---').join(' | ')} |\n${rows.map(row => `| ${row.map(escapeMarkdown).join(' | ')} |`).join('\n')}\n`;
}
function coverage(source: Source) {
  return table(['声明分组', '收录范围'], Object.entries(source.coverage)) + `\n依据：${escapeMarkdown(source.evidence)}\n\n执行对象、闭包和 handler 未纳入静态文档。complete 仅描述所选来源和版本的声明分组；未知收录量不能视为零。\n`;
}

export function generatePages(input: readonly Source[], contracts: PointContracts): Map<string, string> {
  const compile = createPointCompiler(contracts);
  const sources = [...input].sort((a, b) => compare(identity(a), identity(b)));
  const identities = new Set<string>();
  for (const source of sources) {
    if (identities.has(identity(source))) throw Error(`Duplicate plugin version: ${identity(source)}`);
    identities.add(identity(source));
    if (Object.values(source.coverage).includes('complete') && !source.evidence.trim()) throw Error('Complete coverage requires evidence');
    if (source.manifest) {
      // Offline shape validation with no granted permissions, no installation store or Host admission.
      // Entry validation uses the same local path restriction as kubeeye-installation.ts.
      validateRestrictedInstallRecord({ manifest: source.manifest, config: {
        id: source.manifest.id, version: source.manifest.version, enabled: false, grantedPermissions: [],
      } }, { isEntryAllowed: entry => entry.startsWith('/plugins/') });
    }
  }
  const points = sources.flatMap(source => {
    const ids = new Set<string>();
    const entries = sorted(source.points).map(point => {
      if (ids.has(point.id)) throw Error(`Duplicate Point: ${identity(source)}/${point.id}`);
      ids.add(point.id);
      return { source, point, compiled: compile(point), title: point.id, description: '' };
    });
    const seen = new Set<string>();
    for (const annotation of source.catalog ?? []) {
      const { ref } = annotation;
      assertPointRef(ref);
      const entry = entries.find(entry => entry.point.id === ref.id);
      if (!entry || ref.ownerPluginId !== source.descriptor.id || ref.contractMajor !== entry.point.contractMajor || annotation.kind !== entry.point.kind || seen.has(ref.id)) {
        throw Error(`Catalog mismatch or duplicate: ${identity(source)}/${ref.ownerPluginId}/${ref.id}@${ref.contractMajor} (${annotation.kind})`);
      }
      seen.add(ref.id);
      entry.title = annotation.title;
      entry.description = annotation.description;
    }
    return entries;
  });
  const contributions = sources.flatMap(source => (['routes', 'navigation', 'extensions'] as const).flatMap(group =>
    sorted<Omit<RouteContribution, 'target'> | NavigationContribution | ExtensionContributionDefinition>(source.contributions[group] ?? []).map(value => {
      if (group === 'routes') assertRouteMetadata(source.descriptor.id, value as Omit<RouteContribution, 'target'>);
      else if (group === 'navigation') assertNavigationMetadata(source.descriptor.id, value as NavigationContribution);
      else assertExtensionContribution(value as ExtensionContributionDefinition);
      return { source, group, value, kind: group === 'routes' ? 'route' : group === 'navigation' ? 'navigation' : (value as ExtensionContributionDefinition).kind };
    })));
  for (let i = 0; i < contributions.length; i++) {
    const a = contributions[i];
    for (const b of contributions.slice(i + 1)) {
      if (a.group !== b.group || a.value.id !== b.value.id) continue;
      const sameOwner = a.source.descriptor.id === b.source.descriptor.id;
      if (sameOwner && a.source.descriptor.version !== b.source.descriptor.version) continue;
      if (sameOwner || a.group !== 'extensions') throw Error(`Duplicate ${a.group} identity: ${identity(a.source)}/${a.value.id}, ${identity(b.source)}`);
    }
  }
  function relation(source: Source, value: { point?: ExtensionPointRef; expectedProfile?: string; expectedRefContract?: string }, kind: string) {
    const ref = value.point;
    if (!ref) return '未声明 Point 引用';
    assertPointRef(ref);
    const candidates = points.filter(p => p.source.descriptor.id === ref.ownerPluginId && p.point.id === ref.id &&
      (p.source.descriptor.id !== source.descriptor.id || p.source.descriptor.version === source.descriptor.version));
    const label = `${ref.ownerPluginId}/${ref.id}@${ref.contractMajor}`;
    if (!candidates.length) return `${label}：未解析（所选来源中未收录目标）`;
    return candidates.map(p => {
      const diagnostics = [];
      if (p.point.contractMajor !== ref.contractMajor) diagnostics.push('contractMajor 不匹配');
      if (p.point.kind !== kind) diagnostics.push('kind 不匹配');
      if (value.expectedProfile && value.expectedProfile !== p.point.profile) diagnostics.push('expectedProfile 不匹配');
      if (value.expectedRefContract && !Object.values(p.compiled.refContracts).some(r => r.id === value.expectedRefContract)) diagnostics.push('expectedRefContract 不匹配');
      return `${label}（目标插件 ${identity(p.source)}）：${diagnostics.join('；') || '声明目标已收录'}`;
    }).join('；');
  }
  const pages = new Map<string, string>();
  let reference = `# Kind / Profile / Ref Reference\n\n${notice}\n## Kind\n\n${table(['Kind', '执行语义概要'], Object.entries(kinds))}`;
  reference += '\n## Profile\n\n模板、参数位、允许约束和策略维度来自原 PointProfile。Profile 可选；无 Profile 的 Point 使用内联 Schema。\n';
  for (const profile of sorted(contracts.profiles ?? [])) reference += `\n### ${escapeMarkdown(profile.id)}\n\n${json(profile)}`;
  reference += '\n## Ref Contract\n\n领域 Schema、traits 和 predicates 来自原 RefContract。\n';
  for (const ref of sorted(contracts.refContracts ?? [])) reference += `\n### ${escapeMarkdown(ref.id)}\n\n${json(ref)}`;
  pages.set('reference.md', reference);
  let pointPage = `# Point Reference\n\n${notice}\n已收录贡献的反向引用不是全局贡献计数；未收录贡献不参与零贡献或孤立判断。不同插件版本分别展示。\n`;
  for (const { source, point, compiled, title, description } of points) {
    pointPage += `\n## ${escapeMarkdown(`${identity(source)}/${point.id}`)}\n\n${escapeMarkdown(title)} — ${escapeMarkdown(description)}\n\nOwner：${escapeMarkdown(source.descriptor.id)}\n\n### 原声明\n\n${json(point)}\n### 编译后的有效 Schema 与约束\n\n${json(compiled)}\n### 已收录贡献反向引用\n\n`;
    const refs = contributions.filter(c => c.value.point?.ownerPluginId === source.descriptor.id && c.value.point.id === point.id &&
      (c.source.descriptor.id !== source.descriptor.id || c.source.descriptor.version === source.descriptor.version));
    pointPage += refs.length ? table(['插件版本 / 分组 / Contribution', '声明关系'], refs.map(c => [`${identity(c.source)} / ${c.group} / ${c.value.id}`, relation(c.source, c.value, c.kind)])) : '所选来源中没有收录反向引用；不推断运行时零贡献。\n';
  }
  pages.set('points.md', pointPage);
  let index = `# 插件契约参考\n\n${notice}\n[Kind / Profile / Ref](./reference.md) · [Point Reference](./points.md)\n\n版本号分别属于插件、Point contractMajor 和 Profile/Ref ID，不能互相替代。requires/provides 是 Capability 声明，不从 Point 引用推导权限或依赖。\n`;
  for (const source of sources) {
    index += `\n## [${escapeMarkdown(identity(source))}](./${filename(source)})\n\n${coverage(source)}`;
    const { id, version, roles, provenance, requires, provides } = source.descriptor;
    let page = `# ${escapeMarkdown(identity(source))} Extension API\n\n${notice}\n来源：${escapeMarkdown(source.origin)}\n\n## 收录范围\n\n${coverage(source)}\n## Descriptor\n\n${json({ id, version, roles, provenance, requires, provides })}`;
    if (source.manifest) page += `\n## Restricted Manifest\n\n请求权限不表示管理员授予。安装配置不属于此参考。\n\n${json(source.manifest)}`;
    page += '\n## Extension Points\n\n';
    for (const point of sorted(source.points)) page += `### ${escapeMarkdown(point.id)}\n\n${json(point)}\n`;
    if (!source.points.length) page += source.coverage.points === 'complete' ? '该版本未声明 Point。\n' : 'Point 未纳入静态文档或收录不完整；数量未知。\n';
    for (const group of ['routes', 'navigation', 'extensions'] as const) {
      page += `\n## contributions.${group}\n\n`;
      const entries = contributions.filter(c => c.source === source && c.group === group);
      if (!entries.length) page += source.coverage[group] === 'complete' ? '该版本未声明此分组贡献。\n' : '未纳入静态文档或收录不完整；数量未知。\n';
      for (const c of entries) {
        page += `### ${escapeMarkdown(c.value.id)}\n\n${json(c.value)}\n${escapeMarkdown(relation(source, c.value, c.kind))}\n`;
        if ('childPoint' in c.value && c.value.childPoint) page += `\n子 Point：${escapeMarkdown(relation(source, { point: c.value.childPoint }, c.kind))}\n`;
      }
    }
    pages.set(filename(source), page);
  }
  pages.set('index.md', index);
  return pages;
}
