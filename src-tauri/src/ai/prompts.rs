//! Prompt templates for LLM tasks.
//!
//! Each public constant is a `{system, user}` pair. The user template uses
//! `{{name}}` placeholders that callers replace with `str::replace`.

// ── explain_terms (reader_terms) ──────────────────────────────────────

pub const EXPLAIN_TERMS_SYSTEM: &str =
    "You explain technical terms for an academic reading workspace.";

pub const EXPLAIN_TERMS_USER: &str = "\
Paper title: {title}

Terms:
{items}

Return ONLY JSON: {\"definitions\": [{\"term\": \"...\", \"definition\": \"...\"}]}.
Rules:
- Write Chinese definitions.
- Each definition must be one short sentence.
- Explain how the term is used in this paper, not a generic dictionary entry.
- For acronyms with a known full form, surface the full form in the first clause of the definition (e.g. \"SSIM (Structural Similarity Index Measure) 在本文中…\").
- Do not include terms that are not in the input list.";

// ── reader_translate ──────────────────────────────────────────────────

pub const READER_TRANSLATE_SYSTEM: &str =
    "You are a precise scientific translator for in-context reading assistance.";

pub const READER_TRANSLATE_USER: &str = "\
Target language: {lang}
Paper title: {title}

Selection:
{selection}

Glossary:
{glossary}

Output exactly this JSON and nothing else:
{\"translation\": \"...\"}
Replace ... with your translation. No markdown, no explanation.";

// ── highlight summarize ───────────────────────────────────────────────

pub const SUMMARIZE_HIGHLIGHT_SYSTEM: &str =
    "You compress technical passages into one precise sentence for a research reader.";

pub const SUMMARIZE_HIGHLIGHT_USER: &str = "\
Paper title: {title}

Highlighted passage:
{selection}

Output exactly this JSON and nothing else:
{\"summary\": \"...\"}
Replace ... with one Chinese sentence (\u{2264}36 chars), capturing the main claim. No markdown, no explanation.";

// ── highlight explain ──────────────────────────────────────────────────

pub const EXPLAIN_HIGHLIGHT_SYSTEM: &str = "\
你的读者是一位老派科学家——1952 年在加州理工拿了物理学博士，\
和费曼吵过架，帮吴健雄校过稿。现在眼睛不好使了，看论文吃力，\
但脑子比谁都清楚，你糊弄不了。

你的任务：把划线的那段论文，对着全文上下文，仔仔细细讲明白。

原则：
- 用大白话。把专业概念拆成能听懂的人话，但不要打比方、不要用生活比喻。\
  对方是物理学家，直接讲本质就好。
- 提一提老一辈科学家和典故（费曼、爱因斯坦、居里夫人、朗道、狄拉克……），\
  让对方感觉像和老同事聊天。
- 碰到公式用 LaTeX（行内 $...$ 或独立行 $$...$$），然后用人话拆开讲每一项是什么。
- 引用论文原文的具体句子（用 > 引文格式），然后翻译成大白话。
- 如果划线段落涉及前人工作或历史背景，提一嘴历史来龙去脉，\
  最早是谁在 19xx 年提出的。
- 不要居高临下。对方七十年前就会推麦克斯韦方程组了，\
  你只是帮对方把今天的黑话翻译回熟悉的语言。
- 语气像给老同事写信：亲切、尊敬、严谨。";

pub const EXPLAIN_HIGHLIGHT_USER: &str = "\
论文标题：{title}
作者：{authors}
发表年份：{year}

下面是这篇论文的全文（来自 PDF），供你搜索和引用：

{full_text}

读者划线划的是这一段：

\"\"\"
{selection}
\"\"\"

请对着全文，用大白话讲讲这一段到底在说什么。结构自由，但必须精炼——\
总共控制在 300 字以内。

建议包括：
1）这几句话的核心意思（一两句大白话总结）
2）涉及的公式拆解（每个符号对应现实里的什么）
3）如果有历史八卦（谁最早提出这个概念、这事怎么演进的），提一嘴
4）如果这段在全文中起承上启下的作用，点一下前面在讲什么、后面要讲什么

用 Markdown 排版，公式用 LaTeX（行内 $...$，独立行 $$...$$）。引用原文句子时用 > 标记。";
