import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { ChartContainer, ChartTooltipContent } from './chart';

vi.mock('recharts', async (original) => ({
  ...(await original<typeof import('recharts')>()),
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

it('renders tooltip entries without requiring embedded source data', () => {
  render(
    <ChartContainer config={{ count: { label: 'Count' } }}>
      <ChartTooltipContent active payload={[{ name: 'count', dataKey: 'count', value: 12 }]} />
    </ChartContainer>
  );
  expect(screen.getByText('12')).toBeInTheDocument();
});

it.each(['count', 0])(
  'passes the complete tooltip payload for name %s to a custom formatter',
  (name) => {
    const payload = [{ name, dataKey: 'count', value: 12, payload: { count: 12 } }];
    const formatter = vi.fn(() => 'Formatted count');
    render(
      <ChartContainer config={{ count: { label: 'Count' } }}>
        <ChartTooltipContent active payload={payload} formatter={formatter} />
      </ChartContainer>
    );
    expect(formatter).toHaveBeenCalledWith(12, name, payload[0], 0, payload);
    expect(screen.getByText('Formatted count')).toBeInTheDocument();
  }
);

it('renders zero using the same value element as other numbers', () => {
  render(
    <ChartContainer config={{ count: { label: 'Count' } }}>
      <ChartTooltipContent
        active
        payload={[{ name: 'count', dataKey: 'count', value: 0, payload: {} }]}
      />
    </ChartContainer>
  );
  expect(screen.getByText('0')).toHaveClass('tabular-nums');
});
