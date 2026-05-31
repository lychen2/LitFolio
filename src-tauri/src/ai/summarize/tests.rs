use super::*;

#[test]
fn fit_pdf_body_passes_short_text_through_unchanged() {
    let short = "abc".repeat(100);
    assert_eq!(fit_pdf_body(&short), short);
}

#[test]
fn fit_pdf_body_truncates_with_head_and_tail() {
    let total = PDF_BODY_BUDGET_CHARS * 2;
    let body: String = (0..total)
        .map(|i| (b'a' + (i % 26) as u8) as char)
        .collect();
    let fitted = fit_pdf_body(&body);

    assert!(fitted.chars().count() < total);
    assert!(fitted.contains("truncated"));
    let original_head: String = body.chars().take(50).collect();
    let original_tail: String = body
        .chars()
        .rev()
        .take(50)
        .collect::<String>()
        .chars()
        .rev()
        .collect();
    assert!(fitted.starts_with(&original_head));
    assert!(fitted.ends_with(&original_tail));
}

#[test]
fn fit_pdf_body_handles_multibyte_chars_without_panicking() {
    let body: String = "字".repeat(PDF_BODY_BUDGET_CHARS + 100);
    let fitted = fit_pdf_body(&body);

    assert!(fitted.chars().count() < body.chars().count());
    assert!(fitted.contains("truncated"));
}

#[test]
fn fit_pdf_body_keeps_input_when_bytes_exceed_budget_but_chars_do_not() {
    let body: String = "字".repeat(PDF_BODY_BUDGET_CHARS / 2);
    let fitted = fit_pdf_body(&body);

    assert_eq!(fitted, body);
}
