// What the panel and the dialogs share: the text size and the two controls, so both look the same.
import { h_flex } from "gpui-base";
import { shared, setShared } from "herdr";

const SCALE = "sessionmemory.textScale", MIN = 0.8, MAX = 2;

// The person's text size for this mod, as a factor of the designed sizes.
export function textScale() {
  const s = Number(shared(SCALE));
  return Number.isFinite(s) && s >= MIN && s <= MAX ? s : 1;
}

export function setTextScale(next) {
  setShared(SCALE, Math.min(MAX, Math.max(MIN, Math.round(next * 10) / 10)));
}

// A designed px size at the person's text size.
export function px(n) {
  return Math.round(n * textScale());
}

export function chip(t, id, on, onClick) {
  return h_flex().id(id).h(px(24)).px(8).gap(5).items_center().rounded(6).text_size(px(12)).cursor_pointer()
    .bg(on ? t.selected : t.raised).text_color(on ? t.foreground : t.muted)
    .hover(s => s.bg(t.hover)).on_click(onClick);
}

export function button(t, id, label, primary, onClick) {
  return h_flex().id(id).h(px(28)).px(10).items_center().rounded(6).text_size(px(12)).cursor_pointer()
    .border_1().border_color(primary ? t.solid : t.input).bg(primary ? t.solid : t.raised)
    .text_color(primary ? t.solid_foreground : t.foreground).hover(s => s.opacity(0.88))
    .on_click(onClick).child(label);
}
