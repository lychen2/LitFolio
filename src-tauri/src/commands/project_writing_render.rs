//! Markdown renderer for traceable project writing outlines.

use crate::storage::{EvidenceItem, NoteSection, Paper, PaperComparison, ResearchProject};

const MAX_EXCERPT_CHARS: usize = 480;
const MAX_COMPARISON_CHARS: usize = 900;

pub fn render_outline(
    project: &ResearchProject,
    papers: &[Paper],
    paper_notes: &[(Paper, Vec<NoteSection>)],
    evidence: &[EvidenceItem],
    comparisons: &[PaperComparison],
) -> String {
    let mut out = format!("# Related Work Draft: {}\n\n", project.name);
    out.push_str("This editable draft is generated from local project assets. ");
    out.push_str("Every bullet keeps a source marker for verification.\n\n");
    push_project_context(&mut out, project);
    push_source_map(&mut out, papers, evidence, comparisons);
    push_paper_outline(&mut out, paper_notes);
    push_evidence_outline(&mut out, evidence);
    push_comparison_outline(&mut out, comparisons);
    push_gap_outline(&mut out, paper_notes);
    push_editable_draft(&mut out, project, papers, evidence, comparisons);
    out
}

fn push_project_context(out: &mut String, project: &ResearchProject) {
    out.push_str("## Project Context\n\n");
    push_optional(
        out,
        "Research question",
        project.research_question.as_deref(),
    );
    push_optional(out, "Target output", project.target_output.as_deref());
    push_optional(out, "Description", project.description.as_deref());
}

fn push_source_map(
    out: &mut String,
    papers: &[Paper],
    evidence: &[EvidenceItem],
    comparisons: &[PaperComparison],
) {
    out.push_str("## Source Map\n\n");
    for (idx, paper) in papers.iter().enumerate() {
        out.push_str(&format!("- [P{}] {}\n", idx + 1, paper_title(paper)));
    }
    for (idx, item) in evidence.iter().enumerate() {
        let source = item
            .paper_title
            .as_deref()
            .unwrap_or(item.source_type.as_str());
        out.push_str(&format!("- [E{}] {}", idx + 1, source));
        if let Some(page) = item.page {
            out.push_str(&format!(", p. {page}"));
        }
        out.push('\n');
    }
    for (idx, report) in comparisons.iter().enumerate() {
        out.push_str(&format!(
            "- [C{}] Comparison report {}\n",
            idx + 1,
            report.id
        ));
    }
    out.push('\n');
}

fn push_paper_outline(out: &mut String, paper_notes: &[(Paper, Vec<NoteSection>)]) {
    out.push_str("## Paper-Level Claims\n\n");
    if paper_notes.is_empty() {
        out.push_str("- Add project papers to draft paper-level claims.\n\n");
        return;
    }
    for (paper_idx, (paper, notes)) in paper_notes.iter().enumerate() {
        let source = format!("[P{}]", paper_idx + 1);
        out.push_str(&format!("### {}\n\n", paper_title(paper)));
        push_paper_metadata(out, paper, &source);
        for section in notes.iter().filter(|section| has_content(&section.content)) {
            out.push_str(&format!(
                "- **{}:** {} {}:{}\n",
                section.section_key,
                trim_block(&section.content, MAX_EXCERPT_CHARS),
                source,
                section.section_key
            ));
        }
        out.push('\n');
    }
}

fn push_paper_metadata(out: &mut String, paper: &Paper, source: &str) {
    push_claim(out, "Problem", paper.research_question.as_deref(), source);
    push_claim(out, "Method", paper.method.as_deref(), source);
    push_claim(out, "Limitations", paper.limitations.as_deref(), source);
    for finding in paper.key_findings.iter().filter(|item| has_content(item)) {
        out.push_str(&format!("- **Finding:** {} {source}\n", finding.trim()));
    }
    if let Some(abstract_text) = paper
        .abstract_text
        .as_deref()
        .filter(|text| has_content(text))
    {
        out.push_str(&format!(
            "- **Abstract basis:** {} {source}\n",
            trim_block(abstract_text, MAX_EXCERPT_CHARS)
        ));
    }
}

fn push_evidence_outline(out: &mut String, evidence: &[EvidenceItem]) {
    out.push_str("## Evidence-Backed Themes\n\n");
    if evidence.is_empty() {
        out.push_str(
            "- Add highlights, Ask answers, notes, or comparisons to the evidence board.\n\n",
        );
        return;
    }
    for (idx, item) in evidence.iter().enumerate() {
        let label = item.label.as_deref().unwrap_or(item.source_type.as_str());
        out.push_str(&format!(
            "- **{}:** {} [E{}]\n",
            label,
            trim_block(&item.excerpt, MAX_EXCERPT_CHARS),
            idx + 1
        ));
        if let Some(note) = item.note.as_deref().filter(|text| has_content(text)) {
            out.push_str(&format!(
                "  Note: {}\n",
                trim_block(note, MAX_EXCERPT_CHARS)
            ));
        }
    }
    out.push('\n');
}

