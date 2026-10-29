import { installAgentNativeTrace } from './AgentNativeTrace';
import React, { useEffect, useRef, useState } from 'react';

let capture = null;
export function recordAgentCommit(id, phase, duration, baseDuration, startTime, commitTime) {
  if (capture) capture.commits.push({ id, phase, duration, startTime, commitTime });
}
const percentile = (values, fraction) => {
  const sorted = [...values].sort((a, b) => a - b);
  return +(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] || 0).toFixed(
    2
  );
};
export function AgentPerformanceProbe() {
  const session = useRef(null);
  const [report, setReport] = useState('Ready');
  const [profileJson, setProfileJson] = useState('null');
  const [phase, setPhase] = useState('stream');
  const [recording, setRecording] = useState(false);
  useEffect(() => {
    const restoreNative = installAgentNativeTrace();
    let frame, previous;
    const tick = (time) => {
      const state = session.current;
      if (state && document.visibilityState === 'visible') {
        if (previous !== undefined) {
          state.frames.push(time - previous);
          if (time - previous > 33.4)
            state.slowFrames.push({ start: previous, end: time, duration: time - previous });
        }
        previous = time;
      } else previous = undefined;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const observers = [];
    for (const type of ['longtask', 'layout-shift', 'long-animation-frame', 'measure']) {
      if (!PerformanceObserver.supportedEntryTypes.includes(type)) continue;
      const observer = new PerformanceObserver((list) => {
        const state = session.current;
        if (!state) return;
        for (const entry of list.getEntries()) {
          if (entry.startTime < state.started) continue;
          if (type === 'measure') {
            if (entry.name.startsWith('agent-native:'))
              state.nativeCalls.push({ ...entry.toJSON(), detail: entry.detail });
          } else if (type === 'long-animation-frame') state.animationFrames.push(entry.toJSON());
          else if (type === 'longtask') state.longTasks.push(entry.toJSON());
          else
            state.shifts.push({
              value: entry.value,
              recentInput: entry.hadRecentInput,
              sources: entry.sources?.map(
                (source) => source.node?.className || source.node?.nodeName
              ),
            });
        }
      });
      observer.observe({ type, buffered: false });
      observers.push(observer);
    }
    const interaction = (event) => {
      if (session.current)
        session.current.interactions.push({
          time: performance.now(),
          type: event.type,
          target:
            event.target?.getAttribute?.('aria-label') || event.target?.textContent?.slice(0, 80),
        });
    };
    for (const type of ['click', 'keydown', 'wheel', 'visibilitychange'])
      document.addEventListener(type, interaction, { capture: true, passive: true });
    return () => {
      for (const type of ['click', 'keydown', 'wheel', 'visibilitychange'])
        document.removeEventListener(type, interaction, true);
      restoreNative();
      cancelAnimationFrame(frame);
      observers.forEach((o) => o.disconnect());
      capture = null;
    };
  }, []);
  const start = () => {
    const state = {
      phase,
      nativeCalls: [],
      started: performance.now(),
      frames: [],
      commits: [],
      longTasks: [],
      shifts: [],
      slowFrames: [],
      animationFrames: [],
      interactions: [],
    };
    try {
      state.profiler = new globalThis.Profiler({ sampleInterval: 1, maxBufferSize: 200000 });
    } catch (error) {
      state.profileError = String(error);
    }
    session.current = state;
    capture = state;
    setRecording(true);
    setReport('Recording visible frames only');
  };
  const stop = async () => {
    const state = session.current;
    if (!state) return;
    session.current = null;
    capture = null;
    setRecording(false);
    const profile = state.profiler ? await state.profiler.stop() : null;
    setProfileJson(JSON.stringify(profile));
    const frames = state.frames;
    setReport(
      JSON.stringify(
        {
          phase: state.phase,
          profileSamples: profile?.samples?.length,
          profileInterval: state.profiler?.sampleInterval,
          profileError: state.profileError,
          timeOrigin: performance.timeOrigin,
          started: state.started,
          interactions: state.interactions,
          nativeCalls: state.nativeCalls,
          seconds: +((performance.now() - state.started) / 1000).toFixed(1),
          frames: frames.length,
          frameP50: percentile(frames, 0.5),
          frameP95: percentile(frames, 0.95),
          frameP99: percentile(frames, 0.99),
          over33ms: frames.filter((n) => n > 33.4).length,
          over50ms: frames.filter((n) => n > 50).length,
          maxFrame: Math.max(0, ...frames),
          slowFrames: state.slowFrames.map((frame) => ({
            ...frame,
            commits: state.commits.filter(
              (c) => c.startTime <= frame.end && c.commitTime >= frame.start
            ),
            interactions: state.interactions.filter(
              (e) => e.time >= frame.start - 100 && e.time <= frame.end
            ),
          })),
          animationFrames: state.animationFrames,
          worstCommits: [...state.commits].sort((a, b) => b.duration - a.duration).slice(0, 10),
          renderGroups: Object.fromEntries(
            [...new Set(state.commits.map((c) => c.id))].map((id) => {
              const list = state.commits.filter((c) => c.id === id).map((c) => c.duration);
              return [
                id,
                {
                  count: list.length,
                  p95: percentile(list, 0.95),
                  p99: percentile(list, 0.99),
                  max: Math.max(...list),
                  total: list.reduce((a, b) => a + b, 0),
                },
              ];
            })
          ),
          commits: state.commits.length,
          commitP95: percentile(
            state.commits.map((c) => c.duration),
            0.95
          ),
          commitTotal: +state.commits.reduce((n, c) => n + c.duration, 0).toFixed(2),
          longTasks: state.longTasks,
          layoutShiftTotal: state.shifts.reduce((n, s) => n + s.value, 0),
          unexpectedLayoutShift: state.shifts
            .filter((s) => !s.recentInput)
            .reduce((n, s) => n + s.value, 0),
          shiftSources: state.shifts.slice(-12),
          support: PerformanceObserver.supportedEntryTypes,
        },
        null,
        2
      )
    );
  };
  return (
    <section
      aria-label="真实调用性能采集"
      style={{
        position: 'fixed',
        bottom: 8,
        left: 8,
        zIndex: 10000,
        background: '#111',
        color: '#fff',
        padding: 10,
        borderRadius: 8,
        maxWidth: 350,
        fontSize: 12,
      }}
    >
      <script type="application/json" id="agent-cpu-profile">
        {profileJson}
      </script>
      <label>
        采集阶段{' '}
        <select
          aria-label="采集阶段"
          value={phase}
          onChange={(e) => setPhase(e.target.value)}
          disabled={recording}
          style={{ color: '#111' }}
        >
          {['stream', 'actions', 'collapse-scroll'].map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </label>
      <button onClick={recording ? stop : start} style={{ marginLeft: 12 }}>
        {recording ? '停止性能采集' : '开始性能采集'}
      </button>
      <details open={!recording}>
        <summary>性能结果</summary>
        <pre aria-label="性能结果" style={{ maxHeight: 220, overflow: 'auto', fontSize: 10 }}>
          {report}
        </pre>
      </details>
    </section>
  );
}
