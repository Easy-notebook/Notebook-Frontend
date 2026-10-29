import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AgentCell } from './AgentCell';
const mocks = vi.hoisted(() => ({ send: vi.fn(() => new Promise<void>(() => {})) }));
vi.mock('@Store/notebookStore', () => ({
  default: (select: (state: unknown) => unknown) =>
    select({
      notebookId: 'n',
      cells: [
        {
          id: 'a',
          type: 'agent',
          content: '',
          metadata: { agent: { provider: 'codex', sessionId: 's', turns: [] } },
        },
      ],
    }),
}));
vi.mock('@Services/agent-cell/agentCellService', () => ({
  agentCellService: {
    send: mocks.send,
    isActive: () => false,
    cancel: vi.fn(),
    configure: vi.fn(),
  },
}));
vi.mock('../../NotebookContext/FactCapture', () => ({
  FactCapture: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('./AgentRunActivity', () => ({ AgentRunActivity: () => null }));
vi.mock('./AgentDetails', () => ({ AgentDetails: () => null }));
vi.mock('./AgentAnswer', () => ({ AgentAnswer: () => null }));
describe('Agent composer keyboard', () => {
  it('does not submit composition/shift-enter and admits one request for repeated submission', () => {
    render(<AgentCell cellId="a" />);
    const input = screen.getByRole('textbox', { name: 'Agent prompt' });
    fireEvent.change(input, { target: { value: '中文问题' } });
    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229, isComposing: true });
    expect(mocks.send).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(mocks.send).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.submit(input.closest('form')!);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send).toHaveBeenCalledWith('a', '中文问题');
  });
});
