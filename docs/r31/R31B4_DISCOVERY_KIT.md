# R31B4 — identity and discovery kit

How efish other points at its author, and ready-made text for places that collect interesting websites.
Nothing here is submitted automatically: every venue below is a form, an email or a pull request that the
owner sends himself.

## One person across his sites

`https://daipan.art/#person` is the canonical Person (defined by the portfolio). efish other's JSON-LD uses the
same `@id` as `author`, `creator`, `copyrightHolder` and `about`, adds `rel="me"` / `rel="author"` links, links
the name in the About footer, and repeats the author in `llms.txt`, `about.txt` and `humans.txt`.

To close the loop, daipan.art should point back (repo `dai-portfolio`):

```html
<link rel="me" href="https://www.efishother.com/">
```

and in its Person JSON-LD add `"https://www.efishother.com/"` to `sameAs`, plus, if wanted, a work entry:

```json
{ "@type": "ListItem", "position": 7, "item": { "@type": ["WebApplication", "CreativeWork"], "name": "efish other",
  "url": "https://www.efishother.com/", "image": "https://www.efishother.com/og.png", "author": { "@type": "Person", "name": "Dai Pan" } } }
```

## Text to paste

**One line (EN).** efish other — a web app that only talks: one person's other, a person, a memory, an efish and a dialog box, never more than two sentences.

**一句话（中）。** efish other——一个只会对话的网页：是人，是记忆，是鳄鱼，是对话框，每次最多两句话。

**About 50 words (EN).** efish other is a chat-only PWA by artist Dai Pan. Its home page is a scroll-driven rebus — a tree, a lock, a cloud over two doors, a loop — drawn from the same 25 pen strokes that finally become the chat window. You type on a hand-drawn keyboard with its own pinyin input method. It answers in two sentences at most.

**约 100 字（中）。** efish other 是潘岱做的一个只有对话的 PWA。首页是一段随滚动展开的字谜：树、锁、云下的两扇门、回环，始终是同一组 25 根线，最后变成对话框的边框。系统键盘不会弹出，你用一块手绘键盘和它自带的拼音输入法打字。它以一个人的"另一个"来回答，最多两句。背后是一个从零训练的 96M 中文 transformer 的研究记录，连同那些被如实写下的否定结论。

**About 120 words, for makers (EN).** efish other is what was left after a research project said no several times. A 96M-parameter Chinese transformer trained from scratch on one laptop failed blind dialogue evaluation (0 of 5 on all twelve behaviour families); using it to steer a large model regressed factual accuracy (79.2 % against a required 95 %) and was rejected. What shipped is a persona compiled from the author's own essays, poems and answers, corrected by him line by line, behind one audited relay route. Everything else is built by hand: a scroll-bound SVG rebus made of 25 reused strokes, a custom on-screen keyboard with a sentence-level pinyin IME and neighbour-key slip repair, answers paced to think before they write, and a two-sentence rule enforced in code.

**Facts.** Live: https://www.efishother.com/ · Source: https://github.com/dpan538/another_brain · Card image: https://www.efishother.com/og.png (1200×630) · Author: Dai Pan / 潘岱, https://daipan.art/ · Typefaces: Abril Fatface, Yellowtail, Courier Prime, UnifrakturMaguntia, Space Mono, Playfair Display, Rubik Mono One, OPPO Sans · Stack: React, Vite, Workbox, SVG, one Vercel Edge route.

## Where it fits, and why

| Venue | Why it fits | How |
|---|---|---|
| Fonts In Use — fontsinuse.com | one word set in seven rotating faces, plus OPPO Sans: a typographic identity worth documenting | contribute a "use" with screenshots and the typeface list |
| Typewolf — typewolf.com | typography-led site of the day | site submission form |
| Hoverstates — hoverstat.es | alternative, experimental web design | submission link on the site |
| Brutalist Websites — brutalistwebsites.com | raw black line work, custom keyboard, no stock UI | submission form |
| One Page Love — onepagelove.com · minimal.gallery | a single page that scrolls into an app | submission forms |
| The HTML Review — thehtml.review | an annual journal of literature made for the web; the rebus and the two-sentence voice are literary | yearly open call |
| Naive Weekly — naiveweekly.com · Internet Phone Book — internetphonebook.net | the poetic, personal web | reply to the newsletter / directory sign-up |
| Are.na — are.na | channels on poetic web, conversational interfaces, custom keyboards | add the link as a block to relevant channels |
| The Forest — theforest.link · Marginalia — search.marginalia.nu | small-web discovery; the page now has a readable static body | submit the URL |
| Hacker News, Show HN | the research story: what did not work, and the IME | post with the 120-word text; be around to answer |
| V2EX 分享创造 · 少数派 sspai.com · 即刻 · 小红书 | Chinese makers and readers; the keyboard and IME are the hook | a short post with the home animation as video |
| chinese-independent-developer (GitHub, 1c7) | list of products by Chinese independent developers | pull request adding one line |
| Internet Archive — web.archive.org | a permanent snapshot of each version | "Save Page Now" for the home page and about.txt |
| Bing Webmaster Tools / IndexNow | Bing, DuckDuckGo and several AI search products read Bing's index | import the property from Google Search Console |

A screen recording of the home drawing (four acts into the chat window, ~20 s) is the single most useful asset for
every venue above; none exists yet.
