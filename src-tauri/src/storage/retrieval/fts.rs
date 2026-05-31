/// Strip the phrase-terminator double-quote and trim leading/trailing
/// punctuation that FTS5 still interprets as a tokenizer boundary even inside
/// quoted phrases. Internal `-`, `.`, `/` pass through unchanged.
pub fn sanitize_fts_token(token: &str) -> String {
    token
        .chars()
        .filter(|c| *c != '"')
        .collect::<String>()
        .trim_matches(|c: char| matches!(c, '(' | ')' | ':' | ',' | ';' | '!' | '?'))
        .to_string()
}

/// Build an AND-joined FTS5 MATCH expression. Each whitespace-separated
/// token becomes a quoted prefix.
pub fn escape_fts(input: &str) -> String {
    escaped_tokens(input).join(" AND ")
}

/// Build an OR-joined FTS5 MATCH expression for broader retrieval.
pub fn escape_fts_or(input: &str) -> String {
    escaped_tokens(input).join(" OR ")
}

fn escaped_tokens(input: &str) -> Vec<String> {
    input
        .split_whitespace()
        .map(sanitize_fts_token)
        .filter(|s| !s.is_empty())
        .map(|s| format!("\"{s}\"*"))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escape_fts_handles_empty_and_special() {
        assert_eq!(escape_fts(""), "");
        assert_eq!(escape_fts("   "), "");
        assert_eq!(escape_fts("foo bar"), "\"foo\"* AND \"bar\"*");
        assert_eq!(escape_fts("BERT-base"), "\"BERT-base\"*");
        assert_eq!(escape_fts("R3.0"), "\"R3.0\"*");
        assert_eq!(escape_fts("(foo)"), "\"foo\"*");
        assert_eq!(escape_fts("hi\"there"), "\"hithere\"*");
    }

    #[test]
    fn escape_fts_or_joins_with_or() {
        assert_eq!(escape_fts_or("a b"), "\"a\"* OR \"b\"*");
        assert_eq!(escape_fts_or(""), "");
    }

    #[test]
    fn sanitize_fts_token_preserves_internal_special() {
        assert_eq!(sanitize_fts_token("BERT-base"), "BERT-base");
        assert_eq!(sanitize_fts_token("IEEE 802.11"), "IEEE 802.11");
    }

    #[test]
    fn sanitize_fts_token_cleans_quotes_and_punctuation() {
        assert_eq!(sanitize_fts_token("\"hello\""), "hello");
        assert_eq!(sanitize_fts_token("(test:)"), "test");
        assert_eq!(sanitize_fts_token("foo,;!?"), "foo");
    }
}
