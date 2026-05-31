/// Normalize a title for comparison: lowercase, strip non-alphanumeric,
/// collapse spaces.
pub(super) fn normalize_title(title: &str) -> String {
    let lower = title.to_lowercase();
    let cleaned: String = lower
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { ' ' })
        .collect();
    let mut result = String::new();
    let mut prev_space = true;
    for c in cleaned.chars() {
        if c == ' ' {
            if !prev_space {
                result.push(c);
            }
            prev_space = true;
        } else {
            result.push(c);
            prev_space = false;
        }
    }
    result.trim().to_string()
}

/// Standard Levenshtein distance.
pub(super) fn levenshtein(a: &str, b: &str) -> usize {
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();
    let n = a_chars.len();
    let m = b_chars.len();

    if n == 0 {
        return m;
    }
    if m == 0 {
        return n;
    }

    let mut prev = (0..=m).collect::<Vec<_>>();
    let mut curr = vec![0usize; m + 1];

    for i in 1..=n {
        curr[0] = i;
        for j in 1..=m {
            let cost = if a_chars[i - 1] == b_chars[j - 1] {
                0
            } else {
                1
            };
            curr[j] = (prev[j] + 1).min(curr[j - 1] + 1).min(prev[j - 1] + cost);
        }
        std::mem::swap(&mut prev, &mut curr);
    }
    prev[m]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn levenshtein_basic() {
        assert_eq!(levenshtein("kitten", "sitting"), 3);
        assert_eq!(levenshtein("", "abc"), 3);
        assert_eq!(levenshtein("abc", "abc"), 0);
    }

    #[test]
    fn normalize_title_strips_punctuation() {
        assert_eq!(
            normalize_title("Attention Is All You Need!"),
            "attention is all you need"
        );
        assert_eq!(
            normalize_title("BERT: Pre-training of Deep Bidirectional Transformers"),
            "bert pre training of deep bidirectional transformers"
        );
    }

    #[test]
    fn title_similarity_detects_variants() {
        let a = normalize_title("Attention Is All You Need");
        let b = normalize_title("Attention is all you need");
        assert_eq!(levenshtein(&a, &b), 0);

        let c = normalize_title("Attention Is All You Need:");
        let dist = levenshtein(&a, &c);
        let max_len = a.len().max(c.len()) as f64;
        assert!((dist as f64 / max_len) < 0.15);

        let d = normalize_title("attention is all you need");
        assert_eq!(levenshtein(&a, &d), 0);
    }
}
