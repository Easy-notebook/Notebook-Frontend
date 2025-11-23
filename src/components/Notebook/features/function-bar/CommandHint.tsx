/**
 * Command Hint Component - Shows real-time command hints and parameter guidance
 */

import React from 'react';
import { CommandHintProvider } from '@Services/stream/commands/CommandHintProvider';

interface CommandHintProps {
  input: string;
}

export const CommandHintComponent: React.FC<CommandHintProps> = ({ input }) => {
  const hint = React.useMemo(() => {
    return CommandHintProvider.getHint(input);
  }, [input]);

  const suggestions = React.useMemo(() => {
    return CommandHintProvider.getSuggestions(input);
  }, [input]);

  if (!hint && suggestions.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 text-sm">
      {/* Command Hint */}
      {hint && (
        <div className="space-y-2">
          {/* Command Header */}
          <div className="flex items-center gap-2">
            <span className="font-mono font-semibold text-theme-600 dark:text-theme-400">
              {hint.command}
            </span>
            <span className="text-gray-600 dark:text-gray-400">{hint.description}</span>
          </div>

          {/* Usage */}
          <div className="pl-4 border-l-2 border-theme-200 dark:border-theme-800">
            <div className="text-gray-500 dark:text-gray-500 text-xs mb-1">Usage:</div>
            <div className="font-mono text-gray-700 dark:text-gray-300">{hint.usage}</div>
          </div>

          {/* Flags */}
          {hint.flags && hint.flags.length > 0 && (
            <div className="pl-4 border-l-2 border-theme-200 dark:border-theme-800">
              <div className="text-gray-500 dark:text-gray-500 text-xs mb-1">Parameters:</div>
              <div className="space-y-1">
                {hint.flags.map((flag) => (
                  <div key={flag.name} className="flex items-start gap-2">
                    <span className="font-mono text-theme-600 dark:text-theme-400 shrink-0">
                      --{flag.name}
                      {flag.required && <span className="text-red-500 ml-1">*</span>}
                    </span>
                    <span className="text-gray-600 dark:text-gray-400 text-xs">
                      {flag.description}
                      <span className="text-gray-500 ml-1">({flag.type})</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Examples */}
          {hint.examples && hint.examples.length > 0 && (
            <div className="pl-4 border-l-2 border-theme-200 dark:border-theme-800">
              <div className="text-gray-500 dark:text-gray-500 text-xs mb-1">Examples:</div>
              <div className="space-y-1">
                {hint.examples.map((example, idx) => (
                  <div key={idx} className="font-mono text-xs text-gray-700 dark:text-gray-300">
                    {example}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Command Suggestions */}
      {!hint && suggestions.length > 0 && (
        <div className="space-y-2">
          <div className="text-gray-500 dark:text-gray-500 text-xs">Suggestions:</div>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <span
                key={suggestion}
                className="px-2 py-1 bg-theme-50 dark:bg-theme-900/30 text-theme-700 dark:text-theme-300 rounded text-xs font-mono"
              >
                {suggestion}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Quick Tip */}
      <div className="mt-2 text-xs text-gray-400 dark:text-gray-600">
        💡 Tip: Use <span className="font-mono">--help</span> for detailed help, or{' '}
        <span className="font-mono">/list</span> to see all commands
      </div>
    </div>
  );
};
