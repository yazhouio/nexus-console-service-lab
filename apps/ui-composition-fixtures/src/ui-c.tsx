import { useState } from 'react';
import { useSurfaceContext } from '@nexus/plugin-runtime/react';
import { mount } from './mount';
function Chart() {
  const context = useSurfaceContext();
  const [instance] = useState(() => crypto.randomUUID());
  return (
    <section data-testid="ui-c">
      <h4>C chart</h4>
      <p data-testid="c-instance">{instance}</p>
      <pre data-testid="c-context">{JSON.stringify(context)}</pre>
      <div style={{ width: '100%', height: 40, background: '#dbeafe' }}>Chart area</div>
    </section>
  );
}
mount(<Chart />);
