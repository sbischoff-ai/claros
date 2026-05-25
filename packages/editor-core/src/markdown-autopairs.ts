import {
  EditorSelection,
  StateEffect,
  StateField,
  type Extension,
} from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";

type MarkdownAutoPairCharacter = "*" | "_" | "[" | "(";
type MarkdownAutoPairClosingCharacter = "*" | "_" | "]" | ")";
type MarkdownAutoPairKey = MarkdownAutoPairCharacter | MarkdownAutoPairClosingCharacter;

interface ActiveMarkdownAutoPair {
  open: MarkdownAutoPairCharacter;
  close: MarkdownAutoPairClosingCharacter;
  openFrom: number;
  closeFrom: number;
}

const closingCharacters: Record<MarkdownAutoPairCharacter, MarkdownAutoPairClosingCharacter> = {
  "*": "*",
  _: "_",
  "[": "]",
  "(": ")",
};

const openingAutoPairCharacters = Object.keys(closingCharacters) as MarkdownAutoPairCharacter[];
const openingCharacters = new Set<MarkdownAutoPairKey>(openingAutoPairCharacters);
const handledCharacters = new Set<MarkdownAutoPairKey>([
  ...openingAutoPairCharacters,
  ...Object.values(closingCharacters),
] as MarkdownAutoPairKey[]);

const addAutoPair = StateEffect.define<ActiveMarkdownAutoPair>();
const consumeAutoPair = StateEffect.define<Pick<ActiveMarkdownAutoPair, "close" | "closeFrom">>();

const activeAutoPairs = StateField.define<ActiveMarkdownAutoPair[]>({
  create() {
    return [];
  },
  update(value, transaction) {
    let next = transaction.docChanged
      ? value.map((pair) => ({
          ...pair,
          openFrom: transaction.changes.mapPos(pair.openFrom, -1),
          closeFrom: transaction.changes.mapPos(pair.closeFrom, 1),
        }))
      : value;

    for (const effect of transaction.effects) {
      if (effect.is(addAutoPair)) {
        next = [...next, effect.value];
      }
      if (effect.is(consumeAutoPair)) {
        next = next.filter(
          (pair) => pair.close !== effect.value.close || pair.closeFrom !== effect.value.closeFrom
        );
      }
    }

    const selection = transaction.newSelection.main;
    if (!selection.empty) {
      return [];
    }

    return next.filter((pair) => cursorIsInsideAutoPair(selection.head, pair));
  },
});

export function markdownAutoPairExtension(): Extension {
  return [
    activeAutoPairs,
    keymap.of(
      [...handledCharacters].map((character) => ({
        key: character,
        run: handleMarkdownAutoPairCharacter(character),
      }))
    ),
  ];
}

export function shouldInsertMarkdownAutoPair(
  markdown: string,
  position: number,
  insideActivePair = false
): boolean {
  if (insideActivePair) {
    return true;
  }
  if (position === 0) {
    return true;
  }
  return /\s/.test(markdown[position - 1] ?? "");
}

function handleMarkdownAutoPairCharacter(character: MarkdownAutoPairKey) {
  return (view: EditorView): boolean => {
    const selection = view.state.selection.main;
    if (!selection.empty) {
      return false;
    }

    const activePairs = view.state.field(activeAutoPairs);
    const nextCloser = autoPairCloserAt(view, character, selection.from);
    const shouldNestSameCharacterPair =
      nextCloser !== undefined &&
      openingCharacters.has(character) &&
      autoPairIsEmpty(nextCloser);

    const shouldInsertOpeningPair =
      openingCharacters.has(character) &&
      (nextCloser === undefined
        ? shouldInsertMarkdownAutoPair(
            view.state.doc.toString(),
            selection.from,
            activePairs.some((pair) => cursorIsInsideAutoPair(selection.from, pair))
          )
        : shouldNestSameCharacterPair);

    if (shouldInsertOpeningPair) {
      insertMarkdownAutoPair(view, character as MarkdownAutoPairCharacter);
      return true;
    }

    if (nextCloser !== undefined) {
      view.dispatch({
        selection: EditorSelection.cursor(selection.from + character.length),
        effects: consumeAutoPair.of({
          close: nextCloser.close,
          closeFrom: nextCloser.closeFrom,
        }),
        scrollIntoView: true,
        userEvent: "input.type",
      });
      return true;
    }

    return false;
  };
}

function insertMarkdownAutoPair(view: EditorView, open: MarkdownAutoPairCharacter): void {
  const selection = view.state.selection.main;
  const close = closingCharacters[open];

  view.dispatch({
    changes: {
      from: selection.from,
      insert: `${open}${close}`,
    },
    selection: { anchor: selection.from + open.length },
    effects: addAutoPair.of({
      open,
      close,
      openFrom: selection.from,
      closeFrom: selection.from + open.length,
    }),
    scrollIntoView: true,
    userEvent: "input.type",
  });
}

function autoPairCloserAt(
  view: EditorView,
  character: MarkdownAutoPairKey,
  position: number
): ActiveMarkdownAutoPair | undefined {
  if (view.state.doc.sliceString(position, position + character.length) !== character) {
    return undefined;
  }

  return view.state
    .field(activeAutoPairs)
    .filter((pair) => pair.close === character && pair.closeFrom === position)
    .sort((left, right) => right.openFrom - left.openFrom)[0];
}

function cursorIsInsideAutoPair(position: number, pair: ActiveMarkdownAutoPair): boolean {
  return position > pair.openFrom && position <= pair.closeFrom;
}

function autoPairIsEmpty(pair: ActiveMarkdownAutoPair): boolean {
  return pair.closeFrom === pair.openFrom + pair.open.length;
}
