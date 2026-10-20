import { useMathPreview } from './model/useMathPreview';
import { usePreviewStart } from './model/usePreviewStart';

export function MathPreviewError({
  error,
  reloadRequired,
  retry,
}: {
  error: string;
  reloadRequired: boolean;
  retry: () => void;
}) {
  return (
    <span role="status">
      {error}{' '}
      {reloadRequired ? (
        'Save your work, then reload the page to load the formula engine.'
      ) : (
        <button type="button" onClick={retry}>
          Retry formula
        </button>
      )}
    </span>
  );
}

export function MathPreview({ source, displayMode }: { source: string; displayMode: boolean }) {
  const { container, active } = usePreviewStart<HTMLSpanElement>();
  const { html, error, pending, retry, reloadRequired } = useMathPreview(
    source,
    displayMode,
    false,
    active
  );
  if (html) return <span ref={container} dangerouslySetInnerHTML={{ __html: html }} />;
  return (
    <span ref={container} aria-busy={pending}>
      <code>{source}</code>
      {error && <MathPreviewError error={error} reloadRequired={reloadRequired} retry={retry} />}
    </span>
  );
}
