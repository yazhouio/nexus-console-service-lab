import { Component, type ReactNode } from 'react';

export class SurfaceBoundary extends Component<
  { children: ReactNode; fail(error: unknown): void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    this.props.fail(error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
