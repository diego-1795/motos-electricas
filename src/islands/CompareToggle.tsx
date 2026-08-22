import { useStore } from '@nanostores/preact';
import { $compare, toggleCompare } from '../stores/compare';
import { toast } from '../stores/toast';
import { site } from '../config/site';

export default function CompareToggle({ slug, name }: { slug: string; name: string }) {
  const list = useStore($compare);
  const active = list.includes(slug);
  const onClick = () => {
    const r = toggleCompare(slug);
    if (r === 'full') toast(`Puedes comparar hasta ${site.compareLimit} modelos`, { label: 'Ver comparador', href: '/comparar' });
    else if (r === 'added') toast(`${name} añadido al comparador`, { label: 'Comparar', href: '/comparar' });
  };
  return (
    <button type="button" class={`btn btn--ghost btn--sm${active ? ' is-active' : ''}`} onClick={onClick} aria-pressed={active} data-compare-toggle={slug}>
      {active ? '✓ Comparando' : 'Comparar'}
    </button>
  );
}
