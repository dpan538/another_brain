export function showQuietAffordance(element, affordance) {
  if (!element || !affordance) return;
  element.textContent = affordance.display_text || "…？…";
  element.setAttribute("aria-label", affordance.aria_label || "等待下一句输入");
  element.dataset.affordanceType = affordance.affordance_type || "water_ripple";
  element.hidden = false;
  element.classList.add("is-visible");
}

export function hideQuietAffordance(element) {
  if (!element) return;
  element.hidden = true;
  element.classList.remove("is-visible");
  element.textContent = "";
  delete element.dataset.affordanceType;
}
