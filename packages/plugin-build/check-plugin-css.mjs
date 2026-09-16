import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';

/** Build-time ownership checks, including the rightmost subject of each selector. */
export function checkCss(css, namespace, { allowFixed = false } = {}) {
  const root = postcss.parse(css);
  const privateName = (name) => name.startsWith(`${namespace}-`);
  const privateClass = (name) => privateName(name) || name.startsWith(`${namespace}:`);
  root.walkDecls((declaration) => {
    if (declaration.prop.startsWith('--nexus-')) throw Error('Platform tokens are read-only');
    if (declaration.prop.startsWith('--') && !privateName(declaration.prop.slice(2)))
      throw Error(`Unowned variable: ${declaration.prop}`);
    if (declaration.important) throw Error('Plugin CSS cannot use !important');
    if (
      !allowFixed &&
      (declaration.prop === 'z-index' ||
        (declaration.prop === 'position' && declaration.value === 'fixed'))
    )
      throw Error('Use the Overlay presentation API');
  });
  root.walkAtRules((rule) => {
    if (rule.name === 'import') throw Error('Unbundled CSS @import');
    if (rule.name.endsWith('keyframes') && !privateName(rule.params))
      throw Error(`Unowned keyframes: ${rule.params}`);
    if (rule.name === 'property' && !privateName(rule.params.replace(/^--/, '')))
      throw Error(`Unowned property: ${rule.params}`);
    if (rule.name === 'layer' && rule.params.split(',').some((name) => !privateName(name.trim())))
      throw Error(`Unowned layer: ${rule.params}`);
    if (rule.name === 'counter-style' && !privateName(rule.params))
      throw Error(`Unowned counter: ${rule.params}`);
    if (rule.name === 'font-face')
      rule.walkDecls('font-family', (d) => {
        if (!privateName(d.value.replace(/["']/g, ''))) throw Error(`Unowned font: ${d.value}`);
      });
  });
  root.walkRules((rule) => {
    if ((rule.parent?.name ?? '').endsWith('keyframes')) return;
    selectorParser((selectors) =>
      selectors.each((selector) => {
        selector.walk((node) => {
          if (node.type === 'class' && !privateClass(node.value))
            throw Error(`Unowned class: ${node.value}`);
          if (
            (node.type === 'tag' && !/^\d+$/.test(node.value)) ||
            node.type === 'id' ||
            node.type === 'universal'
          )
            throw Error(`Unowned selector: ${rule.selector}`);
          if (node.type === 'pseudo' && /:(?:root|host|global)/.test(node.value))
            throw Error('Plugin CSS cannot target the document or host');
        });
        let subject = false;
        selector.each((node) => {
          if (node.type === 'combinator') subject = false;
          if (node.type === 'class') {
            if (!privateClass(node.value)) throw Error(`Unowned class: ${node.value}`);
            subject = true;
          }
          if (node.type === 'id' || node.type === 'tag' || node.type === 'universal')
            throw Error(`Unowned selector: ${rule.selector}`);
          if (node.type === 'attribute' && node.attribute.startsWith('data-nexus-'))
            throw Error('Runtime presentation markers are private');
          if (node.type === 'pseudo' && /:(?:root|host|global)/.test(node.value))
            throw Error('Plugin CSS cannot target the document or host');
        });
        if (!subject) throw Error(`Selector subject needs a private class: ${rule.selector}`);
      }),
    ).processSync(rule.selector);
  });
}
