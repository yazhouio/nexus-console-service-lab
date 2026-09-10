import { useState } from 'react';
import { RouteLink, Slot, ActionMenu, useUiObservation, useRouteContext } from '@nexus/plugin-runtime/react';
import type { ContributionRef, PluginDefinition } from '@nexus/plugin-runtime';
import { deploymentDescriptor, deploymentRoutes, deploymentNavigation } from './deployment-data';
import { DEPLOYMENT_EXTENSION_POINTS, DEPLOYMENT_CARDS_POINT, DEPLOYMENT_TABS_POINT, DEPLOYMENT_ACTIONS_POINT } from '@nexus/cluster-api';
import { useDeployments } from './deployment-mock';
import './deployment.css';

function DeploymentList() {
  const records = useDeployments();
  const [query, setQuery] = useState('');
  const [namespace, setNamespace] = useState('all');
  const filtered = records.filter(item => (namespace === 'all' || item.ref.namespace === namespace) && item.ref.name.includes(query.toLowerCase()));
  return <div className="nexus-page deployment-example">
    <div className="nexus-page-heading"><div><span className="nexus-kicker">工作负载 / DEMO CLUSTER</span><h1>Deployments</h1><p>查看应用运行状态，打开详情管理伸缩、监控与网络。</p></div><span className="nexus-status-chip">MOCK 数据</span></div>
    <p className="nexus-info-banner">这是可交互的示例环境。操作仅更新当前页面会话中的模拟数据，刷新后恢复初始状态。</p>
    <section className="nexus-content-card"><div className="deployment-filters"><label>搜索应用 <input value={query} onChange={event => setQuery(event.target.value)} placeholder="例如 checkout" /></label><label>命名空间 <select aria-label="命名空间" value={namespace} onChange={event => setNamespace(event.target.value)}><option value="all">全部</option><option>production</option><option>staging</option></select></label><span>{filtered.length} 个 Deployment</span></div>
      <div className="deployment-table-wrap"><table><thead><tr><th>名称</th><th>命名空间</th><th>状态</th><th>就绪副本</th><th>镜像</th></tr></thead><tbody>{filtered.map(item => <tr key={item.ref.uid}><td><RouteLink routeId="deployment-detail" params={{ cluster: item.ref.clusterId, namespace: item.ref.namespace!, deployment: item.ref.name }}>{item.ref.name}</RouteLink></td><td>{item.ref.namespace}</td><td><span className={`nexus-status-chip ${item.ready === item.replicas ? 'nexus-status-chip--success' : ''}`}>{item.ready === item.replicas ? '运行正常' : '更新中'}</span></td><td>{item.ready} / {item.replicas}</td><td>{item.image}</td></tr>)}</tbody></table></div>
      {!filtered.length && <p role="status">没有匹配的 Deployment，请调整筛选条件。</p>}
    </section>
  </div>;
}

function DeploymentDetail() {
  const { params } = useRouteContext();
  const records = useDeployments();
  const item = records.find(record => record.ref.clusterId === params.cluster && record.ref.namespace === params.namespace && record.ref.name === params.deployment);
  if (!item) return <div className="nexus-page"><h1>Deployment 不存在</h1><p>该资源不在示例数据中。</p><RouteLink routeId="deployment-list" params={{}}>返回 Deployments</RouteLink></div>;
  const context = { itemRef: { ...item.ref } };
  const key = `${item.ref.clusterId}/${item.ref.namespace}/${item.ref.name}`;
  return <div className="nexus-page deployment-example">
    <RouteLink routeId="deployment-list" params={{}}>← Deployments</RouteLink>
    <div className="nexus-page-heading"><div><span className="nexus-kicker">{item.ref.clusterId} / {item.ref.namespace}</span><h1>{item.ref.name}</h1><p>{item.image}</p></div><span className="nexus-status-chip">MOCK 数据</span></div>
    <section className="deployment-metrics" aria-label="资源概览"><article><span>就绪副本</span><strong>{item.ready} / {item.replicas}</strong></article><article><span>CPU 使用率</span><strong>{item.cpu}%</strong></article><article><span>内存使用</span><strong>{item.memory} MiB</strong></article></section>
    <section className="nexus-content-card"><h2>资源操作</h2><ActionMenu point={DEPLOYMENT_ACTIONS_POINT} context={context} /></section>
    <section aria-label="伸缩建议"><Slot id={DEPLOYMENT_CARDS_POINT.id} contextKey={key} context={context} /></section>
    <section className="nexus-content-card"><DeploymentTabs key={key} contextKey={key} context={context} /></section>
    <section className="nexus-content-card"><h2>最近事件</h2><ul>{item.events.map((event, index) => <li key={index}>{event}</li>)}</ul></section>
  </div>;
}

// Selection is stored in the URL; surfaces remain mounted by the runtime Slot.
function DeploymentTabs({ contextKey, context }: { contextKey: string; context: { itemRef: Record<string, string | undefined> } }) {
  const [tab, setTab] = useState(() => new URLSearchParams(window.location.search).get('view') ?? 'monitoring');
  const observation = useUiObservation();
  const available = observation?.occurrences.find(slot => slot.pointId === DEPLOYMENT_TABS_POINT.id && slot.input.submittedKey === contextKey)?.contributions;
  const match = available?.find(contribution => contribution.tabId === tab);
  const selected: ContributionRef[] = match ? [match.ref] : [];
  return <Slot id={DEPLOYMENT_TABS_POINT.id} contextKey={contextKey} context={context as import('@nexus/plugin-runtime').JsonValue} selected={selected} feedback={(state, retry, error) => <>
    <div role="tablist" aria-label="Deployment 详情">{state?.contributions.map(contribution => <button key={contribution.ref.id} role="tab" aria-selected={contribution.tabId === tab} aria-controls="deployment-tab-panel" tabIndex={contribution.tabId === tab || !match && contribution === state?.contributions[0] ? 0 : -1} onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const buttons = [...event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>('[role=tab]:not(:disabled)')];
      const index = buttons.indexOf(event.currentTarget);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }} disabled={contribution.availability !== 'available'} onClick={() => {
      const next = contribution.tabId!; setTab(next); const url = new URL(window.location.href); url.searchParams.set('view', next); window.history.replaceState(window.history.state, '', url);
    }}>{contribution.label}</button>)}</div>
    {state && !state.contributions.some(contribution => contribution.tabId === tab) && <p>当前视图不可用，请选择其他 Tab。</p>}
    {error && <p role="alert">{error}</p>}
    {state?.runtimeError && <p role="alert">{state.runtimeError}</p>}
    {state?.input.acceptance === 'rejected' && <p role="alert">资源上下文无效</p>}
    {state?.contributions.filter(contribution => contribution.execution?.phase === 'failed').map(contribution => <button key={contribution.ref.id} onClick={() => { if (contribution.execution?.retryTarget) void retry(contribution.execution.retryTarget); }}>重试 {contribution.label}</button>)}
  </>} panel={{ id: 'deployment-tab-panel', label: 'Deployment 详情内容' }} />;
}

export const deployment: PluginDefinition = {
  ...deploymentDescriptor,
  activate({ contributions }) {
    DEPLOYMENT_EXTENSION_POINTS.forEach(point => contributions.registerExtensionPoint(point));
    contributions.registerRoute({ ...deploymentRoutes.list, target: { kind: 'builtin', render: DeploymentList } });
    contributions.registerRoute({ ...deploymentRoutes.detail, target: { kind: 'builtin', render: DeploymentDetail } });
    contributions.registerNavigation(deploymentNavigation);
  },
};
