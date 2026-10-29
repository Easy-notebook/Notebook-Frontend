import {
  createContext,
  Profiler,
  useContext,
  type ProfilerOnRenderCallback,
  type ReactNode,
} from 'react';

/** Opt-in profiling boundary. Normal application rendering does not mount a Profiler. */
export const RenderDiagnosticsContext = createContext<ProfilerOnRenderCallback | undefined>(
  undefined
);
export function RenderDiagnostics({ name, children }: { name: string; children: ReactNode }) {
  const record = useContext(RenderDiagnosticsContext);
  return record ? (
    <Profiler id={name} onRender={record}>
      {children}
    </Profiler>
  ) : (
    <>{children}</>
  );
}
