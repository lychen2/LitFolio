use super::parse_skeleton;

#[test]
fn parses_clean_json() {
    let raw = r#"{
      "subareas": [
        {"name":"CPA","year_range":[1985,1995],"summary":"啁啾脉冲放大。","search_terms":["chirped pulse amplification","CPA femtosecond"],"pi_hints":["Gérard Mourou"]}
      ],
      "key_pis":[{"name":"Gérard Mourou","why_central":"CPA 发明人,2018 诺奖。"}]
    }"#;
    let s = parse_skeleton(raw).unwrap();
    assert_eq!(s.subareas.len(), 1);
    assert_eq!(s.subareas[0].name, "CPA");
    assert_eq!(s.subareas[0].year_range, Some((1985, 1995)));
    assert_eq!(s.subareas[0].search_terms.len(), 2);
    assert_eq!(s.subareas[0].pi_hints, vec!["Gérard Mourou"]);
    assert_eq!(s.key_pis.len(), 1);
    assert_eq!(s.key_pis[0].why_central, "CPA 发明人,2018 诺奖。");
}

#[test]
fn parses_markdown_fenced() {
    let raw = "```json\n{\"subareas\":[{\"name\":\"X\",\"summary\":\"y\",\"search_terms\":[\"a\"]}],\"key_pis\":[]}\n```";
    let s = parse_skeleton(raw).unwrap();
    assert_eq!(s.subareas[0].name, "X");
}

#[test]
fn parses_with_leading_chatter() {
    let raw = "Here is your plan:\n{\"subareas\":[{\"name\":\"A\",\"summary\":\"b\",\"search_terms\":[\"q\"]}],\"key_pis\":[]}\nThanks!";
    let s = parse_skeleton(raw).unwrap();
    assert_eq!(s.subareas[0].name, "A");
}

#[test]
fn tolerates_missing_optional_fields() {
    let raw = r#"{"subareas":[{"name":"X","summary":"y","search_terms":["t"]}]}"#;
    let s = parse_skeleton(raw).unwrap();
    assert!(s.subareas[0].pi_hints.is_empty());
    assert!(s.subareas[0].year_range.is_none());
    assert!(s.key_pis.is_empty());
}

#[test]
fn tolerates_null_year_range() {
    let raw = r#"{"subareas":[{"name":"X","summary":"y","search_terms":["t"],"year_range":null}]}"#;
    let s = parse_skeleton(raw).unwrap();
    assert!(s.subareas[0].year_range.is_none());
}

#[test]
fn tolerates_string_year_range_silently() {
    let raw = r#"{"subareas":[{"name":"X","summary":"y","search_terms":["t"],"year_range":"2000-2010"}]}"#;
    let s = parse_skeleton(raw).unwrap();
    assert!(s.subareas[0].year_range.is_none());
    assert_eq!(s.subareas[0].name, "X");
}

#[test]
fn tolerates_float_year_range() {
    let raw = r#"{"subareas":[{"name":"X","summary":"y","search_terms":["t"],"year_range":[1985.0,1995.0]}]}"#;
    let s = parse_skeleton(raw).unwrap();
    assert_eq!(s.subareas[0].year_range, Some((1985, 1995)));
}

#[test]
fn sanitize_drops_subareas_with_no_search_terms() {
    let raw = r#"{"subareas":[
      {"name":"good","summary":"ok","search_terms":["t1"]},
      {"name":"bad","summary":"ok","search_terms":[]}
    ]}"#;
    let s = parse_skeleton(raw).unwrap();
    assert_eq!(s.subareas.len(), 1);
    assert_eq!(s.subareas[0].name, "good");
}

#[test]
fn sanitize_caps_search_terms_at_four() {
    let raw =
        r#"{"subareas":[{"name":"X","summary":"y","search_terms":["a","b","c","d","e","f"]}]}"#;
    let s = parse_skeleton(raw).unwrap();
    assert_eq!(s.subareas[0].search_terms.len(), 4);
}

#[test]
fn malformed_json_errors() {
    let err = parse_skeleton("totally not json").unwrap_err();
    assert!(err.to_string().contains("could not parse"));
}