fn push_comparison_outline(out: &mut String, comparisons: &[PaperComparison]) {
    out.push_str("## Comparison Findings\n\n");
    if comparisons.is_empty() {
        out.push_str("- Generate or link a comparison report to compare methods, data, results, or limitations.\n\n");
        return;
    }
    for (idx, report) in comparisons.iter().enumerate() {
        out.push_str(&format!(
            "- {} [C{}]\n",
            trim_block(&report.content, MAX_COMPARISON_CHARS),
            idx + 1
        ));
    }
    out.push('\n');
}

fn push_gap_outline(out: &mut String, paper_notes: &[(Paper, Vec<NoteSection>)]) {
    out.push_str("## Gaps And Open Questions\n\n");
    let mut wrote = false;
    for (paper_idx, (_paper, notes)) in paper_notes.iter().enumerate() {
        for section in notes
            .iter()
            .filter(|section| section.section_key == "open_questions")
        {
            if has_content(&section.content) {
                out.push_str(&format!(
                    "- {} [P{}:open_questions]\n",
                    trim_block(&section.content, MAX_EXCERPT_CHARS),
                    paper_idx + 1
                ));
                wrote = true;
            }
        }
    }
    if !wrote {
        out.push_str("- Add open questions in reading cards to expose research gaps.\n");
    }
    out.push('\n');
}

fn push_editable_draft(
    out: &mut String,
    project: &ResearchProject,
    papers: &[Paper],
    evidence: &[EvidenceItem],
    comparisons: &[PaperComparison],
) {
    out.push_str("## Editable Draft\n\n");
    let question = project
        .research_question
        .as_deref()
        .unwrap_or("the project research question");
    out.push_str(&format!(
        "This project examines {} across {} linked papers.",
        question,
        papers.len()
    ));
    if !papers.is_empty() {
        out.push_str(" The starting corpus includes ");
        out.push_str(&paper_refs(papers));
        out.push('.');
    }
    out.push_str("\n\n");
    if !evidence.is_empty() {
        out.push_str("The evidence board currently supports the draft with ");
        out.push_str(&format!("{} traceable items", evidence.len()));
        out.push_str(", including ");
        out.push_str(&evidence_refs(evidence.len()));
        out.push_str(".\n\n");
    }
    if !comparisons.is_empty() {
        out.push_str("Existing comparison reports provide cross-paper synthesis points ");
        out.push_str(&comparison_refs(comparisons.len()));
        out.push_str(".\n\n");
    }
}

fn push_claim(out: &mut String, label: &str, value: Option<&str>, source: &str) {
    if let Some(value) = value.filter(|text| has_content(text)) {
        out.push_str(&format!(
            "- **{}:** {} {source}\n",
            label,
            trim_block(value, MAX_EXCERPT_CHARS)
        ));
    }
}

fn push_optional(out: &mut String, label: &str, value: Option<&str>) {
    if let Some(value) = value.filter(|text| has_content(text)) {
        out.push_str(&format!("{label}: {}\n\n", value.trim()));
    }
}

fn paper_title(paper: &Paper) -> String {
    paper
        .year
        .map(|year| format!("{} ({year})", paper.title))
        .unwrap_or_else(|| paper.title.clone())
}

fn paper_refs(papers: &[Paper]) -> String {
    papers
        .iter()
        .enumerate()
        .map(|(idx, _paper)| format!("[P{}]", idx + 1))
        .collect::<Vec<_>>()
        .join(", ")
}

fn evidence_refs(len: usize) -> String {
    (1..=len)
        .map(|idx| format!("[E{idx}]"))
        .collect::<Vec<_>>()
        .join(", ")
}

fn comparison_refs(len: usize) -> String {
    (1..=len)
        .map(|idx| format!("[C{idx}]"))
        .collect::<Vec<_>>()
        .join(", ")
}

fn has_content(value: &str) -> bool {
    !value.trim().is_empty()
}

fn trim_block(value: &str, max_chars: usize) -> String {
    let normalized = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.chars().count() <= max_chars {
        return normalized;
    }
    let trimmed = normalized.chars().take(max_chars).collect::<String>();
    format!("{}...", trimmed.trim_end())
}
