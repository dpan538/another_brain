import re


GENERIC_ASSISTANT_RE = re.compile(
    r"(as an ai language model|how can i assist|i'?m here to help|customer support|happy to help|作为一个ai|我可以帮助你)",
    re.I,
)
MODEL_IDENTITY_RE = re.compile(r"(chatgpt|openai|large language model|语言模型|人工智能助手)", re.I)


def style_rejection_reason(text):
    text = str(text or "")
    if GENERIC_ASSISTANT_RE.search(text):
        return "generic_assistant_style"
    if MODEL_IDENTITY_RE.search(text):
        return "model_identity_boilerplate"
    return ""
