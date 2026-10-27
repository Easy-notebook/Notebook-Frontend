import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { RevealButton } from './fluent-button';

it.each(['button', 'link'] as const)(
  'preserves %s hover behavior with caller callbacks',
  (mode) => {
    const enter = vi.fn();
    const leave = vi.fn();
    const targets: EventTarget[] = [];
    render(
      mode === 'link' ? (
        <RevealButton
          as="a"
          href="/next"
          onMouseEnter={enter}
          onMouseLeave={leave}
          onMouseMove={(event) => targets.push(event.currentTarget)}
        >
          Next
        </RevealButton>
      ) : (
        <RevealButton
          onMouseEnter={enter}
          onMouseLeave={leave}
          onMouseMove={(event) => targets.push(event.currentTarget)}
        >
          Next
        </RevealButton>
      )
    );
    const element = screen.getByRole(mode, { name: 'Next' });
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
      left: 10,
      top: 20,
      width: 100,
      height: 40,
      right: 110,
      bottom: 60,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    });
    fireEvent.mouseEnter(element);
    fireEvent.mouseMove(element, { clientX: 35, clientY: 50 });
    const glow = element.querySelector('span[aria-hidden="true"]');
    expect(glow).toHaveStyle({ left: '25px', top: '30px' });
    expect(enter).toHaveBeenCalledOnce();
    expect(targets).toEqual([element]);
    fireEvent.mouseLeave(element);
    expect(leave).toHaveBeenCalledOnce();
    expect(element.querySelector('span[aria-hidden="true"]')).toBeNull();
    if (mode === 'link') expect(element).toHaveAttribute('href', '/next');
  }
);
