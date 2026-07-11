use super::*;

#[test]
fn empty_result_carries_terms() {
    let r = empty_result(vec!["foo".into(), "bar".into()]);
    assert!(r.sources.is_empty());
    assert_eq!(r.retrieved_count, 0);
    assert_eq!(r.terms, vec!["foo".to_string(), "bar".into()]);
    assert!(r.answer.contains("未在"));
}

#[test]
fn empty_result_explicitly_says_no_matching_papers() {
    let r = empty_result(vec!["transformer".into()]);
    assert!(r
        .answer
        .contains("未在你的文献库中检索到与此问题相关的论文"));
    assert!(r.answer.contains("入库") || r.answer.contains("主题发现"));
}

#[test]
fn empty_result_zeroes_token_counts_so_meta_does_not_lie() {
    let r = empty_result(vec![]);
    assert_eq!(r.prompt_tokens, 0);
    assert_eq!(r.completion_tokens, 0);
    assert_eq!(r.model, "");
    assert_eq!(r.retrieved_count, 0);
}

#[test]
fn history_summary_preserves_prior_constraints() {
    let messages = vec![
        ChatMessage {
            role: "user".into(),
            content: "Only compare transformer retrieval papers".into(),
        },
        ChatMessage {
            role: "assistant".into(),
            content: "I will restrict the answer to transformer retrieval papers.".into(),
        },
    ];

    let summary = summarize_history(&messages);

    assert!(summary.contains("Q: Only compare transformer retrieval papers"));
    assert!(summary.contains("A: I will restrict the answer to transformer retrieval papers"));
}
