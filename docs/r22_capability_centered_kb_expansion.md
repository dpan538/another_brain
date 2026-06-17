# R22 Capability-Centered Knowledge Expansion Contract

The KB is a capability substrate, not a warehouse of facts.

The purpose of expansion is to add reusable primitives that help the system
make better turn decisions and compose better answers across sibling domains.
It is not to add exact prompt answers, more rows, or broader domain profiles
that only improve visible proxy metrics.

## Core Principle

Most cards are not answer snippets. They are compositional supports for
response-making.

The maintenance question is:

```text
What primitive is missing that would help this answer family and its siblings?
```

not:

```text
What sentence would make this prompt pass?
```

## Card Taxonomy

- `factual_card`: stable anchor.
- `concept_card`: definition or conceptual boundary.
- `relation_card`: typed relation between ideas.
- `contrast_card`: disciplined foil or distinction.
- `bridge_card`: reusable cross-domain transfer.
- `example_card`: worked instance or local anchor.
- `constraint_card`: how not to overreach.
- `negative_card`: nearby wrong move.
- `uncertainty_card`: what remains unknown and what would settle it.
- `style_card`: local manner without canned prose.
- `answer_shape_card`: reusable turn form.

## Likely Missing Primitive Classes

- `missing_factual_anchor`
- `missing_concept`
- `missing_relation`
- `missing_contrast_operator`
- `missing_bridge_operator`
- `missing_example`
- `missing_constraint`
- `missing_negative_example`
- `missing_uncertainty_primitive`
- `missing_style_primitive`
- `missing_answer_shape_primitive`
- `missing_domain_specific_verb_set`

## Missing-Knowledge Audit Order

1. Capture the weak turn and trace.
2. Record `turn_function`, `response_mode`, `binding_kind`, `operation`, and
   surface risk.
3. Classify one primary missing primitive.
4. State the minimally sufficient primitive set.
5. Check whether the current KB already has reusable support.
6. If support exists, do not add cards; inspect retrieval, composition, or
   control.
7. If support is missing, add generalized primitive cards only.
8. Declare sibling domains the primitive should help.
9. Add at least one negative or constraint card for new domain expansion.
10. Evaluate blind siblings before anchor re-runs.
11. End the audit with what remains unknown.

## Patch Rules

- Exact failing-prompt answer card: forbidden.
- New entity-specific runtime path: forbidden.
- Domain profile skeleton without native verbs: forbidden.
- New primitive without sibling-domain support: suspicious.
- New domain set without negative and constraint cards: incomplete.
- If KB support exists, patching KB is disallowed; fix retrieval, composition,
  control, or surface instead.

## Anti-Template Constraints

Detect and avoid domain-profile collapse:

- `X 可以从 A/B/C 进入`
- `重点在于 Y`
- `差别在于 Z`
- `不是 P，而是 Q`
- `这体现了 A/B/C`
- `它本质上是关系/身份/结构/社会`

Each domain should expose:

- `domain_specific_verbs`
- local examples
- contrast grammar
- forbidden generic templates
- uncertainty conditions
- answer-shape hints

Example verb sets:

Food:

- 切
- 炖
- 腌
- 发酵
- 调味
- 收汁
- 保留
- 过火

Law:

- 适用
- 区分
- 解释
- 约束
- 排除
- 推翻
- 援引
- 限缩

Film:

- 调度
- 取景
- 剪
- 留白
- 推进
- 停顿
- 框住
- 对切

Music:

- 铺陈
- 重复
- 变奏
- 压缩
- 推进
- 留白
- 转调
- 咬字

Literature:

- 叙述
- 转视角
- 留白
- 嵌套
- 反讽
- 延宕
- 对照
- 收束

## Eval Replacement Policy

Do not weaken existing gates. Migrate proxy-forcing constraints only by adding
equal or stronger semantic/naturalness rubrics.

Migration patterns:

- exact `must_include` -> semantic rubric
- keyword required -> specificity check
- row pass -> sibling transfer
- max_chars only -> `sentence_shape` + `surface_mode`
- exact expected phrase -> bad/better pair
- anchor-only pass -> anchor-vs-sibling delta

## Safe Domain Expansion Priority

Prefer domains where primitives transfer widely:

- food
- film
- music
- literature
- language
- urban life
- design
- everyday cultural practices

Use law, medicine, finance, and current institutional facts primarily for
boundary, uncertainty, and source-dependence primitives unless reliable current
sources are available.
