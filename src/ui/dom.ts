type Child = Node | string | null | undefined | false;

type Props<K extends keyof HTMLElementTagNameMap> =
  & Partial<Omit<HTMLElementTagNameMap[K], "style" | "children">>
  & { class?: string; attrs?: Record<string, string> };

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props<K> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  const { class: cls, attrs, ...rest } = props;
  Object.assign(el, rest);
  if (cls) el.className = cls;
  for (const [name, value] of Object.entries(attrs ?? {})) el.setAttribute(name, value);
  el.append(...children.filter((c): c is Node | string => !!c));
  return el;
}

export function clear(el: Element) {
  el.replaceChildren();
}
