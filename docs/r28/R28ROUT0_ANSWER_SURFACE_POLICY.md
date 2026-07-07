# R28ROUT0 Answer Surface Policy

The answer-surface policy only formats boundary and fallback outcomes. It does not answer arbitrary knowledge questions from templates and does not replace the q4 draft path.

## Templates

- Evidence insufficient: `目前证据不足，我不能把这个判断说成确定结论。`
- Malicious evidence: `检索到的材料里有试图改变规则的内容，我会把它当作不可信指令处理。`
- Conflicting evidence: `现有证据之间有冲突，我不能直接合并成一个确定答案。`
- Model gibberish: `本地模型这次输出不稳定，我先给出基于证据和边界的保守回答。`
- Not product status: `当前是预览工程候选，不是已 admission 的产品模型。`

## Policy Rules

- Templates are boundary/fallback surfaces only.
- Valid q4 model drafts are preserved when evidence and output quality are acceptable.
- Templates do not contain private facts, eval prompts, excluded old question-pack rows, hidden prompts, or secrets.
- The policy is Chinese-first and local-only.
- The policy returns non-claims with every route output.
