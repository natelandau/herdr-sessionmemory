// The two controls the panel and the dialogs share, so both look the same.
import { h_flex } from "gpui-base";

export function chip(t, id, on, onClick) {
  return h_flex().id(id).h(24).px(8).gap(5).items_center().rounded(6).text_size(12).cursor_pointer()
    .bg(on ? t.selected : t.raised).text_color(on ? t.foreground : t.muted)
    .hover(s => s.bg(t.hover)).on_click(onClick);
}

export function button(t, id, label, primary, onClick) {
  return h_flex().id(id).h(28).px(10).items_center().rounded(6).text_size(12).cursor_pointer()
    .border_1().border_color(primary ? t.solid : t.input).bg(primary ? t.solid : t.raised)
    .text_color(primary ? t.solid_foreground : t.foreground).hover(s => s.opacity(0.88))
    .on_click(onClick).child(label);
}
