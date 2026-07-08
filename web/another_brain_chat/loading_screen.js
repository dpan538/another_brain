const R28MERGE3_LOADING_COPY = [
  "本地加载小模型，可能需要一点时间。",
  "不会调用云端 LLM。",
  "模型不稳定时，我会先给边界回答。",
  "证据不足时，不硬编。",
  "手机端初次加载可能更慢。"
];

function setLoadingMicrocopy(index) {
  const node = document.querySelector("#loading-microcopy");
  if (node) node.textContent = R28MERGE3_LOADING_COPY[index % R28MERGE3_LOADING_COPY.length];
}

let copyIndex = 0;
setLoadingMicrocopy(copyIndex);
setInterval(() => {
  copyIndex += 1;
  setLoadingMicrocopy(copyIndex);
}, 3200);

document.addEventListener("click", (event) => {
  if (!(event.target instanceof HTMLElement)) return;
  if (event.target.id !== "loading-dashboard-button") return;
  document.querySelector("#dashboard-mode-button")?.click();
});

window.R28MERGE3LoadingScreen = {
  copy: R28MERGE3_LOADING_COPY,
  setMicrocopy: setLoadingMicrocopy
};
