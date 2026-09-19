interface SourceInput {
  readonly cancelable: boolean;
  readonly isComposing: boolean;
  readonly inputType: string;
  readonly data: string | null;
}

/** Only events whose complete text range is known without emulating browser editing. */
export function sourceInputChange(event: SourceInput, from: number, to: number) {
  if (!event.cancelable || event.isComposing) return undefined;
  let insert: string;
  let isolated = false;
  switch (event.inputType) {
    case 'insertText':
      if (event.data === null) return undefined;
      insert = event.data.replace(/\r\n?/g, '\n');
      break;
    case 'insertLineBreak':
    case 'insertParagraph':
      insert = '\n';
      break;
    case 'deleteContentBackward':
    case 'deleteContentForward':
    case 'deleteByCut':
      if (from === to) return undefined;
      insert = '';
      isolated = event.inputType === 'deleteByCut';
      break;
    default:
      return undefined;
  }
  return { from, to, insert, cursor: from + insert.length, isolated };
}
