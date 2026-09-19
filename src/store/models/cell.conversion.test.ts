import { expect, it } from 'vitest';
import { CellModel } from './cell';
import { CellContent } from './CellContent';

it('does not reinterpret fence examples inside an already-executable cell', () => {
  const source = '```typescript\nexample\n```';
  const model = CellModel.fromJSON({ id: 'code', type: 'code', language: 'python', content: source });
  expect(model.convertMarkdownCodeBlockToCode()).toBe(model);
  expect(model.content).toBe(source);
  expect(model.language).toBe('python');
});

it('converts only text fields without accessing runtime payloads', () => {
  const source = {
    type: 'code' as const,
    content: '  print(1)\n',
    language: 'python',
    get outputs(): never { throw new Error('Outputs must not be accessed'); },
    get metadata(): never { throw new Error('Metadata must not be accessed'); },
  };
  const content = new CellContent(source).convertToHybrid().convertMarkdownCodeBlockToCode();
  expect(content.content).toBe(source.content);
  expect(content.type).toBe('code');
  expect(Object.keys(content).sort()).toEqual(['content', 'language', 'type']);
});
it('round-trips code through hybrid without trimming code or losing language and outputs', () => {
  const content = '  print(1)\n\n```\n';
  const model = CellModel.fromJSON({
    id: 'code',
    type: 'code',
    content,
    language: 'typescript',
    outputs: [{ type: 'text', content: 'kept' }],
  });
  model.convertToHybrid();
  expect(model.type).toBe('hybrid');
  const source = model.content;
  model.convertToHybrid();
  expect(model.content).toBe(source);
  model.convertMarkdownCodeBlockToCode();
  expect(model.type).toBe('code');
  expect(model.content).toBe(content);
  expect(model.language).toBe('typescript');
  expect(model.outputs[0].content).toBe('kept');
});
it.each(['before\n```python\nx\n```', '```python\nx', '```mermaid\ngraph TD; A-->B\n```'])(
  'does not discard non-executable source during conversion: %s',
  (content) => {
    const model = CellModel.fromJSON({ id: 'hybrid', type: 'hybrid', content });
    model.convertMarkdownCodeBlockToCode();
    expect(model.type).toBe('hybrid');
    expect(model.content).toBe(content);
  }
);
