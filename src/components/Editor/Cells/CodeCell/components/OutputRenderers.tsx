import React from 'react';
import { AnsiUp } from 'ansi_up';
import { Output } from '../utils/types';

/** A changed URL starts a new resource lifecycle; old failures cannot hide its replacement. */
function OutputImage({ source, label }: { source: string; label: string }) {
  const [failed, setFailed] = React.useState(false);
  return failed ? (
    <div className="text-center text-red-500" role="status">
      Image load error
    </div>
  ) : (
    <img
      src={source}
      alt={label}
      className="max-w-full h-auto object-contain"
      onError={() => setFailed(true)}
    />
  );
}

export const ImageOutput: React.FC<{ output: Output }> = ({ output }) => {
  const source = typeof output.content === 'string' ? output.content : String(output.content);
  return (
    <div key={output.key} className="output-image-container flex justify-center items-center">
      <div className="max-w-[80%] flex justify-center">
        <OutputImage key={source} source={source} label={`Output ${output.key}`} />
      </div>
    </div>
  );
};

/**
 * HTML output renderer
 */
export const HtmlOutput: React.FC<{ output: Output }> = ({ output }) => {
  const htmlContent = String(output.content ?? '');
  return (
    <div
      key={output.key}
      className="output-html-container"
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  );
};

/**
 * Text/Error output renderer
 */
export const TextOutput: React.FC<{ output: Output }> = ({ output }) => {
  // Each output is an independent snapshot, not a continuation of another cell's stream.
  const htmlContent = new AnsiUp().ansi_to_html(String(output.content ?? ''));
  return (
    <pre
      key={output.key}
      className={`font-mono text-sm whitespace-pre-wrap break-words ${
        output.type === 'error' ? 'text-red-500' : ''
      }`}
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  );
};

interface OutputBoundaryProps {
  output: Output;
  children: React.ReactNode;
}
interface OutputBoundaryState {
  output: Output;
  failed: boolean;
}

/** Isolate failures to one output revision and retry only when that revision changes. */
class OutputBoundary extends React.Component<OutputBoundaryProps, OutputBoundaryState> {
  state: OutputBoundaryState = { output: this.props.output, failed: false };

  static getDerivedStateFromProps(props: OutputBoundaryProps, state: OutputBoundaryState) {
    return props.output !== state.output ? { output: props.output, failed: false } : null;
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.error('Error rendering output:', error);
  }

  render() {
    return this.state.failed ? (
      <pre className="text-red-500" role="alert">
        Error rendering output
      </pre>
    ) : (
      this.props.children
    );
  }
}

function OutputContent({ output }: { output: Output }) {
  if (output.type === 'image') return <ImageOutput output={output} />;
  if (output.type === 'html') return <HtmlOutput output={output} />;
  if (output.type === 'error' || output.type === 'text') return <TextOutput output={output} />;
  return null;
}

export const OutputRenderer = React.memo(function OutputRenderer({
  output,
}: {
  output: Output | null;
}) {
  return output ? (
    <OutputBoundary output={output}>
      <OutputContent output={output} />
    </OutputBoundary>
  ) : null;
});
