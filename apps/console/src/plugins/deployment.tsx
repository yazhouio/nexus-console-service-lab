import { useState } from 'react';
import {
  RouteLink,
  Slot,
  ActionMenu,
  useUiObservation,
  useRouteContext,
} from '@feforgejs/plugin-runtime/react';
import type { ContributionRef, PluginDefinition } from '@feforgejs/plugin-runtime';
import { deploymentDescriptor, deploymentRoutes, deploymentNavigation } from './deployment-data';
import {
  DEPLOYMENT_EXTENSION_POINTS,
  DEPLOYMENT_CARDS_POINT,
  DEPLOYMENT_TABS_POINT,
  DEPLOYMENT_ACTIONS_POINT,
} from '@feforgejs/cluster-api';
import { useDeployments } from './deployment-mock';

function DeploymentList() {
  const records = useDeployments();
  const [query, setQuery] = useState('');
  const [namespace, setNamespace] = useState('all');
  const filtered = records.filter(
    (item) =>
      (namespace === 'all' || item.ref.namespace === namespace) &&
      item.ref.name.includes(query.toLowerCase()),
  );
  return (
    <div className="deployment-ui-el-div deployment-ui-page deployment-ui-example">
      <div className="deployment-ui-el-div deployment-ui-page-heading">
        <div className="deployment-ui-el-div">
          <span className="deployment-ui-el-span deployment-ui-kicker">
            工作负载 / DEMO CLUSTER
          </span>
          <h1 className="deployment-ui-el-h1">Deployments</h1>
          <p className="deployment-ui-el-p">查看应用运行状态，打开详情管理伸缩、监控与网络。</p>
        </div>
        <span className="deployment-ui-el-span deployment-ui-status-chip">MOCK 数据</span>
      </div>
      <p className="deployment-ui-el-p deployment-ui-info-banner">
        这是可交互的示例环境。操作仅更新当前页面会话中的模拟数据，刷新后恢复初始状态。
      </p>
      <section className="deployment-ui-el-section deployment-ui-content-card">
        <div className="deployment-ui-el-div deployment-ui-filters">
          <label className="deployment-ui-el-label">
            搜索应用{' '}
            <input
              className="deployment-ui-el-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="例如 checkout"
            />
          </label>
          <label className="deployment-ui-el-label">
            命名空间{' '}
            <select
              className="deployment-ui-el-select"
              aria-label="命名空间"
              value={namespace}
              onChange={(event) => setNamespace(event.target.value)}
            >
              <option className="deployment-ui-el-option" value="all">
                全部
              </option>
              <option className="deployment-ui-el-option">production</option>
              <option className="deployment-ui-el-option">staging</option>
            </select>
          </label>
          <span className="deployment-ui-el-span">{filtered.length} 个 Deployment</span>
        </div>
        <div className="deployment-ui-el-div deployment-ui-table-wrap">
          <table className="deployment-ui-el-table">
            <thead className="deployment-ui-el-thead">
              <tr className="deployment-ui-el-tr">
                <th className="deployment-ui-el-th">名称</th>
                <th className="deployment-ui-el-th">命名空间</th>
                <th className="deployment-ui-el-th">状态</th>
                <th className="deployment-ui-el-th">就绪副本</th>
                <th className="deployment-ui-el-th">镜像</th>
              </tr>
            </thead>
            <tbody className="deployment-ui-el-tbody">
              {filtered.map((item) => (
                <tr className="deployment-ui-el-tr" key={item.ref.uid}>
                  <td className="deployment-ui-el-td">
                    <RouteLink
                      className="deployment-ui-el-a"
                      routeId="deployment-detail"
                      params={{
                        cluster: item.ref.clusterId,
                        namespace: item.ref.namespace!,
                        deployment: item.ref.name,
                      }}
                    >
                      {item.ref.name}
                    </RouteLink>
                  </td>
                  <td className="deployment-ui-el-td">{item.ref.namespace}</td>
                  <td className="deployment-ui-el-td">
                    <span
                      className={
                        'deployment-ui-el-span ' +
                        `deployment-ui-status-chip ${item.ready === item.replicas ? 'deployment-ui-status-chip--success' : ''}`
                      }
                    >
                      {item.ready === item.replicas ? '运行正常' : '更新中'}
                    </span>
                  </td>
                  <td className="deployment-ui-el-td">
                    {item.ready} / {item.replicas}
                  </td>
                  <td className="deployment-ui-el-td">{item.image}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length && (
          <p className="deployment-ui-el-p" role="status">
            没有匹配的 Deployment，请调整筛选条件。
          </p>
        )}
      </section>
    </div>
  );
}

function DeploymentDetail() {
  const { params } = useRouteContext();
  const records = useDeployments();
  const item = records.find(
    (record) =>
      record.ref.clusterId === params.cluster &&
      record.ref.namespace === params.namespace &&
      record.ref.name === params.deployment,
  );
  if (!item)
    return (
      <div className="deployment-ui-el-div deployment-ui-page">
        <h1 className="deployment-ui-el-h1">Deployment 不存在</h1>
        <p className="deployment-ui-el-p">该资源不在示例数据中。</p>
        <RouteLink className="deployment-ui-el-a" routeId="deployment-list" params={{}}>
          返回 Deployments
        </RouteLink>
      </div>
    );
  const context = { itemRef: { ...item.ref } };
  const key = `${item.ref.clusterId}/${item.ref.namespace}/${item.ref.name}`;
  return (
    <div className="deployment-ui-el-div deployment-ui-page deployment-ui-example">
      <RouteLink className="deployment-ui-el-a" routeId="deployment-list" params={{}}>
        ← Deployments
      </RouteLink>
      <div className="deployment-ui-el-div deployment-ui-page-heading">
        <div className="deployment-ui-el-div">
          <span className="deployment-ui-el-span deployment-ui-kicker">
            {item.ref.clusterId} / {item.ref.namespace}
          </span>
          <h1 className="deployment-ui-el-h1">{item.ref.name}</h1>
          <p className="deployment-ui-el-p">{item.image}</p>
        </div>
        <span className="deployment-ui-el-span deployment-ui-status-chip">MOCK 数据</span>
      </div>
      <section className="deployment-ui-el-section deployment-ui-metrics" aria-label="资源概览">
        <article className="deployment-ui-el-article">
          <span className="deployment-ui-el-span">就绪副本</span>
          <strong className="deployment-ui-el-strong">
            {item.ready} / {item.replicas}
          </strong>
        </article>
        <article className="deployment-ui-el-article">
          <span className="deployment-ui-el-span">CPU 使用率</span>
          <strong className="deployment-ui-el-strong">{item.cpu}%</strong>
        </article>
        <article className="deployment-ui-el-article">
          <span className="deployment-ui-el-span">内存使用</span>
          <strong className="deployment-ui-el-strong">{item.memory} MiB</strong>
        </article>
      </section>
      <section className="deployment-ui-el-section deployment-ui-content-card">
        <h2 className="deployment-ui-el-h2">资源操作</h2>
        <ActionMenu
          classNames={{
            root: 'deployment-ui-actions deployment-ui-el-div',
            button: 'deployment-ui-el-button',
            status: 'deployment-ui-el-span',
            result: 'deployment-ui-el-pre',
          }}
          point={DEPLOYMENT_ACTIONS_POINT}
          context={context}
        />
      </section>
      <section className="deployment-ui-el-section" aria-label="伸缩建议">
        <Slot id={DEPLOYMENT_CARDS_POINT.id} contextKey={key} context={context} />
      </section>
      <section className="deployment-ui-el-section deployment-ui-content-card">
        <DeploymentTabs key={key} contextKey={key} context={context} />
      </section>
      <section className="deployment-ui-el-section deployment-ui-content-card">
        <h2 className="deployment-ui-el-h2">最近事件</h2>
        <ul className="deployment-ui-el-ul">
          {item.events.map((event, index) => (
            <li className="deployment-ui-el-li" key={index}>
              {event}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

// Selection is stored in the URL; surfaces remain mounted by the runtime Slot.
function DeploymentTabs({
  contextKey,
  context,
}: {
  contextKey: string;
  context: { itemRef: Record<string, string | undefined> };
}) {
  const [tab, setTab] = useState(
    () => new URLSearchParams(window.location.search).get('view') ?? 'monitoring',
  );
  const observation = useUiObservation();
  const available = observation?.occurrences.find(
    (slot) => slot.pointId === DEPLOYMENT_TABS_POINT.id && slot.input.submittedKey === contextKey,
  )?.contributions;
  const match = available?.find((contribution) => contribution.tabId === tab);
  const selected: ContributionRef[] = match ? [match.ref] : [];
  return (
    <Slot
      id={DEPLOYMENT_TABS_POINT.id}
      contextKey={contextKey}
      context={context as import('@feforgejs/plugin-runtime').JsonValue}
      selected={selected}
      feedback={(state, retry, error) => (
        <>
          <div className="deployment-ui-el-div" role="tablist" aria-label="Deployment 详情">
            {state?.contributions.map((contribution) => (
              <button
                className="deployment-ui-el-button"
                key={contribution.ref.id}
                role="tab"
                aria-selected={contribution.tabId === tab}
                aria-controls="deployment-tab-panel"
                tabIndex={
                  contribution.tabId === tab || (!match && contribution === state?.contributions[0])
                    ? 0
                    : -1
                }
                onKeyDown={(event) => {
                  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                  event.preventDefault();
                  const buttons = [
                    ...event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>(
                      '[role=tab]:not(:disabled)',
                    ),
                  ];
                  const index = buttons.indexOf(event.currentTarget);
                  const next =
                    event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? buttons.length - 1
                        : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) %
                          buttons.length;
                  buttons[next]?.focus();
                }}
                disabled={contribution.availability !== 'available'}
                onClick={() => {
                  const next = contribution.tabId!;
                  setTab(next);
                  const url = new URL(window.location.href);
                  url.searchParams.set('view', next);
                  window.history.replaceState(window.history.state, '', url);
                }}
              >
                {contribution.label}
              </button>
            ))}
          </div>
          {state && !state.contributions.some((contribution) => contribution.tabId === tab) && (
            <p className="deployment-ui-el-p">当前视图不可用，请选择其他 Tab。</p>
          )}
          {error && (
            <p className="deployment-ui-el-p" role="alert">
              {error}
            </p>
          )}
          {state?.runtimeError && (
            <p className="deployment-ui-el-p" role="alert">
              {state.runtimeError}
            </p>
          )}
          {state?.input.acceptance === 'rejected' && (
            <p className="deployment-ui-el-p" role="alert">
              资源上下文无效
            </p>
          )}
          {state?.contributions
            .filter((contribution) => contribution.execution?.phase === 'failed')
            .map((contribution) => (
              <button
                className="deployment-ui-el-button"
                key={contribution.ref.id}
                onClick={() => {
                  if (contribution.execution?.retryTarget)
                    void retry(contribution.execution.retryTarget);
                }}
              >
                重试 {contribution.label}
              </button>
            ))}
        </>
      )}
      panel={{ id: 'deployment-tab-panel', label: 'Deployment 详情内容' }}
    />
  );
}

export const deployment: PluginDefinition = {
  ...deploymentDescriptor,
  activate({ contributions }) {
    DEPLOYMENT_EXTENSION_POINTS.forEach((point) => contributions.registerExtensionPoint(point));
    contributions.registerRoute({
      ...deploymentRoutes.list,
      target: { kind: 'builtin', render: DeploymentList },
    });
    contributions.registerRoute({
      ...deploymentRoutes.detail,
      target: { kind: 'builtin', render: DeploymentDetail },
    });
    contributions.registerNavigation(deploymentNavigation);
  },
};
