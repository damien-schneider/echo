interface PromptChoice {
  label: string;
  value: string;
}

const SLASH_COMMAND = /^\/(\S*)$/;

export const slashQuery = (input: string) =>
  SLASH_COMMAND.exec(input)?.[1] ?? null;

export const matchingChoices = <Choice extends PromptChoice>(
  choices: Choice[],
  query: string
) => {
  const needle = query.toLowerCase();
  return choices.filter((choice) =>
    choice.label.toLowerCase().includes(needle)
  );
};

export const movedHighlight = (current: number, step: 1 | -1, count: number) =>
  count === 0 ? current : (current + step + count) % count;
