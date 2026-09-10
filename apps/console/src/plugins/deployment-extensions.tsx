import { useState } from 'react';
import { useSurfaceContext } from '@nexus/plugin-runtime/react';
import type { JsonValue, PluginDefinition } from '@nexus/plugin-runtime';
import { deploymentHpaDescriptor, deploymentVpaDescriptor, deploymentMonitoringDescriptor, deploymentNetworkDescriptor, deploymentExtensions } from './deployment-data';
import { type ResourceRef } from '@nexus/cluster-api';
import { findDeployment, updateDeployment, useDeployments } from './deployment-mock';

function resource(context: JsonValue | undefined): ResourceRef | undefined {
  if (!context || typeof context !== 'object' || Array.isArray(context) || !('itemRef' in context)) return;
  return context.itemRef as unknown as ResourceRef | undefined;
}
function useDeployment() { useDeployments(); return findDeployment(resource(useSurfaceContext()?.value)); }
function HpaCard() {
  const item = useDeployment();
  const [message, setMessage] = useState('');
  if (!item) return <p>资源不可用</p>;
  return <article className="nexus-content-card"><span className="nexus-kicker">HPA · 水平伸缩</span><h2>{item.hpa ? '自动伸缩已启用' : '自动伸缩未启用'}</h2><p>当前 {item.replicas} 个副本 · 范围 {item.min}–{item.max} · CPU 目标 70%</p><form className="deployment-filters" onSubmit={event => {
    event.preventDefault(); const data = new FormData(event.currentTarget); const min = Number(data.get('min')), max = Number(data.get('max'));
    if (min > max) { setMessage('最小副本数不能大于最大副本数'); return; }
    updateDeployment(item.ref, { min, max, hpa: true }, `HPA 范围更新为 ${min}–${max}`); setMessage('HPA 配置已保存（mock）');
  }}><label>最小副本 <input name="min" type="number" min="1" max="20" required defaultValue={item.min} /></label><label>最大副本 <input name="max" type="number" min="1" max="20" required defaultValue={item.max} /></label><button className="nexus-button nexus-button--primary">保存伸缩配置</button></form><p role="status">{message}</p></article>;
}
function VpaCard() {
  const item = useDeployment();
  if (!item) return <p>资源不可用</p>;
  return <article className="nexus-content-card"><span className="nexus-kicker">VPA · 资源建议</span><h2>容器资源配置</h2><p>当前请求：{item.requestCpu}m CPU / {item.requestMemory} MiB 内存</p><p>模拟建议：500m CPU / 768 MiB 内存。通过上方「应用 VPA 建议」更新配置，结果同步到这里和事件列表。</p></article>;
}
function MonitoringTab() {
  const item = useDeployment();
  if (!item) return <p>资源不可用</p>;
  const values = [item.cpu - 18, item.cpu - 12, item.cpu - 16, item.cpu - 6, item.cpu - 9, item.cpu];
  return <article><h2>{item.ref.name} 监控</h2><p>最近 25 分钟 · 每 5 分钟一个模拟采样点</p><div className="deployment-chart" role="img" aria-label={`CPU 趋势：${values.join('、')}%，当前 ${item.cpu}%`}>{values.map((value, index) => <div key={index}><span style={{ height: `${value * 1.6}px` }} /><strong>{value}%</strong><small>{(5 - index) * 5} 分钟前</small></div>)}</div><p>当前内存：{item.memory} MiB · 就绪副本：{item.ready}/{item.replicas}</p></article>;
}
function NetworkTab() {
  const item = useDeployment();
  if (!item) return <p>资源不可用</p>;
  return <article><h2>{item.ref.name} 网络</h2><p>关联 Service 与 Deployment 使用同一个命名空间。</p><dl className="nexus-definition-list"><div><dt>Service</dt><dd>{item.service}</dd></div><div><dt>集群内部地址</dt><dd>{item.service}.{item.ref.namespace}.svc.cluster.local:{item.port}</dd></div><div><dt>就绪端点</dt><dd>{item.ready}</dd></div><div><dt>类型</dt><dd>ClusterIP</dd></div></dl><p>以上为模拟连接信息，不会发起网络请求。</p></article>;
}

export const deploymentHpa: PluginDefinition = { ...deploymentHpaDescriptor, activate({ contributions }) {
  contributions.registerSurface({ id: 'hpa-card', target: { kind: 'builtin', render: HpaCard } });
  contributions.registerExtension(deploymentExtensions['hpa-card']);
} };
export const deploymentVpa: PluginDefinition = { ...deploymentVpaDescriptor, activate({ contributions, actions }) {
  contributions.registerSurface({ id: 'vpa-card', target: { kind: 'builtin', render: VpaCard } });
  contributions.registerExtension(deploymentExtensions['vpa-card']);
  actions.register('apply-recommendation', async ({ context }) => {
    const ref = resource(context); if (!ref) throw new Error('Missing resource');
    updateDeployment(ref, { requestCpu: 500, requestMemory: 768 }, 'VPA 建议已应用：500m CPU / 768 MiB');
    return 'VPA 建议已应用（mock）';
  });
  contributions.registerExtension(deploymentExtensions['vpa-apply']);
} };
export const deploymentMonitoring: PluginDefinition = { ...deploymentMonitoringDescriptor, activate({ contributions }) {
  contributions.registerSurface({ id: 'monitoring', target: { kind: 'builtin', render: MonitoringTab } });
  contributions.registerExtension(deploymentExtensions['monitoring-tab']);
} };
export const deploymentNetwork: PluginDefinition = { ...deploymentNetworkDescriptor, activate({ contributions }) {
  contributions.registerSurface({ id: 'network', target: { kind: 'builtin', render: NetworkTab } });
  contributions.registerExtension(deploymentExtensions['network-tab']);
} };
