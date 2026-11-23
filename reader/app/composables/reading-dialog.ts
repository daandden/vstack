import type { Ref } from "vue";

export function useReadingDialog(
  open: Ref<boolean>,
  dialog: Readonly<Ref<HTMLDialogElement | null>>,
  firstItem: () => HTMLElement | undefined,
  triggerId: string,
) {
  let opener: Element | null = null;
  let openingHash = "";
  watch(open, async (show) => {
    const d = dialog.value;
    if (!d) return;
    if (show && !d.open) {
      opener = document.activeElement;
      openingHash = location.hash;
      d.showModal();
      await nextTick();
      if (d.open) focusReadingItem(firstItem());
    } else if (!show && d.open) d.close();
  });
  function closed() {
    if (dialog.value?.open) return;
    open.value = false;
    if (location.hash !== openingHash) return;
    const focus = document.activeElement;
    if (focus && focus !== document.body && focus !== opener && !dialog.value?.contains(focus)) return;
    if (opener instanceof HTMLElement && opener.isConnected && opener !== document.body) opener.focus({ preventScroll: true });
    else document.getElementById(triggerId)?.focus({ preventScroll: true });
  }
  return { closed };
}

export function focusReadingItem(item: HTMLElement | undefined) {
  item?.focus({ preventScroll: true });
  item?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
}
