/**
 * Detect interactive typing targets so global editor shortcuts never steal keys.
 */
export function isInteractiveKeyboardTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;

  const el = target as HTMLElement;
  const tag = el.tagName;

  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  if (el.getAttribute('role') === 'textbox') return true;
  if (el.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""], [role="textbox"]')) {
    return true;
  }
  return false;
}
