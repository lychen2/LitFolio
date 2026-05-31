use super::*;

#[test]
fn rule_serialization_roundtrip() {
    let rule = FilterRule::Group {
        combinator: "and".into(),
        rules: vec![
            FilterRule::Condition {
                field: "read_status".into(),
                operator: "equals".into(),
                value: serde_json::json!("unread"),
            },
            FilterRule::Condition {
                field: "year".into(),
                operator: "gte".into(),
                value: serde_json::json!(2024),
            },
        ],
    };
    let json = serde_json::to_string(&rule).unwrap();
    let back: FilterRule = serde_json::from_str(&json).unwrap();
    match back {
        FilterRule::Group { combinator, rules } => {
            assert_eq!(combinator, "and");
            assert_eq!(rules.len(), 2);
        }
        _ => panic!("expected group"),
    }
}
