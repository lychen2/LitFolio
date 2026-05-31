use super::*;

#[test]
fn empty_result_carries_terms() {
    let r = empty_result(vec!["foo".into(), "bar".into()]);
    assert!(r.sources.is_empty());
    assert_eq!(r.retrieved_count, 0);
    assert_eq!(r.terms, vec!["foo".to_string(), "bar".into()]);
    assert!(r.answer.contains("未在"));
}
