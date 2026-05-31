use anyhow::{bail, Context, Result};

use super::{FilterRule, Paper, Pool};

pub(super) fn build_where_clause(rule: &FilterRule) -> Result<(String, Vec<String>)> {
    let mut params = Vec::new();
    let clause = rule_to_sql(rule, &mut params)?;
    Ok((clause, params))
}

fn rule_to_sql(rule: &FilterRule, params: &mut Vec<String>) -> Result<String> {
    match rule {
        FilterRule::Condition {
            field,
            operator,
            value,
        } => condition_to_sql(field, operator, value, params),
        FilterRule::Group { combinator, rules } => group_to_sql(combinator, rules, params),
    }
}

fn group_to_sql(
    combinator: &str,
    rules: &[FilterRule],
    params: &mut Vec<String>,
) -> Result<String> {
    if rules.is_empty() {
        return Ok("1=1".into());
    }
    let joiner = match combinator.to_lowercase().as_str() {
        "or" => " OR ",
        "and" => " AND ",
        other => bail!("unsupported smart collection combinator {other}"),
    };
    let parts = rules
        .iter()
        .map(|rule| rule_to_sql(rule, params))
        .collect::<Result<Vec<_>>>()?;
    Ok(format!("({})", parts.join(joiner)))
}

fn condition_to_sql(
    field: &str,
    operator: &str,
    value: &serde_json::Value,
    params: &mut Vec<String>,
) -> Result<String> {
    match field {
        "read_status" => equals_condition("p.read_status", value, params),
        "year" => year_condition(operator, value, params),
        "title" => like_condition("p.title", operator, value, params),
        "tags" => tag_condition(value, params),
        "folders" => folder_condition(value, params),
        "venue" => like_condition("p.venue", operator, value, params),
        other => bail!("unsupported smart collection field {other}"),
    }
}

fn equals_condition(
    column: &str,
    value: &serde_json::Value,
    params: &mut Vec<String>,
) -> Result<String> {
    let Some(value) = value.as_str().filter(|value| !value.is_empty()) else {
        bail!("smart collection condition for {column} requires a string value");
    };
    params.push(value.to_string());
    Ok(format!("{column} = ?{}", params.len()))
}

fn year_condition(
    operator: &str,
    value: &serde_json::Value,
    params: &mut Vec<String>,
) -> Result<String> {
    let Some(value) = value.as_i64() else {
        bail!("smart collection year condition requires an integer value");
    };
    params.push(value.to_string());
    let sql_operator = match operator {
        "gt" | ">" => ">",
        "lt" | "<" => "<",
        "gte" | ">=" => ">=",
        "lte" | "<=" => "<=",
        "equals" | "=" | "eq" => "=",
        other => bail!("unsupported smart collection year operator {other}"),
    };
    Ok(format!("p.year {sql_operator} ?{}", params.len()))
}

fn like_condition(
    column: &str,
    operator: &str,
    value: &serde_json::Value,
    params: &mut Vec<String>,
) -> Result<String> {
    let Some(value) = value.as_str() else {
        bail!("smart collection condition for {column} requires a string value");
    };
    params.push(format!("%{value}%"));
    let sql_operator = match operator {
        "contains" | "equals" => "LIKE",
        "not_contains" => "NOT LIKE",
        other => bail!("unsupported smart collection text operator {other}"),
    };
    Ok(format!("{column} {sql_operator} ?{}", params.len()))
}

fn tag_condition(value: &serde_json::Value, params: &mut Vec<String>) -> Result<String> {
    let Some(tag_name) = value.as_str().filter(|value| !value.is_empty()) else {
        bail!("smart collection tags condition requires a tag name");
    };
    params.push(tag_name.to_string());
    Ok(format!(
        "p.id IN (SELECT pt.paper_id FROM paper_tags pt JOIN tags t ON t.id = pt.tag_id WHERE t.name = ?{})",
        params.len()
    ))
}

fn folder_condition(value: &serde_json::Value, params: &mut Vec<String>) -> Result<String> {
    let Some(folder_id) = value.as_i64() else {
        bail!("smart collection folders condition requires a folder id");
    };
    params.push(folder_id.to_string());
    Ok(format!(
        "p.id IN (SELECT pf.paper_id FROM paper_folders pf WHERE pf.folder_id = ?{})",
        params.len()
    ))
}

pub(super) async fn execute_paper_query(
    pool: &Pool,
    where_clause: &str,
    params: &[String],
) -> Result<Vec<Paper>> {
    let sql = format!(
        "SELECT p.id, p.title, p.authors_json, p.year, p.venue, p.doi, p.arxiv_id,
                p.abstract_text, p.pdf_path, p.note_path, p.added_at, p.updated_at,
                p.read_status, p.tldr, p.research_question, p.method, p.dataset,
                p.key_findings_json, p.limitations, p.comparison,
                p.title_translated, p.abstract_translated, p.translate_target_lang,
                p.translated_at, p.bibtex, p.last_exported_at
         FROM papers p
         WHERE {where_clause}
         ORDER BY p.updated_at DESC",
    );

    let mut query = sqlx::query(&sql);
    for param in params {
        query = query.bind(param);
    }
    let rows = query
        .fetch_all(pool)
        .await
        .context("query smart collection papers")?;
    rows.into_iter()
        .map(super::super::papers::row_to_paper)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_where_simple_condition() {
        let rule = FilterRule::Condition {
            field: "read_status".into(),
            operator: "equals".into(),
            value: serde_json::json!("unread"),
        };
        let (clause, params) = build_where_clause(&rule).unwrap();
        assert!(clause.contains("read_status"));
        assert_eq!(params, vec!["unread"]);
    }

    #[test]
    fn build_where_group() {
        let rule = FilterRule::Group {
            combinator: "and".into(),
            rules: vec![
                FilterRule::Condition {
                    field: "year".into(),
                    operator: "gte".into(),
                    value: serde_json::json!(2024),
                },
                FilterRule::Condition {
                    field: "title".into(),
                    operator: "contains".into(),
                    value: serde_json::json!("transformer"),
                },
            ],
        };
        let (clause, params) = build_where_clause(&rule).unwrap();
        assert!(clause.contains("AND"));
        assert_eq!(params, vec!["2024", "%transformer%"]);
    }

    #[test]
    fn rejects_unknown_condition_field() {
        let rule = FilterRule::Condition {
            field: "unknown".into(),
            operator: "equals".into(),
            value: serde_json::json!("x"),
        };
        let err = build_where_clause(&rule).unwrap_err().to_string();
        assert!(err.contains("unsupported smart collection field"));
    }
}
