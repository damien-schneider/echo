use anyhow::{bail, Result};

struct TextLine<'a> {
    content: &'a str,
    separator: &'a str,
}

pub(super) fn restore_line_structure(input: &str, output: &str) -> Result<String> {
    let input_lines = text_lines(input);
    let output_lines = text_lines(output);
    if matching_line_shapes(&input_lines, &output_lines) {
        return Ok(restore_separators(&input_lines, &output_lines));
    }
    let input_words = input.split_whitespace().collect::<Vec<_>>();
    let output_words = output.split_whitespace().collect::<Vec<_>>();
    let nonempty_lines = input_lines
        .iter()
        .filter(|line| !line.content.trim().is_empty())
        .count();
    if output_words.len() < nonempty_lines {
        bail!("Polish response changed line structure");
    }
    let prefixes = aligned_output_prefixes(&input_words, &output_words);
    reconstruct_lines(&input_lines, &output_words, &prefixes)
}

fn text_lines(text: &str) -> Vec<TextLine<'_>> {
    let mut lines = Vec::new();
    let mut content_start = 0;
    for (newline_index, _) in text.match_indices('\n') {
        let separator_start = if text.as_bytes().get(newline_index.wrapping_sub(1)) == Some(&b'\r')
        {
            newline_index - 1
        } else {
            newline_index
        };
        lines.push(TextLine {
            content: &text[content_start..separator_start],
            separator: &text[separator_start..=newline_index],
        });
        content_start = newline_index + 1;
    }
    if content_start < text.len() || lines.is_empty() {
        lines.push(TextLine {
            content: &text[content_start..],
            separator: "",
        });
    }
    lines
}

fn matching_line_shapes(input: &[TextLine<'_>], output: &[TextLine<'_>]) -> bool {
    input.len() == output.len()
        && input.iter().zip(output).all(|(before, after)| {
            before.content.trim().is_empty() == after.content.trim().is_empty()
        })
}

fn restore_separators(input: &[TextLine<'_>], output: &[TextLine<'_>]) -> String {
    let mut restored = String::new();
    for (input_line, output_line) in input.iter().zip(output) {
        restored.push_str(&preserve_line_padding(
            input_line.content,
            output_line.content.trim(),
        ));
        restored.push_str(input_line.separator);
    }
    restored
}

fn aligned_output_prefixes(input: &[&str], output: &[&str]) -> Vec<usize> {
    let columns = output.len() + 1;
    let mut costs = vec![0; (input.len() + 1) * columns];
    for input_index in 0..=input.len() {
        costs[input_index * columns] = input_index;
    }
    for output_index in 0..=output.len() {
        costs[output_index] = output_index;
    }
    for input_index in 1..=input.len() {
        for output_index in 1..=output.len() {
            let substitution =
                usize::from(!input[input_index - 1].eq_ignore_ascii_case(output[output_index - 1]));
            costs[input_index * columns + output_index] =
                (costs[(input_index - 1) * columns + output_index] + 1)
                    .min(costs[input_index * columns + output_index - 1] + 1)
                    .min(costs[(input_index - 1) * columns + output_index - 1] + substitution);
        }
    }
    backtrack_prefixes(input, output, &costs, columns)
}

fn backtrack_prefixes(
    input: &[&str],
    output: &[&str],
    costs: &[usize],
    columns: usize,
) -> Vec<usize> {
    let mut input_index = input.len();
    let mut output_index = output.len();
    let mut prefixes = vec![0; input.len() + 1];
    prefixes[input_index] = output_index;
    while input_index > 0 {
        let aligns = output_index > 0
            && costs[input_index * columns + output_index]
                == costs[(input_index - 1) * columns + output_index - 1]
                    + usize::from(
                        !input[input_index - 1].eq_ignore_ascii_case(output[output_index - 1]),
                    );
        if aligns {
            input_index -= 1;
            output_index -= 1;
        } else if costs[input_index * columns + output_index]
            == costs[(input_index - 1) * columns + output_index] + 1
        {
            input_index -= 1;
        } else {
            output_index -= 1;
            continue;
        }
        prefixes[input_index] = output_index;
    }
    prefixes
}

fn reconstruct_lines(
    input_lines: &[TextLine<'_>],
    output_words: &[&str],
    prefixes: &[usize],
) -> Result<String> {
    let mut input_word_end = 0;
    let mut output_word_start = 0;
    let mut restored = String::new();
    for input_line in input_lines {
        input_word_end += input_line.content.split_whitespace().count();
        let output_word_end = prefixes[input_word_end];
        if !input_line.content.trim().is_empty() && output_word_end == output_word_start {
            bail!("Polish response changed line structure");
        }
        let corrected = output_words[output_word_start..output_word_end].join(" ");
        restored.push_str(&preserve_line_padding(input_line.content, &corrected));
        restored.push_str(input_line.separator);
        output_word_start = output_word_end;
    }
    if output_word_start != output_words.len() {
        bail!("Polish response changed line structure");
    }
    Ok(restored)
}

fn preserve_line_padding(input_line: &str, corrected: &str) -> String {
    if input_line.trim().is_empty() {
        return input_line.to_string();
    }
    let leading_end = input_line
        .char_indices()
        .find(|(_, character)| !character.is_whitespace())
        .map(|(index, _)| index)
        .unwrap_or(input_line.len());
    let trailing_start = input_line
        .char_indices()
        .rev()
        .find(|(_, character)| !character.is_whitespace())
        .map(|(index, character)| index + character.len_utf8())
        .unwrap_or(leading_end);
    format!(
        "{}{corrected}{}",
        &input_line[..leading_end],
        &input_line[trailing_start..]
    )
}
